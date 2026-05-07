"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Trophy, Award, ExternalLink, ArrowRight, BookOpen, Flame, Play,
  Calendar, CreditCard, CheckCircle2, Activity, Compass, Sparkles,
} from "lucide-react";
import { getProfile, type DashboardSummary, type NextAction, type ProfileData } from "@/lib/api";
import type { UserDTO } from "@/lib/api";

interface Props {
  user: UserDTO;
  summary: DashboardSummary | null;
  nextAction: NextAction | null;
  loading: boolean;
}

function greetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good evening"; // 9pm-5am
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.split(" ")[0];
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Maps a recent-activity row to an icon + color tile. Strings come
// from DashboardSummaryService — keep in sync with what it emits.
function activityVisual(type: string): {
  Icon: typeof BookOpen;
  bg: string;
  fg: string;
} {
  const t = type.toUpperCase();
  if (t.includes("LESSON") || t.includes("COURSE_PROGRESS")) {
    return { Icon: BookOpen, bg: "bg-teal-50", fg: "text-[#0D9488]" };
  }
  if (t.includes("SESSION")) {
    return { Icon: Calendar, bg: "bg-amber-50", fg: "text-amber-600" };
  }
  if (t.includes("CERT")) {
    return { Icon: Award, bg: "bg-[#f0fdf9]", fg: "text-[#0F766E]" };
  }
  if (t.includes("QUIZ_PASSED")) {
    return { Icon: Trophy, bg: "bg-[#f0fdf9]", fg: "text-[#0F766E]" };
  }
  if (t.includes("COMPLETED")) {
    return { Icon: CheckCircle2, bg: "bg-[#f0fdf9]", fg: "text-[#0F766E]" };
  }
  if (t.includes("PAYMENT")) {
    return { Icon: CreditCard, bg: "bg-blue-50", fg: "text-blue-600" };
  }
  return { Icon: Activity, bg: "bg-gray-50", fg: "text-gray-500" };
}

