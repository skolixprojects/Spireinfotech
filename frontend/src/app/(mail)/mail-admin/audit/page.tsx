"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { listAudit, type MailAuditEntry, type PagedResponse } from "@/lib/mail-admin-api";

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function AuditPage() {
  const { toast } = useToast();
  const [data, setData] = useState<PagedResponse<MailAuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await listAudit(page, 20)); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Failed to load audit log"); }
    finally { setLoading(false); }
  }, [page, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Audit log</h1>

      <GlassCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#0F766E]" /></div>
        ) : !data || data.content.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16">No audit entries.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.content.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(e.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-700">{e.actorEmail}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">{e.action}</span></td>
                  <td className="px-4 py-3 text-gray-500">{e.targetType ? `${e.targetType} #${e.targetId}` : "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{e.details || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </GlassCard>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.totalElements} entries</span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" disabled={data.page <= 0} onClick={() => setPage(Math.max(0, data.page - 1))}>Prev</Button>
            <span>Page {data.page + 1} / {data.totalPages}</span>
            <Button variant="ghost" size="sm" disabled={data.page >= data.totalPages - 1} onClick={() => setPage(data.page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
