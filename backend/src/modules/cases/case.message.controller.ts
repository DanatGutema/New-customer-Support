import { Request, Response } from "express";
import * as MessageService from "./case.message.service";
import { ForbiddenError } from "../../utils/error";
import { upload } from "../../middleware/upload.middleware";

// ─── GET messages for a case ──────────────────────────────────────────────────

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const caseId = req.params.id;
    const actor = (req as any).user;
    const viewerType = actor?.partyType === "CUSTOMER" ? "CUSTOMER" : "STAFF";

    const messages = await MessageService.getMessages(caseId, viewerType);

    res.status(200).json({ success: true, data: messages });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ─── POST a message ───────────────────────────────────────────────────────────

export const postMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const caseId = req.params.id;
    const actor  = (req as any).user;
    const actorId = actor?.userId || actor?.id;
    const partyType = actor?.partyType;

    if (!actorId) throw new ForbiddenError("Invalid token credentials.");

    const body       = req.body.body || req.body.message || "";
    const visibility = req.body.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC";

    // Only staff may post INTERNAL notes
    if (visibility === "INTERNAL" && partyType !== "STAFF") {
      throw new ForbiddenError("Only staff can post internal notes.");
    }

    // Parse uploaded attachments
    const rawFiles = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
    const attachments = rawFiles.map((f) => ({
      fileName:    f.originalname,
      storagePath: f.path || f.filename,
      fileSizeBytes: f.size,
      mimeType:    f.mimetype,
    }));

    const message = await MessageService.postMessage({
      caseId,
      body,
      visibility,
      authorStaffId:    partyType === "STAFF"    ? actorId : undefined,
      authorCustomerId: partyType === "CUSTOMER" ? actorId : undefined,
      attachments,
    });

    res.status(201).json({ success: true, data: message });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ─── DELETE a message ─────────────────────────────────────────────────────────

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const messageId = req.params.messageId;
    const actor     = (req as any).user;
    const actorId   = actor?.userId || actor?.id;
    const partyType: "STAFF" | "CUSTOMER" = actor?.partyType === "CUSTOMER" ? "CUSTOMER" : "STAFF";

    if (!actorId) throw new ForbiddenError("Invalid token credentials.");

    await MessageService.deleteMessage(messageId, actorId, partyType, actor?.isSAdmin);

    res.status(200).json({ success: true, message: "Message deleted." });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ─── Canned replies ───────────────────────────────────────────────────────────

export const getCannedReplies = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await MessageService.getAllCannedReplies(true);
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createCannedReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, body, category } = req.body;
    const data = await MessageService.createCannedReply({ title, body, category });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const updateCannedReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await MessageService.updateCannedReply(id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const deleteCannedReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await MessageService.deleteCannedReply(id);
    res.status(200).json({ success: true, message: "Canned reply deleted." });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};
