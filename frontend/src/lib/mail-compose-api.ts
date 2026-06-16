// Compose API + reply/forward builders. Talks only to existing Phase 5
// endpoints via the shared mailApiFetch; reuses Phase 6 types.
import { mailApiFetch } from "./mail-api";
import type { MailMessageDetail } from "./mail-client-api";

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
  };
}
