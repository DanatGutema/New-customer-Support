import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import timeTrackingApi from "../../api/timeTrackingApi";

function formatSeconds(s) {
  if (!s || s <= 0) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ConfirmModal({ session, action, onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try { await onConfirm(note); }
    finally { setLoading(false); }
  };

  if (!session) return null;
  const isApprove = action === "APPROVE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isApprove ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
            {isApprove ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{isApprove ? "Approve" : "Reject"} Time Entry</h3>
            <p className="text-xs text-slate-500">
              {session.staff?.firstName} {session.staff?.lastName} · {formatSeconds(session.activeSeconds)} · {session.case?.caseNumber}
            </p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isApprove ? "Approval note…" : "Reason for rejection…"}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="flex justify-end gap-2.5">
          <button onClick={onCancel} disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={loading}
            className={`rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
            {loading ? "Processing…" : isApprove ? "Approve" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManagerTimeApprovals() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [confirm, setConfirm]   = useState(null); // { session, action }
  const [toast, setToast]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await timeTrackingApi.getPendingApprovals();
      if (res.success) setSessions(res.data || []);
      else setError(res.message || "Failed to load.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async (note) => {
    if (!confirm) return;
    try {
      await timeTrackingApi.approveOrRejectSession(confirm.session.id, confirm.action, note);
      setToast(`Session ${confirm.action === "APPROVE" ? "approved" : "rejected"} successfully.`);
      setConfirm(null);
      await load();
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to process.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Time Approvals</h1>
              <p className="text-xs text-slate-500">Manual entries over 4 hours need your approval before counting.</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
            {toast}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
            <h3 className="mt-3 text-sm font-bold text-slate-800">All caught up</h3>
            <p className="mt-1 text-xs text-slate-400">No pending time entries require your approval.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-xs text-slate-500">
                <span className="font-bold text-slate-800">{sessions.length}</span> entr{sessions.length === 1 ? "y" : "ies"} pending
              </p>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Agent</th>
                  <th className="px-4 py-3.5">Case</th>
                  <th className="px-4 py-3.5">Period</th>
                  <th className="px-4 py-3.5 text-right">Duration</th>
                  <th className="px-4 py-3.5">Note</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800">{s.staff?.firstName} {s.staff?.lastName}</p>
                      <p className="text-[11px] text-slate-400">{s.staff?.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-800">{s.case?.caseNumber}</p>
                      <p className="text-[11px] text-slate-400 max-w-[160px] truncate">{s.case?.subject}</p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600">
                      {formatDateTime(s.startedAt)}<br />
                      <span className="text-slate-400">→ {formatDateTime(s.endedAt)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-700">
                      {formatSeconds(s.activeSeconds)}
                    </td>
                    <td className="px-4 py-3.5 max-w-[160px]">
                      <p className="truncate text-slate-600 italic">
                        {s.note || <span className="text-slate-400 not-italic">No note</span>}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setConfirm({ session: s, action: "APPROVE" })}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Approve
                        </button>
                        <button onClick={() => setConfirm({ session: s, action: "REJECT" })}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100">
                          <XCircle className="h-3 w-3" />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          session={confirm.session}
          action={confirm.action}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
