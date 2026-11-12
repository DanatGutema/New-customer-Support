import { z } from "zod";

export const WorkTypeEnum = z.enum([
  "DESK",
  "PHONE",
  "SITE_VISIT",
  "HARDWARE_REPAIR",
  "TRAVEL",
]);

export const WorkSessionSourceEnum = z.enum(["AUTO", "TIMER", "MANUAL"]);

export const startSessionSchema = z.object({
  caseId: z.string().uuid("Invalid case ID"),
  workType: WorkTypeEnum.optional().default("DESK"),
  source: z.enum(["AUTO", "TIMER"]).optional().default("TIMER"),
});

export const stopSessionSchema = z.object({
  caseId: z.string().uuid("Invalid case ID").optional(),
  sessionId: z.string().uuid("Invalid session ID").optional(),
  endReason: z.string().max(255).optional(),
  note: z.string().optional(),
});

export const manualSessionSchema = z.object({
  caseId: z.string().uuid("Invalid case ID"),
  startedAt: z.string().datetime("startedAt must be a valid ISO datetime string"),
  endedAt: z.string().datetime("endedAt must be a valid ISO datetime string"),
  workType: WorkTypeEnum.default("DESK"),
  note: z.string().min(3, "A descriptive note is required for manual time logs"),
});

export const caseIdParamSchema = z.object({
  caseId: z.string().uuid("Invalid case ID"),
});

export const heartbeatSchema = z.object({
  caseId: z.string().uuid("Invalid case ID"),
  sessionId: z.string().uuid("Invalid session ID").optional(),
  source: z.enum(["AUTO", "TIMER"]).optional(),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid("Invalid session ID"),
});

export const updateSessionSchema = z.object({
  workType: WorkTypeEnum.optional(),
  startedAt: z.string().datetime("startedAt must be a valid ISO datetime string").optional(),
  endedAt: z.string().datetime("endedAt must be a valid ISO datetime string").optional(),
  note: z.string().optional(),
  reason: z.string().min(3, "Reason for edit is required"),
});

export const myDayQuerySchema = z.object({
  date: z.string().optional(),
});

export const teamReportQuerySchema = z.object({
  groupBy: z.enum(["case", "category", "organization", "section", "agent"]).optional().default("agent"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const approvalActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().optional(),
});


