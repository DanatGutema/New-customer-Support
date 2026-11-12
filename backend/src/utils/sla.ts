/**
 * SLA utility — response/resolution targets, elapsed-time calculation
 * (pauses while the case is PENDING), deadline computation.
 *
 * Targets are in milliseconds.
 */

// ─── SLA targets ────────────────────────────────────────────────────────────

export interface SlaTargets {
  responseMs: number;   // time from OPEN → first IN_PROGRESS
  resolutionMs: number; // total active time from OPEN → RESOLVED
}

const HOUR = 60 * 60 * 1000;
const DAY  =  24 * HOUR;

/**
 * SLA targets by priority.
 * null priority = lowest tier (same as LOW).
 */
export const SLA_TARGETS: Record<string, SlaTargets> = {
  URGENT:  { responseMs:  1 * HOUR,  resolutionMs:  8 * HOUR  },
  HIGH:    { responseMs:  4 * HOUR,  resolutionMs: 24 * HOUR  },
  MEDIUM:  { responseMs:  8 * HOUR,  resolutionMs:  2 * DAY   },
  LOW:     { responseMs: 24 * HOUR,  resolutionMs:  5 * DAY   },
};

export const DEFAULT_SLA = SLA_TARGETS.LOW;

export function getSlaTargets(priority?: string | null): SlaTargets {
  if (!priority) return DEFAULT_SLA;
  return SLA_TARGETS[priority.toUpperCase()] ?? DEFAULT_SLA;
}

// ─── History-row shape we need ───────────────────────────────────────────────

export interface HistoryRow {
  toStatus: string;
  fromStatus: string;
  createdAt: Date;
}

// ─── Elapsed active time ─────────────────────────────────────────────────────

/**
 * Returns total milliseconds the case has been "active" (not PENDING,
 * not RESOLVED, not CLOSED, not CANCELLED).
 *
 * Walks status history chronologically, accumulating time only while
 * the case is in an active status.
 */
export function computeElapsedActiveMs(
  history: HistoryRow[],
  now: Date = new Date(),
): number {
  const PAUSED_STATUSES = new Set(["PENDING", "RESOLVED", "CLOSED", "CANCELLED"]);

  if (!history || history.length === 0) return 0;

  // Sort ascending
  const sorted = [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let elapsed = 0;
  let lastActiveStart: Date | null = null;

  for (const row of sorted) {
    const rowTime = new Date(row.createdAt);
    const to = (row.toStatus ?? "").toUpperCase();

    if (PAUSED_STATUSES.has(to)) {
      // Transitioning into a paused state — accumulate active time up to this point
      if (lastActiveStart) {
        elapsed += rowTime.getTime() - lastActiveStart.getTime();
        lastActiveStart = null;
      }
    } else {
      // Transitioning into an active state — mark start if not already tracking
      if (!lastActiveStart) {
        lastActiveStart = rowTime;
      }
    }
  }

  // If currently in an active state, count time up to now
  if (lastActiveStart) {
    elapsed += now.getTime() - lastActiveStart.getTime();
  }

  return Math.max(0, elapsed);
}

// ─── Response time ───────────────────────────────────────────────────────────

/**
 * Returns the time (ms) from case creation to first IN_PROGRESS transition.
 * Returns null if the case has not been picked up yet.
 */
export function computeFirstResponseMs(history: HistoryRow[]): number | null {
  const sorted = [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const creation = sorted.find((r) => (r.toStatus ?? "").toUpperCase() === "OPEN");
  const firstInProgress = sorted.find(
    (r) => (r.toStatus ?? "").toUpperCase() === "IN_PROGRESS",
  );

  if (!creation || !firstInProgress) return null;

  return (
    new Date(firstInProgress.createdAt).getTime() -
    new Date(creation.createdAt).getTime()
  );
}

// ─── SLA status ──────────────────────────────────────────────────────────────

export type SlaStatus = "OK" | "WARNING" | "BREACHED";

export interface SlaInfo {
  priority: string;
  targets: SlaTargets;
  elapsedActiveMs: number;
  remainingMs: number;     // ms until resolution SLA breaches (negative = overdue)
  percentUsed: number;     // 0–100+
  status: SlaStatus;
  /** ISO string of when resolution SLA will/did breach (approximate) */
  resolutionDeadline: string | null;
  responseBreached: boolean;
  responseMs: number | null;
}

/**
 * Computes full SLA information for a case given its status history
 * and current priority.
 */
export function computeSlaInfo(
  history: HistoryRow[],
  priority: string | null | undefined,
  now: Date = new Date(),
): SlaInfo {
  const targets  = getSlaTargets(priority);
  const pLabel   = (priority ?? "LOW").toUpperCase();
  const elapsed  = computeElapsedActiveMs(history, now);
  const remaining = targets.resolutionMs - elapsed;
  const percent  = Math.round((elapsed / targets.resolutionMs) * 100);

  let slaStatus: SlaStatus = "OK";
  if (remaining <= 0) slaStatus = "BREACHED";
  else if (percent >= 75) slaStatus = "WARNING";

  // Approximate deadline: now + remainingMs
  const deadlineDate = new Date(now.getTime() + remaining);

  const responseMs  = computeFirstResponseMs(history);
  const responseSlaMs = targets.responseMs;
  const responseBreached = responseMs !== null
    ? responseMs > responseSlaMs
    : false;

  return {
    priority: pLabel,
    targets,
    elapsedActiveMs: elapsed,
    remainingMs: remaining,
    percentUsed: percent,
    status: slaStatus,
    resolutionDeadline: deadlineDate.toISOString(),
    responseBreached,
    responseMs,
  };
}

// ─── Formatting helpers (used on the frontend too via API response) ──────────

export function formatDuration(ms: number): string {
  const abs  = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs  > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}
