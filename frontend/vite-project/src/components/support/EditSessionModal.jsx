import { useState, useEffect } from "react";
import { X, Clock, AlertCircle, History, Check } from "lucide-react";
import timeTrackingApi from "../../api/timeTrackingApi";

const WORK_TYPES = [
  { value: "DESK", label: "Desk Work" },
  { value: "PHONE", label: "Phone Call" },
  { value: "SITE_VISIT", label: "Site Visit" },
  { value: "HARDWARE_REPAIR", label: "Hardware Repair" },
  { value: "TRAVEL", label: "Travel" },
];

function toLocalDatetimeString(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditSessionModal({ session, isOpen, onClose, onSuccess }) {
  const [workType, setWorkType] = useState("DESK");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAudits, setShowAudits] = useState(false);

  useEffect(() => {
    if (session) {
      setWorkType(session.workType || "DESK");
      setStartedAt(toLocalDatetimeString(session.startedAt));
      setEndedAt(toLocalDatetimeString(session.endedAt));
      setNote(session.note || "");
      setReason("");
      setError("");
      setShowAudits(false);
    }
  }, [session, isOpen]);

  if (!isOpen || !session) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!reason || reason.trim().length < 3) {
      setError("Please provide a reason for editing this session (at least 3 characters).");
      return;
    }

    if (!startedAt) {
      setError("Start time is required.");
      return;
    }

    const startDate = new Date(startedAt);
    let endDate = endedAt ? new Date(endedAt) : null;

    if (endDate && endDate <= startDate) {
      setError("End time must be strictly after start time.");
      return;
    }

    if (endDate && endDate > new Date()) {
      setError("End time cannot be in the future.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        workType,
        startedAt: startDate.toISOString(),
        endedAt: endDate ? endDate.toISOString() : undefined,
        note: note.trim(),
        reason: reason.trim(),
      };

      const res = await timeTrackingApi.updateSession(session.id, payload);
      if (res.success) {
        if (onSuccess) onSuccess(res.data);
        onClose();
      } else {
        setError(res.message || "Failed to update session.");
      }
    } catch (err) {
      console.error("Update session error:", err);
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0]?.message || err.message || "Error updating session.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const audits = session.audits || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edit Work Session</h3>
              <p className="text-xs text-slate-500">
                Case: {session.case?.caseNumber || "Case"} • {session.source}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Work Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Work Type
            </label>
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            >
              {WORK_TYPES.map((wt) => (
                <option key={wt.value} value={wt.value}>
                  {wt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date range grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Start Time (Local)
              </label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                End Time (Local)
              </label>
              <input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Work Note
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Summary of work performed..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Reason for Edit (REQUIRED) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
            <label className="block text-xs font-bold text-amber-900">
              Reason for Edit <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-amber-800">
              Company policy requires an explanation for modifying logged time sessions. This will be recorded in the audit trail.
            </p>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Corrected start time due to travel delay..."
              required
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Audit History Toggle */}
          {audits.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAudits(!showAudits)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <History className="h-3.5 w-3.5" />
                {showAudits ? "Hide Audit History" : `View Audit History (${audits.length} edits)`}
              </button>

              {showAudits && (
                <div className="mt-2 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px]">
                  {audits.map((a) => (
                    <div key={a.id} className="border-b border-slate-200/60 pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between font-semibold text-slate-700">
                        <span>
                          {a.editedBy?.firstName} {a.editedBy?.lastName} edited <code className="rounded bg-slate-200 px-1">{a.field}</code>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-600">
                        <span className="text-slate-400">Changed from:</span> <span className="line-through">{a.oldValue || "(empty)"}</span> → <span className="text-emerald-700 font-medium">{a.newValue || "(empty)"}</span>
                      </p>
                      <p className="mt-0.5 italic text-slate-500">Reason: "{a.reason}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

