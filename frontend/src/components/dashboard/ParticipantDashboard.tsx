"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, Bell, Briefcase, CheckCircle2, ClipboardList,
  CreditCard, FileText, Loader2, Mail, Menu, MessageSquare, Plus, Save,
  Send, Settings, ShieldCheck, Sparkles, Target, Trash2, Upload as UploadIcon,
  Users, BookOpen, LayoutDashboard, X,
} from "lucide-react";

import LockedTabView from "./LockedTabView";
import ProfileCompletionBanner from "./ProfileCompletionBanner";
import ProfileCompletionChecklist from "./ProfileCompletionChecklist";

import { useAuth } from "@/lib/auth-context";
import {
  acceptEmployment, acceptPaymentPlan, acceptPhase1Completion,
  enroll as enrollInCourse,
  getCourses, getEmploymentStatus, getEnrollments, getParticipantDashboard,
  getParticipantPaymentPlan,
  getParticipantPaymentSummary, getParticipantProfile, getParticipantTeam,
  listParticipantCheckTracking, listParticipantDocuments,
  listParticipantInvoices, listParticipantPaymentHistory,
  listWeeklyReports, saveWeeklyReportDraft, submitCheckTracking,
  submitWeeklyReport, updateParticipantProfile, uploadOfferDocument,
  type CheckTrackingDTO, type EmploymentStatus, type InvoiceDTO,
  type ParticipantDashboard as DashboardData, type ParticipantPaymentPlanResponse,
  type ParticipantTeam, type ParticipantDocument, type PaymentLedgerDTO,
  type PaymentSummary,
  type UserDTO, type WeeklyReportDTO,
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
  | "home" | "complete-profile" | "courses" | "weekly"
  | "resume" | "interview" | "employment" | "payments" | "documents"
  | "agreement" | "team" | "messages" | "profile";

interface NavItem {
  id: TabId;
  label: string;
  Icon: typeof LayoutDashboard;
}

const NAV: ReadonlyArray<NavItem> = [
  { id: "home",              label: "Dashboard",        Icon: LayoutDashboard },
  { id: "complete-profile",  label: "Complete Profile", Icon: Sparkles },
  { id: "courses",           label: "My Courses",       Icon: BookOpen },
  { id: "weekly",            label: "Weekly Report",    Icon: ClipboardList },
  { id: "resume",     label: "Resume",         Icon: BookOpen },
  { id: "interview",  label: "Interviews",     Icon: Target },
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
  const searchParams = useSearchParams();
  // Sync the tab to the ?tab=... query param so the gate modal /
  // banner / "Continue Setup" links can deep-link into the right
  // section. Defaults to "home" otherwise.
  const initialTab = (searchParams.get("tab") as TabId) || "home";
  const [active, setActive] = useState<TabId>(initialTab);
  const [data, setData] = useState<DashboardData | null>(null);
  const [team, setTeam] = useState<ParticipantTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the active tab changes — desktop
  // sidebar stays put because it isn't backed by this state.
  useEffect(() => { setDrawerOpen(false); }, [active]);

  // Re-sync if the query param changes while the page is mounted
  // (e.g. the gate modal pushes /dashboard?tab=complete-profile
  // while the user is still on /dashboard).
  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (t) setActive(t);
  }, [searchParams]);

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
          // Phase 1C — surface the completion percentage as a badge
          // beside the "Complete Profile" tab. Hidden once the user
          // is fully done.
          const showBadge = n.id === "complete-profile"
            && !user?.profileComplete
            && typeof user?.profileCompletionPct === "number";
          return (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={
                "w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer "
                + (isActive
                    ? "bg-[#0F766E] text-white shadow-sm"
                    : showBadge
                      ? "text-amber-800 bg-amber-50 hover:bg-amber-100"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
              }
            >
              <n.Icon size={14} />
              <span className="truncate flex-1 text-left">{n.label}</span>
              {showBadge && (
                <span className={
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full "
                  + (isActive ? "bg-white text-[#0F766E]" : "bg-amber-200 text-amber-900")
                }>
                  {user?.profileCompletionPct ?? 0}%
                </span>
              )}
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
        <ProfileCompletionBanner
          onContinueSetup={() => setActive("complete-profile")}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {active === "home" && (
            <HomeTab data={data} team={team} userEmail={user?.email ?? null}
              onJumpTo={(t) => setActive(t)} />
          )}
          {active === "complete-profile" && <ProfileCompletionChecklist />}
          {active === "courses" && (
            <MyCoursesTab
              profileComplete={Boolean(user?.profileComplete)}
              onContinueSetup={() => setActive("complete-profile")}
            />
          )}
          {active === "weekly" && (
            user?.profileComplete
              ? <WeeklyTab dashboardData={data} />
              : <LockedTabView
                  title="Weekly Report"
                  subtitle="Log your job applications, resume updates, and interview prep each week."
                  headline="Weekly reports unlock after profile completion"
                  body={
                    <>
                      Phase 1 weekly check-ins start once your profile is
                      complete and your team is assigned.
                    </>
                  }
                  onContinueSetup={() => setActive("complete-profile")}
                />
          )}
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
          {active === "employment" && <EmploymentTab />}
          {active === "payments" && <PaymentsTab />}
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

function TeamTab({ team }: { team: ParticipantTeam | null; data: DashboardData }) {
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
      </div>
    </div>
  );
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

/* ── My Courses tab (LMS bridge) ─────────────────────────────── */

interface EnrollmentRow {
  id?: number | string;
  courseId?: number;
  courseTitle?: string;
  title?: string;
  thumbnailUrl?: string | null;
  progress?: number;
  progressPercent?: number;
  enrolledAt?: string | null;
  completed?: boolean;
}

interface CourseRow {
  id: number;
  title?: string;
  shortDescription?: string | null;
  thumbnailUrl?: string | null;
  level?: string | null;
  category?: string | null;
  price?: number | null;
  isFree?: boolean;
  enrolledCount?: number;
  rating?: number;
}

interface MyCoursesTabProps {
  profileComplete: boolean;
  onContinueSetup: () => void;
}

function MyCoursesTab({ profileComplete, onContinueSetup }: MyCoursesTabProps) {
  const [mode, setMode] = useState<"enrolled" | "browse">("enrolled");
  const [enrolledRows, setEnrolledRows] = useState<EnrollmentRow[]>([]);
  const [enrolledLoading, setEnrolledLoading] = useState(true);
  // Note: the backend's legacy AGREEMENT_REQUIRED gate also blocks
  // /api/enrollments for a small number of grandfathered users. We
  // translate that error code to a friendly message — never let the
  // raw "AGREEMENT_REQUIRED" string land in the UI.
  const [error, setError] = useState("");

  const refreshEnrolled = async () => {
    setEnrolledLoading(true);
    try {
      const r = await getEnrollments();
      setEnrolledRows((r ?? []) as EnrollmentRow[]);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      if (raw === "AGREEMENT_REQUIRED" || raw === "PROFILE_INCOMPLETE") {
        // These are gating signals, not real errors — the locked
        // view above handles the messaging. Swallow here so we
        // don't render a red banner on top of the locked card.
        setError("");
      } else {
        setError("We couldn't load your courses. Please try again in a moment.");
      }
    } finally {
      setEnrolledLoading(false);
    }
  };

  useEffect(() => {
    // Don't even attempt the fetch for incomplete-profile users —
    // the backend would return 403 AGREEMENT_REQUIRED and pollute
    // the error state. The locked view below is what they should see.
    if (!profileComplete) {
      setEnrolledLoading(false);
      return;
    }
    refreshEnrolled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileComplete]);

  if (!profileComplete) {
    return (
      <LockedTabView
        title="My Courses"
        subtitle="Track your enrolled courses and learning progress."
        headline="Complete your profile to unlock courses"
        body={
          <>
            Finish your profile setup to unlock course enrollment and
            access the learning catalog.
          </>
        }
        onContinueSetup={onContinueSetup}
      />
    );
  }

  if (mode === "browse") {
    return <BrowseCoursesView
      enrolledIds={new Set(enrolledRows
        .map((r) => r.courseId ?? (typeof r.id === "number" ? r.id : undefined))
        .filter((id): id is number => typeof id === "number"))}
      onBack={() => setMode("enrolled")}
      onEnrolled={refreshEnrolled}
    />;
  }

  if (enrolledLoading) {
    return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">My courses</h1>
      <p className="text-sm text-gray-500">
        Self-paced technical development modules. These complement your
        Phase-1 weekly coaching plan.
      </p>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}

      {enrolledRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
          <BookOpen size={28} className="text-gray-400 inline-block mb-2" />
          <p className="text-sm text-gray-600">You haven&apos;t enrolled in any courses yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            Browse our catalog to get started.
          </p>
          <button type="button" onClick={() => setMode("browse")}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
            Browse Courses →
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrolledRows.map((r) => {
              const cid = r.courseId ?? (typeof r.id === "number" ? r.id : 0);
              const pct = typeof r.progressPercent === "number"
                ? r.progressPercent
                : typeof r.progress === "number" ? r.progress : 0;
              return (
                <div key={String(r.id ?? cid)}
                  className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 hover:shadow-md transition">
                  <div className="aspect-video rounded-lg bg-gray-100 mb-3 overflow-hidden flex items-center justify-center">
                    {r.thumbnailUrl
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={r.thumbnailUrl} alt={r.courseTitle ?? r.title ?? ""}
                          className="w-full h-full object-cover" />
                      : <BookOpen size={24} className="text-gray-400" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">
                    {r.courseTitle ?? r.title ?? "Untitled course"}
                  </p>
                  <div className="mt-auto">
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[#0F766E]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1 mb-2">
                      {pct}% complete{r.completed ? " · ✅" : ""}
                    </p>
                    <Link href={`/courses/${cid}`} target="_blank" rel="noopener"
                      className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
                      {pct > 0 ? "Continue Learning" : "Start Course"} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-2">
            <button type="button" onClick={() => setMode("browse")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white border border-gray-200 text-[#0F766E] hover:border-[#0F766E] cursor-pointer">
              Browse More Courses →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BrowseCoursesView({ enrolledIds, onBack, onEnrolled }: {
  enrolledIds: Set<number>;
  onBack: () => void;
  onEnrolled: () => Promise<void>;
}) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [enrolling, setEnrolling] = useState<number | null>(null);

  const load = async (q?: string) => {
    setLoading(true); setError("");
    try {
      const r = await getCourses(q ? { search: q } : undefined);
      setCourses((r ?? []) as CourseRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEnroll = async (id: number) => {
    setEnrolling(id); setError("");
    try {
      await enrollInCourse(id);
      await onEnrolled();
      // Stay in browse mode so user can keep enrolling; the button
      // for this course flips to "Enrolled ✓".
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enroll");
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Browse courses</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Enroll in self-paced modules without leaving your dashboard.
          </p>
        </div>
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:border-[#0F766E] hover:text-[#0F766E] cursor-pointer">
          ← Back to My Courses
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input type="search" placeholder="Search courses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(search.trim() || undefined); }}
          className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]" />
        <button type="button" onClick={() => load(search.trim() || undefined)}
          className="px-3 py-2 rounded-lg text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer">
          Search
        </button>
      </div>

      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}

      {loading ? (
        <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
          <p className="text-sm text-gray-600">No courses match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((c) => {
            const enrolled = enrolledIds.has(c.id);
            return (
              <div key={c.id}
                className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 hover:shadow-md transition">
                <div className="aspect-video rounded-lg bg-gray-100 mb-3 overflow-hidden flex items-center justify-center">
                  {c.thumbnailUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={c.thumbnailUrl} alt={c.title ?? ""}
                        className="w-full h-full object-cover" />
                    : <BookOpen size={24} className="text-gray-400" />}
                </div>
                <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                  {c.title ?? "Untitled course"}
                </p>
                {c.shortDescription && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.shortDescription}</p>
                )}
                <div className="mt-auto pt-3 flex items-center gap-2">
                  {c.level && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                      {c.level}
                    </span>
                  )}
                  {c.isFree
                    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">Free</span>
                    : c.price != null && (
                      <span className="text-xs font-semibold text-gray-700">
                        ₹{Number(c.price).toLocaleString()}
                      </span>
                    )}
                </div>
                <div className="mt-2">
                  {enrolled ? (
                    <button type="button" disabled
                      className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 cursor-default">
                      <CheckCircle2 size={12} /> Enrolled
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleEnroll(c.id)}
                      disabled={enrolling === c.id}
                      className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
                      {enrolling === c.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      {enrolling === c.id ? "Enrolling…" : "Enroll →"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

/* ── Payments tab (Phase 7) ───────────────────────────────────── */

const PAYMENT_PLAN_ACK_VERSION = "PPL-v1.0";

function PaymentsTab() {
  const [planRes, setPlanRes] = useState<ParticipantPaymentPlanResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({});
  const [history, setHistory] = useState<PaymentLedgerDTO[]>([]);
  const [trackings, setTrackings] = useState<CheckTrackingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [p, inv, s, h, t] = await Promise.all([
      getParticipantPaymentPlan(),
      listParticipantInvoices(),
      getParticipantPaymentSummary(),
      listParticipantPaymentHistory(),
      listParticipantCheckTracking(),
    ]);
    setPlanRes(p); setInvoices(inv); setSummary(s); setHistory(h); setTrackings(t);
  };

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load payments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Payments &amp; invoices</h1>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}

      <PaymentPlanSection res={planRes} onAccepted={refresh} />
      {planRes?.plan?.acceptedAt && (
        <>
          <CheckTrackingSection trackings={trackings} onAdded={refresh} />
          <InvoicesSection invoices={invoices} />
          <PaymentSummarySection summary={summary} history={history} />
        </>
      )}
    </div>
  );
}

function PaymentPlanSection({ res, onAccepted }: {
  res: ParticipantPaymentPlanResponse | null;
  onAccepted: () => Promise<void>;
}) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const plan = res?.plan;

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-5">
        <p className="text-sm text-gray-700">
          No payment plan on file yet. Once finance creates your plan it
          will appear here for you to review and accept.
        </p>
      </div>
    );
  }

  const handleAccept = async () => {
    if (!accepted) return;
    setSaving(true); setError("");
    try {
      await acceptPaymentPlan(plan.id, PAYMENT_PLAN_ACK_VERSION);
      await onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't accept plan");
    } finally {
      setSaving(false);
    }
  };

  const alreadyAccepted = !!plan.acceptedAt;
  const schedule = res?.schedule ?? [];

  return (
    <div className={
      "rounded-2xl border p-5 space-y-3 "
      + (alreadyAccepted ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200 bg-white shadow-sm")
    }>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold text-gray-900">Payment plan</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-mono">{plan.planId}</span>
            {" · "}Total {formatMoney(plan.totalAmount)}
            {" · "}{plan.installments ?? schedule.length} installments
          </p>
        </div>
        {alreadyAccepted && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={12} /> Accepted{plan.acceptedAt && (
              " on " + new Date(plan.acceptedAt).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata", dateStyle: "medium",
              })
            )}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 w-12">#</th>
              <th className="text-left px-3 py-2">Due date</th>
              <th className="text-left px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedule.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-400 italic">
                Schedule pending.
              </td></tr>
            ) : schedule.map((s, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{s.dueDate ?? "—"}</td>
                <td className="px-3 py-2 text-gray-700">{formatMoney(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!alreadyAccepted && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 leading-relaxed">
            <p className="font-bold text-gray-900">PAYMENT PLAN ACCEPTANCE</p>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
              Version: {PAYMENT_PLAN_ACK_VERSION}
            </p>
            <p className="mt-1.5">By accepting this payment plan, I confirm:</p>
            <ol className="list-decimal pl-5 space-y-1 text-[13px] mt-1">
              <li>I have reviewed the payment schedule above.</li>
              <li>I agree to the installment amounts and due dates as listed.</li>
              <li>I understand that late payments may incur additional follow-up
                as per my agreement.</li>
              <li>I will provide check copies and tracking information through
                the secure portal.</li>
            </ol>
          </div>
          <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6]" />
            <span>
              I accept the payment plan ({PAYMENT_PLAN_ACK_VERSION}){" "}
              <span className="text-red-500">*</span>
            </span>
          </label>
          {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle size={14} /> {error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={handleAccept} disabled={!accepted || saving}
              className={
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition "
                + (accepted && !saving
                    ? "bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed")
              }>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? "Accepting…" : "Accept Payment Plan →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CheckTrackingSection({ trackings, onAdded }: {
  trackings: CheckTrackingDTO[];
  onAdded: () => Promise<void>;
}) {
  const [checkNumber, setCheckNumber] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [trackingId, setTrackingId] = useState("");
  const [mailedDate, setMailedDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = checkNumber.trim() && trackingId.trim() && mailedDate && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true); setError("");
    try {
      await submitCheckTracking({
        checkNumber: checkNumber.trim(),
        carrier,
        trackingId: trackingId.trim(),
        mailedDate,
        expectedReceiptDate: expectedDate || null,
      });
      await onAdded();
      setCheckNumber(""); setTrackingId(""); setMailedDate(""); setExpectedDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit tracking");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-3">
      <h2 className="font-serif text-xl font-bold text-gray-900">Physical check tracking</h2>
      <p className="text-sm text-gray-500">
        If paying by physical check, provide tracking details so finance
        can reconcile receipt.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Check number *" value={checkNumber} onChange={setCheckNumber} />
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Carrier *</label>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 bg-white">
            {["USPS", "FedEx", "UPS", "DHL", "Other"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input label="Tracking ID *" value={trackingId} onChange={setTrackingId} />
        <Input label="Mailed date *" type="date" value={mailedDate} onChange={setMailedDate} />
        <Input label="Expected receipt" type="date" value={expectedDate} onChange={setExpectedDate} />
      </div>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={handleSubmit} disabled={!canSubmit}
          className={
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition "
            + (canSubmit
                ? "bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
                : "bg-gray-200 text-gray-500 cursor-not-allowed")
          }>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {saving ? "Submitting…" : "Submit tracking info →"}
        </button>
      </div>

      {trackings.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Check #</th>
                <th className="text-left px-3 py-2">Carrier</th>
                <th className="text-left px-3 py-2">Tracking ID</th>
                <th className="text-left px-3 py-2">Mailed</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {trackings.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{t.checkNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{t.carrier ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{t.trackingId ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{t.mailedDate ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={
                      "px-2 py-0.5 rounded-full text-[10px] font-bold "
                      + (t.status === "RECEIVED"
                          ? "bg-emerald-50 text-emerald-700"
                          : t.status === "EXCEPTION" || t.status === "LOST"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700")
                    }>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvoicesSection({ invoices }: { invoices: InvoiceDTO[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-3">
      <h2 className="font-serif text-xl font-bold text-gray-900">Invoices</h2>
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Invoice #</th>
              <th className="text-left px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Due</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400 italic">
                No invoices yet.
              </td></tr>
            ) : invoices.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{i.invoiceNumber}</td>
                <td className="px-3 py-2 text-gray-700">{formatMoney(i.amount)}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{i.dueDate ?? "—"}</td>
                <td className="px-3 py-2">
                  <InvoiceStatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const cls = status === "PAID"
    ? "bg-emerald-50 text-emerald-700"
    : status === "OVERDUE"
      ? "bg-red-50 text-red-700"
      : status === "PARTIAL"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";
  return <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold " + cls}>{status}</span>;
}

function PaymentSummarySection({ summary, history }: {
  summary: PaymentSummary;
  history: PaymentLedgerDTO[];
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-4">
      <h2 className="font-serif text-xl font-bold text-gray-900">Payment summary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <SmallStat label="Total due" value={formatMoney(summary.totalDue)} />
        <SmallStat label="Total paid" value={formatMoney(summary.totalPaid)} accent="emerald" />
        <SmallStat label="Balance" value={formatMoney(summary.balance)} />
        <SmallStat label="Overdue" value={formatMoney(summary.overdue)} accent="red" />
        <SmallStat label="Next due"
          value={summary.nextDueAmount
            ? formatMoney(summary.nextDueAmount) + " · " + (summary.nextDueDate ?? "")
            : "—"} />
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">
          Payment history
        </p>
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-gray-400 italic">
                  No payments recorded yet.
                </td></tr>
              ) : history.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{h.receiptDate ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{formatMoney(h.amountReceived)}</td>
                  <td className="px-3 py-2 text-gray-700">{h.method ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">#{h.invoiceId ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{formatMoney(h.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SmallStat({ label, value, accent }: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const accentCls = accent === "emerald" ? "text-emerald-700"
    : accent === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className={"mt-0.5 text-sm font-bold " + accentCls}>{value}</p>
    </div>
  );
}

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* ── Employment + Phase 1 tab (Phase 6) ───────────────────────── */

const PHASE_1_ACK_VERSION = "PH1-v1.0";

function EmploymentTab() {
  const [status, setStatus] = useState<EmploymentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setStatus(await getEmploymentStatus());
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const s = await getEmploymentStatus();
        if (!cancelled) setStatus(s);
      } catch { /* swallow */ }
    };
    tick().finally(() => { if (!cancelled) setLoading(false); });
    // Light polling while we're waiting for ERM verification so the
    // dashboard flips to "verified" without a manual reload.
    timer = setInterval(tick, 15_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, []);

  if (loading) return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Employment acceptance</h1>

      {!status?.submitted ? (
        <EmploymentForm onSaved={refresh} />
      ) : (
        <EmploymentSummary status={status!} />
      )}

      {status?.submitted && (
        status.ermVerified
          ? <Phase1Section status={status} onSaved={refresh} />
          : <PendingErmCallout ermName={status.ermName ?? null} />
      )}
    </div>
  );
}

function EmploymentForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [employer, setEmployer] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("Full-time");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = employer.trim() && jobTitle.trim() && startDate && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true); setError("");
    try {
      let offerUrl: string | null = null;
      if (file) {
        const up = await uploadOfferDocument(file);
        offerUrl = up.url;
      }
      await acceptEmployment({
        employer: employer.trim(),
        jobTitle: jobTitle.trim(),
        startDate,
        location: location.trim() || null,
        employmentType: employmentType || null,
        offerDocumentUrl: offerUrl,
        notes: notes.trim() || null,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit employment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-3">
      <p className="text-sm text-gray-500">
        Congratulations on your offer! Provide the following details so
        your ERM can verify and unlock Phase 1 completion.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Employer / Client *" value={employer} onChange={setEmployer} />
        <Input label="Job title *" value={jobTitle} onChange={setJobTitle} />
        <Input label="Start date *" type="date" value={startDate} onChange={setStartDate} />
        <Input label="Location" value={location} onChange={setLocation} />
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Employment type</label>
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 bg-white">
            {["Full-time", "Part-time", "Contract", "Internship", "Other"].map((t) =>
              <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Offer document (PDF / JPG / PNG)</label>
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#0F766E] file:text-white hover:file:bg-[#0D9488] cursor-pointer" />
          <p className="text-[10px] text-gray-400 mt-0.5">Max 5 MB.</p>
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Additional notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]" />
      </div>
      {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle size={14} /> {error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={handleSubmit} disabled={!canSubmit}
          className={
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition "
            + (canSubmit
                ? "bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
                : "bg-gray-200 text-gray-500 cursor-not-allowed")
          }>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <UploadIcon size={14} />}
          {saving ? "Submitting…" : "Submit employment acceptance →"}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">After submission, your ERM will review and verify.</p>
    </div>
  );
}

function EmploymentSummary({ status }: { status: EmploymentStatus }) {
  const d = status.details;
  const verified = status.ermVerified;
  return (
    <div className={
      "rounded-2xl border p-5 "
      + (verified ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30")
    }>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={16} className={verified ? "text-emerald-600" : "text-amber-600"} />
        <p className="text-sm font-bold text-gray-900">
          {verified ? "Employment verified by ERM" : "Employment acceptance submitted"}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
        <SumRow label="Employer" value={d?.employerClient} />
        <SumRow label="Job title" value={d?.jobTitle} />
        <SumRow label="Start date" value={d?.startDate} mono />
        <SumRow label="Location" value={d?.location} />
        <SumRow label="Employment type" value={d?.employmentType} />
        <SumRow label="Submitted"
          value={d?.acceptanceDate ? new Date(d.acceptanceDate).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
          }) : null} />
      </div>
      {d?.notes && <p className="mt-3 text-xs text-gray-600 italic">&ldquo;{d.notes}&rdquo;</p>}
      {d?.offerDocumentUrl && (
        <a href={d.offerDocumentUrl} target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline">
          <FileText size={11} /> View uploaded offer document
        </a>
      )}
      {verified && d?.ermVerifiedDate && (
        <p className="mt-3 text-xs text-emerald-700">
          Verified by {status.ermName ?? "your ERM"} on{" "}
          {new Date(d.ermVerifiedDate).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata", dateStyle: "medium",
          })}.
          {d.ermNotes && <span className="block text-gray-600 italic mt-1">ERM note: {d.ermNotes}</span>}
        </p>
      )}
    </div>
  );
}

function SumRow({ label, value, mono }: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className={mono ? "font-mono text-[13px] text-gray-800" : "text-[13px] text-gray-800"}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function PendingErmCallout({ ermName }: { ermName: string | null }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-5">
      <p className="text-sm text-amber-900 inline-flex items-center gap-1.5">
        <Loader2 size={14} className="animate-spin" />
        Pending ERM verification
      </p>
      <p className="text-xs text-gray-600 mt-1.5">
        Your ERM{ermName ? ` (${ermName})` : ""} will review and verify
        your employment shortly. This page refreshes automatically.
        Once verified, the Phase 1 acknowledgment unlocks below.
      </p>
    </div>
  );
}

function Phase1Section({ status, onSaved }: {
  status: EmploymentStatus;
  onSaved: () => Promise<void>;
}) {
  const alreadyAccepted = !!status.phase1?.acceptedAt;
  const [accepted, setAccepted] = useState(alreadyAccepted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAccept = async () => {
    if (!accepted || alreadyAccepted) return;
    setSaving(true); setError("");
    try {
      await acceptPhase1Completion(PHASE_1_ACK_VERSION);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept Phase 1");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#0F766E]/20 bg-[#f0fdf9] p-5 space-y-3">
      <h2 className="font-serif text-xl font-bold text-gray-900">
        Phase 1 completion acknowledgment
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 leading-relaxed space-y-2">
        <p className="font-bold text-gray-900">PHASE 1 COMPLETION ACKNOWLEDGMENT</p>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          Version: {PHASE_1_ACK_VERSION}
        </p>
        <p>By accepting this acknowledgment, I confirm:</p>
        <ol className="list-decimal pl-5 space-y-1 text-[13px]">
          <li>I have completed the Phase 1 pre-employment readiness program
            activities including career coaching, resume administration,
            interview preparation, technical modules, and job-navigation support.</li>
          <li>I have accepted employment and provided the required acceptance details.</li>
          <li>I understand that Phase 1 completion activates the payment plan
            and invoice schedule as per my signed agreement.</li>
          <li>I acknowledge that Phase 2 post-offer support will be provided
            as per the terms of my agreement.</li>
        </ol>
      </div>

      {alreadyAccepted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 inline-flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-700" />
          <span>
            Phase 1 acknowledgment accepted on{" "}
            {status.phase1?.acceptedAt
              ? new Date(status.phase1.acceptedAt).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata", dateStyle: "medium",
                })
              : "—"} ·{" "}
            <span className="font-mono text-xs">{status.phase1?.acknowledgmentVersion}</span>
          </span>
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6]" />
            <span>
              I accept the Phase 1 Completion Acknowledgment ({PHASE_1_ACK_VERSION}){" "}
              <span className="text-red-500">*</span>
            </span>
          </label>
          {error && <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle size={14} /> {error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={handleAccept} disabled={!accepted || saving}
              className={
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition "
                + (accepted && !saving
                    ? "bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed")
              }>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? "Accepting…" : "Accept Phase 1 completion →"}
            </button>
          </div>
        </>
      )}
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
