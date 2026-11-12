import { useCallback, useEffect, useState } from "react";
import { Clock, Download, RefreshCw, ChevronDown } from "lucide-react";
import timeTrackingApi from "../../api/timeTrackingApi";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s) {
  if (!s || s <= 0) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toHoursFixed(s) {
  return (s / 3600).toFixed(2);
}

const GROUP_OPTIONS = [
  { value: "agent",        label: "By Agent" },
  { value: "case",         label: "By Case" },
  { value: "category",     label: "By Category" },
  { value: "organization", label: "By Organization" },
  { value: "section",      label: "By Section" },
];

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(groups, groupBy) {
  const header = `Group (${groupBy}),Hours,Sessions\n`;
  const rows = groups
    .map((g) => `"${g.label}",${toHoursFixed(g.totalSeconds)},${g.sessionCount}`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `time-report-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManagerTimeReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [groupBy, setGroupBy]   = useState("agent");
  const [from,    setFrom]      = useState("");
  const [to,      setTo]        = useState(today);
  const [data,    setData]      = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await timeTrackingApi.getTeamReport({ groupBy, from: from || undefined, to: to || undefined });
      if (res.success) setData(res.data);
      else setError(res.message || "Failed to load report.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [groupBy, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalHours = data?.groups?.reduce((acc, g) => acc + g.totalSeconds, 0) || 0;

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Team Time Report</h1>
              <p className="text-xs text-slate-500">Approved & counted time only. Grouped by selected dimension.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {data?.groups?.length > 0 && (
              <button onClick={() => exportCsv(data.groups, groupBy)}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Group By</label>
            <div className="relative">
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                className="h-9 appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-7 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none">
                {GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none" />
          </div>
          <button onClick={load} disabled={loading}
            className="h-9 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Loading…" : "Apply"}
          </button>
          {(from || to !== today) && (
            <button onClick={() => { setFrom(""); setTo(today); }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              Clear
            </button>
          )}
        </div>

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Total Hours", value: formatSeconds(totalHours) },
              { label: "Total Sessions", value: data.totalSessions },
              { label: "Groups", value: data.groups?.length || 0 },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</p>
                <p className="mt-1.5 text-2xl font-bold font-mono text-slate-900">{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}

        {/* Table */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">Loading…</div>
        ) : data?.groups?.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No time records found</p>
            <p className="mt-1 text-xs text-slate-400">Adjust the date filters or grouping.</p>
          </div>
        ) : data?.groups ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">
                    {GROUP_OPTIONS.find((o) => o.value === groupBy)?.label.replace("By ", "") || "Label"}
                  </th>
                  <th className="px-4 py-3.5 text-right">Hours</th>
                  <th className="px-4 py-3.5 text-right">Sessions</th>
                  <th className="px-4 py-3.5">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.groups.map((g) => {
                  const pct = totalHours > 0 ? Math.round((g.totalSeconds / totalHours) * 100) : 0;
                  return (
                    <tr key={g.key} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        {g.label}
                        {g.meta?.email && <span className="ml-1 font-normal text-slate-400">{g.meta.email}</span>}
                        {g.meta?.subject && <span className="ml-1 font-normal text-slate-400 truncate max-w-xs">{g.meta.subject}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{formatSeconds(g.totalSeconds)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{g.sessionCount}</td>
                      <td className="px-4 py-3 w-32">
                        <div className="h-1.5 w-full rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{pct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
