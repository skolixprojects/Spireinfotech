// Compose API + reply/forward builders. Talks only to existing Phase 5/8
// endpoints via the shared mailApiFetch; reuses Phase 6 types.
import { mailApiFetch, mailRefresh, getMailAccessToken, MAIL_API_BASE_URL } from "./mail-api";
import type { MailAttachmentSummary, MailMessageDetail } from "./mail-client-api";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface MailContact {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
}

export interface ComposePayload {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyToId?: number | null;
}

const unwrap = <T>(p: Promise<ApiResponse<T>>) => p.then((r) => r.data);

export function sendMessage(p: ComposePayload) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>("/api/mail/messages", {
    method: "POST", body: JSON.stringify(p),
  }));
}
export function saveDraft(p: ComposePayload) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>("/api/mail/drafts", {
    method: "POST", body: JSON.stringify(p),
  }));
}
export function updateDraft(id: number, p: ComposePayload) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>(`/api/mail/drafts/${id}`, {
    method: "PUT", body: JSON.stringify(p),
  }));
}
export function sendDraft(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>(`/api/mail/drafts/${id}/send`, {
    method: "POST",
  }));
}
export function fetchContacts(q: string) {
  return unwrap(mailApiFetch<ApiResponse<MailContact[]>>(`/api/mail/contacts?q=${encodeURIComponent(q)}`));
}

// ─── Attachments (Phase 8 backend, draft-anchored) ──────────────────

/** Mirror of the backend cap (mail.attachment-max-bytes default, 25 MB). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Upload a file to a DRAFT via the Phase 8 endpoint, reporting progress.
 * Uses native XMLHttpRequest (fetch has no upload-progress event); shares
 * the mail token + one-refresh-retry with mailApiFetch. The draft must
 * already exist (anchor) — see ComposeWindow.ensureDraft.
 */
export function uploadAttachment(
  draftId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MailAttachmentSummary> {
  return uploadOnce(draftId, file, onProgress, false);
}

function uploadOnce(
  draftId: number,
  file: File,
  onProgress: ((percent: number) => void) | undefined,
  retried: boolean,
): Promise<MailAttachmentSummary> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file); // multipart field name matches @RequestParam("file")
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${MAIL_API_BASE_URL}/api/mail/attachments?draftId=${draftId}`);
    const token = getMailAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // NOTE: never set Content-Type — the browser adds the multipart boundary.
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = async () => {
      if (xhr.status === 401 && !retried) {
        // Expired access token mid-compose: refresh once and retry, exactly
        // like mailApiFetch.
        if (await mailRefresh()) {
          try { resolve(await uploadOnce(draftId, file, onProgress, true)); }
          catch (e) { reject(e); }
          return;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as ApiResponse<MailAttachmentSummary>;
          resolve(body.data);
        } catch { reject(new Error("Unexpected upload response")); }
        return;
      }
      let msg = `Upload failed (${xhr.status})`;
      try { const b = JSON.parse(xhr.responseText); if (b?.message) msg = b.message; } catch { /* keep default */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

/** Remove an attachment from a draft (Phase 8). */
export function deleteAttachment(id: number) {
  return mailApiFetch<ApiResponse<unknown>>(`/api/mail/attachments/${id}`, { method: "DELETE" });
}

/**
 * Copy a source message's attachments onto a draft — used when forwarding, since
 * attachments are anchored to the original message and must be duplicated onto
 * the new one. Returns the new (draft-anchored) attachment summaries.
 */
export function copyAttachmentsFromMessage(draftId: number, fromMessageId: number) {
  return unwrap(mailApiFetch<ApiResponse<MailAttachmentSummary[]>>(
    `/api/mail/attachments/copy?draftId=${draftId}&fromMessageId=${fromMessageId}`, { method: "POST" }));
}

// ─── Reply / Forward builders (pure) ────────────────────────────────

export interface ComposeInit {
  mode: "new" | "reply" | "replyAll" | "forward" | "draft";
  /** Per-invocation id — used as the ComposeWindow React key so each
   *  Compose/Reply/Forward/draft-open remounts with fresh state. */
  nonce?: number;
  draftId?: number;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  inReplyToId?: number | null;
  /** Pre-existing attachments when re-opening a draft (Phase 8); for a forward,
   *  the SOURCE message's attachments (shown pending until copied). */
  attachments?: MailAttachmentSummary[];
  /** Forward only: the message to copy attachments from onto the new draft. */
  sourceMessageId?: number;
}

const ensurePrefix = (subject: string | null | undefined, prefix: "Re:" | "Fwd:") => {
  const s = (subject ?? "").trim();
  const re = new RegExp(`^${prefix}\\s*`, "i");
  return re.test(s) ? s : `${prefix} ${s}`.trim();
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const bodyOrText = (m: MailMessageDetail) =>
  m.bodyHtml && m.bodyHtml.trim() ? m.bodyHtml : `<p>${escapeHtml(m.bodyText ?? "")}</p>`;

const fmtDate = (iso: string) => new Date(iso).toLocaleString();

const quote = (m: MailMessageDetail) => {
  const who = m.fromName ? `${m.fromName} &lt;${escapeHtml(m.from)}&gt;` : escapeHtml(m.from);
  return (
    `<p></p>` +
    `<blockquote style="border-left:2px solid #ccc;margin:0;padding-left:12px;color:#555">` +
    `<p>On ${fmtDate(m.createdAt)}, ${who} wrote:</p>${bodyOrText(m)}</blockquote>`
  );
};

export function buildReply(orig: MailMessageDetail): ComposeInit {
  return {
    mode: "reply",
    to: [orig.from],
    subject: ensurePrefix(orig.subject, "Re:"),
    bodyHtml: quote(orig),
    inReplyToId: orig.messageId,
  };
}

export function buildReplyAll(orig: MailMessageDetail, selfEmail: string): ComposeInit {
  const self = selfEmail.toLowerCase();
  const ccSet = new Set<string>();
  for (const a of [...(orig.to ?? []), ...(orig.cc ?? [])]) {
    const e = a.toLowerCase();
    if (e !== self && e !== orig.from.toLowerCase()) ccSet.add(a);
  }
  return {
    mode: "replyAll",
    to: [orig.from],
    cc: [...ccSet],
    subject: ensurePrefix(orig.subject, "Re:"),
    bodyHtml: quote(orig),
    inReplyToId: orig.messageId,
  };
}

export function buildForward(orig: MailMessageDetail): ComposeInit {
  const header =
    `<p></p><p>---------- Forwarded message ----------<br>` +
    `From: ${escapeHtml(orig.from)}<br>` +
    `Date: ${fmtDate(orig.createdAt)}<br>` +
    `Subject: ${escapeHtml(orig.subject ?? "")}<br>` +
    `To: ${escapeHtml((orig.to ?? []).join(", "))}</p>`;
  return {
    mode: "forward",
    to: [],
    subject: ensurePrefix(orig.subject, "Fwd:"),
    bodyHtml: header + bodyOrText(orig),
    inReplyToId: null,
    // Carry the source's attachments so they're forwarded too: shown pending in
    // the tray, then copied onto the new draft (they can't just be re-referenced).
    attachments: orig.attachments ?? [],
    sourceMessageId: orig.messageId,
  };
}
