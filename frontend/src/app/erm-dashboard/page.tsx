"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Briefcase, Check, CheckCircle2, ClipboardList, FileText,
  Loader2, MessageSquare, Search, Send, Settings, Target, UserCheck,
  Users, X as XIcon,
} from "lucide-react";

import { RoleDashboardShell, type RoleDashboardTab }
  from "@/components/dashboard/RoleDashboardShell";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import {
  addErmNote, approvePhase1, approveReferral,
  getErmParticipantDetail, getErmPendingEmployment,
  getErmPendingPhaseApprovals, getErmReports, getErmRoster,
  getReferralQueue, rejectReferral, reviewErmReport, verifyEmployment,
  type ErmPendingEmploymentRow, type ErmPendingPhaseRow,
  type ErmRosterRow, type ReferralQueue, type ReferralQueueRow,
  type WeeklyReportDTO,
} from "@/lib/api";

/**
 * Phase 5B — ERM dashboard. Eight tabs:
 *
 *   home       — assigned participant roster + drill-in detail panel
 *   reports    — weekly reports across all assigned participants,
 *                with inline review (add notes + mark reviewed)
 *   comms      — communication log per participant, free-text notes
 *                with an escalation toggle
 *   interviews — interview milestones (cross-cut view of reports)
 *   employment — Phase 6 placeholder
 *   phase1     — Phase 6 placeholder
 *   coaches    — coach assignments per participant (read-only)
 *   profile    — link to the existing /profile editor
 */

type TabId =
  | "referrals" | "home" | "reports" | "comms" | "interviews"
  | "employment" | "phase1" | "profile";

