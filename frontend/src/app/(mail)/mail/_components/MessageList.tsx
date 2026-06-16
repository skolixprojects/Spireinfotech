"use client";

import { Star, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { MailMessageSummary } from "@/lib/mail-client-api";

const SENDER_FOLDERS = new Set(["SENT", "DRAFTS"]);

function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function MessageList({
  title,
  items,
  loading,
  selectedId,
  folder,
  page,
  totalPages,
  onOpen,
  onToggleStar,
  onPage,
}: {
  title: string;
  items: MailMessageSummary[];
  loading: boolean;
  selectedId: number | null;
  folder: string;
  page: number;
  totalPages: number;
  onOpen: (m: MailMessageSummary) => void;
  onToggleStar: (m: MailMessageSummary) => void;
  onPage: (p: number) => void;
}) {
  const showRecipient = SENDER_FOLDERS.has(folder);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="font-serif text-lg font-bold text-gray-900">{title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#0F766E]" /></div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">No messages.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((m) => {
              const who = showRecipient
                ? "To " + (m.to.length ? m.to.join(", ") : "—")
                : m.fromName || m.from;
              const selected = m.messageId === selectedId;
              const unread = !m.read;
              return (
                <li
                  key={m.messageId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(m)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(m); } }}
                  className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E] ${
                    selected ? "bg-[#0F766E]/10" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleStar(m); }}
                    className="mt-0.5 shrink-0 text-gray-300 hover:text-amber-400"
                    title={m.starred ? "Unstar" : "Star"}
                  >
                    <Star size={16} className={m.starred ? "fill-amber-400 text-amber-400" : ""} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? "font-bold text-gray-900" : "text-gray-700"}`}>
                        {who}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">{relTime(m.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />}
                      <span className={`truncate text-sm ${unread ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                        {m.subject || "(no subject)"}
                      </span>
                      {m.important && <span className="shrink-0 text-xs text-amber-600" title="Important">!</span>}
                      {m.hasAttachments && <Paperclip size={13} aria-label="Has attachments" className="shrink-0 text-gray-400" />}
                    </div>
                    <p className="truncate text-xs text-gray-400">{m.snippet}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          <Button variant="ghost" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Prev</Button>
          <span>Page {page + 1} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
