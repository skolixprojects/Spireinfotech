// Mail Admin API helpers — thin typed wrappers over the Phase 2
// mailApiFetch (which carries the mail session, refreshes once on 401,
// and redirects to /mail/login on failure). Backend ENFORCES
// scope/walling/lockout; these calls just surface its results/errors.
import { mailApiFetch } from "./mail-api";

// Mirrors the (un-exported) MailApiResponse envelope in mail-api.ts —
// re-declared locally since Phase 1-3 code must not be modified to export it.
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface MailDomainSummary {
  id: number;
  domain: string;
  entityName: string;
  isActive: boolean;
  createdAt: string;
}

export interface MailboxSummary {
  id: number;
  email: string;
  localPart: string;
  domainId: number;
  domain: string;
  displayName: string | null;
  role: string;          // USER | ADMIN | SUPER_ADMIN
  status: string;        // ACTIVE | SUSPENDED | PENDING_DELETION
  quotaBytes: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  deleteAfter: string | null;   // set only when status === PENDING_DELETION
  createdAt: string;
}

/** One-time credential result for create / reset. `password` is plaintext,
 *  shown ONCE — never returned by any GET, never stored in plaintext. */
export interface MailCredentialResponse {
  account: MailboxSummary;
  password: string;
}

export interface MailAuditEntry {
  id: number;
  actorId: number;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  details: string | null;
  createdAt: string;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

const ADMIN = "/api/mail/admin";
const unwrap = <T>(p: Promise<ApiResponse<T>>) => p.then((r) => r.data);

// ─── Domains ──
export function listDomains() {
  return unwrap(mailApiFetch<ApiResponse<MailDomainSummary[]>>(`${ADMIN}/domains`));
}
export function createDomain(body: { domain: string; entityName: string }) {
  return unwrap(mailApiFetch<ApiResponse<MailDomainSummary>>(`${ADMIN}/domains`, {
    method: "POST",
    body: JSON.stringify(body),
  }));
}
export function updateDomain(id: number, body: { entityName?: string; isActive?: boolean }) {
  return unwrap(mailApiFetch<ApiResponse<MailDomainSummary>>(`${ADMIN}/domains/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}

// ─── Mailboxes ──
export interface MailboxFilters {
  domainId?: number | null;
  status?: string | null;
  q?: string | null;
  page?: number;
  size?: number;
}
export function listMailboxes(f: MailboxFilters = {}) {
  const qs = new URLSearchParams();
  if (f.domainId != null) qs.set("domainId", String(f.domainId));
  if (f.status) qs.set("status", f.status);
  if (f.q && f.q.trim()) qs.set("q", f.q.trim());
  qs.set("page", String(f.page ?? 0));
  qs.set("size", String(f.size ?? 20));
  return unwrap(mailApiFetch<ApiResponse<PagedResponse<MailboxSummary>>>(`${ADMIN}/mailboxes?${qs.toString()}`));
}
export function createMailbox(body: {
  localPart: string; domainId: number; displayName?: string; role?: string;
  password?: string; requireChangeOnFirstLogin?: boolean;
}) {
  return unwrap(mailApiFetch<ApiResponse<MailCredentialResponse>>(`${ADMIN}/mailboxes`, {
    method: "POST",
    body: JSON.stringify(body),
  }));
}
export function updateMailbox(id: number, body: { displayName?: string; quotaBytes?: number; role?: string }) {
  return unwrap(mailApiFetch<ApiResponse<MailboxSummary>>(`${ADMIN}/mailboxes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}
export function suspendMailbox(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailboxSummary>>(`${ADMIN}/mailboxes/${id}/suspend`, { method: "POST" }));
}
export function reactivateMailbox(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailboxSummary>>(`${ADMIN}/mailboxes/${id}/reactivate`, { method: "POST" }));
}
/** Schedule the mailbox for deletion (disabled now, hard-purged after a 15-day grace). */
export function deleteMailbox(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailboxSummary>>(`${ADMIN}/mailboxes/${id}`, { method: "DELETE" }));
}
/** Cancel a pending deletion and reactivate the mailbox. */
export function cancelMailboxDeletion(id: number) {
  return unwrap(mailApiFetch<ApiResponse<MailboxSummary>>(`${ADMIN}/mailboxes/${id}/cancel-deletion`, { method: "POST" }));
}
/** Reset a mailbox's password (admin-set or, if blank, server-generated).
 *  Returns the new plaintext ONCE. The password is final unless
 *  requireChangeOnFirstLogin is true. */
export function resetPassword(id: number, body: { password?: string; requireChangeOnFirstLogin?: boolean } = {}) {
  return unwrap(mailApiFetch<ApiResponse<MailCredentialResponse>>(`${ADMIN}/mailboxes/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

// ─── Audit ──
export function listAudit(page = 0, size = 20) {
  return unwrap(mailApiFetch<ApiResponse<PagedResponse<MailAuditEntry>>>(`${ADMIN}/audit?page=${page}&size=${size}`));
}