export default function ErmDashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [active, setActive] = useState<TabId>("referrals");
  const [roster, setRoster] = useState<ErmRosterRow[]>([]);
  const [referralQueue, setReferralQueue] = useState<ReferralQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshReferrals = async () => {
    try {
      const q = await getReferralQueue();
      setReferralQueue(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load referrals");
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    if ((user.role ?? "").toUpperCase() !== "ERM") {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    Promise.allSettled([getErmRoster(), getReferralQueue()])
      .then(([rosterRes, queueRes]) => {
        if (cancelled) return;
        if (rosterRes.status === "fulfilled") setRoster(rosterRes.value);
        else setError(rosterRes.reason instanceof Error ? rosterRes.reason.message : "Couldn't load roster");
        if (queueRes.status === "fulfilled") setReferralQueue(queueRes.value);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoading, user, router]);

  const TABS: ReadonlyArray<RoleDashboardTab> = [
    { id: "referrals",  label: "Referrals",        Icon: UserCheck,
      badge: referralQueue?.stats.pending ?? 0 },
    { id: "home",       label: "My Participants",  Icon: Users },
    { id: "reports",    label: "Weekly Reports",   Icon: ClipboardList },
    { id: "comms",      label: "Communications",   Icon: MessageSquare },
    { id: "interviews", label: "Interviews",       Icon: Target },
    { id: "employment", label: "Employment",       Icon: Briefcase },
    { id: "phase1",     label: "Phase 1",          Icon: CheckCircle2 },
    { id: "profile",    label: "Profile",          Icon: Settings },
  ];

  if (isLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 size={28} className="animate-spin text-[#0F766E]" />
    </div>;
  }

  return (
    <RoleDashboardShell title="ERM Dashboard"
      tabs={TABS} active={active}
      onSelect={(id) => setActive(id as TabId)}
    >
      {error && (
        <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {active === "referrals" && (
        <ReferralsTab queue={referralQueue} onRefresh={refreshReferrals} />
      )}
      {active === "home" && <RosterTab roster={roster} />}
      {active === "reports" && <ReportsTab />}
      {active === "comms" && <CommsTab roster={roster} />}
      {active === "interviews" && <InterviewsTab />}
      {active === "employment" && <EmploymentTab />}
      {active === "phase1" && <Phase1Tab />}
      {active === "profile" && <Placeholder title="Profile"
        copy="Edit your ERM profile from the standard profile page."
        link={{ label: "Open profile", href: "/profile" }} />}
    </RoleDashboardShell>
  );
}

/* ── Referrals tab ────────────────────────────────────────────── */

function ReferralsTab({ queue, onRefresh }: {
  queue: ReferralQueue | null;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [search, setSearch] = useState("");

  const pending = queue?.pending ?? [];
  const stats = queue?.stats ?? { pending: 0, approvedThisWeek: 0, rejected: 0 };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((r) =>
      (r.fullName ?? "").toLowerCase().includes(q)
      || (r.email ?? "").toLowerCase().includes(q));
  }, [pending, search]);

  // Auto-select the top row when the queue lands (or the selection is gone).
  useEffect(() => {
    if (selectedId != null && pending.some((r) => r.userId === selectedId)) return;
    setSelectedId(filtered[0]?.userId ?? null);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  const selected = pending.find((r) => r.userId === selectedId) ?? null;

  const handleReview = async (action: "approve" | "reject") => {
    if (!selected || busy) return;
    setBusy(action);
    try {
      const fn = action === "approve" ? approveReferral : rejectReferral;
      const result = await fn(selected.userId, note.trim() || undefined);
      if (result.alreadyReviewed) {
        toast("info", "Another ERM already reviewed this referral.");
      } else {
        toast(
          action === "approve" ? "success" : "info",
          action === "approve"
            ? `Approved ${selected.fullName ?? selected.email ?? "referral"}`
            : `Rejected ${selected.fullName ?? selected.email ?? "referral"}`
        );
      }
      setSelectedId(null);
      setNote("");
      await onRefresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">Referrals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Approve unlocks the participant&apos;s onboarding steps. Reject drops the account.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Pending" value={stats.pending} accent="amber" />
        <Stat label="Approved this week" value={stats.approvedThisWeek} accent="emerald" />
        <Stat label="Rejected" value={stats.rejected} accent="rose" />
      </div>

      {/* Two-pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-4">
        {/* Queue */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col min-h-[480px]">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-4 py-6 text-center">
                {pending.length === 0
                  ? "No pending referrals."
                  : "No matches for that search."}
              </p>
            ) : filtered.map((r) => {
              const isSel = r.userId === selectedId;
              return (
                <button
                  key={r.userId}
                  type="button"
                  onClick={() => { setSelectedId(r.userId); setNote(""); }}
                  className={
                    "w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition cursor-pointer "
                    + (isSel ? "bg-[#f0fdf9] border-l-2 border-l-[#0F766E]"
                             : "hover:bg-gray-50 border-l-2 border-l-transparent")
                  }
                >
                  <Avatar name={r.fullName ?? r.email ?? "?"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {r.fullName ?? "(no name)"}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">{r.email}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      submitted {formatAgo(r.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 min-h-[480px]">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <UserCheck size={28} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                {pending.length === 0
                  ? "No referrals to review right now."
                  : "Select a referral from the queue to review."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Avatar name={selected.fullName ?? selected.email ?? "?"} size="lg" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif text-lg font-bold text-gray-900 truncate">
                    {selected.fullName ?? "(no name)"}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">{selected.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
                      Reference
                    </span>
                    {selected.emailVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={9} /> Email verified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <DetailRow label="Signed up" value={formatDate(selected.createdAt)} />
                <DetailRow label="Email verified"
                  value={selected.emailVerified ? "Yes" : "No"} />
              </dl>

              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
                  Verification notes (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Add context for the audit log — how you verified, who referred, etc."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleReview("approve")}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {busy === "approve"
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Check size={14} />}
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => handleReview("reject")}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {busy === "reject"
                    ? <Loader2 size={14} className="animate-spin" />
                    : <XIcon size={14} />}
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: {
  label: string;
  value: number;
  accent: "amber" | "emerald" | "rose";
}) {
  const bar =
    accent === "amber" ? "bg-amber-500" :
    accent === "emerald" ? "bg-emerald-500" :
    "bg-rose-500";
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 relative overflow-hidden">
      <span className={"absolute left-0 top-0 bottom-0 w-1 " + bar} />
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 ml-2">
        {label}
      </p>
      <p className="text-3xl font-bold text-gray-900 mt-1 ml-2">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  const cls = size === "lg" ? "w-11 h-11 text-sm" : "w-8 h-8 text-[11px]";
  return (
    <div className={
      "shrink-0 rounded-full bg-[#0F766E] text-white flex items-center justify-center font-bold "
      + cls
    }>
      {initials}
    </div>
  );
}

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "recently";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ── Roster + detail ─────────────────────────────────────────── */

function RosterTab({ roster }: { roster: ErmRosterRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openParticipant = async (id: number) => {
    setOpenId(id);
    setDetailLoading(true);
    try {
      setDetail(await getErmParticipantDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">My participants</h1>
      <p className="text-sm text-gray-500">
        Every participant on your caseload. Click a row to see the full
        profile, roadmap status, documents, agreement state, and weekly
        reports.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Program</th>
              <th className="text-left px-4 py-2">Technology</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {roster.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No participants assigned yet.
              </td></tr>
            ) : roster.map((r) => (
              <tr key={r.userId}
                onClick={() => openParticipant(r.userId)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-2 font-medium text-gray-900">{r.fullName ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.participantId ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.program ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.technology ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0fdf9] text-[#0F766E]">
                    {r.currentStatus ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.lastActivity ? new Date(r.lastActivity).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
                  }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => { setOpenId(null); setDetail(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>
            ) : (
              <DetailPanel detail={detail} onClose={() => { setOpenId(null); setDetail(null); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ detail, onClose }: {
  detail: Record<string, unknown> | null;
  onClose: () => void;
}) {
  if (!detail) return <p className="text-sm text-gray-500">Couldn&apos;t load details.</p>;
  const program = detail.program as Record<string, string | null> | undefined;
  const agreement = detail.agreement as Record<string, string> | undefined;
  const documents = (detail.documents as Array<Record<string, unknown>>) ?? [];
  const reports = (detail.reports as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-gray-900">
            {(detail.fullName as string) ?? "Participant"}
          </h2>
          <p className="text-xs text-gray-500 font-mono">{(detail.participantId as string) ?? "—"}</p>
          <p className="text-xs text-gray-500 mt-0.5">{(detail.email as string) ?? "—"}</p>
        </div>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-red-600 cursor-pointer">Close</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <SmallStat label="Status" value={(detail.currentStatus as string) ?? "—"} />
        <SmallStat label="Phone" value={(detail.phone as string) ?? "—"} />
        <SmallStat label="Program" value={program?.program ?? "—"} />
        <SmallStat label="Phase" value={program?.phase ?? "—"} />
        <SmallStat label="Skillset" value={program?.skillset ?? "—"} />
        <SmallStat label="Target role" value={program?.targetJobTitle ?? "—"} />
        <SmallStat label="Availability" value={program?.availability ?? "—"} />
        <SmallStat label="Agreement" value={agreement?.status ?? "—"} />
      </div>

      <DetailBlock title={`Documents (${documents.length})`}>
        {documents.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No documents.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {documents.map((d, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <FileText size={11} className="text-gray-400" />
                <span className="flex-1">{String(d.documentType)}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                  {String(d.reviewStatus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>

      <DetailBlock title={`Weekly reports (${reports.length})`}>
        {reports.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No reports submitted yet.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {reports.slice(0, 5).map((r, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="font-mono">{String(r.weekStart)} – {String(r.weekEnd)}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 ml-auto">
                  {String(r.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>

      <DetailBlock title="Communication notes">
        <pre className="text-xs whitespace-pre-wrap text-gray-700">{(detail.communicationNotes as string) || "—"}</pre>
      </DetailBlock>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className="font-medium text-gray-800 truncate">{value}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">{title}</p>
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">{children}</div>
    </div>
  );
}

/* ── Reports tab ─────────────────────────────────────────────── */

function ReportsTab() {
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setReports(await getErmReports());
  };

  useEffect(() => {
    let cancelled = false;
    getErmReports()
      .then((r) => { if (!cancelled) setReports(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (filter === "ALL") return reports;
    return reports.filter((r) => r.status === filter);
  }, [reports, filter]);

  const openReport = (id: number) => {
    const r = reports.find((x) => x.id === id);
    setOpenId(id);
    setNotes(r?.ermNotes ?? "");
  };

  const submitReview = async () => {
    if (!openId) return;
    setSaving(true);
    try {
      await reviewErmReport(openId, notes);
      await refresh();
      setOpenId(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Weekly reports</h1>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
          {["ALL", "SUBMITTED", "REVIEWED", "OVERDUE", "PENDING"].map((s) => (
            <button key={s} type="button"
              onClick={() => setFilter(s)}
              className={
                "px-2.5 py-1 rounded-md font-semibold cursor-pointer "
                + (filter === s ? "bg-[#0F766E] text-white" : "text-gray-600 hover:text-[#0F766E]")
              }>{s}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-100">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400 italic">No reports match this filter.</p>
        ) : visible.map((r) => (
          <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-gray-50">
            <span className="font-mono text-xs text-gray-700 w-44 shrink-0">
              {r.weekStart} – {r.weekEnd}
            </span>
            <span className={
              "px-2 py-0.5 rounded-full text-[10px] font-bold "
              + (r.status === "SUBMITTED"
                  ? "bg-emerald-50 text-emerald-700"
                  : r.status === "REVIEWED"
                    ? "bg-blue-50 text-blue-700"
                    : r.status === "OVERDUE"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-600")
            }>{r.status}</span>
            <span className="text-xs text-gray-500 ml-auto">User #{r.id}</span>
            <button type="button" onClick={() => openReport(r.id)}
              className="text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] cursor-pointer">
              Review
            </button>
          </div>
        ))}
      </div>

      {openId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenId(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-lg font-bold text-gray-900">Review report #{openId}</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
              className="mt-3 w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
              placeholder="Notes for the participant + audit trail" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenId(null)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button type="button" onClick={submitReview} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {saving ? "Saving…" : "Mark reviewed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Comms tab ───────────────────────────────────────────────── */

function CommsTab({ roster }: { roster: ErmRosterRow[] }) {
  const [participantId, setParticipantId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [escalation, setEscalation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!participantId || !note.trim()) {
      setError("Pick a participant and write a note.");
      return;
    }
    setSaving(true); setError(""); setFeedback("");
    try {
      await addErmNote(Number(participantId), note.trim(), escalation);
      setFeedback("Note logged.");
      setNote(""); setEscalation(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Communications</h1>
      <p className="text-sm text-gray-500">
        Log communication notes and escalations. Notes are timestamped
        and appended to the participant&apos;s ERM record.
      </p>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Participant</label>
          <select value={participantId}
            onChange={(e) => setParticipantId(e.target.value ? Number(e.target.value) : "")}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-200">
            <option value="">— Pick one —</option>
            {roster.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.fullName ?? "—"} ({r.participantId ?? "—"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-200"
            placeholder="What happened, what's the next step, who's owning it..." />
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={escalation}
            onChange={(e) => setEscalation(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
          <span className="text-gray-700">Flag this as an escalation</span>
        </label>
        {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={14} /> {error}</p>}
        {feedback && <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={14} /> {feedback}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={handleAdd} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {saving ? "Logging…" : "Log note"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Employment tab (Phase 6) ────────────────────────────────── */

function EmploymentTab() {
  const [rows, setRows] = useState<ErmPendingEmploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => setRows(await getErmPendingEmployment());

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load queue"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const openVerify = (uid: number) => { setOpenId(uid); setNotes(""); };

  const handleVerify = async () => {
    if (openId == null) return;
    setSaving(true); setError("");
    try {
      await verifyEmployment(openId, notes);
      await refresh();
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Employment verification</h1>
      <p className="text-sm text-gray-500">
        Pending employment acceptances from your assigned participants.
        Verifying flips Gate 6 open and unlocks Phase 1 acknowledgment.
      </p>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-left px-4 py-2">Employer</th>
              <th className="text-left px-4 py-2">Job title</th>
              <th className="text-left px-4 py-2">Start date</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-left px-4 py-2">Offer doc</th>
              <th className="text-right px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No pending verifications.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{r.fullName ?? "—"}</div>
                  <div className="font-mono text-[10px] text-gray-400">{r.participantId ?? "—"}</div>
                </td>
                <td className="px-4 py-2 text-gray-700">{r.employerClient ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.jobTitle ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.startDate ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.acceptanceDate
                    ? new Date(r.acceptanceDate).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata", dateStyle: "medium",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {r.offerDocumentUrl
                    ? <a href={r.offerDocumentUrl} target="_blank" rel="noreferrer"
                        className="text-xs font-semibold text-[#0F766E] hover:underline">View</a>
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openVerify(r.userId)}
                    className="px-3 py-1 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
                    Verify
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId != null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenId(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-lg font-bold text-gray-900">Verify employment</h2>
            <p className="text-xs text-gray-500 mt-1">
              Confirms the offer details on file and unlocks Phase 1 for the participant.
            </p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="mt-3 w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
              placeholder="Optional ERM notes (audit trail)" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenId(null)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button type="button" onClick={handleVerify} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {saving ? "Verifying…" : "Verify ✓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Phase 1 tab (Phase 6) ───────────────────────────────────── */

function Phase1Tab() {
  const [rows, setRows] = useState<ErmPendingPhaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => setRows(await getErmPendingPhaseApprovals());

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load queue"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const approve = async (uid: number) => {
    setBusy(uid); setError("");
    try {
      await approvePhase1(uid);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Phase 1 approvals</h1>
      <p className="text-sm text-gray-500">
        Participants who self-attested Phase 1 completion. Approving
        closes Phase 1 audit-side; the payment plan activation remains
        with finance.
      </p>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-left px-4 py-2">Accepted</th>
              <th className="text-left px-4 py-2">Version</th>
              <th className="text-right px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No Phase 1 approvals pending.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{r.fullName ?? "—"}</div>
                  <div className="font-mono text-[10px] text-gray-400">{r.participantId ?? "—"}</div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.acceptedAt ? new Date(r.acceptedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata", dateStyle: "medium",
                  }) : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.acknowledgmentVersion ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => approve(r.userId)} disabled={busy === r.userId}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
                    {busy === r.userId ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                    Approve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Interviews tab ──────────────────────────────────────────── */

function InterviewsTab() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Interview milestones</h1>
      <p className="text-sm text-gray-500">
        Interview milestones are recorded inside each weekly report&apos;s
        interview-training section. Use the Weekly Reports tab to drill in
        per participant.
      </p>
    </div>
  );
}

function Placeholder({ title, copy, link }: {
  title: string;
  copy: string;
  link?: { label: string; href: string };
}) {
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{title}</h1>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-6">
        <p className="text-sm text-gray-700">{copy}</p>
        {link && (
          <a href={link.href} className="mt-3 inline-block text-sm font-semibold text-[#0F766E] hover:underline">
            {link.label} →
          </a>
        )}
      </div>
    </div>
  );
}
