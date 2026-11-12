import { useState, useMemo } from "react";
import { Clock, AlertCircle, X, ShieldAlert, CheckCircle2 } from "lucide-react";
import timeTrackingApi from "../../api/timeTrackingApi";

const WORK_TYPES = [
  { value: "DESK", label: "Desk / Investigation" },
  { value: "PHONE", label: "Phone Call / Conference" },
  { value: "SITE_VISIT", label: "Site Visit" },
  { value: "HARDWARE_REPAIR", label: "Hardware Repair" },
  { value: "TRAVEL", label: "Travel" },
];

export default function LogTimeModal({ caseId, isOpen, onClose, onSuccess }) {
  const [workType, setWorkType] = useState("DESK");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const durationMinutes = useMemo(() => {
    if (!date || !startTime || !endTime) return 0;
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60);
    return diff > 0 ? Math.round(diff) : 0;
  }, [date, startTime, endTime]);

  const durationFormatted = useMemo(() => {
    if (durationMinutes <= 0) return "0m";
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  }, [durationMinutes]);

  const exceedsFourHours = durationMinutes > 240;

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!note.trim()) {
      setError("Please provide a note describing the work performed.");
      return;
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endIso) > new Date()) {
      setError("Cannot log work in the future.");
      return;
    }

    if (new Date(endIso) <= new Date(startIso)) {
      setError("End time must be after start time.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await timeTrackingApi.logManualTime({
        caseId,
        startedAt: startIso,
        endedAt: endIso,
        workType,
        note: note.trim(),
      });

      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to record manual time log."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-ink-200 bg-[#0b1b33] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-sky-400" />
            <h3 className="text-sm font-bold tracking-tight">Log Manual Work Time</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
              Work Type
            </label>
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs font-medium text-ink-800 focus:border-[#0b1b33] focus:outline-hidden"
            >
              {WORK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
              Date
            </label>
            <input
              type="date"
              max={new Date().toISOString().split("T")[0]}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs text-ink-800 focus:border-[#0b1b33] focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs text-ink-800 focus:border-[#0b1b33] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs text-ink-800 focus:border-[#0b1b33] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs">
            <span className="text-slate-600 font-medium">Calculated Duration:</span>
            <span className="font-mono font-bold text-slate-900">{durationFormatted}</span>
          </div>

          {exceedsFourHours && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Entries exceeding 4 hours require manager approval before being added to total active case time.
              </span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
              Work Note <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe actions taken, diagnosis, hardware replaced..."
              required
              className="w-full rounded-lg border border-ink-300 bg-white p-2.5 text-xs text-ink-800 placeholder-ink-400 focus:border-[#0b1b33] focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-ink-600 hover:text-ink-800 hover:bg-ink-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || durationMinutes <= 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0b1b33] hover:bg-[#102949] rounded-lg transition disabled:opacity-50"
            >
              {submitting ? "Logging..." : "Save Time Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

