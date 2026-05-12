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
  bulkGenerateInvoices, createFinancePlan, generateInvoice,
  getFinanceChecks, getFinanceDashboard, getFinanceInvoices,
  getFinanceLedger, getFinancePlans, getFinanceTrackings,
  markOverdueInvoices, recordPaymentReceipt, reviewFinanceCheck,
  updateTrackingStatus,
  type FinanceCheckRow, type FinanceDashboardSummary, type FinancePlanRow,
  type FinanceTrackingRow, type InvoiceDTO, type PaymentLedgerDTO,
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
      {active === "plans" && <PlansTab />}
      {active === "invoices" && <InvoicesTab />}
      {active === "payments" && <PaymentsLedgerTab />}
      {active === "tracking" && <CheckTrackingTab />}
      {active === "excepts" && <ExceptionsTab />}
    </RoleDashboardShell>
  );
}

function OverviewTab({ checks }: { checks: FinanceCheckRow[] }) {
  const [summary, setSummary] = useState<FinanceDashboardSummary | null>(null);
  useEffect(() => {
    getFinanceDashboard().then(setSummary).catch(() => {});
  }, []);

  const pending = checks.filter((c) => c.reviewStatus === "PENDING").length;
  const approved = checks.filter((c) => c.reviewStatus === "APPROVED").length;
  const totalAmount = checks
    .filter((c) => c.reviewStatus === "APPROVED" && c.amount != null)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Finance overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Active payment plans" value={summary?.activePlans ?? 0} />
        <Stat label="Unpaid invoices" value={summary?.unpaidInvoices ?? 0} accent="amber" />
        <Stat label="Overdue invoices" value={summary?.overdueInvoices ?? 0} accent="red" />
        <Stat label="Collected"
          value={(typeof summary?.totalCollected === "number"
            ? summary.totalCollected
            : Number(summary?.totalCollected ?? 0)).toLocaleString(undefined,
              { style: "currency", currency: "USD" })}
          accent="emerald" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Checks pending review" value={pending} accent="amber" />
        <Stat label="Checks approved" value={approved} accent="emerald" />
        <Stat label="Check $ total"
          value={totalAmount.toLocaleString(undefined, { style: "currency", currency: "USD" })} />
      </div>
    </div>
  );
}

/* ── Plans tab ───────────────────────────────────────────────── */

function PlansTab() {
  const [rows, setRows] = useState<FinancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = async () => setRows(await getFinancePlans());

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Payment plans</h1>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
          + Create plan
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Plan #</th>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-left px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Installments</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Accepted</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No payment plans yet.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.planNumber}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{r.participantName ?? "—"}</div>
                  <div className="font-mono text-[10px] text-gray-400">{r.participantId ?? "—"}</div>
                </td>
                <td className="px-4 py-2 text-gray-700">{moneyFmt(r.totalAmount)}</td>
                <td className="px-4 py-2 text-gray-700">{r.installments ?? "—"}</td>
                <td className="px-4 py-2">
                  <Pill>{r.status}</Pill>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">
                  {r.acceptedAt ? new Date(r.acceptedAt).toLocaleDateString("en-IN") : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "ACTIVE" && (
                    <button onClick={async () => {
                      await generateInvoice(r.id);
                      await refresh();
                    }}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
                      + Invoice
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={refresh} />}
    </div>
  );
}

function CreatePlanModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [participantId, setParticipantId] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState("3");
  const [firstDue, setFirstDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true); setError("");
    try {
      const totalNum = Number(total);
      const n = Math.max(1, Math.min(60, Number(installments) || 1));
      const installmentAmt = Number((totalNum / n).toFixed(2));
      const base = firstDue ? new Date(firstDue + "T00:00:00") : new Date();
      const schedule = Array.from({ length: n }, (_, i) => {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        return {
          dueDate: d.toISOString().slice(0, 10),
          amount: installmentAmt,
          label: `Installment ${i + 1}`,
        };
      });
      await createFinancePlan({
        participantId: Number(participantId),
        totalAmount: totalNum,
        installments: n,
        schedule,
      });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg font-bold text-gray-900">Create payment plan</h2>
        <p className="text-xs text-gray-500 mt-1">
          Auto-generates a monthly schedule of equal installments starting on
          the first due date.
        </p>
        <div className="mt-3 space-y-2">
          <Field label="Participant user ID" value={participantId} onChange={setParticipantId} />
          <Field label="Total amount (USD)" type="number" value={total} onChange={setTotal} />
          <Field label="Installments" type="number" value={installments} onChange={setInstallments} />
          <Field label="First installment due date" type="date" value={firstDue} onChange={setFirstDue} />
        </div>
        {error && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !participantId || !total || !firstDue}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
            {saving ? <Loader2 size={12} className="animate-spin" /> : "Create plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Invoices tab ────────────────────────────────────────────── */

function InvoicesTab() {
  const [rows, setRows] = useState<InvoiceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("ALL");

  const refresh = async () => {
    setRows(await getFinanceInvoices(filter === "ALL" ? undefined : filter));
  };

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [filter]);

  const runBulkGenerate = async () => {
    setBusy(true);
    try { await bulkGenerateInvoices(); await refresh(); }
    finally { setBusy(false); }
  };
  const runMarkOverdue = async () => {
    setBusy(true);
    try { await markOverdueInvoices(); await refresh(); }
    finally { setBusy(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Invoices</h1>
        <div className="flex gap-1.5">
          <button onClick={runBulkGenerate} disabled={busy}
            className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
            Generate due
          </button>
          <button onClick={runMarkOverdue} disabled={busy}
            className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 cursor-pointer">
            Mark overdue
          </button>
        </div>
      </div>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
        {["ALL", "UNPAID", "PARTIAL", "PAID", "OVERDUE"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={
              "px-2.5 py-1 rounded-md font-semibold cursor-pointer "
              + (filter === s ? "bg-[#0F766E] text-white" : "text-gray-600 hover:text-[#0F766E]")
            }>{s}</button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Invoice</th>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Amount</th>
              <th className="text-left px-4 py-2">Balance</th>
              <th className="text-left px-4 py-2">Due</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No invoices match this filter.
              </td></tr>
            ) : rows.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{i.invoiceNumber}</td>
                <td className="px-4 py-2 text-gray-700">#{i.userId}</td>
                <td className="px-4 py-2 text-gray-700">{moneyFmt(i.amount)}</td>
                <td className="px-4 py-2 text-gray-700">{moneyFmt(i.balance)}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{i.dueDate ?? "—"}</td>
                <td className="px-4 py-2"><Pill>{i.status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Payments ledger tab ─────────────────────────────────────── */

function PaymentsLedgerTab() {
  const [rows, setRows] = useState<PaymentLedgerDTO[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecord, setShowRecord] = useState(false);

  const refresh = async () => {
    const [l, inv] = await Promise.all([
      getFinanceLedger(),
      getFinanceInvoices(),
    ]);
    setRows(l);
    setInvoices(inv);
  };

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Payments ledger</h1>
        <button onClick={() => setShowRecord(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
          + Record payment
        </button>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Invoice</th>
              <th className="text-left px-4 py-2">Amount</th>
              <th className="text-left px-4 py-2">Method</th>
              <th className="text-left px-4 py-2">Balance</th>
              <th className="text-left px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No payments recorded yet.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.receiptDate ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">#{r.userId}</td>
                <td className="px-4 py-2 text-xs text-gray-500">#{r.invoiceId ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{moneyFmt(r.amountReceived)}</td>
                <td className="px-4 py-2 text-gray-700">{r.method ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{moneyFmt(r.balance)}</td>
                <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-[200px]">{r.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRecord && (
        <RecordPaymentModal invoices={invoices}
          onClose={() => setShowRecord(false)} onSaved={refresh} />
      )}
    </div>
  );
}

function RecordPaymentModal({ invoices, onClose, onSaved }: {
  invoices: InvoiceDTO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const unpaid = invoices.filter((i) =>
    i.status === "UNPAID" || i.status === "PARTIAL" || i.status === "OVERDUE");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("CHEQUE");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true); setError("");
    try {
      await recordPaymentReceipt({
        invoiceId: Number(invoiceId),
        amountReceived: Number(amount),
        receiptDate: date || undefined,
        method,
        notes,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg font-bold text-gray-900">Record payment</h2>
        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Invoice</label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200">
              <option value="">— Pick invoice —</option>
              {unpaid.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} · user #{i.userId} · {moneyFmt(i.balance ?? i.amount)} balance
                </option>
              ))}
            </select>
          </div>
          <Field label="Amount received" type="number" value={amount} onChange={setAmount} />
          <Field label="Receipt date" type="date" value={date} onChange={setDate} />
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200">
              {["CHEQUE", "BANK_TRANSFER", "CARD", "CASH", "ADJUSTMENT"].map((m) =>
                <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Field label="Notes (optional)" value={notes} onChange={setNotes} />
        </div>
        {error && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || !invoiceId || !amount}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
            {saving ? <Loader2 size={12} className="animate-spin" /> : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Check tracking tab ──────────────────────────────────────── */

function CheckTrackingTab() {
  const [rows, setRows] = useState<FinanceTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const refresh = async () => setRows(await getFinanceTrackings());

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const updateStatus = async (id: number,
                              status: "RECEIVED" | "EXCEPTION" | "IN_TRANSIT") => {
    setBusy(id);
    try {
      await updateTrackingStatus(id, status,
        status === "RECEIVED" ? new Date().toISOString().slice(0, 10) : undefined);
      await refresh();
    } finally { setBusy(null); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Physical check tracking</h1>
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-left px-4 py-2">Check #</th>
              <th className="text-left px-4 py-2">Carrier</th>
              <th className="text-left px-4 py-2">Tracking ID</th>
              <th className="text-left px-4 py-2">Mailed</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No tracking entries.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{r.participantName ?? "—"}</div>
                  <div className="font-mono text-[10px] text-gray-400">{r.participantId ?? "—"}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.checkNumber ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.carrier ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-gray-500">{r.trackingId ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.mailedDate ?? "—"}</td>
                <td className="px-4 py-2"><Pill>{r.status}</Pill></td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => updateStatus(r.id, "RECEIVED")} disabled={busy === r.id}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                      Received
                    </button>
                    <button onClick={() => updateStatus(r.id, "EXCEPTION")} disabled={busy === r.id}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                      Exception
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Exceptions tab ──────────────────────────────────────────── */

function ExceptionsTab() {
  const [overdue, setOverdue] = useState<InvoiceDTO[]>([]);
  const [exceptions, setExceptions] = useState<FinanceTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFinanceInvoices("OVERDUE"), getFinanceTrackings("EXCEPTION")])
      .then(([o, e]) => {
        if (cancelled) return;
        setOverdue(o);
        setExceptions(e);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Finance exceptions</h1>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          Overdue invoices ({overdue.length})
        </p>
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
              <tr>
                <th className="text-left px-3 py-1.5">Invoice</th>
                <th className="text-left px-3 py-1.5">User</th>
                <th className="text-left px-3 py-1.5">Amount</th>
                <th className="text-left px-3 py-1.5">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overdue.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400 italic">None.</td></tr>
              ) : overdue.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{i.invoiceNumber}</td>
                  <td className="px-3 py-1.5 text-gray-700">#{i.userId}</td>
                  <td className="px-3 py-1.5 text-gray-700">{moneyFmt(i.amount)}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{i.dueDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          Check tracking exceptions ({exceptions.length})
        </p>
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
              <tr>
                <th className="text-left px-3 py-1.5">Participant</th>
                <th className="text-left px-3 py-1.5">Check #</th>
                <th className="text-left px-3 py-1.5">Carrier</th>
                <th className="text-left px-3 py-1.5">Tracking ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {exceptions.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400 italic">None.</td></tr>
              ) : exceptions.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5 text-gray-700">{e.participantName ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{e.checkNumber ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-700">{e.carrier ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-gray-500">{e.trackingId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI primitives ────────────────────────────────────── */

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">{children}</span>;
}

function Spinner() {
  return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
}

function Field({ label, type = "text", value, onChange }: {
  label: string;
  type?: "text" | "date" | "number";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]" />
    </div>
  );
}

function moneyFmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
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