export function StudentDashboard({ user, summary, nextAction, loading }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Profile gives certificate count + lastActiveAt without bloating
  // DashboardSummary. Failures are silent — degrade to approximations.
  useEffect(() => {
    getProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  const enrolledCourses = summary?.enrolledCourses ?? [];
  const upcomingSessions = summary?.upcomingSessions ?? [];
  const recentActivity = summary?.recentActivity ?? [];
  const streakDays = summary?.streakDays ?? 0;

  // Days active fallback chain:
  //   1. profile.streakDays from server (if profile loaded)
  //   2. summary.streakDays
  //   3. days since user.createdAt
  const daysActive = useMemo(() => {
    if (profile?.streakDays && profile.streakDays > 0) return profile.streakDays;
    if (streakDays > 0) return streakDays;
    if (user.createdAt) {
      const d = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000);
      return Math.max(1, d);
    }
    return 0;
  }, [profile, streakDays, user.createdAt]);

  const certificatesCount = profile?.certificatesCount
    ?? enrolledCourses.filter((c) => c.progressPercent >= 100).length;

  // ── Next action — pick the CTA + copy. ──────────────────────────

  const heroLabel = (() => {
    switch (nextAction?.type) {
      case "SESSION_SOON":   return "YOU HAVE A SESSION COMING UP";
      case "CONTINUE_COURSE": return "PICK UP WHERE YOU LEFT OFF";
      case "START_COURSE":    return "READY TO BEGIN?";
      case "ASSIGNMENT_DUE":  return "ASSIGNMENT DUE";
      case "ALL_COMPLETE":    return "INCREDIBLE WORK";
      case "BROWSE_COURSES":
      default:                return "WELCOME TO SPIRE INFO TECH";
    }
  })();

  const heroTitle = (() => {
    if (!nextAction) return "Find your first course";
    switch (nextAction.type) {
      case "SESSION_SOON":
        return `Session with ${nextAction.mentorName ?? "your mentor"}`;
      case "CONTINUE_COURSE":
        return nextAction.nextLessonTitle ?? "Continue your course";
      case "START_COURSE":
        return `${nextAction.courseTitle ?? "Your course"} — Start with Lesson 1`;
      case "ASSIGNMENT_DUE":
        return nextAction.assignmentTitle ?? "Submit your assignment";
      case "ALL_COMPLETE":
        return "All courses completed!";
      default:
        return "Find your first course";
    }
  })();

  const heroContext = (() => {
    if (!nextAction) return "Browse courses with personal mentorship";
    switch (nextAction.type) {
      case "SESSION_SOON": {
        const when = nextAction.scheduledAt
          ? formatSessionDate(nextAction.scheduledAt) : "";
        return `${nextAction.courseTitle ?? ""}${when ? " · " + when : ""}`;
      }
      case "CONTINUE_COURSE":
        return [
          nextAction.courseTitle,
          nextAction.moduleTitle,
          nextAction.progressPercent != null ? `${nextAction.progressPercent}% complete` : null,
        ].filter(Boolean).join(" · ");
      case "START_COURSE":
        return nextAction.mentorName ? `Your mentor: ${nextAction.mentorName}` : "";
      case "ASSIGNMENT_DUE":
        return nextAction.dueDate
          ? `Due ${new Date(nextAction.dueDate).toLocaleDateString()}` : "";
      case "ALL_COMPLETE":
        return `${nextAction.completedCount ?? 0} courses done · ${nextAction.certificateCount ?? 0} certificates earned`;
      default:
        return "Browse courses with personal mentorship";
    }
  })();

  const heroProgressPercent = nextAction?.type === "CONTINUE_COURSE"
    ? (nextAction.progressPercent ?? 0)
    : null;

  const heroOnClick = () => {
    if (!nextAction) { router.push("/courses"); return; }
    switch (nextAction.type) {
      case "SESSION_SOON":
        if (nextAction.meetingUrl) window.open(nextAction.meetingUrl, "_blank", "noopener,noreferrer");
        break;
      case "CONTINUE_COURSE":
        if (nextAction.courseId && nextAction.nextLessonId) {
          router.push(`/learn/${nextAction.courseId}/${nextAction.nextLessonId}`);
        }
        break;
      case "START_COURSE":
        if (nextAction.courseId && nextAction.firstLessonId) {
          router.push(`/learn/${nextAction.courseId}/${nextAction.firstLessonId}`);
        } else if (nextAction.courseId) {
          router.push(`/courses/${nextAction.courseId}`);
        }
        break;
      case "ASSIGNMENT_DUE":
        if (nextAction.courseId) router.push(`/courses/${nextAction.courseId}`);
        break;
      case "ALL_COMPLETE":
      case "BROWSE_COURSES":
      default:
        router.push("/courses");
    }
  };

  const heroButtonLabel = (() => {
    switch (nextAction?.type) {
      case "SESSION_SOON":   return "Join meeting";
      case "CONTINUE_COURSE": return "Resume lesson";
      case "START_COURSE":    return "Start course";
      case "ASSIGNMENT_DUE":  return "Open assignment";
      case "ALL_COMPLETE":    return "Browse more courses";
      default:                return "Browse courses";
    }
  })();

  // ── Recent achievement (Widget B). ──────────────────────────────

  const recentAchievement = useMemo(() => {
    const cert = recentActivity.find((a) => a.type?.toUpperCase().includes("CERT"));
    if (cert) return { headline: "Certificate earned", sub: cert.description, type: "cert" as const };
    const completed = enrolledCourses
      .filter((c) => c.progressPercent >= 100)
      .sort((a, b) => {
        const at = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
        const bt = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
        return bt - at;
      })[0];
    if (completed) {
      return { headline: "Course completed", sub: completed.title, type: "course" as const, courseId: completed.id };
    }
    const passed = recentActivity.find((a) => a.type?.toUpperCase().includes("QUIZ_PASSED"));
    if (passed) return { headline: "Quiz passed", sub: passed.description, type: "quiz" as const };
    return null;
  }, [recentActivity, enrolledCourses]);

  const upcomingSession = upcomingSessions[0];

  if (loading && !summary) {
    return (
      <PageShell>
        <div className="h-32 bg-gray-100 rounded-2xl animate-pulse mb-4" />
        <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Section 1: Greeting + stat badges ─────────────────────── */}
      {/* Name uses text-3xl on mobile (375px doesn't have the room
          for 36px without overflow next to the badges) and steps up
          to text-4xl on sm+. Stays the most prominent text on the
          page either way. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-3 mb-3"
      >
        <div>
          <p className="text-base text-gray-500 font-normal leading-none">
            {greetingByHour(new Date().getHours())},
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-1.5 leading-none">
            {firstName(user.fullName)}
          </h1>
        </div>
        {/* One badge on tiny phones; certs from sm+; days from md+. */}
        <div className="flex items-center gap-2">
          <StatBadge icon={BookOpen} value={enrolledCourses.length} label="courses" />
          <StatBadge icon={Award} value={certificatesCount} label="certificates" className="hidden sm:flex" />
          <StatBadge
            icon={Flame}
            value={daysActive}
            label={daysActive === 1 ? "day active" : "days active"}
            className="hidden md:flex"
          />
        </div>
      </motion.div>

      {/* ── Section 2: Hero next-action card ──────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl py-5 px-6"
        style={{
          background: "linear-gradient(135deg, #0F766E 0%, #134E4A 100%)",
          boxShadow: "0 8px 30px rgba(15,118,110,0.25)",
        }}
      >
        {/* Decorative concentric rings, top-right. */}
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: -50,
            right: -30,
            width: 160,
            height: 160,
            background: "rgba(255,255,255,0.1)",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: 20,
            right: 50,
            width: 90,
            height: 90,
            background: "rgba(255,255,255,0.07)",
          }}
        />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[2px] text-white/50 font-semibold">
            {heroLabel}
          </p>
          <p className="text-xl font-bold text-white mt-2 line-clamp-2">
            {heroTitle}
          </p>
          {heroContext && (
            <p className="text-sm text-white/60 mt-1 line-clamp-1">
              {heroContext}
            </p>
          )}

          {/* Button + progress bar share one row to save vertical space. */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={heroOnClick}
              className="inline-flex items-center gap-2 bg-white text-[#0F766E] text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shrink-0"
            >
              <HeroButtonIcon nextActionType={nextAction?.type} />
              {heroButtonLabel}
            </button>
            {heroProgressPercent != null && (
              <>
                <div className="flex-1 h-[6px] rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, heroProgressPercent))}%` }}
                  />
                </div>
                <span className="text-base font-bold text-white/80 tabular-nums shrink-0">
                  {heroProgressPercent}%
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Section 3: My courses ─────────────────────────────────── */}
      {/* Layout: 1-2 courses → single column (full width per card);
          3+ courses → 2-column grid on lg+. Avoids stretched single
          rows for power users while keeping focus when there are few. */}
      {enrolledCourses.length > 0 && (
        <div className="mt-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <BookOpen size={18} className="text-[#0F766E]" />
            My courses
          </h2>
          <div className={enrolledCourses.length >= 3
            ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
            : "space-y-3"
          }>
            {enrolledCourses.map((course, idx) => {
              const completed = course.progressPercent >= 100;
              const href = course.type === "SERVICE"
                ? `/services/${course.id}`
                : `/courses/${course.id}`;
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * idx }}
                >
                  <Link
                    href={href}
                    className="flex items-center gap-3.5 bg-white rounded-2xl border border-gray-100 py-3.5 px-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0F766E] to-[#0D9488] shadow-md flex items-center justify-center text-white font-bold text-lg shrink-0">
                      {course.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-bold text-gray-900 truncate">
                          {course.title}
                        </p>
                        {completed ? (
                          <span className="text-xs font-semibold text-[#0D9488] bg-[#f0fdf9] px-2.5 py-1 rounded-full shrink-0">
                            Complete
                          </span>
                        ) : (
                          <span className="text-base font-bold text-[#0F766E] tabular-nums shrink-0">
                            {course.progressPercent}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-[#0F766E] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, course.progressPercent))}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {completed
                          ? `${course.totalLessons}/${course.totalLessons} lessons · Certificate earned`
                          : `${course.completedLessons}/${course.totalLessons} lessons`}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4: Two-column widgets ─────────────────────────── */}
      {/* items-stretch (grid default) keeps both widgets the same
          height when one's content is taller. Inner flex-col +
          mt-auto on the CTA pushes buttons to the bottom of each. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5"
      >
        {/* Widget A — Upcoming session */}
        <div className="flex flex-col bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-200">
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
            <Calendar size={12} />
            Upcoming Session
          </p>
          {upcomingSession ? (
            <>
              <p className="text-base font-semibold text-gray-900 mt-2 truncate">
                with {upcomingSession.mentorName ?? "your mentor"}
              </p>
              <p className="text-sm text-[#0F766E] mt-1">
                {formatSessionDate(upcomingSession.scheduledAt)}
              </p>
              {upcomingSession.meetingUrl ? (
                <a
                  href={upcomingSession.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto pt-3 w-full inline-flex items-center justify-center gap-1.5 bg-[#0F766E] text-white text-sm font-bold py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-200"
                >
                  <ExternalLink size={14} /> Join meeting
                </a>
              ) : (
                <p className="text-xs text-gray-400 mt-auto pt-3">
                  Awaiting meeting link from mentor
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-900 mt-2">
                No sessions scheduled
              </p>
              <Link
                href={enrolledCourses[0]?.type === "SERVICE"
                  ? `/services/${enrolledCourses[0]?.id ?? ""}`
                  : `/courses/${enrolledCourses[0]?.id ?? ""}`}
                className="mt-auto pt-3 w-full inline-flex items-center justify-center gap-1.5 bg-[#0F766E] text-white text-sm font-bold py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-200"
              >
                Request a session <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>

        {/* Widget B — Recent achievement */}
        <div className="flex flex-col bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-200">
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
            <Trophy size={12} />
            Recent Achievement
          </p>
          {recentAchievement ? (
            <>
              <div className="flex items-center gap-2.5 mt-2">
                <div className="w-9 h-9 rounded-lg bg-[#f0fdf9] flex items-center justify-center shrink-0">
                  {recentAchievement.type === "cert"
                    ? <Award size={16} className="text-[#0F766E]" />
                    : <Trophy size={16} className="text-[#0F766E]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {recentAchievement.headline}
                  </p>
                  <p className="text-sm text-[#0F766E] truncate">
                    {recentAchievement.sub}
                  </p>
                </div>
              </div>
              {recentAchievement.type === "course" && recentAchievement.courseId != null ? (
                <Link
                  href={`/courses/${recentAchievement.courseId}`}
                  className="mt-auto pt-3 w-full inline-flex items-center justify-center gap-1 bg-transparent border border-[#0F766E]/20 text-[#0F766E] text-sm font-bold py-2.5 rounded-xl hover:bg-[#f0fdf9] active:scale-[0.98] transition-all duration-200"
                >
                  View certificate
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-base text-gray-500 mt-2">
              Keep learning — your first achievement is around the corner.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Section 5: Recent activity ────────────────────────────── */}
      {recentActivity.length > 0 && (
        <div className="mt-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Activity size={18} className="text-[#0F766E]" />
            Recent activity
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 shadow-sm">
            {recentActivity.slice(0, 8).map((item, idx) => {
              const { Icon, bg, fg } = activityVisual(item.type ?? "");
              return (
                <motion.div
                  key={`${item.timestamp}-${idx}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.04 * idx }}
                  className="flex gap-3 py-3 border-b border-gray-50 last:border-0"
                >
                  <div className={`shrink-0 w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={15} className={fg} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-gray-700 leading-snug">
                      {item.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {relativeTime(item.timestamp)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Browse-more card — fills space when content is short, and
          surfaces a useful CTA back to /courses regardless. Only
          suppressed when the user already has 4+ courses (they don't
          need the nudge). */}
      {enrolledCourses.length < 4 && (
        <Link
          href="/courses"
          className="mt-5 flex items-center gap-3 bg-white rounded-2xl border border-gray-100 py-3.5 px-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0fdf9] flex items-center justify-center shrink-0">
            <Compass size={18} className="text-[#0F766E]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900">Explore more courses</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Discover what to learn next with personal mentorship.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#0F766E] shrink-0">
            Browse <ArrowRight size={14} />
          </span>
        </Link>
      )}

      {/* Empty state — only when no enrollments AND no activity. */}
      {enrolledCourses.length === 0 && recentActivity.length === 0 && (
        <div className="mt-5 flex flex-col items-center text-center text-base text-gray-500">
          <Sparkles size={20} className="text-[#0F766E] mb-2" />
          Start a course to see your activity here.
        </div>
      )}
    </PageShell>
  );
}

/**
 * Page shell — escapes the parent /dashboard wrapper's `px-6 pt-28
 * pb-20` so the gray bg can full-bleed. Side margins replace a hard
 * max-width: content stretches to fill the viewport up to a 1200px
 * cap, with progressively larger gutters on bigger screens.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#f8f9fa] -mx-6 -mt-28 pt-[80px] pb-8 min-h-screen">
      <div className="w-full max-w-[1200px] mx-auto pt-4 px-4 md:px-12 lg:px-16">
        {children}
      </div>
    </div>
  );
}

/**
 * Picks an icon for the hero CTA based on the next-action type.
 * Resume / start lessons get a Play icon (filled, looks active);
 * sessions get a Calendar; assignments get a FileText; browse gets
 * Compass. Falls back to ArrowRight as a generic forward affordance.
 */
function HeroButtonIcon({ nextActionType }: { nextActionType?: string }) {
  switch (nextActionType) {
    case "SESSION_SOON":   return <ExternalLink size={14} />;
    case "CONTINUE_COURSE":
    case "START_COURSE":
      return <Play size={13} fill="currentColor" />;
    case "ASSIGNMENT_DUE": return <ArrowRight size={14} />;
    case "ALL_COMPLETE":
    case "BROWSE_COURSES":
    default:               return <Compass size={14} />;
  }
}

function StatBadge({
  icon: Icon, value, label, className = "",
}: {
  icon: typeof BookOpen;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center bg-white border border-gray-200 rounded-xl min-w-[84px] px-3 py-2 shadow-sm ${className}`}
    >
      <div className="flex items-baseline gap-1.5 leading-none">
        <Icon size={14} className="text-[#0F766E]" />
        <span className="text-2xl font-bold text-[#0F766E] tabular-nums">
          {value}
        </span>
      </div>
      <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mt-1">
        {label}
      </span>
    </div>
  );
}
