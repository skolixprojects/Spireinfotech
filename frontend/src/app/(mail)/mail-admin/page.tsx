"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Ban, RotateCcw, KeyRound, Link2, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useMailAuth } from "@/lib/mail-auth-context";
import {
  listDomains, listMailboxes, createMailbox, updateMailbox,
  suspendMailbox, reactivateMailbox, issueSetupLink, issueResetLink,
  type MailDomainSummary, type MailboxSummary, type MailLinkResponse, type PagedResponse,
} from "@/lib/mail-admin-api";
import { Modal } from "./_components/Modal";
import { OneTimeLinkModal } from "./_components/OneTimeLinkModal";
import { ConfirmDialog } from "./_components/ConfirmDialog";

const INPUT = "w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent";
const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"];
const MB = 1024 * 1024;
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function MailboxesPage() {
  const { account } = useMailAuth();
  const { toast } = useToast();
  const isSuper = account?.role === "SUPER_ADMIN";

  const [domains, setDomains] = useState<MailDomainSummary[]>([]);
  const [data, setData] = useState<PagedResponse<MailboxSummary> | null>(null);
  const [loading, setLoading] = useState(true);

  const [domainId, setDomainId] = useState("");
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(0);

  const [linkResult, setLinkResult] = useState<MailLinkResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMailboxes({
        domainId: domainId ? Number(domainId) : undefined,
        status: statusF || undefined,
        q: appliedQ || undefined,
        page,
        size: 20,
      });
      setData(res);
      // If a shrunken result set (e.g. a status-filtered suspend) left us
      // past the last page, step back so we don't strand on an empty page.
      if (res.content.length === 0 && page > 0) setPage((p) => Math.max(0, p - 1));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }, [domainId, statusF, appliedQ, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listDomains().then(setDomains).catch(() => {/* surfaced elsewhere */});
  }, []);

  const canManage = (row: MailboxSummary) => isSuper || row.role === "USER";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Mailboxes</h1>
        <CreateButton domains={domains} isSuper={!!isSuper} onCreated={(link) => { setLinkResult(link); load(); }} />
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Domain</label>
            <select className={INPUT} value={domainId} onChange={(e) => { setPage(0); setDomainId(e.target.value); }}>
              <option value="">{isSuper ? "All domains" : "My domain"}</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select className={INPUT} value={statusF} onChange={(e) => { setPage(0); setStatusF(e.target.value); }}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
          <form
            className="flex items-end gap-2 flex-1 min-w-[220px]"
            onSubmit={(e) => { e.preventDefault(); setPage(0); setAppliedQ(q); }}
          >
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input className={INPUT} placeholder="local part or display name" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="gap-1.5"><Search size={14} /> Search</Button>
          </form>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#0F766E]" /></div>
        ) : !data || data.content.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16">No mailboxes found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.content.map((row) => (
                <MailboxRow
                  key={row.id}
                  row={row}
                  isSuper={!!isSuper}
                  canManage={canManage(row)}
                  onChanged={load}
                  onLink={setLinkResult}
                />
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.totalElements} mailbox(es)</span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" disabled={data.page <= 0} onClick={() => setPage(Math.max(0, data.page - 1))}>Prev</Button>
            <span>Page {data.page + 1} / {data.totalPages}</span>
            <Button variant="ghost" size="sm" disabled={data.page >= data.totalPages - 1} onClick={() => setPage(data.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <OneTimeLinkModal link={linkResult} onClose={() => setLinkResult(null)} />
    </div>
  );
}

