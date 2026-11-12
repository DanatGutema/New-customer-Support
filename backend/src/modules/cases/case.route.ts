import { Router, Request, Response, NextFunction } from "express";
import * as cases from "./cases.controller";
import * as CaseService from "./case.service";
import * as MessageController from "./case.message.controller";
import { handleInboundEmail } from "./inbound.email.controller";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../config/default.permission";
import { upload } from "../../middleware/upload.middleware";
import { NotFoundError, ForbiddenError } from "../../utils/error";

const router = Router();

router.get("/public/:id", cases.getPublicCaseForConfirmation);
router.get("/public/track/:caseNumber", cases.getPublicCaseTrack);
router.post("/close/:id/feedback-close", cases.closeCaseWithFeedback);
router.post("/rejectedcase/:id", cases.rejectedCase);

// ─── Inbound email webhook (no auth — provider posts here) ──────────────────
router.post("/inbound-email", handleInboundEmail);

router.use(authenticateToken);

router.get(
  "/",
  requirePermission(PERMISSIONS.CASE_READ_ALL),
  cases.getAllCases
);

const requireCaseReadAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (req.user?.partyType === "CUSTOMER") {
      const caseData = await CaseService.getCase(caseId);
      if (!caseData) {
        throw new NotFoundError("Case not found.");
      }

      const customerId = req.user?.userId;
      if (!customerId || caseData.customerId !== customerId) {
        throw new ForbiddenError("Access Denied: You are not allowed to view this case.");
      }

      return next();
    }

    return requirePermission(PERMISSIONS.CASE_READ_ALL, PERMISSIONS.CASE_READ_HIERARCHY)(req, res, next);
  } catch (error) {
    return next(error);
  }
};

router.get(
  "/:id",
  requireCaseReadAccess,
  cases.getCase
);

router.post(
  "/create",
  upload.array("attachments", 5),
  cases.createCustomerCase
);

router.post(
  "/auth/create",
  upload.array("attachments", 5),
  requirePermission("CASE_CREATE"),
  cases.createAdminCase
);

router.patch(
  "/:id/assign",
  requirePermission("CASE_ASSIGN"),
  cases.AssignCase
);

router.patch(
  "/:id/status",
  cases.updateStatus
);

router.post(
  "/:id/confirm-resolution",
  cases.updateStatus
);

router.patch(
  "/:id/reassign",
  requirePermission("CASE_ASSIGN"),
  cases.ReassignCase
);

router.patch(
  "/give/:id/priority",
  requirePermission("CASE_SET_PRIORITY"),
  cases.GivePriority
);

router.patch(
  "/:id/resolve",
  requirePermission(PERMISSIONS.CASE_RESOLVE),
  cases.resolveCase
);

// ─── Conversation thread ────────────────────────────────────────────────────
router.get("/:id/messages", MessageController.getMessages);
router.post("/:id/messages", upload.array("attachments", 5), MessageController.postMessage);
router.delete("/:id/messages/:messageId", MessageController.deleteMessage);

// ─── Email thread (read-only log of all emails linked to this case) ──────────
router.get("/:id/email-thread", async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await (await import("../../config/database")).prisma.emailLog.findMany({
      where: { relatedCaseId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        direction: true,
        fromEmail: true,
        recipientEmail: true,
        subject: true,
        bodyText: true,
        messageId: true,
        inReplyTo: true,
        sentAt: true,
        createdAt: true,
        status: true,
      },
    });

    // Group emails into conversations.
    // A "conversation" = one root email + all replies that reference it.
    // Root = an email whose inReplyTo is null OR whose inReplyTo does not
    //        match any other messageId in this case's thread.
    const messageIdSet = new Set(logs.map((l) => l.messageId).filter(Boolean));
    const roots = logs.filter(
      (l) => !l.inReplyTo || !messageIdSet.has(l.inReplyTo)
    );
    const replies = logs.filter(
      (l) => l.inReplyTo && messageIdSet.has(l.inReplyTo)
    );

    // For each reply, trace it back to its root
    const findRoot = (log: typeof logs[number]): string | null => {
      if (!log.inReplyTo) return log.messageId;
      let current = log;
      let iterations = 0;
      while (current.inReplyTo && iterations < 20) {
        const parent = logs.find((l) => l.messageId === current.inReplyTo);
        if (!parent) break;
        current = parent;
        iterations++;
      }
      return current.messageId;
    };

    const conversationMap = new Map<string, typeof logs>();
    for (const root of roots) {
      if (root.messageId) conversationMap.set(root.messageId, [root]);
    }

    for (const reply of replies) {
      const rootMsgId = findRoot(reply);
      if (rootMsgId && conversationMap.has(rootMsgId)) {
        conversationMap.get(rootMsgId)!.push(reply);
      } else {
        // Orphan reply — treat as its own root
        conversationMap.set(reply.messageId || reply.id, [reply]);
      }
    }

    const conversations = Array.from(conversationMap.entries()).map(([rootMessageId, messages]) => {
      const root = messages[0];
      const latestAt = messages.reduce(
        (latest, m) => (m.sentAt || m.createdAt) > (latest.sentAt || latest.createdAt) ? m : latest,
        messages[0]
      );
      return {
        threadId: rootMessageId,
        subject: root.subject,
        messageCount: messages.length,
        latestAt: latestAt.sentAt || latestAt.createdAt,
        hasInbound: messages.some((m) => m.direction === "INBOUND"),
        hasOutbound: messages.some((m) => m.direction === "OUTBOUND"),
        messages: messages.sort(
          (a, b) => new Date(a.sentAt || a.createdAt).getTime() - new Date(b.sentAt || b.createdAt).getTime()
        ),
      };
    }).sort(
      (a, b) => new Date(a.latestAt).getTime() - new Date(b.latestAt).getTime()
    );

    res.status(200).json({ success: true, data: { conversations, totalMessages: logs.length } });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export const CaseReportRouter = router;