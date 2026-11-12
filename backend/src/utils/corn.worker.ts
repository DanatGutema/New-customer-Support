import cron from "node-cron";
import { prisma } from "../config/database";
import { CaseStatus, /* NotificationType, PartyType */ } from "../../generated/prisma/client";
import { triggerAutoCloseEmail, triggerResolutionReminderEmail, /* getTransporter */ } from "../utils/email";
import { createStatusHistory } from "../modules/cases/statusHistory.service";
import { TimeTrackingService } from "../modules/timeTracking/timeTracking.service";
// import { computeSlaInfo } from "../utils/sla";  // SLA DISABLED
// import { ENV } from "../config/env";             // SLA DISABLED

const SYSTEM_BOT_ID = "00000000-0000-0000-0000-000000000000";

// ─── SLA helper: get manager ids up the hierarchy (DISABLED) ─────────────────
// async function getManagementChain(assignedStaffId: string): Promise<string[]> {
//   const ids = new Set<string>();
//   const staff = await prisma.staff.findUnique({
//     where: { id: assignedStaffId },
//     include: { section: { include: { division: { include: { department: true } } } } },
//   });
//   if (!staff) return [];
//   const getManager = async (field: "section" | "division" | "department", id: string | null | undefined) => {
//     if (!id) return null;
//     const record = await (prisma as any)[field].findUnique({ where: { id }, select: { managerId: true } });
//     return record?.managerId ?? null;
//   };
//   const secMgr  = await getManager("section",    staff.sectionId);
//   const divMgr  = await getManager("division",   staff.section?.divisionId);
//   const deptMgr = await getManager("department", staff.section?.division?.departmentId);
//   if (secMgr  && secMgr  !== assignedStaffId) ids.add(secMgr);
//   if (divMgr  && divMgr  !== assignedStaffId) ids.add(divMgr);
//   if (deptMgr && deptMgr !== assignedStaffId) ids.add(deptMgr);
//   const admins = await prisma.staff.findMany({ where: { isSAdmin: true }, select: { id: true } });
//   admins.forEach((a) => ids.add(a.id));
//   return Array.from(ids);
// }

// ─── SLA sweep (DISABLED) ─────────────────────────────────────────────────────
// async function runSlaSweep() { ... }
// The full SLA sweep function has been commented out.
// To re-enable, restore the runSlaSweep function and the */15 cron schedule below.

// SLA DISABLED — runSlaSweep function commented out.
// To re-enable: uncomment this entire block and the */15 cron schedule in startCaseTimeoutWorker.
/*
async function runSlaSweep() {
  console.log("[SLA Worker] Starting SLA breach sweep...");
  const now = new Date();
  const activeCases = await prisma.caseReport.findMany({
    where: {
      status: { in: [CaseStatus.OPEN, CaseStatus.IN_PROGRESS, CaseStatus.PENDING, CaseStatus.ESCALATED] },
      assignedSupportId: { not: null },
    },
    include: {
      statusHistory: { orderBy: { createdAt: "asc" } },
      assignedSupport: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  for (const c of activeCases) {
    // ... full SLA breach logic (warnings, emails, auto-escalation) ...
  }
  console.log("[SLA Worker] SLA sweep complete.");
}
*/

// ─── Resolution confirmation worker (existing) ───────────────────────────────

export const startCaseTimeoutWorker = () => {
  // Existing: runs every hour — resolution reminders + auto-close
  cron.schedule("0 */1 * * *", async () => {
    console.log("[Cron Worker] Starting resolution confirmation sweep...");

    try {
      const now = new Date();
      const reminderThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const reminderWindowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const autoCloseThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const reminderCases = await prisma.caseReport.findMany({
        where: {
          status: CaseStatus.RESOLVED,
          resolvedAt: { lte: reminderThreshold, gt: reminderWindowStart },
        },
        include: { customer: true },
      });

      for (const targetCase of reminderCases) {
        try {
          await triggerResolutionReminderEmail(targetCase);
          console.log(`[Cron Worker] Sent resolution reminder for case ${targetCase.caseNumber}.`);
        } catch (individualError) {
          console.error(`[Cron Worker] Failed to remind case ${targetCase.id}:`, individualError);
        }
      }

      const autoCloseCases = await prisma.caseReport.findMany({
        where: {
          status: CaseStatus.RESOLVED,
          resolvedAt: { lte: autoCloseThreshold },
        },
        include: { customer: true },
      });

      for (const targetCase of autoCloseCases) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.caseReport.update({
              where: { id: targetCase.id },
              data: {
                status: CaseStatus.CLOSED,
                closedAt: new Date(),
                updatedById: null, // was SYSTEM_BOT_ID — changed to null (SYSTEM actor)
              },
            });

            await createStatusHistory(tx, {
              caseReportId: targetCase.id,
              changedById: null,
              actorType: "SYSTEM",
              actorId: null,
              fromStatus: CaseStatus.RESOLVED,
              toStatus: CaseStatus.CLOSED,
              oldPriority: targetCase.priority,
              newPriority: targetCase.priority,
              oldAgentId: targetCase.assignedSupportId,
              newAgentId: targetCase.assignedSupportId,
            });
          });

          await triggerAutoCloseEmail(targetCase);
          console.log(`[Cron Worker] Auto-closed case ${targetCase.caseNumber} due to inactivity.`);
        } catch (individualError) {
          console.error(`[Cron Worker] Failed to auto-close case ${targetCase.id}:`, individualError);
        }
      }
    } catch (error) {
      console.error("[Cron Worker] Critical error running confirmation workflow:", error);
    }
  });

  // SLA sweep — DISABLED (comment out to re-enable)
  // cron.schedule("*/15 * * * *", async () => {
  //   try {
  //     await runSlaSweep();
  //   } catch (err) {
  //     console.error("[SLA Worker] Unhandled error in SLA sweep:", err);
  //   }
  // });

  // Time Tracking: close stale segments every 5 minutes (AUTO timeout after 90s, TIMER cap after 12h)
  cron.schedule("*/5 * * * *", async () => {
    try {
      const closed = await TimeTrackingService.cleanupStaleSessions();
      if (closed > 0) {
        console.log(`[TimeTracking Worker] Closed ${closed} stale time tracking sessions.`);
      }
    } catch (err) {
      console.error("[TimeTracking Worker] Error during stale session cleanup:", err);
    }
  });

  console.log("[Cron Worker] Resolution confirmation & Time tracking workflows initialized.");
  // console.log("[SLA Worker] SLA breach monitoring initialized (every 15 min).");
};
