import { prisma } from "../../config/database";
import {
  WorkSessionSource,
  WorkType,
  WorkSessionApprovalStatus,
  CaseStatus,
} from "../../../generated/prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/error";

const TERMINAL_STATUSES: CaseStatus[] = [
  CaseStatus.RESOLVED,
  CaseStatus.CLOSED,
  CaseStatus.CANCELLED,
];

export class TimeTrackingService {
  /**
   * Start a work session for an agent on a case.
   * Closes any other running session for this agent across the system.
   */
  static async startSession({
    caseId,
    staffId,
    source = WorkSessionSource.TIMER,
    workType = WorkType.DESK,
  }: {
    caseId: string;
    staffId: string;
    source?: WorkSessionSource;
    workType?: WorkType;
  }) {
    const caseReport = await prisma.caseReport.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        assignedSupportId: true,
        status: true,
      },
    });

    if (!caseReport) {
      throw new NotFoundError("Case not found");
    }

    if (caseReport.assignedSupportId !== staffId) {
      throw new ForbiddenError(
        "Only the assigned support agent can record time on this case."
      );
    }

    if (TERMINAL_STATUSES.includes(caseReport.status)) {
      throw new BadRequestError(
        `Cannot record time on a case with status ${caseReport.status}.`
      );
    }

    const now = new Date();

    // Check if the agent already has a running session on THIS case with the same source
    const existingSameSession = await prisma.caseWorkSession.findFirst({
      where: {
        caseId,
        staffId,
        source,
        endedAt: null,
      },
    });

    if (existingSameSession) {
      // Already running on this case with same mode, update heartbeat and return
      return prisma.caseWorkSession.update({
        where: { id: existingSameSession.id },
        data: { lastHeartbeatAt: now },
      });
    }

    // Close any existing running session for this agent across ANY case
    await this.closeRunningSessionForStaff(staffId, "SWITCHED_SESSION");

    // Create the new session
    const newSession = await prisma.caseWorkSession.create({
      data: {
        caseId,
        staffId,
        startedAt: now,
        lastHeartbeatAt: now,
        source,
        workType,
        approvalStatus: WorkSessionApprovalStatus.NOT_REQUIRED,
      },
    });

    return newSession;
  }

  /**
   * Stop an active work session.
   */
  static async stopSession({
    staffId,
    caseId,
    sessionId,
    endReason = "MANUAL_STOP",
    note,
  }: {
    staffId: string;
    caseId?: string;
    sessionId?: string;
    endReason?: string;
    note?: string;
  }) {
    const session = await prisma.caseWorkSession.findFirst({
      where: {
        staffId,
        endedAt: null,
        ...(sessionId ? { id: sessionId } : {}),
        ...(caseId ? { caseId } : {}),
      },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      throw new NotFoundError("No active work session found to stop.");
    }

    const now = new Date();
    const duration = Math.max(
      0,
      Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
    );

    // Rule: AUTO ignores visits under 10 seconds
    const effectiveDuration =
      session.source === WorkSessionSource.AUTO && duration < 10 ? 0 : duration;

    const [updatedSession] = await prisma.$transaction([
      prisma.caseWorkSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          lastHeartbeatAt: now,
          activeSeconds: effectiveDuration,
          endReason,
          note: note !== undefined ? note : session.note,
        },
      }),
      prisma.caseReport.update({
        where: { id: session.caseId },
        data: {
          totalActiveSeconds: { increment: effectiveDuration },
        },
      }),
    ]);

    return updatedSession;
  }

  /**
   * Record a manual time entry.
   * Requires a note; no future times, no overlaps; entries over 4h require manager approval.
   */
  static async logManualSession({
    caseId,
    staffId,
    startedAt,
    endedAt,
    workType = WorkType.DESK,
    note,
  }: {
    caseId: string;
    staffId: string;
    startedAt: string;
    endedAt: string;
    workType?: WorkType;
    note: string;
  }) {
    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);
    const now = new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestError("Invalid dates provided.");
    }

    if (endDate <= startDate) {
      throw new BadRequestError("End time must be strictly after start time.");
    }

    if (endDate > now) {
      throw new BadRequestError("Cannot log work session in the future.");
    }

    const caseReport = await prisma.caseReport.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        assignedSupportId: true,
        status: true,
      },
    });

    if (!caseReport) {
      throw new NotFoundError("Case not found.");
    }

    if (caseReport.assignedSupportId !== staffId) {
      throw new ForbiddenError(
        "Only the assigned support agent can record time on this case."
      );
    }

    // Check for overlapping sessions for this staff member
    const overlap = await prisma.caseWorkSession.findFirst({
      where: {
        staffId,
        startedAt: { lt: endDate },
        OR: [{ endedAt: null }, { endedAt: { gt: startDate } }],
      },
    });

    if (overlap) {
      throw new BadRequestError(
        "Time entry overlaps with an existing work session."
      );
    }

    const durationSeconds = Math.floor(
      (endDate.getTime() - startDate.getTime()) / 1000
    );

    // Rule: entries over 4h (14,400s) need manager approval
    const needsApproval = durationSeconds > 4 * 3600;
    const approvalStatus = needsApproval
      ? WorkSessionApprovalStatus.PENDING
      : WorkSessionApprovalStatus.NOT_REQUIRED;

    if (approvalStatus === WorkSessionApprovalStatus.NOT_REQUIRED) {
      const [session] = await prisma.$transaction([
        prisma.caseWorkSession.create({
          data: {
            caseId,
            staffId,
            startedAt: startDate,
            lastHeartbeatAt: endDate,
            endedAt: endDate,
            activeSeconds: durationSeconds,
            source: WorkSessionSource.MANUAL,
            workType,
            note,
            approvalStatus,
          },
        }),
        prisma.caseReport.update({
          where: { id: caseId },
          data: {
            totalActiveSeconds: { increment: durationSeconds },
          },
        }),
      ]);

      return { session, needsApproval: false };
    } else {
      const session = await prisma.caseWorkSession.create({
        data: {
          caseId,
          staffId,
          startedAt: startDate,
          lastHeartbeatAt: endDate,
          endedAt: endDate,
          activeSeconds: durationSeconds,
          source: WorkSessionSource.MANUAL,
          workType,
          note,
          approvalStatus,
        },
      });

      return { session, needsApproval: true };
    }
  }

  /**
   * Get case time tracking data.
   */
  static async getCaseTime(caseId: string, staffId: string) {
    const caseReport = await prisma.caseReport.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        totalActiveSeconds: true,
        assignedSupportId: true,
        status: true,
      },
    });

    if (!caseReport) {
      throw new NotFoundError("Case not found.");
    }

    // Active session for current agent on this case
    const activeSession = await prisma.caseWorkSession.findFirst({
      where: {
        caseId,
        staffId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    // Total approved or auto/timer seconds logged by current agent on this case
    const agentAgg = await prisma.caseWorkSession.aggregate({
      where: {
        caseId,
        staffId,
        approvalStatus: {
          not: WorkSessionApprovalStatus.REJECTED,
        },
        endedAt: { not: null },
      },
      _sum: {
        activeSeconds: true,
      },
    });

    // Completed sessions on this case
    const sessions = await prisma.caseWorkSession.findMany({
      where: { caseId },
      include: {
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return {
      caseId,
      caseNumber: caseReport.caseNumber,
      totalActiveSeconds: caseReport.totalActiveSeconds,
      agentActiveSeconds: agentAgg._sum.activeSeconds || 0,
      activeSession,
      isAssignedAgent: caseReport.assignedSupportId === staffId,
      sessions,
    };
  }

  /**
   * Close any running session for an agent (e.g. on logout or when switching cases).
   */
  static async closeRunningSessionForStaff(staffId: string, endReason = "CLOSED") {
    const session = await prisma.caseWorkSession.findFirst({
      where: { staffId, endedAt: null },
    });

    if (!session) return null;

    const now = new Date();
    const duration = Math.max(
      0,
      Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
    );

    const effectiveDuration =
      session.source === WorkSessionSource.AUTO && duration < 10 ? 0 : duration;

    const [updated] = await prisma.$transaction([
      prisma.caseWorkSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          lastHeartbeatAt: now,
          activeSeconds: effectiveDuration,
          endReason,
        },
      }),
      prisma.caseReport.update({
        where: { id: session.caseId },
        data: {
          totalActiveSeconds: { increment: effectiveDuration },
        },
      }),
    ]);

    return updated;
  }

  /**
   * Close all running sessions for a case (e.g. when resolved/closed/cancelled or reassigned).
   */
  static async closeRunningSessionsForCase(caseId: string, endReason = "CASE_TERMINATED") {
    const runningSessions = await prisma.caseWorkSession.findMany({
      where: { caseId, endedAt: null },
    });

    if (runningSessions.length === 0) return 0;

    const now = new Date();

    for (const session of runningSessions) {
      const duration = Math.max(
        0,
        Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
      );

      const effectiveDuration =
        session.source === WorkSessionSource.AUTO && duration < 10 ? 0 : duration;

      await prisma.$transaction([
        prisma.caseWorkSession.update({
          where: { id: session.id },
          data: {
            endedAt: now,
            lastHeartbeatAt: now,
            activeSeconds: effectiveDuration,
            endReason,
          },
        }),
        prisma.caseReport.update({
          where: { id: caseId },
          data: {
            totalActiveSeconds: { increment: effectiveDuration },
          },
        }),
      ]);
    }

    return runningSessions.length;
  }

  /**
   * Heartbeat endpoint logic:
   * Called every 30s by active frontend tab while visible and user is active.
   * Updates lastHeartbeatAt on running session or starts an AUTO session.
   */
  static async heartbeat({
    caseId,
    staffId,
    sessionId,
    source,
  }: {
    caseId: string;
    staffId: string;
    sessionId?: string;
    source?: WorkSessionSource;
  }) {
    const caseReport = await prisma.caseReport.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        assignedSupportId: true,
        status: true,
      },
    });

    if (!caseReport) {
      throw new NotFoundError("Case not found.");
    }

    if (caseReport.assignedSupportId !== staffId) {
      throw new ForbiddenError(
        "Only the assigned support agent can record time on this case."
      );
    }

    if (TERMINAL_STATUSES.includes(caseReport.status)) {
      throw new BadRequestError(
        `Cannot record time on a case with status ${caseReport.status}.`
      );
    }

    const now = new Date();

    let session = await prisma.caseWorkSession.findFirst({
      where: {
        caseId,
        staffId,
        endedAt: null,
        ...(sessionId ? { id: sessionId } : {}),
      },
      orderBy: { startedAt: "desc" },
    });

    if (session) {
      session = await prisma.caseWorkSession.update({
        where: { id: session.id },
        data: { lastHeartbeatAt: now },
      });
      return { session, created: false };
    }

    // Auto-create an AUTO session on this case
    await this.closeRunningSessionForStaff(staffId, "SWITCHED_SESSION");

    session = await prisma.caseWorkSession.create({
      data: {
        caseId,
        staffId,
        startedAt: now,
        lastHeartbeatAt: now,
        source: source || WorkSessionSource.AUTO,
        workType: WorkType.DESK,
        approvalStatus: WorkSessionApprovalStatus.NOT_REQUIRED,
      },
    });

    return { session, created: true };
  }

  /**
   * Cleanup stale sessions - executed every 5 minutes by the background cron.
   * Rules:
   * 1. AUTO: Server closes a segment at its last heartbeat if none arrives for 90s. Ignore visits under 10s.
   * 2. TIMER: Cleanup closes it after 12h.
   */
  static async cleanupStaleSessions() {
    const now = new Date();
    let closedCount = 0;

    // 1. Stale AUTO sessions (last heartbeat older than 90s)
    const autoCutoff = new Date(now.getTime() - 90 * 1000);
    const staleAutoSessions = await prisma.caseWorkSession.findMany({
      where: {
        source: WorkSessionSource.AUTO,
        endedAt: null,
        lastHeartbeatAt: { lt: autoCutoff },
      },
    });

    for (const session of staleAutoSessions) {
      const closeTime = session.lastHeartbeatAt;
      const duration = Math.max(
        0,
        Math.floor((closeTime.getTime() - session.startedAt.getTime()) / 1000)
      );
      const effectiveDuration = duration < 10 ? 0 : duration;

      await prisma.$transaction([
        prisma.caseWorkSession.update({
          where: { id: session.id },
          data: {
            endedAt: closeTime,
            activeSeconds: effectiveDuration,
            endReason: "AUTO_TIMEOUT_NO_HEARTBEAT_90S",
          },
        }),
        prisma.caseReport.update({
          where: { id: session.caseId },
          data: {
            totalActiveSeconds: { increment: effectiveDuration },
          },
        }),
      ]);
      closedCount++;
    }

    // 2. Stale TIMER sessions (running for more than 12 hours)
    const timerCutoff = new Date(now.getTime() - 12 * 3600 * 1000);
    const staleTimerSessions = await prisma.caseWorkSession.findMany({
      where: {
        source: WorkSessionSource.TIMER,
        endedAt: null,
        startedAt: { lt: timerCutoff },
      },
    });

    for (const session of staleTimerSessions) {
      const capSeconds = 12 * 3600;
      const cappedEnd = new Date(session.startedAt.getTime() + capSeconds * 1000);

      await prisma.$transaction([
        prisma.caseWorkSession.update({
          where: { id: session.id },
          data: {
            endedAt: cappedEnd,
            lastHeartbeatAt: cappedEnd,
            activeSeconds: capSeconds,
            endReason: "TIMER_CLEANUP_EXCEEDED_12H",
          },
        }),
        prisma.caseReport.update({
          where: { id: session.caseId },
          data: {
            totalActiveSeconds: { increment: capSeconds },
          },
        }),
      ]);
      closedCount++;
    }

    return closedCount;
  }

  /**
   * Get agent's day summary: sessions, totals, breakdown by work type.
   */
  static async getMyDay(staffId: string, dateStr?: string) {
    let dayStart: Date;
    let dayEnd: Date;

    if (dateStr) {
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestError("Invalid date format provided.");
      }
      dayStart = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 0, 0, 0, 0));
      dayEnd = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 23, 59, 59, 999));
    } else {
      const now = new Date();
      dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    }

    const sessions = await prisma.caseWorkSession.findMany({
      where: {
        staffId,
        startedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            subject: true,   // CaseReport has 'subject', not 'title'
            status: true,
            priority: true,
          },
        },
        audits: {
          include: {
            editedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    // Check for currently running active session
    const activeSession = sessions.find((s) => s.endedAt === null) || null;

    let totalSeconds = 0;
    const workTypeBreakdown: Record<string, number> = {
      DESK: 0,
      PHONE: 0,
      SITE_VISIT: 0,
      HARDWARE_REPAIR: 0,
      TRAVEL: 0,
    };

    const caseMap = new Map<string, { case: any; totalSeconds: number; sessions: any[] }>();

    for (const session of sessions) {
      // If rejected, don't include in totalSeconds
      if (session.approvalStatus === WorkSessionApprovalStatus.REJECTED) {
        continue;
      }

      let sec = session.activeSeconds;
      if (session.endedAt === null) {
        const liveSec = Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000));
        sec = liveSec;
      }

      totalSeconds += sec;
      const wt = session.workType || "DESK";
      workTypeBreakdown[wt] = (workTypeBreakdown[wt] || 0) + sec;

      const caseId = session.caseId;
      if (!caseMap.has(caseId)) {
        caseMap.set(caseId, {
          case: session.case,
          totalSeconds: 0,
          sessions: [],
        });
      }
      const entry = caseMap.get(caseId)!;
      entry.totalSeconds += sec;
      entry.sessions.push(session);
    }

    return {
      date: dayStart.toISOString().split("T")[0],
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      totalSeconds,
      totalSessions: sessions.length,
      workTypeBreakdown,
      activeSession,
      sessions,
      groupedByCase: Array.from(caseMap.values()),
    };
  }

  /**
   * Update a work session with reason and record audit rows for every modified field.
   */
  static async updateSessionWithAudit({
    sessionId,
    staffId,
    reason,
    workType,
    startedAt,
    endedAt,
    note,
  }: {
    sessionId: string;
    staffId: string;
    reason: string;
    workType?: WorkType;
    startedAt?: string;
    endedAt?: string;
    note?: string;
  }) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError("A valid reason for editing this session is required.");
    }

    const session = await prisma.caseWorkSession.findUnique({
      where: { id: sessionId },
      include: {
        case: { select: { id: true, caseNumber: true } },
      },
    });

    if (!session) {
      throw new NotFoundError("Work session not found.");
    }

    // Only owner of the session or staff can edit
    if (session.staffId !== staffId) {
      const staffUser = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { isSAdmin: true, isManager: true, isDirector: true },
      });
      const isPrivileged = staffUser?.isSAdmin || staffUser?.isDirector;
      if (!isPrivileged) {
        throw new ForbiddenError("You can only edit your own work sessions.");
      }
    }

    const newStart = startedAt ? new Date(startedAt) : new Date(session.startedAt);
    const newEnd = endedAt ? new Date(endedAt) : session.endedAt ? new Date(session.endedAt) : null;
    const now = new Date();

    if (isNaN(newStart.getTime())) {
      throw new BadRequestError("Invalid start date provided.");
    }

    if (newEnd) {
      if (isNaN(newEnd.getTime())) {
        throw new BadRequestError("Invalid end date provided.");
      }
      if (newEnd <= newStart) {
        throw new BadRequestError("End time must be strictly after start time.");
      }
      if (newEnd > now) {
        throw new BadRequestError("Cannot set end time in the future.");
      }
    }

    // Overlap validation if dates changed
    if (startedAt || endedAt) {
      const effectiveEnd = newEnd || now;
      const overlap = await prisma.caseWorkSession.findFirst({
        where: {
          id: { not: sessionId },
          staffId: session.staffId,
          startedAt: { lt: effectiveEnd },
          OR: [{ endedAt: null }, { endedAt: { gt: newStart } }],
        },
      });

      if (overlap) {
        throw new BadRequestError("Updated time range overlaps with another existing work session.");
      }
    }

    let newActiveSeconds = session.activeSeconds;
    if (newEnd) {
      newActiveSeconds = Math.max(0, Math.floor((newEnd.getTime() - newStart.getTime()) / 1000));
    }

    // Check if manual session now exceeds 4h
    let newApprovalStatus = session.approvalStatus;
    if (session.source === WorkSessionSource.MANUAL && newActiveSeconds > 4 * 3600) {
      if (session.approvalStatus === WorkSessionApprovalStatus.NOT_REQUIRED) {
        newApprovalStatus = WorkSessionApprovalStatus.PENDING;
      }
    }

    // Collect audit changes
    const auditEntries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

    if (workType !== undefined && workType !== session.workType) {
      auditEntries.push({
        field: "workType",
        oldValue: session.workType,
        newValue: workType,
      });
    }

    if (note !== undefined && note !== session.note) {
      auditEntries.push({
        field: "note",
        oldValue: session.note,
        newValue: note,
      });
    }

    if (startedAt && newStart.toISOString() !== session.startedAt.toISOString()) {
      auditEntries.push({
        field: "startedAt",
        oldValue: session.startedAt.toISOString(),
        newValue: newStart.toISOString(),
      });
    }

    if (endedAt && (!session.endedAt || newEnd?.toISOString() !== session.endedAt.toISOString())) {
      auditEntries.push({
        field: "endedAt",
        oldValue: session.endedAt?.toISOString() || null,
        newValue: newEnd?.toISOString() || null,
      });
    }

    if (newActiveSeconds !== session.activeSeconds) {
      auditEntries.push({
        field: "activeSeconds",
        oldValue: String(session.activeSeconds),
        newValue: String(newActiveSeconds),
      });
    }

    if (newApprovalStatus !== session.approvalStatus) {
      auditEntries.push({
        field: "approvalStatus",
        oldValue: session.approvalStatus,
        newValue: newApprovalStatus,
      });
    }

    if (auditEntries.length === 0) {
      return session; // No changes detected
    }

    const secondsDelta = newActiveSeconds - session.activeSeconds;

    // Execute atomic update, audit log creation, and caseReport adjustment
    const [updatedSession] = await prisma.$transaction([
      prisma.caseWorkSession.update({
        where: { id: sessionId },
        data: {
          workType: workType || session.workType,
          note: note !== undefined ? note : session.note,
          startedAt: newStart,
          endedAt: newEnd,
          lastHeartbeatAt: newEnd || session.lastHeartbeatAt,
          activeSeconds: newActiveSeconds,
          approvalStatus: newApprovalStatus,
        },
        include: {
          case: { select: { id: true, caseNumber: true, subject: true } },
          audits: {
            include: {
              editedBy: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      // Create audits
      ...auditEntries.map((entry) =>
        prisma.caseWorkSessionAudit.create({
          data: {
            sessionId,
            editedById: staffId,
            field: entry.field,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
            reason: reason.trim(),
          },
        })
      ),
      // Adjust case report totalActiveSeconds if not rejected and not pending
      ...(secondsDelta !== 0 && session.approvalStatus !== WorkSessionApprovalStatus.REJECTED && session.approvalStatus !== WorkSessionApprovalStatus.PENDING
        ? [
            prisma.caseReport.update({
              where: { id: session.caseId },
              data: {
                totalActiveSeconds: { increment: secondsDelta },
              },
            }),
          ]
        : []),
    ]);

    return updatedSession;
  }

  // ─── Team Report ───────────────────────────────────────────────────────────

  /**
   * Resolves the staff IDs in a manager's scope (their section/division/department).
   * System admins get all staff.
   */
  static async resolveTeamStaffIds(managerId: string): Promise<string[]> {
    const manager = await prisma.staff.findUnique({
      where: { id: managerId },
      include: {
        managedSection:    { include: { staff: { select: { id: true } } } },
        managedDivision:   { include: { sections: { include: { staff: { select: { id: true } } } } } },
        managedDepartment: { include: { divisions: { include: { sections: { include: { staff: { select: { id: true } } } } } } } },
      },
    });

    if (!manager) return [];

    // System admin → all PS support staff
    if (manager.isSAdmin) {
      const all = await prisma.staff.findMany({ where: { isPSsupport: true }, select: { id: true } });
      return all.map((s) => s.id);
    }

    const ids = new Set<string>();

    if (manager.managedSection) {
      manager.managedSection.staff.forEach((s) => ids.add(s.id));
    } else if (manager.managedDivision) {
      manager.managedDivision.sections.forEach((sec) =>
        sec.staff.forEach((s) => ids.add(s.id))
      );
    } else if (manager.managedDepartment) {
      manager.managedDepartment.divisions.forEach((div) =>
        div.sections.forEach((sec) =>
          sec.staff.forEach((s) => ids.add(s.id))
        )
      );
    }

    return Array.from(ids);
  }

  static async getTeamReport({
    groupBy = "agent",
    from,
    to,
    staffIds,
  }: {
    groupBy?: string;
    from?: string;
    to?: string;
    staffIds?: string[];
  }) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate   = to   ? new Date(to)   : undefined;

    if (fromDate && isNaN(fromDate.getTime())) throw new BadRequestError("Invalid from date.");
    if (toDate   && isNaN(toDate.getTime()))   throw new BadRequestError("Invalid to date.");

    const sessions = await prisma.caseWorkSession.findMany({
      where: {
        approvalStatus: { not: WorkSessionApprovalStatus.REJECTED },
        endedAt: { not: null },
        ...(staffIds && staffIds.length > 0 ? { staffId: { in: staffIds } } : {}),
        ...(fromDate || toDate ? {
          startedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate   ? { lte: toDate }   : {}),
          },
        } : {}),
      },
      include: {
        staff: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            section: { select: { id: true, name: true } },
          },
        },
        case: {
          select: {
            id: true, caseNumber: true, subject: true,
            productCategory: { select: { id: true, name: true } },
            customer: { select: { organization: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const groups = new Map<string, { label: string; meta: any; totalSeconds: number; sessionCount: number }>();

    for (const s of sessions) {
      let key: string;
      let label: string;
      let meta: any = {};

      switch (groupBy) {
        case "case":
          key   = s.caseId;
          label = s.case?.caseNumber || s.caseId;
          meta  = { subject: s.case?.subject };
          break;
        case "category":
          key   = s.case?.productCategory?.id || "none";
          label = s.case?.productCategory?.name || "Uncategorized";
          break;
        case "organization":
          key   = s.case?.customer?.organization?.id || "none";
          label = s.case?.customer?.organization?.name || "Unknown";
          break;
        case "section":
          key   = s.staff?.section?.id || "none";
          label = s.staff?.section?.name || "No Section";
          break;
        default: // "agent"
          key   = s.staffId;
          label = `${s.staff?.firstName || ""} ${s.staff?.lastName || ""}`.trim() || s.staff?.email || s.staffId;
          meta  = { email: s.staff?.email };
          break;
      }

      const existing = groups.get(key);
      if (existing) {
        existing.totalSeconds += s.activeSeconds || 0;
        existing.sessionCount += 1;
      } else {
        groups.set(key, { label, meta, totalSeconds: s.activeSeconds || 0, sessionCount: 1 });
      }
    }

    return {
      groupBy,
      from: fromDate?.toISOString() || null,
      to:   toDate?.toISOString()   || null,
      totalSessions: sessions.length,
      groups: Array.from(groups.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.totalSeconds - a.totalSeconds),
    };
  }

  // ─── Pending approvals ─────────────────────────────────────────────────────

  static async getPendingApprovals(staffIds: string[]) {
    return prisma.caseWorkSession.findMany({
      where: {
        source: WorkSessionSource.MANUAL,
        approvalStatus: WorkSessionApprovalStatus.PENDING,
        ...(staffIds.length > 0 ? { staffId: { in: staffIds } } : {}),
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, email: true } },
        case:  { select: { id: true, caseNumber: true, subject: true } },
        audits: {
          include: { editedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { startedAt: "desc" },
    });
  }

  // ─── Approve / Reject ──────────────────────────────────────────────────────

  static async approveOrRejectSession({
    sessionId,
    managerId,
    action,
    note,
  }: {
    sessionId: string;
    managerId: string;
    action: "APPROVE" | "REJECT";
    note?: string;
  }) {
    const session = await prisma.caseWorkSession.findUnique({
      where: { id: sessionId },
      select: { id: true, caseId: true, staffId: true, approvalStatus: true, activeSeconds: true, source: true },
    });

    if (!session) throw new NotFoundError("Work session not found.");
    if (session.source !== WorkSessionSource.MANUAL) {
      throw new BadRequestError("Only manual time entries require approval.");
    }
    if (session.approvalStatus !== WorkSessionApprovalStatus.PENDING) {
      throw new BadRequestError(`Session is already ${session.approvalStatus}.`);
    }

    const newStatus = action === "APPROVE"
      ? WorkSessionApprovalStatus.APPROVED
      : WorkSessionApprovalStatus.REJECTED;

    const ops: any[] = [
      prisma.caseWorkSession.update({
        where: { id: sessionId },
        data: { approvalStatus: newStatus },
        include: {
          staff: { select: { id: true, firstName: true, lastName: true, email: true } },
          case:  { select: { id: true, caseNumber: true, subject: true } },
        },
      }),
      prisma.caseWorkSessionAudit.create({
        data: {
          sessionId,
          editedById: managerId,
          field: "approvalStatus",
          oldValue: WorkSessionApprovalStatus.PENDING,
          newValue: newStatus,
          reason: note?.trim() || (action === "APPROVE" ? "Approved by manager." : "Rejected by manager."),
        },
      }),
    ];

    // On approval: add seconds to the case total (not counted while PENDING)
    if (action === "APPROVE" && session.activeSeconds > 0) {
      ops.push(
        prisma.caseReport.update({
          where: { id: session.caseId },
          data: { totalActiveSeconds: { increment: session.activeSeconds } },
        })
      );
    }

    const [updatedSession] = await prisma.$transaction(ops);
    return updatedSession;
  }
}
