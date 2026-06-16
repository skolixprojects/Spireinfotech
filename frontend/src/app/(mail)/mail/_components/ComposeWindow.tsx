"use client";

import { useState } from "react";
import { X, Minus, Send, Save, Trash2, Paperclip, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { RecipientInput } from "./RecipientInput";
import { RichTextEditor } from "./RichTextEditor";
import {
  sendMessage, saveDraft, updateDraft, sendDraft,
  type ComposeInit, type ComposePayload,
} from "@/lib/mail-compose-api";

const stripHtml = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const TITLES: Record<string, string> = {
  new: "New message", reply: "Reply", replyAll: "Reply all", forward: "Forward", draft: "Edit draft",
};

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

  const payload = (): ComposePayload => ({
    to, cc, bcc, subject, bodyHtml, bodyText, inReplyToId: init.inReplyToId ?? null,
  });

  const doSend = async () => {
    setBusy("send");
    try {
      if (draftId) { await updateDraft(draftId, payload()); await sendDraft(draftId); }
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
      if (draftId) { await updateDraft(draftId, payload()); }
      else { const d = await saveDraft(payload()); setDraftId(d.messageId); }
      toast("success", "Draft saved");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed bottom-0 right-4 z-40 flex w-[540px] max-w-[95vw] flex-col rounded-t-xl border border-gray-300 bg-white shadow-2xl">
      <div className="flex items-center justify-between rounded-t-xl bg-[#0F766E] px-4 py-2 text-white">
        <span className="text-sm font-semibold">{TITLES[init.mode] ?? "New message"}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized((m) => !m)} className="rounded p-1 hover:bg-white/15" title="Minimize"><Minus size={15} /></button>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/15" title="Discard & close"><X size={15} /></button>
        </div>
      </div>

      {!minimized && (
        <>
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

          <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={doSend}
                disabled={busy !== null || to.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0D9488] disabled:opacity-50"
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
              <button disabled title="Attachments arrive in the next phase" className="rounded-lg p-2 text-gray-300 cursor-not-allowed">
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
