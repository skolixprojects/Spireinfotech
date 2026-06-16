"use client";

import { useState } from "react";
import {
  Star, AlertCircle, Archive, Trash2, Trash, ArrowLeft, Reply, ReplyAll, Forward, Loader2, Mail,
  Paperclip, Download, FileText, Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SafeHtml } from "./SafeHtml";
import { downloadAttachment, type MailAttachmentSummary, type MailMessageSummary, type MailThreadView } from "@/lib/mail-client-api";

function fullTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Attachment chips with authenticated, walled download (never a raw link). */
function MessageAttachments({ attachments }: { attachments: MailAttachmentSummary[] }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const onDownload = async (a: MailAttachmentSummary) => {
    setBusyId(a.id);
    try {
      await downloadAttachment(a.id, a.filename);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not download attachment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <Paperclip size={13} /> {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
      </div>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const isImg = (a.contentType ?? "").startsWith("image/");
          return (
            <li key={a.id}>
              <button
                onClick={() => onDownload(a)}
                disabled={busyId === a.id}
                className="inline-flex max-w-[260px] items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs hover:border-[#0F766E]/40 hover:bg-[#0F766E]/5 disabled:opacity-60"
                title={`Download ${a.filename}`}
              >
                {isImg ? <ImageIcon size={15} className="shrink-0 text-gray-400" />
                  : <FileText size={15} className="shrink-0 text-gray-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-700">{a.filename}</span>
                  <span className="text-gray-400">{humanSize(a.sizeBytes)}</span>
                </span>
                {busyId === a.id
                  ? <Loader2 size={14} className="shrink-0 animate-spin text-[#0F766E]" />
                  : <Download size={14} className="shrink-0 text-gray-400" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IconBtn({ title, onClick, active, danger, disabled, children }: {
  title: string; onClick?: () => void; active?: boolean; danger?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-2 transition-colors ${
        disabled ? "text-gray-300 cursor-not-allowed"
          : active ? "text-amber-500 hover:bg-amber-50"
          : danger ? "text-gray-500 hover:bg-red-50 hover:text-red-600"
          : "text-gray-500 hover:bg-[#0F766E]/10 hover:text-[#0F766E]"
      }`}
    >
      {children}
    </button>
  );
}

export function ReadingPane({
  thread,
  selected,
  loading,
  onBack,
  onStar,
  onImportant,
  onArchive,
  onTrash,
  onPermanent,
  onReply,
  onReplyAll,
  onForward,
}: {
  thread: MailThreadView | null;
  selected: MailMessageSummary | null;
  loading: boolean;
  onBack: () => void;
  onStar: () => void;
  onImportant: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onPermanent: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}) {
  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0F766E]" /></div>;
  }
  if (!thread || !selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-300">
        <Mail size={40} />
        <p className="mt-3 text-sm">Select a message to read</p>
      </div>
    );
  }

  const inTrash = selected.folder === "TRASH";

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 px-3 py-2">
        <button onClick={onBack} className="mr-1 rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden" title="Back">
          <ArrowLeft size={16} />
        </button>
        <IconBtn title={selected.starred ? "Unstar" : "Star"} onClick={onStar} active={selected.starred}>
          <Star size={16} className={selected.starred ? "fill-amber-400 text-amber-400" : ""} />
        </IconBtn>
        <IconBtn title={selected.important ? "Mark not important" : "Mark important"} onClick={onImportant} active={selected.important}>
          <AlertCircle size={16} />
        </IconBtn>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        {selected.folder !== "ARCHIVE" && (
          <IconBtn title="Archive" onClick={onArchive}><Archive size={16} /></IconBtn>
        )}
        {!inTrash && (
          <IconBtn title="Move to Trash" onClick={onTrash} danger><Trash2 size={16} /></IconBtn>
        )}
        {inTrash && (
          <IconBtn title="Delete forever" onClick={onPermanent} danger><Trash size={16} /></IconBtn>
        )}
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <IconBtn title="Reply" onClick={onReply}><Reply size={16} /></IconBtn>
        <IconBtn title="Reply all" onClick={onReplyAll}><ReplyAll size={16} /></IconBtn>
        <IconBtn title="Forward" onClick={onForward}><Forward size={16} /></IconBtn>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <h1 className="font-serif text-2xl font-bold text-gray-900">{selected.subject || "(no subject)"}</h1>
        <div className="mt-4 space-y-5">
          {thread.messages.map((m) => (
            <article key={m.messageId} className="rounded-xl border border-gray-200 bg-white p-4">
              <header className="mb-3 border-b border-gray-100 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-900">{m.fromName || m.from}</span>
                  <span className="shrink-0 text-xs text-gray-400">{fullTime(m.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  <span className="text-gray-400">from</span> {m.from}
                </p>
                {m.to.length > 0 && (
                  <p className="text-xs text-gray-500"><span className="text-gray-400">to</span> {m.to.join(", ")}</p>
                )}
                {m.cc && m.cc.length > 0 && (
                  <p className="text-xs text-gray-500"><span className="text-gray-400">cc</span> {m.cc.join(", ")}</p>
                )}
              </header>
              <SafeHtml html={m.bodyHtml} text={m.bodyText} />
              {m.attachments && m.attachments.length > 0 && (
                <MessageAttachments attachments={m.attachments} />
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
