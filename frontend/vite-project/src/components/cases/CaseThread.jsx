import { useEffect, useRef, useState } from "react";
import {
  Lock,
  Paperclip,
  Send,
  Trash2,
  MessageSquare,
  X,
  ChevronDown,
} from "lucide-react";
import messageApi from "../../api/messageApi";
import { useAuth } from "../../context/useAuth";

const API_BASE_URL = (import.meta.env.VITE_API_ROOT || "http://localhost:5000").replace(/\/$/, "");

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function getAttachmentUrl(att) {
  if (!att) return "";
  const path = att.storagePath || att.fileName || "";
  const name = path.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return name ? `${API_BASE_URL}/uploads/${encodeURIComponent(name)}` : "";
}

function authorLabel(msg) {
  if (msg.authorStaff) {
    const s = msg.authorStaff;
    const name = `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Staff";
    const role = s.isSAdmin ? "Admin" : s.isManager ? "Manager" : "Support";
    return { name, role, isStaff: true };
  }
  if (msg.authorCustomer) {
    const c = msg.authorCustomer;
    return {
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Customer",
      role: "Customer",
      isStaff: false,
    };
  }
  return { name: "System", role: "", isStaff: true };
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// ─── Single message bubble ────────────────────────────────────────────────────

function MessageBubble({ msg, currentUserId, currentPartyType, onDelete, isStaffViewer }) {
  const author = authorLabel(msg);
  const isOwn =
    (currentPartyType === "STAFF" && msg.authorStaff?.id === currentUserId) ||
    (currentPartyType === "CUSTOMER" && msg.authorCustomer?.id === currentUserId);
  const isInternal = msg.visibility === "INTERNAL";

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold
        ${author.isStaff ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
        {initials(author.name)}
      </div>

      {/* Bubble */}
      <div className={`group max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Meta */}
        <div className={`flex items-center gap-2 text-[10px] text-slate-400 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="font-semibold text-slate-600">{author.name}</span>
          <span className="opacity-60">{author.role}</span>
          {isInternal && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
              <Lock size={8} /> Internal
            </span>
          )}
          <span>{formatTime(msg.createdAt)}</span>
        </div>

        {/* Body */}
        <div className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isOwn
            ? "rounded-tr-sm bg-blue-600 text-white"
            : isInternal
            ? "rounded-tl-sm border border-amber-200 bg-amber-50 text-slate-800"
            : "rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm"
          }`}>
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>

          {/* Attachments */}
          {msg.attachments?.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-white/20 pt-2">
              {msg.attachments.map((att) => {
                const url = getAttachmentUrl(att);
                return (
                  <a key={att.id} href={url} target="_blank" rel="noreferrer"
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition
                      ${isOwn ? "bg-white/20 text-white hover:bg-white/30" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                    <Paperclip size={10} />
                    <span className="truncate max-w-[180px]">{att.fileName}</span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Delete button (author or admin) */}
          {(isOwn || (isStaffViewer && currentPartyType === "STAFF")) && (
            <button type="button" onClick={() => onDelete(msg.id)}
              className={`absolute -top-2 ${isOwn ? "-left-6" : "-right-6"} hidden rounded-full bg-red-100 p-1 text-red-500 opacity-0 transition hover:bg-red-200 group-hover:opacity-100 group-hover:flex`}>
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Canned reply picker ──────────────────────────────────────────────────────

function CannedReplyPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState([]);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    messageApi.getCannedReplies()
      .then((r) => setReplies(r.data?.data || []))
      .catch(() => {});
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = replies.filter((r) =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.body.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groups = filtered.reduce((acc, r) => {
    const cat = r.category || "General";
    (acc[cat] = acc[cat] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
        <MessageSquare size={12} />
        Templates
        <ChevronDown size={10} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">Canned Replies</p>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..." autoFocus
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs outline-none focus:border-blue-400" />
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {Object.keys(groups).length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {replies.length === 0 ? "No canned replies yet." : "No matches found."}
              </p>
            ) : Object.entries(groups).map(([cat, items]) => (
              <div key={cat}>
                <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">{cat}</p>
                {items.map((r) => (
                  <button key={r.id} type="button"
                    onClick={() => { onSelect(r.body); setOpen(false); setSearch(""); }}
                    className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-50">
                    <p className="text-xs font-semibold text-slate-800">{r.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{r.body}</p>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main CaseThread component ────────────────────────────────────────────────

export default function CaseThread({ caseId, initialMessages = [], readOnly = false }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const isStaff = user?.partyType === "STAFF" || user?.isSAdmin || user?.isManager || user?.isPSsupport;
  const currentUserId = user?.id || user?.userId;
  const currentPartyType = isStaff ? "STAFF" : "CUSTOMER";

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reload messages from server
  const reload = async () => {
    try {
      const res = await messageApi.getMessages(caseId);
      setMessages(res.data?.data || []);
    } catch (_) {}
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setError("");
    setSending(true);
    try {
      await messageApi.postMessage(caseId, { body, visibility, files });
      setBody("");
      setFiles([]);
      setVisibility("PUBLIC");
      await reload();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await messageApi.deleteMessage(caseId, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete message.");
    }
  };

  // Filter out internal messages for customers
  const visibleMessages = messages.filter(
    (m) => isStaff || m.visibility === "PUBLIC"
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <MessageSquare size={15} strokeWidth={2} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Conversation</p>
          <h3 className="text-sm font-semibold text-slate-900 leading-tight">Thread</h3>
        </div>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {visibleMessages.length}
        </span>
      </div>

      {/* Message list */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" style={{ maxHeight: "420px" }}>
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageSquare size={32} className="mb-3 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No messages yet</p>
            <p className="mt-1 text-xs text-slate-400">
              {isStaff ? "Send the first message or internal note." : "Send a message to the support team."}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              currentUserId={currentUserId}
              currentPartyType={currentPartyType}
              onDelete={handleDelete}
              isStaffViewer={isStaff}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose area */}
      {!readOnly && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {/* Visibility toggle (staff only) */}
          {isStaff && (
            <div className="mb-2 flex items-center gap-2">
              <button type="button"
                onClick={() => setVisibility("PUBLIC")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition
                  ${visibility === "PUBLIC" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <MessageSquare size={10} />
                Reply to customer
              </button>
              <button type="button"
                onClick={() => setVisibility("INTERNAL")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition
                  ${visibility === "INTERNAL" ? "bg-amber-500 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <Lock size={10} />
                Internal note
              </button>
            </div>
          )}

          {visibility === "INTERNAL" && (
            <p className="mb-2 text-[10px] text-amber-600 font-medium">
              👁 Only staff can see this note.
            </p>
          )}

          <form onSubmit={handleSend}>
            <div className={`rounded-xl border bg-white transition
              ${visibility === "INTERNAL" ? "border-amber-300" : "border-slate-200"}
              focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50`}>
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                }}
                placeholder={
                  visibility === "INTERNAL"
                    ? "Add an internal note (only visible to staff)…"
                    : isStaff
                    ? "Reply to customer…"
                    : "Send a message to your support agent…"
                }
                className="w-full resize-none rounded-t-xl bg-transparent px-3.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />

              {/* File previews */}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      <Paperclip size={9} />
                      <span className="max-w-[100px] truncate">{f.name}</span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                        <X size={9} className="text-slate-400 hover:text-red-500" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {/* File attachment */}
                  <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                    <Paperclip size={13} />
                    Attach
                    <input type="file" multiple className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        setFiles((prev) => [...prev, ...picked].slice(0, 5));
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {/* Canned replies (staff only) */}
                  {isStaff && (
                    <CannedReplyPicker onSelect={(text) => setBody((prev) => (prev ? prev + "\n" + text : text))} />
                  )}
                </div>

                <button type="submit" disabled={!body.trim() || sending}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white transition
                    ${visibility === "INTERNAL" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"}
                    disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <Send size={12} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </form>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-1.5 text-[10px] text-slate-400">Press Enter to send · Shift+Enter for new line</p>
        </div>
      )}
    </div>
  );
}
