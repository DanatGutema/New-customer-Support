import { useEffect, useState } from "react";
import { Clock, AlertTriangle, ShieldAlert } from "lucide-react";

/**
 * SlaCountdown
 *
 * Accepts a `sla` object from the backend:
 * {
 *   status: "OK" | "WARNING" | "BREACHED",
 *   remainingMs: number,   // negative = overdue
 *   percentUsed: number,
 *   resolutionDeadline: string,  // ISO
 *   priority: string,
 * }
 *
 * Renders a compact chip with a live countdown.
 */

function formatMs(ms) {
  const abs  = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs  > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function SlaCountdown({ sla, compact = false }) {
  // Live countdown — recalculates every minute
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!sla?.resolutionDeadline) return sla?.remainingMs ?? null;
    return new Date(sla.resolutionDeadline).getTime() - Date.now();
  });

  useEffect(() => {
    if (!sla?.resolutionDeadline) return;

    const tick = () => {
      setRemainingMs(new Date(sla.resolutionDeadline).getTime() - Date.now());
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [sla?.resolutionDeadline]);

  if (!sla || remainingMs === null) return null;

  // Terminal case statuses pass sla=null from backend — nothing to show
  const status   = remainingMs <= 0 ? "BREACHED" : sla.status;
  const overdue  = remainingMs <= 0;
  const label    = overdue ? `Overdue ${formatMs(remainingMs)}` : `${formatMs(remainingMs)} left`;

  const config = {
    OK: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      icon: Clock,
    },
    WARNING: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      icon: AlertTriangle,
    },
    BREACHED: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      icon: ShieldAlert,
    },
  }[status] || {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-500",
    icon: Clock,
  };

  const Icon = config.icon;

  if (compact) {
    // Tiny chip for table rows
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap
          ${config.bg} ${config.border} ${config.text}`}
        title={`SLA: ${label} (${sla.priority})`}
      >
        <Icon size={10} strokeWidth={2.2} />
        {label}
      </span>
    );
  }

  // Full chip for detail views
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${config.bg} ${config.border}`}
    >
      <Icon size={15} strokeWidth={2} className={config.text} />
      <div>
        <p className={`text-xs font-bold leading-tight ${config.text}`}>
          {status === "BREACHED" ? "SLA Breached" : status === "WARNING" ? "SLA Warning" : "On track"}
        </p>
        <p className={`text-[11px] leading-tight ${config.text} opacity-80`}>
          {label} · {sla.priority}
        </p>
      </div>

      {/* progress bar */}
      <div className="ml-auto h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            status === "BREACHED" ? "bg-red-500" :
            status === "WARNING"  ? "bg-amber-400" : "bg-emerald-400"
          }`}
          style={{ width: `${Math.min(100, sla.percentUsed)}%` }}
        />
      </div>
    </div>
  );
}
