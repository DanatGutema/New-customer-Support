import { useEffect, useState } from "react";
import {
  Mail,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import api from "../../api/axios";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function directionIcon(direction, size = 12) {
  return direction === "INBOUND"
    ? <ArrowDownLeft size={size} strokeWidth={2.2} className="text-emerald-600" />
    : <ArrowUpRight size={size} strokeWidth={2.2} className="text-blue-600" />;
}

// ─── Single message bubble inside a conversation ──────────────────────────────

function MessageBubble({ msg }) {
  const [expanded, setExpanded] = useState(false);
  const isInbound = msg.direction === "INBOUND";

  return (
    <div className={`rounded-xl border ${isInbound ? "border-emerald-100 bg-emerald-50/40" : "border-blue-100 bg-blue-50/20"}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left"
      >
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
          ${isInbound ? "bg-emerald-100" : "bg-blue-100"}`}>
          {directionIcon(msg.direction)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-[0.12em]
              ${isInbound ? "text-emerald-600" : "text-blue-600"}`}>
              {isInbound ? `From: ${msg.fromEmail || "customer"}` : `To: ${msg.recipientEmail || "customer"}`}
            </span>
            <span className="ml-auto text-[10px] text-slate-400 shrink-0">
              {formatTime(msg.sentAt || msg.createdAt)}
            </span>
          </div>
          {!expanded && msg.bodyText && (
            <p className="mt-0.5 truncate text-[11px] text-slate-500 max-w-sm">
              {msg.bodyText.slice(0, 120)}
            </p>
          )}
        </div>
        {expanded
          ? <ChevronDown size={13} className="shrink-0 text-slate-400 mt-1" />
          : <ChevronRight size={13} className="shrink-0 text-slate-400 mt-1" />
        }
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {msg.bodyText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {msg.bodyText}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">No body content recorded.</p>
          )}
          {msg.messageId && (
            <p className="mt-2 text-[9px] font-mono text-slate-300 truncate">
              {msg.messageId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── One conversation group (root + replies) ──────────────────────────────────

function ConversationGroup({ conv }) {
  const [open, setOpen] = useState(false);

  const hasInbound  = conv.hasInbound;
  const hasOutbound = conv.hasOutbound;

  // Badge colour: mixed = purple, inbound-only = emerald, outbound-only = blue
  const badgeColor = hasInbound && hasOutbound
    ? "bg-purple-100 text-purple-700 border-purple-200"
    : hasInbound
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-blue-100 text-blue-700 border-blue-200";

  const latestMsg = conv.messages[conv.messages.length - 1];
  const preview   = latestMsg?.bodyText?.slice(0, 100) || "";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition">
      {/* Conversation header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
      >
        {/* Avatar / icon */}
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <MessageSquare size={16} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Subject line */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 truncate max-w-sm">
              {conv.subject || "(no subject)"}
            </p>
            {/* Message count badge */}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
              {conv.messageCount} {conv.messageCount === 1 ? "message" : "messages"}
            </span>
            {/* Direction indicators */}
            <div className="flex items-center gap-1">
              {hasInbound  && <ArrowDownLeft size={11} className="text-emerald-500" />}
              {hasOutbound && <ArrowUpRight  size={11} className="text-blue-500"    />}
            </div>
            <span className="ml-auto text-[10px] text-slate-400 shrink-0">
              {formatDate(conv.latestAt)}
            </span>
          </div>

          {/* Preview of latest message — hidden when expanded */}
          {!open && preview && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400 max-w-md">
              {preview}
            </p>
          )}
        </div>

        {/* Expand / collapse chevron */}
        <div className="mt-1 shrink-0 text-slate-400">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>
      </button>

      {/* Expanded message list */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {conv.messages.map((msg, idx) => (
            <MessageBubble key={msg.id || idx} msg={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main EmailThread component ───────────────────────────────────────────────

export default function EmailThread({ caseId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = async () => {
    if (!caseId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/cases/${caseId}/email-thread`);
      setData(res.data?.data || null);
    } catch (err) {
      setError("Could not load email thread.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [caseId]);

  const conversations = data?.conversations || [];
  const totalMessages = data?.totalMessages || 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Mail size={15} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Emails</p>
          <h3 className="text-sm font-semibold text-slate-900 leading-tight">Email Thread</h3>
        </div>
        <div className="flex items-center gap-3">
          {totalMessages > 0 && (
            <span className="text-[10px] text-slate-400">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""} · {totalMessages} message{totalMessages !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-500">{error}</p>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mail size={28} className="mb-2 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No emails yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Emails sent or received for this case will appear here as grouped conversations.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <ConversationGroup key={conv.threadId} conv={conv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
