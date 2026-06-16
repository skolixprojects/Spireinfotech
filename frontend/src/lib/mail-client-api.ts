// Mail client API — typed wrappers over the Phase 2 mailApiFetch for the
// read/organize endpoints (Phase 5 messaging core). No backend changes.
import { mailApiFetch, mailApiFetchBlob } from "./mail-api";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Attachment summary (mirrors backend MailAttachmentSummary; no storage key/URL). */
export interface MailAttachmentSummary {
  id: number;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
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
  folder: string;            // system key (INBOX/…) or custom folder name
  folderId?: number | null;  // folder_id (Phase 14)
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
  attachments?: MailAttachmentSummary[];
  inReplyToId?: number | null;
  folder: string;
  folderId?: number | null;
  read: boolean;
  starred: boolean;
  important: boolean;
}

/** A node in the caller's folder tree (flat adjacency list — build the tree via parentId). */
export interface MailFolderDto {
  id: number;
  name: string;
  parentId: number | null;
  kind: "SYSTEM" | "CUSTOM";
  systemKey: string | null;  // INBOX/SENT/DRAFTS/ARCHIVE/TRASH for SYSTEM, else null
  sortOrder: number;
  total: number;
  unread: number;
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

/** Real backend folders. "starred" is a virtual cross-folder finder served at
 *  GET /api/mail/folders/starred (see listFolder("starred", ...)). */
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

/** Move a message to a folder by the key-or-id contract (system key or custom id). */
export function moveMessage(id: number, folderRef: string) {
  return patchMessage(id, { folder: folderRef });
}

// ─── Folder tree (Phase 14/15) ──────────────────────────────────────

export function listFolders() {
  return unwrap(mailApiFetch<ApiResponse<MailFolderDto[]>>(`/api/mail/folders`));
}

export function createFolder(name: string, parentFolderId?: number | null) {
  return unwrap(mailApiFetch<ApiResponse<MailFolderDto>>(`/api/mail/folders`, {
    method: "POST",
    body: JSON.stringify({ name, parentFolderId: parentFolderId ?? null }),
  }));
}

export function renameFolder(id: number, name: string) {
  return unwrap(mailApiFetch<ApiResponse<MailFolderDto>>(`/api/mail/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }));
}

export function moveFolder(id: number, newParentFolderId: number | null) {
  return unwrap(mailApiFetch<ApiResponse<MailFolderDto>>(`/api/mail/folders/${id}/move`, {
    method: "POST",
    body: JSON.stringify({ parentFolderId: newParentFolderId }),
  }));
}

export function deleteFolder(id: number) {
  return mailApiFetch<ApiResponse<unknown>>(`/api/mail/folders/${id}`, { method: "DELETE" });
}

/**
 * Download an attachment through the authenticated, walled proxy
 * (GET /api/mail/attachments/{id}) — the bytes are fetched WITH the mail
 * token in the Authorization header (never a plain link, never a raw
 * storage/S3 URL), turned into an object URL, saved via a programmatic
 * <a download>, then the URL is revoked. The proxy 404s if the caller has
 * no access and 401s when unauthenticated.
 */
export async function downloadAttachment(id: number, filename: string): Promise<void> {
  const blob = await mailApiFetchBlob(`/api/mail/attachments/${id}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser has started the save (immediate revoke can
  // cancel it in some engines).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
