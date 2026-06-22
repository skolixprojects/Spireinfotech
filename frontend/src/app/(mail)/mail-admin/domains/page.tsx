"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useMailAuth } from "@/lib/mail-auth-context";
import { listDomains, createDomain, updateDomain, type MailDomainSummary } from "@/lib/mail-admin-api";
import { Modal } from "../_components/Modal";
import { ConfirmDialog } from "../_components/ConfirmDialog";

const INPUT = "w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function DomainsPage() {
  const { account, status } = useMailAuth();
  const { toast } = useToast();
  const router = useRouter();
  const isSuper = account?.role === "SUPER_ADMIN";

  const [domains, setDomains] = useState<MailDomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MailDomainSummary | null>(null);

  // Domains is super-only; mirror the backend (which 403s ADMIN writes).
  useEffect(() => {
    if (status === "authenticated" && !isSuper) router.replace("/mail-admin");
  }, [status, isSuper, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDomains(await listDomains()); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Failed to load domains"); }
    finally { setLoading(false); }
  }, [toast]);

  // Only fetch once the user is confirmed eligible — avoids a spurious
  // 403 toast for an ADMIN who is about to be redirected away.
  useEffect(() => { if (isSuper) load(); }, [isSuper, load]);

  if (!isSuper) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#0F766E]" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Domains</h1>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus size={16} /> Add domain</Button>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#0F766E]" /></div>
        ) : domains.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16">No domains.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {domains.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.domain}</td>
                  <td className="px-4 py-3 text-gray-600">{d.entityName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${d.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmt(d.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button title="Edit" onClick={() => setEditTarget(d)} className="p-1.5 rounded-md text-gray-500 hover:bg-[#0F766E]/10 hover:text-[#0F766E]">
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </GlassCard>

      <CreateDomainModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <EditDomainModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />
    </div>
  );
}

function CreateDomainModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void; }) {
  const { toast } = useToast();
  const [domain, setDomain] = useState("");
  const [entityName, setEntityName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!domain.trim() || !entityName.trim()) { toast("error", "Domain and entity name are required"); return; }
    setBusy(true);
    try {
      await createDomain({ domain: domain.trim(), entityName: entityName.trim() });
      toast("success", "Domain created");
      setDomain(""); setEntityName(""); onClose(); onCreated();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not create domain");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add domain">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Domain</label>
          <input className={INPUT} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity name</label>
          <input className={INPUT} value={entityName} onChange={(e) => setEntityName(e.target.value)} placeholder="Example Inc." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditDomainModal({ target, onClose, onSaved }: { target: MailDomainSummary | null; onClose: () => void; onSaved: () => void; }) {
  const { toast } = useToast();
  const [entityName, setEntityName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (target) { setEntityName(target.entityName); setIsActive(target.isActive); }
  }, [target]);

  const persist = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await updateDomain(target.id, { entityName: entityName.trim(), isActive });
      toast("success", "Domain updated");
      setConfirmDeactivate(false); onClose(); onSaved();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not update domain");
      setConfirmDeactivate(false);
    } finally { setBusy(false); }
  };

  const save = () => {
    // Deactivating a domain blocks every account under it — confirm.
    if (target && target.isActive && !isActive) { setConfirmDeactivate(true); return; }
    persist();
  };

  return (
    <>
      <Modal open={!!target} onClose={onClose} title={target ? `Edit ${target.domain}` : ""}>
        {target && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Entity name</label>
              <input className={INPUT} value={entityName} onChange={(e) => setEntityName(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[#0F766E]" />
              Active
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate domain"
        message={`Deactivate ${target?.domain}? Every mailbox under this domain will be unable to sign in.`}
        confirmLabel="Deactivate"
        danger
        busy={busy}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={persist}
      />
    </>
  );
}
