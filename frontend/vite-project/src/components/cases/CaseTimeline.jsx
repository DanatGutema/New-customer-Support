import StatusBadge from "../support/StatusBadge";

const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const PRIORITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const normalizeText = (value) => {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/_/g, " ").replace(/\s+/g, " ").trim();
};

const formatStatus = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return "Unknown";
  const key = normalized.toUpperCase().replace(/\s+/g, "_");
  return STATUS_LABELS[key] || normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatPriority = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return "Unknown";
  const key = normalized.toUpperCase();
  return PRIORITY_LABELS[key] || normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const getDisplayName = (actor) => {
  if (!actor) return "System";
  if (typeof actor === "string") return actor.trim() || "System";
  if (typeof actor === "object") {
    const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (actor.name) return actor.name;
    if (actor.email) return actor.email;
  }
  return "System";
};

const getTimelineDate = (item) => {
  const rawDate = item?.changedAt || item?.createdAt || item?.updatedAt || item?.submittedAt || item?.timestamp;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getActorName = (item, caseDetails) => {
  const direct = item?.changedBy ?? item?.actor ?? null;
  if (direct) return getDisplayName(direct);

  const actorType = String(item?.actorType || "").toUpperCase();
  if (actorType === "CUSTOMER") {
    const customer = caseDetails?.customer;
    if (customer) {
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
      if (name) return name;
      if (customer.email) return customer.email;
    }
    return "Customer";
  }
  if (actorType === "STAFF") return "Support team";
  return "System";
};

const findAssignedName = (item, caseDetails) => {
  if (item?.newAgentName && String(item.newAgentName).trim()) return String(item.newAgentName).trim();
  const newAgentId = item?.newAgentId ?? item?.assignedAgentId ?? item?.agentId ?? null;
  if (!newAgentId) return null;
  const assigned = caseDetails?.assignedSupport;
  if (assigned && assigned.id === newAgentId)
    return `${assigned.firstName || ""} ${assigned.lastName || ""}`.trim();
  return null;
};

const getStatusEventText = (fromStatus, toStatus) => {
  const lookup = {
    OPEN: "Case created",
    IN_PROGRESS: "Case in progress",
    PENDING: "Awaiting customer or internal action",
    ESCALATED: "Escalated to support lead",
    RESOLVED: "Resolution prepared",
    CLOSED: "Case completed and closed",
    CANCELLED: "Case cancelled",
  };
  const specific = lookup[toStatus?.toUpperCase().replace(/\s+/g, "_") || ""];
  if (specific) return specific;
  const from = formatStatus(fromStatus);
  const to = formatStatus(toStatus);
  if (from && to && from !== to) return `Case moved from ${from} to ${to}`;
  if (to) return `Case updated to ${to}`;
  return "Case updated";
};

const isInitialOpenEvent = (fromStatus, toStatus) => {
  const fromKey = normalizeText(fromStatus).toUpperCase();
  const toKey = normalizeText(toStatus).toUpperCase();
  return Boolean(toKey === "OPEN" && (!fromKey || fromKey === "OPEN"));
};

const hasMeaningfulEvent = (item) => {
  const fromStatus = normalizeText(item?.fromStatus ?? item?.oldStatus ?? item?.previousStatus);
  const toStatus = normalizeText(item?.toStatus ?? item?.newStatus ?? item?.status);
  const oldPriority = normalizeText(item?.oldPriority ?? item?.previousPriority);
  const newPriority = normalizeText(item?.newPriority ?? item?.currentPriority);
  const oldAgentId = item?.oldAgentId ?? item?.previousAgentId ?? null;
  const newAgentId = item?.newAgentId ?? item?.assignedAgentId ?? item?.agentId ?? null;

  return Boolean(
    isInitialOpenEvent(fromStatus, toStatus) ||
      (fromStatus && toStatus && fromStatus !== toStatus) ||
      (oldPriority && newPriority && oldPriority !== newPriority) ||
      (oldAgentId && newAgentId && oldAgentId !== newAgentId) ||
      (item?.note && item.note.trim())
  );
};

export default function CaseTimeline({ history = [], caseDetails = null, hidePriority = false }) {
  const timeline = Array.isArray(history)
    ? (() => {
        const sorted = [...history]
          .sort((a, b) => {
            const dateA = getTimelineDate(a);
            const dateB = getTimelineDate(b);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateA.getTime() - dateB.getTime();
          })
          .filter(hasMeaningfulEvent);

        const deduped = [];
        for (const item of sorted) {
          const prev = deduped[deduped.length - 1];
          if (!prev) { deduped.push(item); continue; }

          const prevFrom = normalizeText(prev?.fromStatus ?? prev?.oldStatus ?? prev?.previousStatus);
          const prevTo   = normalizeText(prev?.toStatus   ?? prev?.newStatus ?? prev?.status);
          const prevOldPr    = normalizeText(prev?.oldPriority ?? prev?.previousPriority);
          const prevNewPr    = normalizeText(prev?.newPriority ?? prev?.currentPriority);
          const prevOldAgent = prev?.oldAgentId ?? prev?.previousAgentId ?? null;
          const prevNewAgent = prev?.newAgentId ?? prev?.assignedAgentId ?? prev?.agentId ?? null;
          const prevNote     = prev?.note && prev.note.trim();

          const curFrom = normalizeText(item?.fromStatus ?? item?.oldStatus ?? item?.previousStatus);
          const curTo   = normalizeText(item?.toStatus   ?? item?.newStatus ?? item?.status);
          const curOldPr    = normalizeText(item?.oldPriority ?? item?.previousPriority);
          const curNewPr    = normalizeText(item?.newPriority ?? item?.currentPriority);
          const curOldAgent = item?.oldAgentId ?? item?.previousAgentId ?? null;
          const curNewAgent = item?.newAgentId ?? item?.assignedAgentId ?? item?.agentId ?? null;
          const curNote     = item?.note && item.note.trim();

          const identical =
            prevFrom === curFrom && prevTo === curTo &&
            prevOldPr === curOldPr && prevNewPr === curNewPr &&
            prevOldAgent === curOldAgent && prevNewAgent === curNewAgent &&
            !prevNote && !curNote;

          if (!identical) deduped.push(item);
        }
        return deduped;
      })()
    : [];

  if (timeline.length === 0) {
    return <div className="text-center py-10 text-slate-500">No timeline available.</div>;
  }

  return (
    /* ── outer container ── */
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

      {/* ── section header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">History</p>
          <h3 className="text-sm font-semibold text-slate-900 leading-tight">Case Timeline</h3>
        </div>
      </div>

      {/* ── timeline list ── */}
      <div className="px-5 py-5">
        <div className="relative border-l-2 border-slate-200 ml-2 space-y-0">
          {timeline.map((item, idx) => {
            const fromStatus = normalizeText(item?.fromStatus ?? item?.oldStatus ?? item?.previousStatus);
            const toStatus   = normalizeText(item?.toStatus   ?? item?.newStatus ?? item?.status);
            const oldPriority = normalizeText(item?.oldPriority ?? item?.previousPriority);
            const newPriority = normalizeText(item?.newPriority ?? item?.currentPriority);
            const oldAgentId  = item?.oldAgentId ?? item?.previousAgentId ?? null;
            const newAgentId  = item?.newAgentId ?? item?.assignedAgentId ?? item?.agentId ?? null;

            const hasStatusChange   = Boolean(fromStatus && toStatus && fromStatus !== toStatus);
            const isOpenCreation    = isInitialOpenEvent(fromStatus, toStatus);
            const hasPriorityChange = Boolean(oldPriority && newPriority && oldPriority !== newPriority);
            const hasAssignmentChange = Boolean(oldAgentId && newAgentId && oldAgentId !== newAgentId);
            const changedByName = getActorName(item, caseDetails);
            const timelineDate  = getTimelineDate(item);
            const upperTo = toStatus?.toUpperCase();

            const assignedName      = item?.newAgentName || findAssignedName(item, caseDetails) || "";
            const showAssignedHere  = Boolean(assignedName) && !hasAssignmentChange;

            let noteShownInBlock = "";
            if (hasStatusChange) {
              if (upperTo === "PENDING" || upperTo === "ESCALATED" || upperTo === "CANCELLED") {
                noteShownInBlock = item?.reason || item?.note || "";
              } else if (upperTo === "RESOLVED") {
                noteShownInBlock = item?.resolutionSnapshot || item?.note || item?.reason || "";
              }
            }
            const showNote = item?.note && String(item.note).trim() !== String(noteShownInBlock).trim();

            const isLast = idx === timeline.length - 1;

            return (
              <div
                key={item.id || `${fromStatus}-${toStatus}-${oldPriority}-${newPriority}-${newAgentId}-${idx}`}
                className={`relative pl-8 ${isLast ? "pb-1" : "pb-8"}`}
              >
                {/* dot */}
                <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full bg-blue-500 border-2 border-white shadow-sm" />

                {/* card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">

                  {/* card header row */}
                  <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                    <StatusBadge status={(hasStatusChange ? toStatus : item?.status || toStatus || "OPEN").toUpperCase()} />
                    {timelineDate ? (
                      <span className="text-xs text-slate-500 shrink-0 text-right leading-tight">
                        {timelineDate.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 shrink-0">Date unavailable</span>
                    )}
                  </div>

                  {/* card body */}
                  <div className="px-4 pb-4 space-y-1">

                    {/* event title */}
                    {(hasStatusChange || isOpenCreation) && (
                      <p className="text-sm text-slate-600">
                        {getStatusEventText(fromStatus, toStatus)}
                      </p>
                    )}
                    {!hasStatusChange && !isOpenCreation && item?.status && (
                      <p className="text-sm text-slate-600">{formatStatus(item.status)}</p>
                    )}

                    {/* ── OPEN ── */}
                    {isOpenCreation && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">Case submitted successfully</p>
                        <p className="text-sm text-slate-700">
                          Created by: {getDisplayName(item?.changedBy ?? item?.actor ?? caseDetails?.customer)}
                        </p>
                      </div>
                    )}

                    {/* ── IN PROGRESS ── */}
                    {hasStatusChange && upperTo === "IN PROGRESS" && (
                      <div className="space-y-0.5">
                        {showAssignedHere && (
                          <p className="text-sm font-semibold text-slate-800">Assigned to: {assignedName}</p>
                        )}
                        <p className={`text-sm text-slate-700 ${!showAssignedHere ? "font-semibold text-slate-800" : ""}`}>
                          Started by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}
                        </p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── PENDING ── */}
                    {hasStatusChange && upperTo === "PENDING" && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">
                          Pending reason: {item?.reason || item?.note || "(no reason provided)"}
                        </p>
                        <p className="text-sm text-slate-700">Performed by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}</p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── ESCALATED ── */}
                    {hasStatusChange && upperTo === "ESCALATED" && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">
                          Escalated to: {item?.reason || item?.note || "(team/person not specified)"}
                        </p>
                        <p className="text-sm text-slate-700">Escalated by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}</p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── RESOLVED ── */}
                    {hasStatusChange && upperTo === "RESOLVED" && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">
                          Resolved by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}
                        </p>
                        <p className="text-sm text-slate-700">
                          Resolution: {item?.resolutionSnapshot || item?.note || item?.reason || caseDetails?.resolutionSummary || "(no resolution provided)"}
                        </p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── CLOSED ── */}
                    {hasStatusChange && upperTo === "CLOSED" && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">Case closed</p>
                        <p className="text-sm text-slate-700">Closed by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}</p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── CANCELLED ── */}
                    {hasStatusChange && upperTo === "CANCELLED" && (
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-800">Case cancelled</p>
                        <p className="text-sm text-slate-700">Cancelled by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}</p>
                        <p className="text-sm text-slate-700">Reason: {item?.reason || item?.note || "(no reason provided)"}</p>
                        <p className="text-sm text-slate-700">Previous status: {formatStatus(fromStatus)}</p>
                      </div>
                    )}

                    {/* ── PRIORITY CHANGE ── */}
                    {!hidePriority && hasPriorityChange && (
                      <p className="text-sm text-orange-600 font-medium">
                        Priority updated: {formatPriority(oldPriority)} → {formatPriority(newPriority)}
                      </p>
                    )}

                    {/* ── ASSIGNMENT CHANGE ── */}
                    {hasAssignmentChange && (
                      <div className="space-y-0.5">
                        <p className="text-sm text-slate-700">Assigned to: {assignedName || "(staff)"}</p>
                        <p className="text-sm text-slate-700">Assigned by: {getDisplayName(item?.changedBy ?? item?.actor ?? null)}</p>
                      </div>
                    )}

                    {/* ── free text note ── */}
                    {showNote && (
                      <p className="text-sm text-slate-600">{item.note}</p>
                    )}

                    {/* ── footer ── */}
                    <div className="pt-3 border-t border-slate-200 mt-3">
                      <p className="text-xs text-slate-400">Changed by: {changedByName}</p>
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
