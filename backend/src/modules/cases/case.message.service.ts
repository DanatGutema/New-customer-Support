import { prisma } from "../../config/database";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/error";
import { MessageVisibility } from "../../../generated/prisma/client";

// ─── Author include helper ────────────────────────────────────────────────────

const MESSAGE_INCLUDE = {
  authorStaff: {
    select: { id: true, firstName: true, lastName: true, isPSsupport: true, isManager: true, isSAdmin: true },
  },
  authorCustomer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  attachments: true,
} as const;

// ─── List messages for a case ─────────────────────────────────────────────────

export const getMessages = async (
  caseId: string,
  viewerType: "STAFF" | "CUSTOMER"
) => {
  const where: any = { caseReportId: caseId };

  // Customers only see PUBLIC messages
  if (viewerType === "CUSTOMER") {
    where.visibility = MessageVisibility.PUBLIC;
  }

  return prisma.caseMessage.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
};

// ─── Post a message ───────────────────────────────────────────────────────────

export interface PostMessageInput {
  caseId: string;
  body: string;
  visibility: "PUBLIC" | "INTERNAL";
  authorStaffId?: string;
  authorCustomerId?: string;
  attachments?: { fileName: string; storagePath: string; fileSizeBytes: number; mimeType: string }[];
}

export const postMessage = async (input: PostMessageInput) => {
  const { caseId, body, visibility, authorStaffId, authorCustomerId, attachments = [] } = input;

  if (!body || body.trim().length === 0) {
    throw new BadRequestError("Message body cannot be empty.");
  }

  // Customers can only post PUBLIC messages
  if (authorCustomerId && visibility === "INTERNAL") {
    throw new ForbiddenError("Customers cannot post internal notes.");
  }

  // Verify case exists
  const caseRecord = await prisma.caseReport.findUnique({
    where: { id: caseId },
    select: { id: true, customerId: true, status: true },
  });
  if (!caseRecord) throw new NotFoundError("Case not found.");

  // Customer can only message on their own case
  if (authorCustomerId && caseRecord.customerId !== authorCustomerId) {
    throw new ForbiddenError("You are not the owner of this case.");
  }

  const message = await prisma.caseMessage.create({
    data: {
      caseReportId: caseId,
      body: body.trim(),
      visibility: visibility as MessageVisibility,
      authorStaffId: authorStaffId || null,
      authorCustomerId: authorCustomerId || null,
      attachments: attachments.length > 0 ? {
        create: attachments.map((f) => ({
          fileName: f.fileName,
          storagePath: f.storagePath,
          fileSizeBytes: BigInt(f.fileSizeBytes),
          mimeType: f.mimeType,
        })),
      } : undefined,
    },
    include: MESSAGE_INCLUDE,
  });

  return message;
};

// ─── Delete a message (author only, or admin) ─────────────────────────────────

export const deleteMessage = async (
  messageId: string,
  actorId: string,
  actorType: "STAFF" | "CUSTOMER",
  isSAdmin = false
) => {
  const msg = await prisma.caseMessage.findUnique({
    where: { id: messageId },
    select: { authorStaffId: true, authorCustomerId: true },
  });
  if (!msg) throw new NotFoundError("Message not found.");

  const isOwner =
    (actorType === "STAFF" && msg.authorStaffId === actorId) ||
    (actorType === "CUSTOMER" && msg.authorCustomerId === actorId);

  if (!isOwner && !isSAdmin) {
    throw new ForbiddenError("You can only delete your own messages.");
  }

  await prisma.caseMessage.delete({ where: { id: messageId } });
};

// ─── Canned replies ───────────────────────────────────────────────────────────

export const getAllCannedReplies = async (activeOnly = true) => {
  return prisma.cannedReply.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
};

export const createCannedReply = async (data: {
  title: string;
  body: string;
  category?: string;
}) => {
  if (!data.title?.trim()) throw new BadRequestError("Title is required.");
  if (!data.body?.trim())  throw new BadRequestError("Body is required.");

  return prisma.cannedReply.create({
    data: {
      title: data.title.trim(),
      body: data.body.trim(),
      category: data.category?.trim() || null,
    },
  });
};

export const updateCannedReply = async (
  id: string,
  data: { title?: string; body?: string; category?: string; isActive?: boolean }
) => {
  const existing = await prisma.cannedReply.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Canned reply not found.");

  return prisma.cannedReply.update({
    where: { id },
    data: {
      title: data.title?.trim() ?? existing.title,
      body: data.body?.trim() ?? existing.body,
      category: data.category !== undefined ? data.category?.trim() || null : existing.category,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    },
  });
};

export const deleteCannedReply = async (id: string) => {
  const existing = await prisma.cannedReply.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Canned reply not found.");
  await prisma.cannedReply.delete({ where: { id } });
};
