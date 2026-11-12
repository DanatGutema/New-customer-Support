import { useMemo } from "react";
import StatusBadge from "../../components/customer/StatusBadge";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

// Full class strings so Tailwind can see them.
const DOT_STYLES = {
  OPEN: { bg: "bg-blue-500", ring: "ring-blue-100" },
  IN_PROGRESS: { bg: "bg-emerald-500", ring: "ring-emerald-100" },
  PENDING: { bg: "bg-orange-500", ring: "ring-orange-100" },
  ESCALATED: { bg: "bg-red-500", ring: "ring-red-100" },
  RESOLVED: { bg: "bg-teal-500", ring: "ring-teal-100" },
  CLOSED: { bg: "bg-slate-500", ring: "ring-slate-200" },
  CANCELLED: { bg: "bg-red-400", ring: "ring-red-100" },
  DEFAULT: { bg: "bg-slate-400", ring: "ring-slate-200" },
};

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const formatDateTime = (date) => (date ? dateTimeFormat.format(date) : "");

const text = (value) => (typeof value === "string" ? value.trim() : "");

// "in progress" / "IN_PROGRESS" / "In Progress" -> "IN_PROGRESS"
const toKey = (value) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/ /g, "_");

const formatStatus = (key) => {
  if (!key) return "";
  return (
    STATUS_LABELS[key] ||
    key
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
};

const getDisplayName = (actor) => {
  if (!actor) return "System";

  if (typeof actor === "string") {
    return actor.trim() || "System";
  }

  if (typeof actor === "object") {
    const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (actor.name) return actor.name;
    if (actor.email) return actor.email;
  }

  return "System";
};

const getTimelineDate = (item) => {
  const rawDate =
    item?.changedAt ||
    item?.createdAt ||
    item?.updatedAt ||
    item?.submittedAt ||
    item?.timestamp;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Only use the current assignee's name when the ids match, so older
// assignment rows never show the wrong person.
const resolveAssignedName = (event, caseDetails) => {
  if (event.newAgentName) return event.newAgentName;

  const assigned = caseDetails?.assignedSupport;
  if (assigned && event.newAgentId && assigned.id === event.newAgentId) {
    return `${assigned.firstName || ""} ${assigned.lastName || ""}`.trim() || null;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* One place that reads a raw history row                              */
/* ------------------------------------------------------------------ */

const normalizeEvent = (item) => {
  const from = toKey(item?.fromStatus ?? item?.oldStatus ?? item?.previousStatus);
  const to = toKey(item?.toStatus ?? item?.newStatus ?? item?.status);
  const oldAgentId = item?.oldAgentId ?? item?.previousAgentId ?? null;
  const newAgentId =
    item?.newAgentId ?? item?.assignedAgentId ?? item?.agentId ?? null;
  const note = text(item?.note);

  return {
    id: item?.id ?? null,
    from,
    to,
    oldAgentId,
    newAgentId,
    newAgentName: text(item?.newAgentName),
    note,
    reason: text(item?.reason) || note,
    resolution: text(item?.resolutionSnapshot),
    actorName: getDisplayName(item?.changedBy ?? item?.actor ?? null),
    date: getTimelineDate(item),
    isCreation: to === "OPEN" && (!from || from === "OPEN"),
    statusChanged: Boolean(from && to && from !== to),
    assignmentChanged: Boolean(newAgentId && newAgentId !== oldAgentId),
  };
};

const buildTimeline = (history) => {
  if (!Array.isArray(history)) return [];

  const sorted = history
    .map(normalizeEvent)
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    })
    .filter(
      (event) =>
        event.isCreation ||
        event.statusChanged ||
        event.assignmentChanged ||
        event.note
    );

  // Drop back-to-back rows that say exactly the same thing.
  const deduped = [];
  for (const event of sorted) {
    const prev = deduped[deduped.length - 1];
    const identical =
      prev &&
      prev.from === event.from &&
      prev.to === event.to &&
      prev.oldAgentId === event.oldAgentId &&
      prev.newAgentId === event.newAgentId &&
      !prev.note &&
      !event.note;

    if (!identical) deduped.push(event);
  }
  return deduped;
};

/* ------------------------------------------------------------------ */
/* What each kind of card shows                                        */
/* A field is [label, getValue(event, caseDetails), emphasis?]         */
/* Empty values are skipped automatically.                             */
/* ------------------------------------------------------------------ */

const actor = (label, emphasis = false) => [label, (e) => e.actorName, emphasis];
const assigned = ["Assigned to", (e, c) => resolveAssignedName(e, c)];
const previous = ["Previous status", (e) => formatStatus(e.from)];

const STATUS_CONFIG = {
  OPEN: {
    title: "Case created",
    fields: [actor("Created by", true), ["Created on", (e) => formatDateTime(e.date)]],
  },
  IN_PROGRESS: {
    title: "Case in progress",
    fields: [actor("Started by", true), assigned, previous],
  },
  PENDING: {
    title: "Awaiting customer or internal action",
    fields: [
      ["Pending reason", (e) => e.reason || "(no reason provided)", true],
      actor("Performed by"),
      previous,
    ],
  },
  ESCALATED: {
    title: "Escalated to support lead",
    fields: [
      ["Escalated to", (e) => e.reason || "(team/person not specified)", true],
      actor("Escalated by"),
      previous,
    ],
  },
  RESOLVED: {
    title: "Resolution prepared",
    fields: [
      actor("Resolved by", true),
      [
        "Resolution",
        (e, c) =>
          e.resolution ||
          e.note ||
          e.reason ||
          c?.resolutionSummary ||
          "(no resolution provided)",
      ],
      previous,
    ],
  },
  CLOSED: {
    title: "Case completed and closed",
    headline: "Case closed",
    fields: [actor("Closed by"), previous],
  },
  CANCELLED: {
    title: "Case cancelled",
    headline: "Case cancelled",
    fields: [
      actor("Cancelled by"),
      ["Reason", (e) => e.reason || "(no reason provided)"],
      previous,
    ],
  },
};

const ASSIGNMENT_CONFIG = {
  title: "Case assigned",
  fields: [
    ["Assigned to", (e, c) => resolveAssignedName(e, c) || "Support staff"],
    actor("Assigned by"),
  ],
};

const getConfig = (event) => {
  if (event.isCreation) return STATUS_CONFIG.OPEN;
  if (event.statusChanged && STATUS_CONFIG[event.to]) return STATUS_CONFIG[event.to];

  if (event.statusChanged) {
    return {
      title: `Case moved from ${formatStatus(event.from)} to ${formatStatus(event.to)}`,
      fields: [actor("Changed by")],
    };
  }

  if (event.assignmentChanged) return ASSIGNMENT_CONFIG;

  return {
    title: event.to ? formatStatus(event.to) : "Case updated",
    fields: [actor("Updated by")],
  };
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CaseTimeline({
  history = [],
  caseDetails = null,
  newestFirst = false,
  showHeading = true,
}) {
  const events = useMemo(() => buildTimeline(history), [history]);

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        No updates yet. Progress will appear here as your case moves.
      </div>
    );
  }

  const latest = events[events.length - 1];
  const display = newestFirst ? [...events].reverse() : events;

  return (
    <section className="mt-8">
      {showHeading && (
        <h3 className="mb-6 text-xl font-bold text-navy-950">Case Timeline</h3>
      )}

      <ol>
        {display.map((event, index) => {
          const config = getConfig(event);
          const isLast = index === display.length - 1;
          const isLatest = event === latest;
          const dot = DOT_STYLES[event.to] || DOT_STYLES.DEFAULT;

          const rows = (config.fields || [])
            .map(([label, getValue, emphasis]) => ({
              label,
              value: getValue(event, caseDetails),
              emphasis,
            }))
            .filter((row) => row.value);

          // Show the free-text note only if a field has not already shown it.
          const showNote =
            event.note && !rows.some((row) => row.value === event.note);

          return (
            <li
              key={event.id ?? `${index}-${event.from}-${event.to}-${event.newAgentId}`}
              className={`flex gap-4 ${isLast ? "" : "pb-8"}`}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`h-4 w-4 shrink-0 rounded-full ${dot.bg} ${
                    isLatest ? `ring-4 ${dot.ring}` : ""
                  }`}
                  aria-hidden="true"
                />
                {!isLast && <div className="mt-2 w-[2px] flex-1 bg-gray-300" />}
              </div>

              <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Same format as before: underscores replaced with spaces. */}
                    <StatusBadge
                      status={(event.to || event.from || "OPEN").replace(/_/g, " ")}
                    />
                    {isLatest && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Latest
                      </span>
                    )}
                  </div>

                  {event.date ? (
                    <time
                      dateTime={event.date.toISOString()}
                      className="text-[13px] text-slate-500"
                    >
                      {formatDateTime(event.date)}
                    </time>
                  ) : (
                    <span className="text-[13px] text-slate-400">Date unavailable</span>
                  )}
                </div>

                <h4 className="mt-3 font-semibold text-navy-900">{config.title}</h4>

                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  {config.headline && (
                    <p className="font-medium">{config.headline}</p>
                  )}

                  {rows.map((row) => (
                    <p key={row.label} className={row.emphasis ? "font-medium" : undefined}>
                      {row.label}: {row.value}
                    </p>
                  ))}

                  {showNote && (
                    <p className="whitespace-pre-line text-slate-600">{event.note}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
