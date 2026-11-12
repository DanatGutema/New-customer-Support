import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit2,
  CheckCircle2,
  Clock4,
  AlertTriangle,
  Play,
  Briefcase,
  Phone,
  MapPin,
  Wrench,
  Car,
  Layers,
  FileText,
  History,
} from "lucide-react";
import timeTrackingApi from "../../api/timeTrackingApi";
import EditSessionModal from "../../components/support/EditSessionModal";

function formatSeconds(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return "0m";
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatTime(isoString) {
  if (!isoString) return "--:--";
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const WORK_TYPE_CONFIG = {
  DESK: { label: "Desk Work", icon: Briefcase, color: "bg-blue-50 text-blue-700 border-blue-200" },
  PHONE: { label: "Phone Call", icon: Phone, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SITE_VISIT: { label: "Site Visit", icon: MapPin, color: "bg-purple-50 text-purple-700 border-purple-200" },
  HARDWARE_REPAIR: { label: "Hardware Repair", icon: Wrench, color: "bg-amber-50 text-amber-700 border-amber-200" },
  TRAVEL: { label: "Travel", icon: Car, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

const SOURCE_CONFIG = {
  AUTO: { label: "Auto", color: "bg-slate-100 text-slate-700 border-slate-200" },
  TIMER: { label: "Timer", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  MANUAL: { label: "Manual", color: "bg-purple-100 text-purple-800 border-purple-300" },
};

const STATUS_CONFIG = {
  NOT_REQUIRED: { label: "Approved", icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  APPROVED: { label: "Approved", icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  PENDING: { label: "Pending Approval", icon: Clock4, color: "text-amber-700 bg-amber-50 border-amber-200" },
  REJECTED: { label: "Rejected", icon: AlertTriangle, color: "text-red-700 bg-red-50 border-red-200" },
};

export default function MyDayPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingSession, setEditingSession] = useState(null);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "by_case"

  const fetchMyDay = useCallback(async () => {
    try {
      setLoading(true);
      const res = await timeTrackingApi.getMyDay(selectedDate);
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Failed to load My Day data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchMyDay();
  }, [fetchMyDay]);

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header & Date Navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
                <Clock className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                My Day
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Track, review, and adjust your daily working hours across support cases.
            </p>
          </div>

          {/* Date Picker Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-2xs"
              title="Previous Day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <button
              type="button"
              onClick={handleNextDay}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-2xs"
              title="Next Day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {!isToday && (
              <button
                type="button"
                onClick={handleToday}
                className="h-9 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Worked */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Worked
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {formatSeconds(data?.totalSeconds || 0)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Logged across {data?.totalSessions || 0} sessions
              </p>
            </div>
          </div>

          {/* Active Running Timer */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Timer
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Play className="h-4 w-4 fill-emerald-600" />
              </div>
            </div>
            <div className="mt-3">
              {data?.activeSession ? (
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 animate-pulse border border-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Running Now
                  </div>
                  <div className="mt-1">
                    <Link
                      to={`/support/case/${data.activeSession.caseId}`}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      {data.activeSession.case?.caseNumber || "View Active Case"}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-medium pt-1">
                  No active timer running
                </div>
              )}
            </div>
          </div>

          {/* Cases Touched */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cases Worked On
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {data?.groupedByCase?.length || 0}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Unique cases addressed today
              </p>
            </div>
          </div>

          {/* Work Breakdown Chips */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Activity Distribution
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Briefcase className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(data?.workTypeBreakdown || {}).map(([type, sec]) => {
                if (sec <= 0) return null;
                const conf = WORK_TYPE_CONFIG[type] || WORK_TYPE_CONFIG.DESK;
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${conf.color}`}
                  >
                    {conf.label}: {formatSeconds(sec)}
                  </span>
                );
              })}
              {(!data?.workTypeBreakdown || Object.values(data.workTypeBreakdown).every((s) => s === 0)) && (
                <span className="text-xs text-slate-400">No time recorded</span>
              )}
            </div>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${viewMode === "timeline"
                  ? "bg-[#0b1b33] text-white shadow-2xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
            >
              Chronological Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode("by_case")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${viewMode === "by_case"
                  ? "bg-[#0b1b33] text-white shadow-2xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
            >
              Grouped by Case
            </button>
          </div>

          <span className="text-xs text-slate-500">
            {data?.sessions?.length || 0} session{data?.sessions?.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Sessions Content */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
            Loading your day's work sessions...
          </div>
        ) : !data?.sessions || data.sessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <Clock className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-sm font-bold text-slate-800">No Work Sessions Logged</h3>
            <p className="mt-1 text-xs text-slate-500">
              You haven't recorded any time for {selectedDate}.
            </p>
          </div>
        ) : viewMode === "timeline" ? (
          /* Timeline / Table View */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3.5">Time Interval</th>
                    <th className="px-4 py-3.5">Case</th>
                    <th className="px-4 py-3.5">Type & Source</th>
                    <th className="px-4 py-3.5">Duration</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Note</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.sessions.map((session) => {
                    const wt = WORK_TYPE_CONFIG[session.workType] || WORK_TYPE_CONFIG.DESK;
                    const src = SOURCE_CONFIG[session.source] || SOURCE_CONFIG.AUTO;
                    const st = STATUS_CONFIG[session.approvalStatus] || STATUS_CONFIG.NOT_REQUIRED;
                    const StatusIcon = st.icon;
                    const WtIcon = wt.icon;
                    const isRunning = !session.endedAt;

                    return (
                      <tr key={session.id} className="hover:bg-slate-50/70 transition">
                        {/* Time Interval */}
                        <td className="px-5 py-3.5 font-mono text-[11px]">
                          {formatTime(session.startedAt)} - {isRunning ? "Now" : formatTime(session.endedAt)}
                        </td>

                        {/* Case Number & Title */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <Link
                            to={`/support/case/${session.caseId}`}
                            className="font-bold text-blue-600 hover:underline block truncate"
                          >
                            {session.case?.caseNumber || "Case"}
                          </Link>
                          <span className="text-[11px] text-slate-500 block truncate">
                            {session.case?.title}
                          </span>
                        </td>

                        {/* Work Type & Source */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${wt.color}`}>
                              <WtIcon className="h-3 w-3" />
                              {wt.label}
                            </span>
                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${src.color}`}>
                              {src.label}
                            </span>
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                          {formatSeconds(session.activeSeconds)}
                          {isRunning && (
                            <span className="ml-1 text-[10px] text-emerald-600 font-normal">
                              (live)
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${st.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {st.label}
                          </span>
                        </td>

                        {/* Note & Audits */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="truncate text-slate-600 text-[11px]">
                            {session.note || <span className="text-slate-400 italic">No note</span>}
                          </p>
                          {session.audits?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                              <History className="h-3 w-3" />
                              Edited ({session.audits.length})
                            </span>
                          )}
                        </td>

                        {/* Action: Edit */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingSession(session)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs"
                          >
                            <Edit2 className="h-3 w-3 text-slate-500" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Grouped by Case View */
          <div className="space-y-4">
            {data.groupedByCase.map((group) => (
              <div
                key={group.case?.id || Math.random()}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs"
              >
                {/* Case Header */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/support/case/${group.case?.id}`}
                      className="font-bold text-sm text-blue-600 hover:underline"
                    >
                      {group.case?.caseNumber || "Case"}
                    </Link>
                    <span className="text-xs text-slate-600 font-medium">
                      {group.case?.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Subtotal:</span>
                    <span className="rounded-lg bg-slate-200/70 px-2.5 py-1 font-mono text-xs font-bold text-slate-900">
                      {formatSeconds(group.totalSeconds)}
                    </span>
                  </div>
                </div>

                {/* Case Sessions List */}
                <div className="divide-y divide-slate-100 p-2 sm:p-4">
                  {group.sessions.map((s) => {
                    const wt = WORK_TYPE_CONFIG[s.workType] || WORK_TYPE_CONFIG.DESK;
                    const st = STATUS_CONFIG[s.approvalStatus] || STATUS_CONFIG.NOT_REQUIRED;
                    const WtIcon = wt.icon;

                    return (
                      <div
                        key={s.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 hover:bg-slate-50/60 rounded-xl transition gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${wt.color}`}>
                            <WtIcon className="h-3 w-3" />
                            {wt.label}
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            {formatTime(s.startedAt)} - {s.endedAt ? formatTime(s.endedAt) : "Now"}
                          </span>
                          {s.note && (
                            <span className="text-xs text-slate-500 italic max-w-sm truncate">
                              "{s.note}"
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {formatSeconds(s.activeSeconds)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingSession(s)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Session Modal */}
      <EditSessionModal
        session={editingSession}
        isOpen={Boolean(editingSession)}
        onClose={() => setEditingSession(null)}
        onSuccess={() => {
          setEditingSession(null);
          fetchMyDay();
        }}
      />
    </div>
  );
}

