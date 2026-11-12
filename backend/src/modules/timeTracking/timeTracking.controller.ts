import { Request, Response } from "express";
import { TimeTrackingService } from "./timeTracking.service";
import {
  startSessionSchema,
  stopSessionSchema,
  manualSessionSchema,
  caseIdParamSchema,
  heartbeatSchema,
  sessionIdParamSchema,
  updateSessionSchema,
  myDayQuerySchema,
  teamReportQuerySchema,
  approvalActionSchema,
} from "./timeTracking.validation";

export class TimeTrackingController {
  static async start(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can record work time." });
        return;
      }

      const parsed = startSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.issues,
        });
        return;
      }

      const session = await TimeTrackingService.startSession({
        caseId: parsed.data.caseId,
        staffId: req.user.userId,
        source: parsed.data.source as any,
        workType: parsed.data.workType as any,
      });

      res.status(201).json({
        success: true,
        message: "Work session started successfully.",
        data: session,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to start session." });
    }
  }

  static async stop(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can record work time." });
        return;
      }

      const parsed = stopSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.issues,
        });
        return;
      }

      const session = await TimeTrackingService.stopSession({
        staffId: req.user.userId,
        caseId: parsed.data.caseId,
        sessionId: parsed.data.sessionId,
        endReason: parsed.data.endReason,
        note: parsed.data.note,
      });

      res.status(200).json({
        success: true,
        message: "Work session stopped successfully.",
        data: session,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to stop session." });
    }
  }

  static async manual(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can record work time." });
        return;
      }

      const parsed = manualSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.issues,
        });
        return;
      }

      const result = await TimeTrackingService.logManualSession({
        caseId: parsed.data.caseId,
        staffId: req.user.userId,
        startedAt: parsed.data.startedAt,
        endedAt: parsed.data.endedAt,
        workType: parsed.data.workType as any,
        note: parsed.data.note,
      });

      res.status(201).json({
        success: true,
        message: result.needsApproval
          ? "Time entry exceeds 4 hours and has been submitted for manager approval."
          : "Work session logged successfully.",
        data: result.session,
        needsApproval: result.needsApproval,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to log manual work session." });
    }
  }

  static async getCaseTime(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Customers cannot view time tracking data." });
        return;
      }

      const parsed = caseIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.issues,
        });
        return;
      }

      const data = await TimeTrackingService.getCaseTime(
        parsed.data.caseId,
        req.user.userId
      );

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to fetch case time data." });
    }
  }

  static async heartbeat(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can record work time." });
        return;
      }

      const parsed = heartbeatSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.issues,
        });
        return;
      }

      const result = await TimeTrackingService.heartbeat({
        caseId: parsed.data.caseId,
        staffId: req.user.userId,
        sessionId: parsed.data.sessionId,
        source: parsed.data.source as any,
      });

      res.status(200).json({
        success: true,
        message: "Heartbeat acknowledged.",
        data: result.session,
        created: result.created,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Heartbeat failed." });
    }
  }

  static async getMyDay(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can view their day summary." });
        return;
      }

      const parsedQuery = myDayQuerySchema.safeParse(req.query);
      const dateStr = parsedQuery.success ? parsedQuery.data.date : undefined;

      const data = await TimeTrackingService.getMyDay(req.user.userId, dateStr);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to load My Day summary." });
    }
  }

  static async updateSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Only staff members can edit work sessions." });
        return;
      }

      const parsedParams = sessionIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          message: "Invalid session ID",
          errors: parsedParams.error.issues,
        });
        return;
      }

      const parsedBody = updateSessionSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsedBody.error.issues,
        });
        return;
      }

      const updated = await TimeTrackingService.updateSessionWithAudit({
        sessionId: parsedParams.data.id,
        staffId: req.user.userId,
        reason: parsedBody.data.reason,
        workType: parsedBody.data.workType as any,
        startedAt: parsedBody.data.startedAt,
        endedAt: parsedBody.data.endedAt,
        note: parsedBody.data.note,
      });

      res.status(200).json({
        success: true,
        message: "Work session updated successfully.",
        data: updated,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to update session." });
    }
  }

  static async getTeamReport(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Staff only." });
        return;
      }

      const q = teamReportQuerySchema.safeParse(req.query);
      const { groupBy, from, to } = q.success ? q.data : { groupBy: "agent", from: undefined, to: undefined };

      // Resolve the manager's scope: collect staff ids in their hierarchy
      const staffIds = await TimeTrackingService.resolveTeamStaffIds(req.user.userId);

      const data = await TimeTrackingService.getTeamReport({ groupBy, from, to, staffIds });

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to load team report." });
    }
  }

  static async getPendingApprovals(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Staff only." });
        return;
      }

      const staffIds = await TimeTrackingService.resolveTeamStaffIds(req.user.userId);
      const data = await TimeTrackingService.getPendingApprovals(staffIds);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to load pending approvals." });
    }
  }

  static async approveOrRejectSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.partyType !== "STAFF") {
        res.status(403).json({ message: "Staff only." });
        return;
      }

      const parsedParams = sessionIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({ message: "Invalid session ID." });
        return;
      }

      const parsedBody = approvalActionSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({ message: "Validation failed", errors: parsedBody.error.issues });
        return;
      }

      const updated = await TimeTrackingService.approveOrRejectSession({
        sessionId: parsedParams.data.id,
        managerId: req.user.userId,
        action: parsedBody.data.action,
        note: parsedBody.data.note,
      });

      res.status(200).json({
        success: true,
        message: `Session ${parsedBody.data.action === "APPROVE" ? "approved" : "rejected"} successfully.`,
        data: updated,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      res.status(statusCode).json({ message: error.message || "Failed to process approval." });
    }
  }
}