// ─── Create ──
function CreateButton({ domains, isSuper, onCreated }: { domains: MailDomainSummary[]; isSuper: boolean; onCreated: (l: MailLinkResponse) => void; }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [domainId, setDomainId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("USER");

  useEffect(() => {
    if (open && !domainId && domains.length > 0) setDomainId(String(domains[0].id));
  }, [open, domains, domainId]);

  const submit = async () => {
    if (!localPart.trim() || !domainId) { toast("error", "Local part and domain are required"); return; }
    setBusy(true);
    try {
      const link = await createMailbox({
        localPart: localPart.trim(),
        domainId: Number(domainId),
        displayName: displayName.trim() || undefined,
        role: isSuper ? role : undefined,
      });
      onCreated(link);
      setOpen(false);
      setLocalPart(""); setDisplayName(""); setRole("USER");
      toast("success", "Mailbox created");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not create mailbox");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus size={16} /> Create mailbox</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create mailbox">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Local part</label>
            <div className="flex items-center gap-2">
              <input className={INPUT} value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="jane.doe" />
              <span className="text-gray-400 text-sm">@</span>
              <select className={INPUT + " max-w-[180px]"} value={domainId} onChange={(e) => setDomainId(e.target.value)}>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
            <input className={INPUT} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
          </div>
          {isSuper && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-gray-500">
            A one-time setup link will be issued — the user sets their own password. You never see it.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Row ──
function MailboxRow({ row, isSuper, canManage, onChanged, onLink }: {
  row: MailboxSummary; isSuper: boolean; canManage: boolean;
  onChanged: () => void; onLink: (l: MailLinkResponse) => void;
}) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "suspend" | "reactivate">(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast("success", ok); onChanged(); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); setConfirm(null); }
  };

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3 font-medium text-gray-900">{row.email}</td>
      <td className="px-4 py-3 text-gray-600">{row.displayName || "—"}</td>
      <td className="px-4 py-3"><RoleBadge role={row.role} /></td>
      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
      <td className="px-4 py-3 text-gray-500">{fmt(row.lastLoginAt)}</td>
      <td className="px-4 py-3">
        {canManage ? (
          <div className="flex items-center justify-end gap-1.5 text-gray-500">
            <IconBtn title="Edit" onClick={() => setEditOpen(true)}><Pencil size={15} /></IconBtn>
            {row.status === "ACTIVE"
              ? <IconBtn title="Suspend" onClick={() => setConfirm("suspend")}><Ban size={15} /></IconBtn>
              : <IconBtn title="Reactivate" onClick={() => setConfirm("reactivate")}><RotateCcw size={15} /></IconBtn>}
            <IconBtn title="Issue setup link" onClick={() => run(() => issueSetupLink(row.id).then(onLink), "Setup link issued")}><Link2 size={15} /></IconBtn>
            <IconBtn title="Reset password" onClick={() => run(() => issueResetLink(row.id).then(onLink), "Reset link issued")}><KeyRound size={15} /></IconBtn>
          </div>
        ) : (
          <span className="block text-right text-xs text-gray-300">—</span>
        )}
      </td>

      <EditMailboxModal open={editOpen} onClose={() => setEditOpen(false)} row={row} isSuper={isSuper} onSaved={onChanged} />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "suspend" ? "Suspend mailbox" : "Reactivate mailbox"}
        message={confirm === "suspend"
          ? `Suspend ${row.email}? They will be unable to sign in until reactivated.`
          : `Reactivate ${row.email}?`}
        confirmLabel={confirm === "suspend" ? "Suspend" : "Reactivate"}
        danger={confirm === "suspend"}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm === "suspend"
          ? run(() => suspendMailbox(row.id), "Mailbox suspended")
          : run(() => reactivateMailbox(row.id), "Mailbox reactivated")}
      />
    </tr>
  );
}

function EditMailboxModal({ open, onClose, row, isSuper, onSaved }: {
  open: boolean; onClose: () => void; row: MailboxSummary; isSuper: boolean; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(row.displayName ?? "");
  const [quotaMb, setQuotaMb] = useState(String(Math.round((row.quotaBytes || 0) / MB)));
  const [role, setRole] = useState(row.role);
  const [busy, setBusy] = useState(false);

  // Reset only on the open edge — a background list refresh (which hands a
  // new row object with the same id) must not clobber in-progress edits.
  useEffect(() => {
    if (!open) return;
    setDisplayName(row.displayName ?? "");
    setQuotaMb(String(Math.round((row.quotaBytes || 0) / MB)));
    setRole(row.role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    // Only send quota when it's a valid number that actually changed, so
    // re-saving an untouched (or non-MB-aligned) quota never rewrites it,
    // and a blank field is rejected rather than silently persisted as 0.
    const origMb = Math.round((row.quotaBytes || 0) / MB);
    let quotaBytes: number | undefined;
    if (quotaMb.trim() !== "") {
      const mb = Number(quotaMb);
      if (!Number.isFinite(mb) || mb < 0) { toast("error", "Quota must be a non-negative number"); return; }
      if (Math.round(mb) !== origMb) quotaBytes = Math.round(mb) * MB;
    }
    setBusy(true);
    try {
      await updateMailbox(row.id, {
        displayName: displayName.trim(),
        quotaBytes,
        role: isSuper && role !== row.role ? role : undefined,
      });
      toast("success", "Mailbox updated");
      onClose(); onSaved();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not update mailbox");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${row.email}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
          <input className={INPUT} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Quota (MB)</label>
          <input className={INPUT} type="number" min={0} value={quotaMb} onChange={(e) => setQuotaMb(e.target.value)} />
        </div>
        {isSuper && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="p-1.5 rounded-md hover:bg-[#0F766E]/10 hover:text-[#0F766E] transition-colors">
      {children}
    </button>
  );
}
function RoleBadge({ role }: { role: string }) {
  const cls = role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700"
    : role === "ADMIN" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{role}</span>;
}
function StatusBadge({ status }: { status: string }) {
  const cls = status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}
