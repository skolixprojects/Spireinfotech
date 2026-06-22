"use client";

import { useRef, useState } from "react";
import { X, Minus, Send, Save, Trash2, Paperclip, Loader2, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RecipientInput } from "./RecipientInput";
import { RichTextEditor } from "./RichTextEditor";
import {
  sendMessage, saveDraft, updateDraft, sendDraft,
  uploadAttachment, deleteAttachment, MAX_ATTACHMENT_BYTES,
  type ComposeInit, type ComposePayload,
} from "@/lib/mail-compose-api";

const stripHtml = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const TITLES: Record<string, string> = {
  new: "New message", reply: "Reply", replyAll: "Reply all", forward: "Forward", draft: "Edit draft",
};

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** One row in the compose attachment tray. `id` is the server attachment id
 *  once the upload succeeds; `key` is a stable client-only id for React. */
interface AttachItem {
  key: number;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  id?: number;
  error?: string;
  /** Transient — the File to upload (only set while pending; not rendered). */
  file?: File;
}

export function ComposeWindow({
  init,
  onClose,
  onSent,
}: {
  init: ComposeInit;
  onClose: () => void;
  onSent: (mode: string) => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState<string[]>(init.to ?? []);
  const [cc, setCc] = useState<string[]>(init.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(init.bcc ?? []);
  const [showCc, setShowCc] = useState((init.cc?.length ?? 0) > 0);
  const [showBcc, setShowBcc] = useState((init.bcc?.length ?? 0) > 0);
  const [subject, setSubject] = useState(init.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(init.bodyHtml ?? "");
  const [bodyText, setBodyText] = useState(stripHtml(init.bodyHtml ?? ""));
  const [draftId, setDraftId] = useState<number | undefined>(init.draftId);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [minimized, setMinimized] = useState(false);

  // Attachments tray, seeded with any attachments already on an opened draft.
  const [attachments, setAttachments] = useState<AttachItem[]>(
    (init.attachments ?? []).map((a, i) => ({
      key: i, name: a.filename, size: a.sizeBytes, progress: 100, status: "done", id: a.id,
    })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous draft id so back-to-back uploads anchor to ONE draft (state
  // updates are async and would otherwise create several drafts).
  const draftIdRef = useRef<number | undefined>(init.draftId);
  // A single in-flight saveDraft so concurrent callers (attach + Save) share
  // ONE create instead of racing two drafts.
  const draftInFlight = useRef<Promise<number> | null>(null);
  const attachKey = useRef(init.attachments?.length ?? 0);

  const uploading = attachments.some((a) => a.status === "uploading");

  const payload = (): ComposePayload => ({
    to, cc, bcc, subject, bodyHtml, bodyText, inReplyToId: init.inReplyToId ?? null,
  });

  const applyDraftId = (id: number) => { draftIdRef.current = id; setDraftId(id); };

  /**
   * Ensure a persisted draft exists; attachments anchor to it (NOT-NULL FK).
   * Concurrent callers share one in-flight create, so attaching a file and
   * hitting Save in the same instant can never spawn two drafts.
   */
  const ensureDraftId = async (): Promise<number> => {
    if (draftIdRef.current) return draftIdRef.current;
    if (!draftInFlight.current) {
      draftInFlight.current = saveDraft(payload())
        .then((d) => { applyDraftId(d.messageId); return d.messageId; })
        .catch((e) => { draftInFlight.current = null; throw e; }); // allow retry after a failed create
    }
    return draftInFlight.current;
  };

  const patchItem = (key: number, patch: Partial<AttachItem>) =>
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files).filter((f) => {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast("error", `${f.name} exceeds the 25 MB limit`);
        return false;
      }
      return true;
    });
    if (chosen.length === 0) return;

    // Add the tray rows as "uploading" UP FRONT so the UI (and the Send guard)
    // reflect pending uploads immediately — including during the draft create.
    const rows: AttachItem[] = chosen.map((f) => ({
      key: attachKey.current++, name: f.name, size: f.size, progress: 0, status: "uploading", file: f,
    }));
    setAttachments((prev) => [...prev, ...rows]);

    let id: number;
    try {
      id = await ensureDraftId();
    } catch (e) {
      rows.forEach((r) => patchItem(r.key, { status: "error", error: "Could not start a draft" }));
      toast("error", e instanceof Error ? e.message : "Could not start a draft");
      return;
    }

    for (const r of rows) {
      uploadAttachment(id, r.file!, (pct) => patchItem(r.key, { progress: pct }))
        .then((summary) => patchItem(r.key, { status: "done", progress: 100, id: summary.id, file: undefined }))
        .catch((e) => {
          patchItem(r.key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
          toast("error", e instanceof Error ? e.message : `Could not upload ${r.name}`);
        });
    }
  };

  const removeAttachment = async (item: AttachItem) => {
    if (item.status === "uploading") return; // wait for it to settle first
    // Optimistically drop it from the tray; only call the API for uploaded ones.
    setAttachments((prev) => prev.filter((a) => a.key !== item.key));
    if (item.status === "done" && item.id != null) {
      try {
        await deleteAttachment(item.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Could not remove attachment");
      }
    }
  };

  const doSend = async () => {
    if (uploading) { toast("error", "Wait for attachments to finish uploading"); return; }
    setBusy("send");
    try {
      const id = draftIdRef.current;
      // A draft (created when files were attached, or when editing one) MUST be
      // sent via sendDraft so its linked attachments go with it; a fresh-message
      // send would drop them.
      if (id) { await updateDraft(id, payload()); await sendDraft(id); }
      else { await sendMessage(payload()); }
      toast("success", "Message sent");
      onSent(init.mode);
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not send"); // walling errors surface verbatim
    } finally {
      setBusy(null);
    }
  };

  const doSaveDraft = async () => {
    setBusy("draft");
    try {
      // Route through the same guarded create (no duplicate draft if an attach
      // is mid-flight), then persist the latest edits.
      const id = await ensureDraftId();
      await updateDraft(id, payload());
      toast("success", "Draft saved");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`fixed z-40 flex flex-col bg-white shadow-2xl ${
        minimized
          ? "bottom-0 right-4 w-[540px] max-w-[95vw] rounded-t-xl border border-gray-300"
          // Mobile: full-screen sheet. sm+: the floating bottom-right panel, capped at 90vh.
          : "inset-0 sm:inset-auto sm:bottom-0 sm:right-4 sm:w-[540px] sm:max-w-[95vw] sm:max-h-[90vh] sm:rounded-t-xl sm:border sm:border-gray-300"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between rounded-t-xl bg-[#0F766E] px-4 py-2 text-white">
        <span className="text-sm font-semibold">{TITLES[init.mode] ?? "New message"}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized((m) => !m)} className="rounded p-1 hover:bg-white/15" title="Minimize"><Minus size={15} /></button>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/15" title="Discard & close"><X size={15} /></button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Scrollable body so the action bar below stays reachable (esp. full-screen on mobile). */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <RecipientInput label="To" value={to} onChange={setTo} autoFocus />
          {!showCc && !showBcc && (
            <div className="flex justify-end gap-3 px-3 py-1 text-xs text-gray-400">
              <button type="button" onClick={() => setShowCc(true)} className="hover:text-[#0F766E]">Cc</button>
              <button type="button" onClick={() => setShowBcc(true)} className="hover:text-[#0F766E]">Bcc</button>
            </div>
          )}
          {showCc && <RecipientInput label="Cc" value={cc} onChange={setCc} />}
          {showBcc && <RecipientInput label="Bcc" value={bcc} onChange={setBcc} />}

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            className="border-b border-gray-100 px-3 py-2 text-sm focus:outline-none"
          />

          <div className="p-3">
            <RichTextEditor
              initialHtml={bodyHtml}
              onChange={(html, text) => { setBodyHtml(html); setBodyText(text); }}
            />
          </div>

          {/* Attachment tray */}
          {attachments.length > 0 && (
            <ul className="max-h-32 space-y-1.5 overflow-y-auto border-t border-gray-100 px-3 py-2">
              {attachments.map((a) => (
                <li key={a.key} className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs">
                  {a.status === "uploading" ? <Loader2 size={14} className="shrink-0 animate-spin text-[#0F766E]" />
                    : a.status === "error" ? <AlertCircle size={14} className="shrink-0 text-red-500" />
                    : <FileText size={14} className="shrink-0 text-gray-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-gray-700" title={a.name}>{a.name}</span>
                      <span className="shrink-0 text-gray-400">{humanSize(a.size)}</span>
                    </div>
                    {a.status === "uploading" && <ProgressBar percent={a.progress} size="sm" className="mt-1" />}
                    {a.status === "error" && <span className="text-red-500">{a.error}</span>}
                  </div>
                  {a.status !== "uploading" && (
                    <button
                      onClick={() => removeAttachment(a)}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove attachment"
                    >
                      <X size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
          />

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={doSend}
                disabled={busy !== null || uploading || to.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0D9488] disabled:opacity-50"
                title={uploading ? "Waiting for attachments to finish" : "Send"}
              >
                {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
              <button
                onClick={doSaveDraft}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                title="Save draft"
              >
                {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy !== null}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-[#0F766E] disabled:opacity-50"
                title="Attach files"
              >
                <Paperclip size={15} />
              </button>
            </div>
            <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600" title="Discard">
              <Trash2 size={15} /> Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
