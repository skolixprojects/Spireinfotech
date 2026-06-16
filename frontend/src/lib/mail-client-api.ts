// Mail client API — typed wrappers over the Phase 2 mailApiFetch for the
// read/organize endpoints (Phase 5 messaging core). No backend changes.
import { mailApiFetch } from "./mail-api";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface MailMessageSummary {
  messageId: number;
  threadId: number;
  from: string;
  fromName: string | null;
  to: string[];
  subject: string | null;
  snippet: string;
  createdAt: string;
  read: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
  folder: string;
}

export interface MailMessageDetail {
  messageId: number;
  threadId: number;
  messageUid: string;
  from: string;
  fromName: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[] | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: string;
  hasAttachments: boolean;
  inReplyToId?: number | null;
  folder: string;
  read: boolean;
  starred: boolean;
  important: boolean;
}

export interface MailThreadView {
  threadId: number;
  messages: MailMessageDetail[];
}

export interface PagedSummaries {
  content: MailMessageSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface MailFolderListing extends PagedSummaries {
  unreadCount: number;
}

export type UnreadCounts = Record<string, number>;

/** Real backend folders (Starred is a client-side aggregate, not a folder). */
export const BACKEND_FOLDERS = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "TRASH"] as const;

const unwrap = <T>(p: Promise<ApiResponse<T>>) => p.then((r) => r.data);

export function listFolder(folder: string, page = 0, size = 25) {
  return unwrap(mailApiFetch<ApiResponse<MailFolderListing>>(
    `/api/mail/folders/${folder}?page=${page}&size=${size}`));
}

export function getThread(threadId: number) {
  return unwrap(mailApiFetch<ApiResponse<MailThreadView>>(`/api/mail/threads/${threadId}`));
}

export function getMessage(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>(`/api/mail/messages/${id}`));
}

export function patchMessage(
  id: number,
  body: { read?: boolean; starred?: boolean; important?: boolean; folder?: string },
) {
  return unwrap(mailApiFetch<ApiResponse<MailMessageDetail>>(`/api/mail/messages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}

export function softDelete(id: number) {
  return mailApiFetch<ApiResponse<unknown>>(`/api/mail/messages/${id}`, { method: "DELETE" });
}

export function permanentDelete(id: number) {
  return mailApiFetch<ApiResponse<unknown>>(`/api/mail/messages/${id}/permanent`, { method: "DELETE" });
}

export function searchMessages(q: string, page = 0, size = 25) {
  return unwrap(mailApiFetch<ApiResponse<PagedSummaries>>(
    `/api/mail/search?q=${encodeURIComponent(q)}&page=${page}&size=${size}`));
}

export function unreadCounts() {
  return unwrap(mailApiFetch<ApiResponse<UnreadCounts>>(`/api/mail/unread-counts`));
}

/**
 * "Starred" is a client-side aggregate — Phase 5 exposes no cross-folder
 * starred query, so we merge starred items from INBOX / SENT / ARCHIVE
 * (first 100 each), dedupe, and sort newest-first. Documented limitation:
 * capped at 100/folder; a true Starred view needs a small backend finder.
 */
export async function listStarred(): Promise<MailMessageSummary[]> {
  const pages = await Promise.all(
    ["INBOX", "SENT", "ARCHIVE"].map((f) => listFolder(f, 0, 100)),
  );
  const seen = new Set<number>();
  const out: MailMessageSummary[] = [];
  for (const p of pages) {
    for (const m of p.content) {
      if (m.starred && !seen.has(m.messageId)) {
        seen.add(m.messageId);
        out.push(m);
      }
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}
