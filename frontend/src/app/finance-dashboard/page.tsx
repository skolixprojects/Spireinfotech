"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CheckCircle2, ClipboardList, CreditCard, FileText,
  Image as ImageIcon, LayoutDashboard, Loader2, Package,
} from "lucide-react";

import { RoleDashboardShell, type RoleDashboardTab }
  from "@/components/dashboard/RoleDashboardShell";
import { useAuth } from "@/lib/auth-context";
import {
  getFinanceChecks, reviewFinanceCheck, type FinanceCheckRow,
} from "@/lib/api";

/**
 * Phase 5B — Finance dashboard. Seven tabs:
 *
 *   home     — totals summary (cheap derived stats)
 *   plans    — payment plans (Phase 7 placeholder)
 *   invoices — invoices (Phase 7 placeholder)
 *   payments — received payments (Phase 7 placeholder)
 *   checks   — uploaded check soft-copies with full unmasked review
 *   tracking — physical check tracking (Phase 7 placeholder)
 *   excepts  — finance exceptions (Phase 7 placeholder)
 *
 * Per PRD §13, this is the ONLY role with un-redacted access to
 * check images. The route is locked to FINANCE / SYSTEM_ADMIN /
 * OPERATIONS_ADMIN at both the page level (router guard below)
 * and the API level.
 */

type TabId = "home" | "plans" | "invoices" | "payments" | "checks" | "tracking" | "excepts";

const TABS: ReadonlyArray<RoleDashboardTab> = [
  { id: "home",     label: "Overview",       Icon: LayoutDashboard },
  { id: "plans",    label: "Payment Plans",  Icon: CreditCard },
  { id: "invoices", label: "Invoices",       Icon: FileText },
  { id: "payments", label: "Payments",       Icon: ClipboardList },
  { id: "checks",   label: "Check Copies",   Icon: ImageIcon },
  { id: "tracking", label: "Check Tracking", Icon: Package },
  { id: "excepts",  label: "Exceptions",     Icon: AlertCircle },
];

export default function FinanceDashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [active, setActive] = useState<TabId>("home");
  const [checks, setChecks] = useState<FinanceCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    const role = (user.role ?? "").toUpperCase();
    if (role !== "FINANCE" && role !== "SYSTEM_ADMIN" && role !== "OPERATIONS_ADMIN") {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    getFinanceChecks()
      .then((c) => { if (!cancelled) setChecks(c); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load checks"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoading, user, router]);

  const refresh = async () => setChecks(await getFinanceChecks());

  if (isLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 size={28} className="animate-spin text-[#0F766E]" />
    </div>;
  }

  return (
    <RoleDashboardShell title="Finance" tabs={TABS}
      active={active} onSelect={(id) => setActive(id as TabId)}
    >
      {error && (
        <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {active === "home" && <OverviewTab checks={checks} />}
      {active === "checks" && <ChecksTab checks={checks} onRefresh={refresh} />}
      {active === "plans" && <FinancePlaceholder title="Payment plans" />}
      {active === "invoices" && <FinancePlaceholder title="Invoices" />}
      {active === "payments" && <FinancePlaceholder title="Payments received" />}
      {active === "tracking" && <FinancePlaceholder title="Check tracking" />}
      {active === "excepts" && <FinancePlaceholder title="Finance exceptions" />}
    </RoleDashboardShell>
  );
}

function OverviewTab({ checks }: { checks: FinanceCheckRow[] }) {
  const pending = checks.filter((c) => c.reviewStatus === "PENDING").length;
  const approved = checks.filter((c) => c.reviewStatus === "APPROVED").length;
  const rejected = checks.filter((c) => c.reviewStatus === "REJECTED").length;
  const totalAmount = checks
    .filter((c) => c.reviewStatus === "APPROVED" && c.amount != null)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Finance overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Checks pending review" value={pending} accent="amber" />
        <Stat label="Approved" value={approved} accent="emerald" />
        <Stat label="Rejected" value={rejected} accent="red" />
        <Stat label="Approved $ total"
          value={totalAmount.toLocaleString(undefined, { style: "currency", currency: "USD" })} />
      </div>
      <p className="text-xs text-gray-500">
        Payment plans, invoices, and tracking activate in Phase 7. Use the
        Check Copies tab to review and verify uploaded check soft-copies.
      </p>
    </div>
  );
}

function ChecksTab({ checks, onRefresh }: {
  checks: FinanceCheckRow[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [openImage, setOpenImage] = useState<string | null>(null);

  const review = async (id: number, status: "APPROVED" | "REJECTED") => {
    setBusy(id);
    try {
      await reviewFinanceCheck(id, status);
      await onRefresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Check soft-copies</h1>
      <p className="text-sm text-gray-500">
        Finance and authorised operations admins are the only roles
        permitted to view un-redacted check images. Approve to record
        receipt, reject to request a re-upload from the participant.
      </p>
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-left px-4 py-2">Check #</th>
              <th className="text-left px-4 py-2">Amount</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">File</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {checks.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No check copies uploaded yet.
              </td></tr>
            ) : checks.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{c.participantName ?? "—"}</div>
                  <div className="font-mono text-[10px] text-gray-400">{c.participantId ?? "—"}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{c.checkNumber ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">
                  {c.amount != null
                    ? Number(c.amount).toLocaleString(undefined, { style: "currency", currency: "USD" })
                    : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{c.checkDate ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={
                    "px-2 py-0.5 rounded-full text-[10px] font-bold "
                    + (c.reviewStatus === "APPROVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : c.reviewStatus === "REJECTED"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700")
                  }>{c.reviewStatus}</span>
                </td>
                <td className="px-4 py-2">
                  {c.fileUrl ? (
                    <button onClick={() => setOpenImage(c.fileUrl)}
                      className="text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] cursor-pointer">
                      View
                    </button>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1.5">
                    <button onClick={() => review(c.id, "APPROVED")}
                      disabled={busy === c.id || c.reviewStatus === "APPROVED"}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                      Approve
                    </button>
                    <button onClick={() => review(c.id, "REJECTED")}
                      disabled={busy === c.id || c.reviewStatus === "REJECTED"}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openImage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpenImage(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-700">Check image (unmasked — finance view)</p>
              <button onClick={() => setOpenImage(null)} className="text-xs text-gray-500 hover:text-red-600 cursor-pointer">Close</button>
            </div>
            {openImage.match(/\.(png|jpe?g|gif|webp)$/i) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={openImage} alt="Check image" className="w-full rounded-lg" />
            ) : (
              <a href={openImage} target="_blank" rel="noreferrer"
                className="text-sm font-semibold text-[#0F766E] hover:underline">
                Open in new tab →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: {
  label: string;
  value: number | string;
  accent?: "amber" | "emerald" | "red";
}) {
  const accentClass = accent === "amber"
    ? "text-amber-700" : accent === "emerald"
    ? "text-emerald-700" : accent === "red"
    ? "text-red-700" : "text-gray-900";
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className={"mt-1 text-2xl font-bold " + accentClass}>{value}</p>
    </div>
  );
}

function FinancePlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{title}</h1>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-6">
        <p className="text-sm text-gray-700">
          This module activates with Phase 7. The data model is in place;
          the UI ships once invoicing and tracking are wired.
        </p>
      </div>
    </div>
  );
}
