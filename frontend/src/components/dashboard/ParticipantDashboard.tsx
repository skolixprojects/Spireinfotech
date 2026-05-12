"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, Bell, Briefcase, CheckCircle2, ClipboardList,
  CreditCard, FileText, Loader2, Mail, Menu, MessageSquare, Plus, Save,
  Send, Settings, ShieldCheck, Target, Trash2, Users, BookOpen,
  LayoutDashboard, X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  getParticipantDashboard, getParticipantProfile, getParticipantTeam,
  listParticipantDocuments, listWeeklyReports, saveWeeklyReportDraft,
  submitWeeklyReport, updateParticipantProfile,
  type ParticipantDashboard as DashboardData, type ParticipantTeam,
  type ParticipantDocument, type UserDTO, type WeeklyReportDTO,
  type WeeklyReportJobSubmission, type WeeklyReportRequest,
} from "@/lib/api";

/**
 * Phase 5A — Participant dashboard.
 *
 * Sidebar + tabbed main content. Lives at /dashboard for users who
 * have a participantId (the legacy LMS dashboard handles everyone
 * else via the branch in app/dashboard/page.tsx).
 *
 * Tab modules:
 *   home       — roadmap + team summary + activity timeline
 *   weekly     — submit / draft / list weekly reports
 *   resume     — placeholder (Phase 5B)
 *   interview  — placeholder (Phase 5B)
 *   employment — placeholder (Phase 6)
 *   payments   — placeholder (Phase 7)
 *   documents  — read-only view of uploaded documents
 *   agreement  — read-only view of signed agreement status
 *   team       — full team contact cards
 *   messages   — link to existing /messages
 *   profile    — link to existing /profile
 */

type TabId =
  | "home" | "weekly" | "resume" | "interview" | "employment"
  | "payments" | "documents" | "agreement" | "team" | "messages" | "profile";

interface NavItem {
  id: TabId;
  label: string;
  Icon: typeof LayoutDashboard;
}

