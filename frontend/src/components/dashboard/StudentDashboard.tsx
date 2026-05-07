"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, Award, ExternalLink, ArrowRight } from "lucide-react";
import { getProfile, type DashboardSummary, type NextAction, type ProfileData } from "@/lib/api";
import type { UserDTO } from "@/lib/api";

interface Props {
  user: UserDTO;
  summary: DashboardSummary | null;
  nextAction: NextAction | null;
  loading: boolean;
}

const TEAL_SHADES = ["#0F766E", "#115E59", "#134E4A"]; // course avatar variants

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

/**
 * Maps a recent-activity row to a dot color. The strings come from
 * the backend (see DashboardSummaryService) — keep this list in sync
 * with the activity types it emits.
 */
function activityDotColor(type: string): string {
  const t = type.toUpperCase();
  if (t.includes("LESSON") || t.includes("COURSE_PROGRESS")) return "#0D9488"; // teal
  if (t.includes("SESSION")) return "#EF9F27"; // amber
  if (t.includes("CERT") || t.includes("COMPLETED") || t.includes("QUIZ_PASSED")) return "#0F766E"; // deep teal
  if (t.includes("PAYMENT")) return "#378ADD"; // blue
  return "#9ca3af"; // neutral fallback
}

export function StudentDashboard({ user, summary, nextAction, loading }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Profile gives us certificate count + lastActiveAt without
  // bloating DashboardSummary. Failures are silent — we degrade to
  // approximated values.
  useEffect(() => {
    getProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  const enrolledCourses = summary?.enrolledCourses ?? [];
  const upcomingSessions = summary?.upcomingSessions ?? [];
  const recentActivity = summary?.recentActivity ?? [];
  const streakDays = summary?.streakDays ?? 0;

  // Days active fallback chain:
  //   1. profile.streakDays from server (if profile loaded)
  //   2. summary.streakDays (already loaded)
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

  // ── Next action — figure out which CTA + copy to render. ────────

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
    // Prefer the most recent CERTIFICATE_GENERATED entry from
    // recentActivity. Otherwise fall back to the most recent
    // completed course in enrolledCourses (sorted by lastAccessedAt
    // when available).
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
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse mb-4" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* ── Section 1: Greeting + stat badges ───────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between gap-4 px-7 py-6 rounded-xl"
        style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
      >
        <div>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            {greetingByHour(new Date().getHours())},
          </p>
          <h1 className="text-2xl font-medium mt-1" style={{ color: "#1a1a2e" }}>
            {firstName(user.fullName)}
          </h1>
        </div>
        {/* Show one badge on tiny phones, the certificates badge from
            sm+ (≥640px), and the days-active badge from md+ (≥768px). */}
        <div className="flex items-center gap-2">
          <StatBadge value={enrolledCourses.length} label="courses" />
          <StatBadge value={certificatesCount} label="certificates" className="hidden sm:flex" />
          <StatBadge value={daysActive} label={daysActive === 1 ? "day active" : "days active"} className="hidden md:flex" />
        </div>
      </motion.div>

      {/* ── Section 2: One next action hero ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        // Negative top margin lets it visually overlap the greeting
        // panel — gives the hero card more visual weight.
        className="relative overflow-hidden rounded-xl mt-[-8px]"
        style={{ background: "#0F766E", padding: "20px 24px" }}
      >
        {/* Decorative concentric rings, top right. Pure CSS, behind text. */}
        <div
          aria-hidden
          className="absolute"
          style={{
            top: -50,
            right: -30,
            width: 100,
            height: 100,
            borderRadius: "50%",
            border: "0.5px solid rgba(255,255,255,0.1)",
          }}
        />
        <div
          aria-hidden
          className="absolute"
          style={{
            top: -10,
            right: 30,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "0.5px solid rgba(255,255,255,0.08)",
          }}
        />

        <div className="relative">
          <p
            className="font-semibold"
            style={{
              fontSize: 11,
              letterSpacing: 1,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {heroLabel}
          </p>
          <p
            className="font-medium mt-1.5 line-clamp-2"
            style={{ color: "#ffffff", fontSize: 16 }}
          >
            {heroTitle}
          </p>
          {heroContext && (
            <p
              className="mt-1 line-clamp-1"
              style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
            >
              {heroContext}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3.5">
            <button
              onClick={heroOnClick}
              className="rounded-lg font-medium transition-colors hover:opacity-90 cursor-pointer"
              style={{
                background: "#ffffff",
                color: "#0F766E",
                fontSize: 12,
                padding: "8px 20px",
              }}
            >
              {heroButtonLabel}
            </button>
            {heroProgressPercent != null && (
              <>
                <div
                  className="flex-1 overflow-hidden rounded-full"
                  style={{ height: 4, background: "rgba(255,255,255,0.1)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, heroProgressPercent))}%`,
                      background: "rgba(255,255,255,0.8)",
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                  {heroProgressPercent}%
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Section 3: My courses ───────────────────────────────── */}
      {enrolledCourses.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium mb-3" style={{ color: "#1a1a2e" }}>
            My courses
          </h2>
          <div className="space-y-2">
            {enrolledCourses.map((course, idx) => {
              const completed = course.progressPercent >= 100;
              const avatarBg = TEAL_SHADES[idx % TEAL_SHADES.length];
              const href = course.type === "SERVICE"
                ? `/services/${course.id}`
                : `/courses/${course.id}`;
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.08 * idx }}
                >
                  <Link
                    href={href}
                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-[10px] hover:shadow-sm transition-shadow"
                    style={{ background: "#f9fafb", border: "0.5px solid #e5e7eb" }}
                  >
                    <div
                      className="flex items-center justify-center font-medium text-white shrink-0"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: avatarBg,
                        fontSize: 16,
                      }}
                    >
                      {course.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className="font-medium truncate"
                          style={{ fontSize: 14, color: "#1a1a2e" }}
                        >
                          {course.title}
                        </p>
                        {completed ? (
                          <span
                            className="font-medium px-2 py-0.5 rounded shrink-0"
                            style={{
                              fontSize: 11,
                              color: "#0D9488",
                              background: "#f0fdf9",
                            }}
                          >
                            Complete
                          </span>
                        ) : (
                          <span
                            className="font-medium tabular-nums shrink-0"
                            style={{ fontSize: 11, color: "#0F766E" }}
                          >
                            {course.progressPercent}%
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1.5 overflow-hidden rounded-full"
                        style={{ height: 3, background: "#e5e7eb" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, course.progressPercent))}%`,
                            background: completed ? "#0D9488" : "#0F766E",
                          }}
                        />
                      </div>
                      <p className="mt-1" style={{ fontSize: 10, color: "#9ca3af" }}>
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

      {/* ── Section 4: Two-column widgets ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8"
      >
        {/* Widget A — Upcoming session */}
        <div
          className="px-4 py-3.5 rounded-[10px]"
          style={{ background: "#f9fafb", border: "0.5px solid #e5e7eb" }}
        >
          <p
            className="font-semibold uppercase"
            style={{ fontSize: 11, letterSpacing: "0.05em", color: "#6b7280" }}
          >
            Upcoming Session
          </p>
          {upcomingSession ? (
            <>
              <p
                className="font-medium mt-1.5 truncate"
                style={{ fontSize: 14, color: "#1a1a2e" }}
              >
                with {upcomingSession.mentorName ?? "your mentor"}
              </p>
              <p style={{ fontSize: 11, color: "#0F766E" }}>
                {formatSessionDate(upcomingSession.scheduledAt)}
              </p>
              {upcomingSession.meetingUrl ? (
                <a
                  href={upcomingSession.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-md font-medium transition-opacity hover:opacity-90"
                  style={{
                    background: "#0F766E",
                    color: "#ffffff",
                    fontSize: 11,
                    padding: "6px 12px",
                  }}
                >
                  <ExternalLink size={11} /> Join meeting
                </a>
              ) : (
                <p className="mt-2.5" style={{ fontSize: 10, color: "#9ca3af" }}>
                  Awaiting meeting link from mentor
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1.5" style={{ fontSize: 13, color: "#6b7280" }}>
                No sessions scheduled
              </p>
              <Link
                href={enrolledCourses[0]?.type === "SERVICE"
                  ? `/services/${enrolledCourses[0]?.id ?? ""}`
                  : `/courses/${enrolledCourses[0]?.id ?? ""}`}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-md font-medium transition-opacity hover:opacity-90"
                style={{
                  background: "#0F766E",
                  color: "#ffffff",
                  fontSize: 11,
                  padding: "6px 12px",
                }}
              >
                Request a session <ArrowRight size={11} />
              </Link>
            </>
          )}
        </div>

        {/* Widget B — Recent achievement */}
        <div
          className="px-4 py-3.5 rounded-[10px]"
          style={{ background: "#f9fafb", border: "0.5px solid #e5e7eb" }}
        >
          <p
            className="font-semibold uppercase"
            style={{ fontSize: 11, letterSpacing: "0.05em", color: "#6b7280" }}
          >
            Recent Achievement
          </p>
          {recentAchievement ? (
            <>
              <div className="flex items-center gap-2 mt-1.5">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "#f0fdf9",
                  }}
                >
                  {recentAchievement.type === "cert"
                    ? <Award size={14} style={{ color: "#0F766E" }} />
                    : <Trophy size={14} style={{ color: "#0F766E" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="font-medium truncate"
                    style={{ fontSize: 14, color: "#1a1a2e" }}
                  >
                    {recentAchievement.headline}
                  </p>
                  <p className="truncate" style={{ fontSize: 11, color: "#6b7280" }}>
                    {recentAchievement.sub}
                  </p>
                </div>
              </div>
              {recentAchievement.type === "course" && recentAchievement.courseId != null ? (
                <Link
                  href={`/courses/${recentAchievement.courseId}`}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-md font-medium hover:bg-[#0F766E]/5 transition"
                  style={{
                    color: "#0F766E",
                    border: "0.5px solid rgba(15,118,110,0.2)",
                    fontSize: 11,
                    padding: "6px 12px",
                  }}
                >
                  View certificate
                </Link>
              ) : null}
            </>
          ) : (
            <p className="mt-1.5" style={{ fontSize: 12, color: "#6b7280" }}>
              Keep learning! Your first achievement is around the corner.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Section 5: Recent activity ──────────────────────────── */}
      {recentActivity.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium mb-2.5" style={{ color: "#1a1a2e" }}>
            Recent activity
          </h2>
          <div>
            {recentActivity.slice(0, 8).map((item, idx) => (
              <motion.div
                key={`${item.timestamp}-${idx}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.05 * idx }}
                className="flex gap-2.5 py-2"
                style={{
                  borderBottom: idx === recentActivity.slice(0, 8).length - 1
                    ? "none" : "0.5px solid #f0f0f0",
                }}
              >
                <div
                  className="shrink-0 mt-1.5"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: activityDotColor(item.type ?? ""),
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 12, color: "#1a1a2e" }}>{item.description}</p>
                  <p className="mt-0.5" style={{ fontSize: 10, color: "#9ca3af" }}>
                    {relativeTime(item.timestamp)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — only when there's literally no enrolled
          courses AND no activity. Keeps the page from looking
          half-built for fresh signups. */}
      {enrolledCourses.length === 0 && recentActivity.length === 0 && (
        <div className="mt-8 text-center text-sm" style={{ color: "#6b7280" }}>
          Start a course to see your activity here.
        </div>
      )}
    </div>
  );
}

function StatBadge({
  value, label, className = "",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${className}`}
      style={{
        background: "#f0fdf9",
        border: "0.5px solid rgba(15,118,110,0.15)",
        borderRadius: 8,
        padding: "8px 14px",
      }}
    >
      <span
        className="font-medium tabular-nums"
        style={{ fontSize: 18, color: "#0F766E", lineHeight: 1.1 }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: "#115E59", marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