const NAV: ReadonlyArray<NavItem> = [
  { id: "home",       label: "Dashboard",      Icon: LayoutDashboard },
  { id: "weekly",     label: "Weekly Report",  Icon: ClipboardList },
  { id: "resume",     label: "Resume / Profile", Icon: BookOpen },
  { id: "interview",  label: "Interview",      Icon: Target },
  { id: "employment", label: "Employment",     Icon: Briefcase },
  { id: "payments",   label: "Payments",       Icon: CreditCard },
  { id: "documents",  label: "Documents",      Icon: FileText },
  { id: "agreement",  label: "Agreement",      Icon: ShieldCheck },
  { id: "team",       label: "My Team",        Icon: Users },
  { id: "messages",   label: "Messages",       Icon: MessageSquare },
  { id: "profile",    label: "Profile",        Icon: Settings },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function ParticipantDashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState<TabId>("home");
  const [data, setData] = useState<DashboardData | null>(null);
  const [team, setTeam] = useState<ParticipantTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the active tab changes — desktop
  // sidebar stays put because it isn't backed by this state.
  useEffect(() => { setDrawerOpen(false); }, [active]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, t] = await Promise.all([getParticipantDashboard(), getParticipantTeam()]);
        if (cancelled) return;
        setData(d);
        setTeam(t);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center max-w-md">
          <AlertCircle size={20} className="text-red-600 inline-block mb-2" />
          <p className="text-sm text-red-700">{error || "Dashboard unavailable"}</p>
        </div>
      </div>
    );
  }

  const SidebarBody = (
    <>
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image src="/logo.png" alt="Spire" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="font-serif text-sm font-bold text-[#0F766E]">Spire Info Tech</span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden text-gray-400 hover:text-gray-700 cursor-pointer"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((n) => {
          const isActive = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={
                "w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer "
                + (isActive
                    ? "bg-[#0F766E] text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
              }
            >
              <n.Icon size={14} />
              <span className="truncate">{n.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-700 truncate">{data.fullName ?? user?.email ?? ""}</p>
          <p className="text-[10px] font-mono text-gray-400 truncate">{data.participantId ?? ""}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="shrink-0 text-xs text-gray-500 hover:text-red-600 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col">
            {SidebarBody}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 text-gray-700 hover:text-[#0F766E] cursor-pointer"
            aria-label="Open menu"
          >
            <Menu size={18} />
            <span className="text-sm font-semibold">{NAV.find((n) => n.id === active)?.label ?? "Menu"}</span>
          </button>
          <span className="text-[10px] font-mono text-gray-400">{data.participantId ?? ""}</span>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {active === "home" && (
            <HomeTab data={data} team={team} userEmail={user?.email ?? null}
              onJumpTo={(t) => setActive(t)} />
          )}
          {active === "weekly" && <WeeklyTab dashboardData={data} />}
          {active === "team" && <TeamTab team={team} data={data} />}
          {active === "documents" && <DocumentsTab />}
          {active === "agreement" && <AgreementTab participantId={data.participantId} />}
          {active === "resume" && (
            <PlaceholderCard
              title="Resume / Profile activity"
              copy="Track your resume versions, LinkedIn updates, and portal profiles here. Detailed tracking ships in Phase 5B."
              hint="In the meantime, log resume updates on your weekly report."
            />
          )}
          {active === "interview" && (
            <PlaceholderCard
              title="Interview training"
              copy="Mock interview schedule, coach feedback, and practice tasks land here in Phase 5B."
              hint="Talk to your interview coach via the My Team tab to schedule a mock."
            />
          )}
          {active === "employment" && (
            <PlaceholderCard
              title="Employment acceptance"
              copy="Once you receive an offer, your ERM will guide you through accepting it. This module activates in Phase 6."
              hint="Notify your ERM as soon as you have an offer in hand."
            />
          )}
          {active === "payments" && (
            <PlaceholderCard
              title="Payments & invoices"
              copy="Your payment plan and invoices will be activated after employment acceptance and Phase 1 completion (Phase 7)."
              hint="Reach out to your ERM if you have questions about the schedule."
            />
          )}
          {active === "messages" && <MessagesTab data={data} team={team} />}
          {active === "profile" && <ProfileTab />}
        </div>
      </main>
    </div>
  );
}

/* ── Home tab ─────────────────────────────────────────────────── */

function HomeTab({ data, team, userEmail, onJumpTo }: {
  data: DashboardData;
  team: ParticipantTeam | null;
  userEmail: string | null;
  onJumpTo: (id: TabId) => void;
}) {
  const firstName = (data.fullName ?? userEmail ?? "there").split(" ")[0];
  const progressPct = Math.round((data.roadmapStep / data.roadmapTotal) * 100);
  const coaches = team?.coaches ?? {};
  const coachEntries = Object.entries(coaches);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {greeting()}, {firstName}!
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Participant ID: <span className="font-mono text-gray-700">{data.participantId ?? "—"}</span>
        </p>
      </div>

      {/* Roadmap */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            Your roadmap
          </p>
          <p className="text-xs text-gray-500">
            Step <span className="font-bold text-[#0F766E]">{data.roadmapStep}</span> of {data.roadmapTotal}
            : <span className="font-semibold text-gray-700">{data.roadmapLabels[Math.max(0, data.roadmapStep - 1)]}</span>
          </p>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-[#0F766E] transition-all"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.roadmapLabels.map((label, idx) => {
            const stepNum = idx + 1;
            const isDone = stepNum < data.roadmapStep;
            const isActive = stepNum === data.roadmapStep;
            return (
              <span key={label}
                title={`${stepNum}. ${label}`}
                className={
                  "inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold "
                  + (isDone
                      ? "bg-emerald-600 text-white"
                      : isActive
                        ? "bg-[#0F766E] text-white ring-2 ring-[#0F766E]/30 animate-pulse"
                        : "bg-white border border-gray-200 text-gray-400")
                }
              >
                {isDone ? "✓" : stepNum}
              </span>
            );
          })}
        </div>

        {data.nextAction && (
          <div className="mt-4 rounded-xl border border-[#0F766E]/20 bg-[#f0fdf9] p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[#0F766E]">Next action</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{data.nextAction.label}</p>
            </div>
            <button type="button"
              onClick={() => {
                if (data.nextAction.href.startsWith("#")) {
                  onJumpTo(data.nextAction.href.slice(1) as TabId);
                } else {
                  window.location.href = data.nextAction.href;
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
            >
              Go <ArrowRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Team summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <SmallTeamCard role="ERM" name={team?.erm?.name ?? null} email={team?.erm?.email ?? null} />
        {coachEntries.slice(0, 3).map(([label, name]) => (
          <SmallTeamCard key={label} role={label}
            name={name && name !== "Awaiting assignment" ? name : null} />
        ))}
      </div>

      {/* Stats + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Weeks enrolled</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{data.stats?.weeksEnrolled ?? 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Reports submitted</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{data.stats?.reportsSubmitted ?? 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Program</p>
          <p className="mt-1 text-sm font-bold text-gray-900 leading-tight">
            {data.program?.program ?? "—"}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {data.program?.skillset} · {data.program?.targetJobTitle}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
          Recent activity
        </p>
        {data.recentActivity && data.recentActivity.length > 0 ? (
          <ul className="space-y-2">
            {data.recentActivity.map((a, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800">{a.title}</p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(a.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 italic">No activity yet.</p>
        )}
      </div>
    </div>
  );
}

function SmallTeamCard({ role, name, email }: {
  role: string; name: string | null; email?: string | null;
}) {
  return (
    <div className={
      "rounded-xl border p-3 "
      + (name ? "border-emerald-200 bg-emerald-50/40" : "border-dashed border-gray-200 bg-gray-50/60")
    }>
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{role}</p>
      <p className={"mt-1 text-sm font-semibold " + (name ? "text-gray-900" : "text-gray-400 italic")}>
        {name ?? "Awaiting…"}
      </p>
      {email && (
        <p className="mt-0.5 text-[11px] text-gray-500 inline-flex items-center gap-1 truncate">
          <Mail size={10} /> {email}
        </p>
      )}
    </div>
  );
}

/* ── Team tab ─────────────────────────────────────────────────── */

function TeamTab({ team, data }: { team: ParticipantTeam | null; data: DashboardData }) {
  const coaches = Object.entries(team?.coaches ?? {});
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Your support team</h1>
      <p className="text-sm text-gray-500">
        Reach out to anyone on your team via the email below. Your ERM is your primary communication owner.
      </p>
      <div className="space-y-3">
        <BigTeamCard role="Employee Relationship Manager (ERM)"
          name={team?.erm?.name ?? null}
          email={team?.erm?.email ?? null}
          subtitle="Primary communication owner — reviews your weekly reports and guides program execution." />
        {coaches.map(([label, name]) => (
          <BigTeamCard key={label} role={label}
            name={name && name !== "Awaiting assignment" ? name : null}
            subtitle={subtitleForRole(label, data.program?.skillset)} />
        ))}
      </div>
    </div>
  );
}

function subtitleForRole(role: string, skillset?: string): string {
  switch (role) {
    case "Career Coach": return "General career guidance, job-market navigation.";
    case "Resume Specialist": return "Resume edits, profile / LinkedIn optimisation.";
    case "Technical Advisor":
      return `Technical mentor — ${skillset ?? "matched to your skillset"}.`;
    case "Interview Coach": return "Mock interviews, communication coaching.";
    default: return "";
  }
}

function BigTeamCard({ role, name, email, subtitle }: {
  role: string;
  name: string | null;
  email?: string | null;
  subtitle: string;
}) {
  return (
    <div className={
      "rounded-2xl border bg-white p-4 sm:p-5 flex items-start gap-3 "
      + (name ? "border-gray-200" : "border-dashed border-gray-200")
    }>
      <div className={
        "shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm "
        + (name ? "bg-[#0F766E] text-white" : "bg-gray-100 text-gray-400")
      }>
        {name ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className={"text-base font-bold " + (name ? "text-gray-900" : "text-gray-400 italic")}>
          {name ?? "Awaiting assignment"}
        </p>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mt-0.5">{role}</p>
        <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
        {email && (
          <a href={`mailto:${email}`} className="mt-1 inline-flex items-center gap-1 text-xs text-[#0F766E] hover:underline">
            <Mail size={11} /> {email}
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Weekly tab ───────────────────────────────────────────────── */

interface WeeklyFormState {
  jobs: WeeklyReportJobSubmission[];
  resumeVersion: string;
  profileUpdates: string;
  portalUpdates: string;
  linkedinUpdates: string;
  mockDate: string;
  interviewTopic: string;
  coach: string;
  feedback: string;
  improvements: string;
  nextPractice: string;
  messagesAck: string;
  questions: string;
  escalation: boolean;
  escalationDetail: string;
}

const blankJob = (): WeeklyReportJobSubmission => ({
  company: "", client: "", jobTitle: "", technology: "",
  portal: "", applicationLink: "", submissionDate: "",
  status: "Applied", followUpDate: "",
});

const blankForm = (): WeeklyFormState => ({
  jobs: [blankJob()],
  resumeVersion: "", profileUpdates: "", portalUpdates: "", linkedinUpdates: "",
  mockDate: "", interviewTopic: "", coach: "", feedback: "",
  improvements: "", nextPractice: "",
  messagesAck: "", questions: "",
  escalation: false, escalationDetail: "",
});

function WeeklyTab({ dashboardData }: { dashboardData: DashboardData }) {
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [form, setForm] = useState<WeeklyFormState>(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  // Load reports + pre-fill form from current-week draft (if any)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listWeeklyReports();
        if (cancelled) return;
        setReports(list);
        const weekStart = dashboardData.currentWeekStart;
        if (weekStart) {
          const current = list.find((r) => r.weekStart === weekStart);
          if (current && current.reportData) {
            try {
              const parsed = JSON.parse(current.reportData);
              setForm({
                jobs: Array.isArray(parsed.jobSubmissions) && parsed.jobSubmissions.length > 0
                  ? parsed.jobSubmissions
                  : [blankJob()],
                resumeVersion: parsed.resumeActivities?.resumeVersion ?? "",
                profileUpdates: parsed.resumeActivities?.profileUpdates ?? "",
                portalUpdates: parsed.resumeActivities?.portalUpdates ?? "",
                linkedinUpdates: parsed.resumeActivities?.linkedinUpdates ?? "",
                mockDate: parsed.interviewTraining?.mockDate ?? "",
                interviewTopic: parsed.interviewTraining?.topic ?? "",
                coach: parsed.interviewTraining?.coach ?? "",
                feedback: parsed.interviewTraining?.feedback ?? "",
                improvements: parsed.interviewTraining?.improvements ?? "",
                nextPractice: parsed.interviewTraining?.nextPracticeDate ?? "",
                messagesAck: parsed.communications?.messagesAcknowledged ?? "",
                questions: parsed.communications?.questions ?? "",
                escalation: parsed.communications?.escalation === "true",
                escalationDetail: parsed.communications?.escalationDetail ?? "",
              });
            } catch { /* keep default */ }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dashboardData.currentWeekStart]);

  const metrics = useMemo(() => {
    const subs = form.jobs.filter((j) => (j.company ?? "").trim());
    const followups = subs.filter((j) => (j.followUpDate ?? "").trim()).length;
    const interviews = subs.filter((j) => j.status === "Interview").length;
    return { submissions: subs.length, followups, interviews };
  }, [form]);

  const toRequest = (): WeeklyReportRequest => ({
    weekStart: dashboardData.currentWeekStart,
    weekEnd: dashboardData.currentWeekEnd,
    jobSubmissions: form.jobs.filter((j) => (j.company ?? "").trim()),
    resumeActivities: {
      resumeVersion: form.resumeVersion,
      profileUpdates: form.profileUpdates,
      portalUpdates: form.portalUpdates,
      linkedinUpdates: form.linkedinUpdates,
    },
    interviewTraining: {
      mockDate: form.mockDate, topic: form.interviewTopic, coach: form.coach,
      feedback: form.feedback, improvements: form.improvements,
      nextPracticeDate: form.nextPractice,
    },
    communications: {
      messagesAcknowledged: form.messagesAck,
      questions: form.questions,
      escalation: form.escalation ? "true" : "false",
      escalationDetail: form.escalation ? form.escalationDetail : "",
    },
  });

  const handleSaveDraft = async () => {
    setSaving(true); setError(""); setFeedback("");
    try {
      await saveWeeklyReportDraft(toRequest());
      setFeedback("Draft saved.");
      setReports(await listWeeklyReports());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save draft");
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    setSubmitting(true); setError(""); setFeedback("");
    try {
      await submitWeeklyReport(toRequest());
      setFeedback("Report submitted. Your ERM will review and respond.");
      setReports(await listWeeklyReports());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit report");
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Weekly submission report</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Week of <span className="font-mono">{dashboardData.currentWeekStart}</span> –{" "}
            <span className="font-mono">{dashboardData.currentWeekEnd}</span>
            {dashboardData.currentWeekEnd && (
              <>
                {" · "}due{" "}
                <span className="font-mono">
                  {addOneDay(dashboardData.currentWeekEnd)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Submissions" value={metrics.submissions} />
        <Stat label="Follow-ups" value={metrics.followups} />
        <Stat label="Interviews" value={metrics.interviews} />
      </div>

      {/* Job submissions */}
      <Section title="Job submissions">
        <div className="space-y-3">
          {form.jobs.map((job, idx) => (
            <div key={idx} className="rounded-xl border border-gray-200 bg-white p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input label="Company *" value={job.company ?? ""}
                onChange={(v) => updateJob(idx, "company", v)} />
              <Input label="Client / Vendor" value={job.client ?? ""}
                onChange={(v) => updateJob(idx, "client", v)} />
              <Input label="Job title *" value={job.jobTitle ?? ""}
                onChange={(v) => updateJob(idx, "jobTitle", v)} />
              <Input label="Technology *" value={job.technology ?? ""}
                onChange={(v) => updateJob(idx, "technology", v)} />
              <Input label="Portal / source *" value={job.portal ?? ""}
                onChange={(v) => updateJob(idx, "portal", v)} />
              <Input label="Application link" value={job.applicationLink ?? ""}
                onChange={(v) => updateJob(idx, "applicationLink", v)} />
              <Input label="Submission date *" type="date" value={job.submissionDate ?? ""}
                onChange={(v) => updateJob(idx, "submissionDate", v)} />
              <Select label="Status *" value={job.status ?? "Applied"}
                onChange={(v) => updateJob(idx, "status", v)}
                options={["Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"]} />
              <Input label="Follow-up date" type="date" value={job.followUpDate ?? ""}
                onChange={(v) => updateJob(idx, "followUpDate", v)} />
              {form.jobs.length > 1 && (
                <button type="button"
                  onClick={() => setForm((p) => ({ ...p, jobs: p.jobs.filter((_, i) => i !== idx) }))}
                  className="sm:col-span-2 inline-flex items-center gap-1.5 self-end text-xs font-semibold text-gray-500 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 size={11} /> Remove this submission
                </button>
              )}
            </div>
          ))}
          <button type="button"
            onClick={() => setForm((p) => ({ ...p, jobs: [...p.jobs, blankJob()] }))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] cursor-pointer"
          >
            <Plus size={12} /> Add another submission
          </button>
        </div>
      </Section>

      <Section title="Resume / profile activities">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Resume version used" value={form.resumeVersion}
            onChange={(v) => setForm((p) => ({ ...p, resumeVersion: v }))} />
          <Input label="Profile updates" value={form.profileUpdates}
            onChange={(v) => setForm((p) => ({ ...p, profileUpdates: v }))} />
          <Input label="Portal profile updates" value={form.portalUpdates}
            onChange={(v) => setForm((p) => ({ ...p, portalUpdates: v }))} />
          <Input label="LinkedIn profile updates" value={form.linkedinUpdates}
            onChange={(v) => setForm((p) => ({ ...p, linkedinUpdates: v }))} />
        </div>
      </Section>

      <Section title="Interview training">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Mock interview date" type="date" value={form.mockDate}
            onChange={(v) => setForm((p) => ({ ...p, mockDate: v }))} />
          <Input label="Interview topic" value={form.interviewTopic}
            onChange={(v) => setForm((p) => ({ ...p, interviewTopic: v }))} />
          <Input label="Coach" value={form.coach}
            onChange={(v) => setForm((p) => ({ ...p, coach: v }))} />
          <Input label="Feedback received" value={form.feedback}
            onChange={(v) => setForm((p) => ({ ...p, feedback: v }))} />
          <Input label="Improvement items" value={form.improvements}
            onChange={(v) => setForm((p) => ({ ...p, improvements: v }))} />
          <Input label="Next practice date" type="date" value={form.nextPractice}
            onChange={(v) => setForm((p) => ({ ...p, nextPractice: v }))} />
        </div>
      </Section>

      <Section title="Communication / acknowledgment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Important messages acknowledged" value={form.messagesAck}
            onChange={(v) => setForm((p) => ({ ...p, messagesAck: v }))} />
          <Input label="Questions for ERM" value={form.questions}
            onChange={(v) => setForm((p) => ({ ...p, questions: v }))} />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.escalation}
            onChange={(e) => setForm((p) => ({ ...p, escalation: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6]"
          />
          <span className="text-gray-700">
            Escalate this week to my ERM — I need help with a blocker.
          </span>
        </label>
        {form.escalation && (
          <div className="mt-2">
            <Input label="Briefly describe the blocker"
              value={form.escalationDetail}
              onChange={(v) => setForm((p) => ({ ...p, escalationDetail: v }))} />
          </div>
        )}
      </Section>

      {error && (
        <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {feedback && (
        <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 size={14} /> {feedback}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={handleSaveDraft} disabled={saving || submitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-60 cursor-pointer transition"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={handleSubmit} disabled={submitting || saving}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer transition"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </div>

      {/* History */}
      {reports.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
            Submitted reports
          </p>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {reports.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
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
                }>
                  {r.status}
                </span>
                {r.submittedAt && (
                  <span className="text-xs text-gray-500">
                    Submitted {new Date(r.submittedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                )}
                {r.ermNotes && <span className="text-xs text-gray-500 truncate ml-auto">ERM: {r.ermNotes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function updateJob(idx: number, key: keyof WeeklyReportJobSubmission, value: string) {
    setForm((p) => {
      const jobs = [...p.jobs];
      jobs[idx] = { ...jobs[idx], [key]: value };
      return { ...p, jobs };
    });
  }
}

/* ── Documents tab ────────────────────────────────────────────── */

function DocumentsTab() {
  const [docs, setDocs] = useState<ParticipantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listParticipantDocuments()
      .then((d) => { if (!cancelled) setDocs(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Documents</h1>
      <p className="text-sm text-gray-500">
        Read-only view of your uploaded documents and their review status. Manage uploads from{" "}
        <Link href="/document-upload" className="text-[#0F766E] font-semibold hover:underline">Document Upload</Link>.
      </p>
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {docs.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400 italic">No documents on file.</p>
        ) : docs.map((d) => (
          <div key={d.id} className="px-4 py-3 flex items-center gap-3 text-sm">
            <FileText size={14} className="text-gray-400" />
            <span className="flex-1 font-medium text-gray-800">{d.documentType}</span>
            <span className="text-xs text-gray-500">{d.fileName}</span>
            <span className={
              "px-2 py-0.5 rounded-full text-[10px] font-bold "
              + (d.reviewStatus === "APPROVED"
                  ? "bg-emerald-50 text-emerald-700"
                  : d.reviewStatus === "REJECTED"
                    ? "bg-red-50 text-red-700"
                    : d.reviewStatus === "NOT_APPLICABLE"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-amber-50 text-amber-700")
            }>
              {d.reviewStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Agreement tab ────────────────────────────────────────────── */

function AgreementTab({ participantId }: { participantId: string | null }) {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Agreement</h1>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
        <div className="inline-flex items-center gap-2 text-emerald-800 text-sm font-semibold">
          <CheckCircle2 size={16} /> Agreement signed and on file
        </div>
        {participantId && (
          <p className="text-xs text-gray-600 mt-2">
            Filed under participant ID <span className="font-mono">{participantId}</span>.
          </p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          A signed PDF copy was emailed to you when you completed the agreement step.
          Contact your ERM if you need another copy.
        </p>
      </div>
    </div>
  );
}

/* ── Messages tab ─────────────────────────────────────────────── */

function MessagesTab({ data, team }: {
  data: DashboardData;
  team: ParticipantTeam | null;
}) {
  const items = data.recentActivity ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Messages &amp; notifications</h1>
      <p className="text-sm text-gray-500">
        System notifications, acknowledgments, and lifecycle events from your account.
        Direct messaging is handled by your ERM via email — see My Team for contact info.
      </p>

      {team?.erm?.email && (
        <div className="rounded-2xl border border-[#0F766E]/20 bg-[#f0fdf9] p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#0F766E]">Your ERM</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{team.erm.name ?? "—"}</p>
            <p className="text-xs text-gray-600 truncate">{team.erm.email}</p>
          </div>
          <a href={`mailto:${team.erm.email}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
            <Mail size={12} /> Email ERM
          </a>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400 italic">No notifications yet.</p>
        ) : items.map((m, idx) => (
          <div key={idx} className="px-4 py-3 flex items-start gap-3 text-sm">
            <Bell size={14} className="text-[#0F766E] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-800">{m.title}</p>
              <p className="text-[11px] text-gray-400">
                {m.category} · {new Date(m.createdAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Profile tab ──────────────────────────────────────────────── */

function ProfileTab() {
  const [profile, setProfile] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let cancelled = false;
    getParticipantProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setFullName(p.fullName ?? "");
        setPhone(p.phone ?? "");
        setLocation(p.location ?? "");
        setAvailability(p.availability ?? "");
        setBio(p.bio ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load profile");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(""); setFeedback("");
    try {
      const updated = await updateParticipantProfile({
        fullName: fullName.trim() || undefined,
        phone,
        location,
        availability,
        bio,
      });
      setProfile(updated);
      setFeedback("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Profile</h1>

      <Section title="Account">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <ReadOnlyRow label="Email" value={profile?.email} />
          <ReadOnlyRow label="Participant ID" value={profile?.participantId} mono />
          <ReadOnlyRow label="Enrolled"
            value={profile?.createdAt
              ? new Date(profile.createdAt).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata", dateStyle: "medium",
                })
              : null} />
          <ReadOnlyRow label="Status" value={profile?.currentStatus} mono />
          <ReadOnlyRow label="Selected technology" value={profile?.selectedTechnology} />
        </div>
      </Section>

      <Section title="Editable details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Full name" value={fullName} onChange={setFullName} />
          <Input label="Phone" value={phone} onChange={setPhone} />
          <Input label="Location" value={location} onChange={setLocation} />
          <Input label="Availability" value={availability} onChange={setAvailability} />
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>
        </div>
      </Section>

      {error && (
        <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {feedback && (
        <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 size={14} /> {feedback}
        </p>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value, mono }: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-gray-800" : "text-[13px] text-gray-800"}>
        {value ?? "—"}
      </span>
    </div>
  );
}

/* ── Placeholder cards ────────────────────────────────────────── */

function PlaceholderCard({ title, copy, hint, link }: {
  title: string;
  copy: string;
  hint?: string;
  link?: { label: string; href: string };
}) {
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{title}</h1>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-6">
        <p className="text-sm text-gray-700">{copy}</p>
        {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
        {link && (
          <Link href={link.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0F766E] hover:underline">
            {link.label} <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Inputs ───────────────────────────────────────────────────── */

/** YYYY-MM-DD + 1 day — used for the weekly report's due date hint. */
function addOneDay(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">
        {title}
      </p>
      <div className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<string>;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
