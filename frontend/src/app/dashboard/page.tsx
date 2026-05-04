"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import {
  BookOpen, ArrowRight, ShieldCheck, GraduationCap, PlusCircle,
  Users, BarChart3, Loader2, AlertCircle, Trash2, Eye, Globe, GlobeLock,
  TrendingUp, CreditCard, Inbox, CalendarClock, History, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getEnrollments, requestInstructor, getMyCourses, getInstructorStudents,
  getAnalytics, deleteCourse, publishCourse, unpublishCourse, getMentorSessions,
  getNextAction, getDashboardSummary,
  type NextAction, type DashboardSummary,
} from "@/lib/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SessionsList } from "@/components/mentorship/SessionsList";
import { PendingRequests } from "@/components/mentorship/PendingRequests";
import { MentorSessionsList } from "@/components/mentorship/MentorSessionsList";
import { NextActionHero } from "@/components/dashboard/NextActionHero";
import type { SessionRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  STUDENT: { label: "Student", color: "bg-teal-100 text-teal-700" },
  INSTRUCTOR: { label: "Instructor", color: "bg-violet-100 text-violet-700" },
  ADMIN: { label: "Admin", color: "bg-amber-100 text-amber-700" },
};

interface InstructorCourse {
  id: number; title: string; shortDescription: string; price: number;
  isFree: boolean; isPublished: boolean; level: string; category: string;
  enrolledCount: number; rating: number; lessonsCount: number;
}

interface AnalyticsData {
  totalUsers: number; totalCourses: number; totalEnrollments: number;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<unknown[]>([]);
  const [enrollLoading, setEnrollLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [requestMsg, setRequestMsg] = useState("");

  // Instructor
  const [myCourses, setMyCourses] = useState<InstructorCourse[]>([]);
  const [myCoursesLoading, setMyCoursesLoading] = useState(false);
  const [myStudents, setMyStudents] = useState<Array<{ studentName: string; email: string; courseTitle: string; enrolledAt: string }>>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Mentor sessions (one fetch shared across upcoming, history, and My Students enrichment)
  const [mentorSessions, setMentorSessions] = useState<SessionRequest[]>([]);

  // Student dashboard — "one next action" hero + summary
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [nextActionLoading, setNextActionLoading] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  // Admin analytics
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (!user) return;
    const role = user.role?.toUpperCase();

    setEnrollLoading(true);
    getEnrollments()
      .then((data) => setEnrollments(data ?? []))
      .catch(() => setEnrollments([]))
      .finally(() => setEnrollLoading(false));

    // Instructor only — fetch own courses and students
    if (role === "INSTRUCTOR") {
      setMyCoursesLoading(true);
      getMyCourses()
        .then((data) => setMyCourses((data ?? []) as InstructorCourse[]))
        .catch(() => setMyCourses([]))
        .finally(() => setMyCoursesLoading(false));

      setStudentsLoading(true);
      getInstructorStudents()
        .then((data) => setMyStudents(data ?? []))
        .catch(() => setMyStudents([]))
        .finally(() => setStudentsLoading(false));

      getMentorSessions()
        .then((data) => setMentorSessions(data ?? []))
        .catch(() => setMentorSessions([]));
    }

    // Admin only — fetch analytics
    if (role === "ADMIN") {
      getAnalytics()
        .then((data) => setAnalytics(data as AnalyticsData))
        .catch(() => setAnalytics(null));
    }

    // Student only — fetch next action + summary for the new hero/sections
    if (role === "STUDENT") {
      setNextActionLoading(true);
      getNextAction()
        .then((data) => setNextAction(data))
        .catch(() => setNextAction(null))
        .finally(() => setNextActionLoading(false));

      getDashboardSummary()
        .then((data) => setSummary(data))
        .catch(() => setSummary(null));
    }
  }, [user]);

  const handleRequestInstructor = async () => {
    setRequestStatus("loading");
    try {
      await requestInstructor();
      setRequestStatus("success");
      setRequestMsg("Request submitted! An admin will review it shortly.");
    } catch (err: unknown) {
      setRequestStatus("error");
      setRequestMsg(err instanceof Error ? err.message : "Failed to submit request.");
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!confirm("Delete this course?")) return;
    try {
      await deleteCourse(courseId);
      setMyCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch (err) { toast("error", err instanceof Error ? err.message : "Failed"); }
  };

  const handleTogglePublish = async (courseId: number, isPublished: boolean) => {
    try {
      if (isPublished) await unpublishCourse(courseId);
      else await publishCourse(courseId);
      setMyCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, isPublished: !isPublished } : c));
    } catch (err) { toast("error", err instanceof Error ? err.message : "Failed"); }
  };

  // Per-student session stats — keyed by email+courseTitle so a student
  // enrolled in two courses gets per-course counts. Matches whatever
  // getMentorSessions returned (mentor sees their own sessions only).
  const studentStats = useMemo(() => {
    const map = new Map<string, { completed: number; lastAt: string | null }>();
    for (const s of mentorSessions) {
      if (!s.studentEmail) continue;
      const key = `${s.studentEmail}|${s.courseTitle}`;
      const cur = map.get(key) ?? { completed: 0, lastAt: null };
      if (s.status === "COMPLETED") {
        cur.completed += 1;
        const at = s.completedAt ?? s.scheduledAt;
        if (at && (!cur.lastAt || new Date(at) > new Date(cur.lastAt))) {
          cur.lastAt = at;
        }
      } else if (s.status === "ACCEPTED" && s.scheduledAt) {
        if (!cur.lastAt || new Date(s.scheduledAt) > new Date(cur.lastAt)) {
          cur.lastAt = s.scheduledAt;
        }
      }
      map.set(key, cur);
    }
    return map;
  }, [mentorSessions]);

  const pendingCount = mentorSessions.filter((s) => s.status === "PENDING").length;
  const upcomingCount = mentorSessions.filter(
    (s) => s.status === "ACCEPTED" && s.scheduledAt && new Date(s.scheduledAt) > new Date()
  ).length;

  if (authLoading) {
    return <section className="mx-auto max-w-7xl px-6 pt-32 pb-20 flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-[#95C8CB]" /></section>;
  }
  if (!user) {
    return <section className="mx-auto max-w-7xl px-6 pt-32 pb-20 text-center"><p className="text-gray-500">Please log in.</p><Button asChild className="mt-4"><Link href="/login">Go to Login</Link></Button></section>;
  }

  const role = user.role?.toUpperCase() ?? "STUDENT";
  const roleInfo = ROLE_CONFIG[role] ?? ROLE_CONFIG.STUDENT;
  const isInstructor = role === "INSTRUCTOR";
  const isAdmin = role === "ADMIN";
  const isStudent = role === "STUDENT";

  const upcomingForStudent = summary?.upcomingSessions ?? [];
  const enrolledForStudent = summary?.enrolledCourses ?? [];

  return (
    <section className="mx-auto max-w-7xl px-6 pt-28 pb-20">
      <motion.div {...fadeUp}>
        {/* Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-[#0E6B6B]">Welcome back, {user.fullName}!</h1>
            <p className="text-gray-500 mt-1">Here&apos;s your overview.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${roleInfo.color} w-fit`}>
            <ShieldCheck size={14} /> {roleInfo.label}
          </span>
        </div>

        {/* ── ADMIN: Analytics Dashboard ──────────────────────────── */}
        {isAdmin && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
              <BarChart3 size={20} /> Platform Analytics
            </h2>

            {analytics ? (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Total Users", value: analytics.totalUsers, icon: Users, color: "from-teal-500 to-teal-600", percent: 100, href: "/admin?tab=Users" },
                    { label: "Total Courses", value: analytics.totalCourses, icon: BookOpen, color: "from-violet-500 to-violet-600", percent: Math.round((analytics.totalCourses / Math.max(analytics.totalUsers, 1)) * 100), href: "/admin?tab=Courses" },
                    { label: "Enrollments", value: analytics.totalEnrollments, icon: CreditCard, color: "from-cyan-500 to-cyan-600", percent: Math.round((analytics.totalEnrollments / Math.max(analytics.totalUsers, 1)) * 100), href: "/admin?tab=Overview" },
                  ].map((stat) => (
                    <Link key={stat.label} href={stat.href} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer block">
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                          <stat.icon size={18} className="text-white" />
                        </div>
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <TrendingUp size={12} /> {stat.percent}%
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>

                      {/* Visual bar */}
                      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(stat.percent, 100)}%` }}
                          transition={{ duration: 1, delay: 0.3 }}
                          className={`h-full rounded-full bg-gradient-to-r ${stat.color}`}
                        />
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Quick actions */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <GlassCard>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <Users size={20} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Admin Panel</p>
                        <p className="text-xs text-gray-500">Manage users, courses, requests</p>
                      </div>
                    </div>
                    <Button size="sm" asChild className="w-full">
                      <Link href="/admin">Open Admin Panel <ArrowRight size={14} className="ml-1" /></Link>
                    </Button>
                  </GlassCard>
                  <GlassCard>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                        <BookOpen size={20} className="text-teal-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Browse Courses</p>
                        <p className="text-xs text-gray-500">View all platform courses</p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" asChild className="w-full">
                      <Link href="/courses">View Courses <ArrowRight size={14} className="ml-1" /></Link>
                    </Button>
                  </GlassCard>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[#95C8CB]" /></div>
            )}
          </div>
        )}

        {/* ── STUDENT: One Next Action hero + My Courses + Upcoming ── */}
        {isStudent && (
          <div className="mb-10 space-y-10">
            {/* Section 1: Next-action hero */}
            <NextActionHero action={nextAction} loading={nextActionLoading} />

            {/* Section 2: My Courses (compact, with real progress) */}
            {enrolledForStudent.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                  <BookOpen size={20} /> My Courses
                  <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {enrolledForStudent.length}
                  </span>
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enrolledForStudent.map((c) => (
                    <Link
                      key={c.id}
                      href={c.type === "SERVICE" ? `/services/${c.id}` : `/courses/${c.id}`}
                      className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#95C8CB]/60 transition-all p-5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                          c.type === "SERVICE" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"
                        )}>
                          {c.type === "SERVICE" ? "Service" : "Course"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {c.lastAccessedAt
                            ? new Date(c.lastAccessedAt).toLocaleDateString()
                            : "Not started"}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 line-clamp-2 mb-3">{c.title}</h3>

                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                        <span>{c.completedLessons}/{c.totalLessons} lessons</span>
                        <span className="font-semibold text-[#0E6B6B]">{c.progressPercent}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#0E6B6B] to-[#5FA3A3] rounded-full transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, c.progressPercent))}%` }}
                        />
                      </div>

                      <div className="mt-4 text-xs font-semibold text-[#0E6B6B] group-hover:underline inline-flex items-center gap-1">
                        Continue <ArrowRight size={12} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Section 3: Upcoming sessions (next 7 days) */}
            {upcomingForStudent.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                  <CalendarClock size={20} /> Upcoming
                  <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {upcomingForStudent.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {upcomingForStudent.map((s) => {
                    const at = new Date(s.scheduledAt);
                    const withinHour = at.getTime() - Date.now() <= 60 * 60 * 1000;
                    return (
                      <div
                        key={s.sessionId}
                        className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                      >
                        <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                          <CalendarClock size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {s.courseTitle ?? "Mentor session"}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {s.mentorName ? `with ${s.mentorName} · ` : ""}
                            {at.toLocaleString(undefined, {
                              weekday: "short", month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {s.meetingUrl && withinHour && (
                          <a
                            href={s.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0E6B6B] text-white text-xs font-semibold hover:bg-[#5FA3A3] transition shrink-0"
                          >
                            <ExternalLink size={12} /> Join
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STUDENT: Request Instructor ─────────────────────────── */}
        {role === "STUDENT" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            <GlassCard>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <GraduationCap size={20} className="text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Become an Instructor</p>
                  <p className="text-xs text-gray-500">Share your knowledge</p>
                </div>
              </div>
              {requestStatus === "success" ? (
                <p className="text-xs text-teal-600 font-medium">{requestMsg}</p>
              ) : requestStatus === "error" ? (
                <p className="text-xs text-red-500 font-medium">{requestMsg}</p>
              ) : (
                <Button size="sm" onClick={handleRequestInstructor} disabled={requestStatus === "loading"} className="w-full">
                  {requestStatus === "loading" && <Loader2 size={14} className="animate-spin mr-1" />}
                  Request Instructor Status
                </Button>
              )}
            </GlassCard>
          </div>
        )}

        {/* ── INSTRUCTOR: Mentorship sections (top — most urgent first) ── */}
        {isInstructor && (
          <>
            {/* Pending Requests */}
            <div className="mb-10">
              <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                <Inbox size={20} /> Pending Requests
                {pendingCount > 0 && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </h2>
              <PendingRequests
                onAccepted={(updated) => {
                  // Keep the shared mentorSessions list in sync so Upcoming /
                  // Session History reflect the change without a re-fetch.
                  setMentorSessions((prev) =>
                    prev.some((s) => s.id === updated.id)
                      ? prev.map((s) => (s.id === updated.id ? updated : s))
                      : [...prev, updated]
                  );
                }}
              />
            </div>

            {/* Upcoming Sessions */}
            <div className="mb-10">
              <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                <CalendarClock size={20} /> Upcoming Sessions
                {upcomingCount > 0 && (
                  <span className="text-xs font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                    {upcomingCount}
                  </span>
                )}
              </h2>
              <MentorSessionsList
                sessions={mentorSessions}
                onSessionsChange={setMentorSessions}
                filter={(s) =>
                  s.status === "ACCEPTED" &&
                  !!s.scheduledAt &&
                  new Date(s.scheduledAt) > new Date()
                }
                emptyMessage="No upcoming sessions scheduled."
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              <GlassCard>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <PlusCircle size={20} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Create a Course</p>
                    <p className="text-xs text-gray-500">Build and publish your curriculum</p>
                  </div>
                </div>
                <Button size="sm" asChild className="w-full">
                  <Link href="/courses/create">Create Course <ArrowRight size={14} className="ml-1" /></Link>
                </Button>
              </GlassCard>
            </div>

            {/* My Courses */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#0E6B6B]">My Courses</h2>
                <Link href="/courses/create" className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
                  <PlusCircle size={14} /> New Course
                </Link>
              </div>
              {myCoursesLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[#95C8CB]" /></div>
              ) : myCourses.length === 0 ? (
                <GlassCard className="text-center py-12">
                  <BookOpen size={40} className="mx-auto text-violet-300 mb-3" />
                  <p className="text-gray-500 text-sm mb-4">No courses created yet.</p>
                  <Button size="sm" asChild><Link href="/courses/create">Create Your First Course</Link></Button>
                </GlassCard>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myCourses.map((course) => (
                    <motion.div key={course.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
                        <div className="h-24 bg-gradient-to-br from-violet-100 to-purple-50 flex items-center justify-center relative">
                          <BookOpen size={24} className="text-violet-300" />
                          <span className={cn("absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                            course.isPublished ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"
                          )}>{course.isPublished ? "Published" : "Draft"}</span>
                        </div>
                        <div className="p-5">
                          <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">{course.title}</h3>
                          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                            <span>{course.lessonsCount} lessons</span>
                            <span>{course.enrolledCount} enrolled</span>
                            <span className="ml-auto font-medium text-gray-900">{course.isFree ? "Free" : `₹${course.price}`}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                            <Link href={`/courses/${course.id}`} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"><Eye size={12} /> View</Link>
                            <button onClick={() => handleTogglePublish(course.id, course.isPublished)}
                              className={cn("flex items-center gap-1 text-xs font-medium", course.isPublished ? "text-amber-600" : "text-blue-600")}>
                              {course.isPublished ? <><GlobeLock size={12} /> Unpublish</> : <><Globe size={12} /> Publish</>}
                            </button>
                            <button onClick={() => handleDeleteCourse(course.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium ml-auto"><Trash2 size={12} /> Delete</button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* My Students */}
            <div className="mb-10">
              <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                <Users size={20} /> My Students
                {myStudents.length > 0 && <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{myStudents.length} enrolled</span>}
              </h2>
              {studentsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[#95C8CB]" /></div>
              ) : myStudents.length === 0 ? (
                <GlassCard className="text-center py-12"><Users size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500 text-sm">No students enrolled yet.</p></GlassCard>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Course</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Enrolled</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Sessions</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Last session</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {myStudents.map((s, i) => {
                        const stats = studentStats.get(`${s.email}|${s.courseTitle}`);
                        const sessionsCount = stats?.completed ?? 0;
                        const lastAt = stats?.lastAt ?? null;
                        return (
                          <motion.tr key={`${s.email}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-gray-50/50">
                            <td className="px-6 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">{s.studentName?.charAt(0)?.toUpperCase()}</div><span className="font-medium text-gray-900">{s.studentName}</span></div></td>
                            <td className="px-6 py-3 text-gray-500">{s.email}</td>
                            <td className="px-6 py-3"><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{s.courseTitle}</span></td>
                            <td className="px-6 py-3 text-gray-400 text-xs">{new Date(s.enrolledAt).toLocaleDateString()}</td>
                            <td className="px-6 py-3 text-gray-700 text-xs">
                              {sessionsCount > 0 ? (
                                <span className="font-semibold">{sessionsCount}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-gray-400 text-xs">
                              {lastAt ? new Date(lastAt).toLocaleDateString() : <span className="text-gray-300">—</span>}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Session History (collapsed-feel: at the bottom of the instructor sections) */}
            <details className="mb-10 group">
              <summary className="cursor-pointer list-none">
                <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 flex items-center gap-2">
                  <History size={20} /> Session History
                  <span className="text-xs font-normal text-gray-400 group-open:hidden">(click to expand)</span>
                </h2>
              </summary>
              <MentorSessionsList
                sessions={mentorSessions}
                onSessionsChange={setMentorSessions}
                filter={(s) => s.status === "COMPLETED" || s.status === "CANCELLED"}
                emptyMessage="No completed or cancelled sessions yet."
              />
            </details>
          </>
        )}

        {/* ── Enrolled Courses (admin / instructor only — students see "My Courses" above) ── */}
        {error && (
          <GlassCard className="mb-6 border-red-200 bg-red-50/80">
            <div className="flex items-center gap-2 text-red-600"><AlertCircle size={16} /><p className="text-sm">{error}</p></div>
          </GlassCard>
        )}

        {!isStudent && (
          <>
        <h2 className="text-xl font-bold text-[#0E6B6B] mb-4">
          {isAdmin ? "Enrolled Courses" : "Enrolled Courses"}
        </h2>

        {enrollLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[#95C8CB]" /></div>
        ) : enrollments.length === 0 ? (
          <GlassCard className="text-center py-12">
            <BookOpen size={40} className="mx-auto text-[#95C8CB]/40 mb-3" />
            <p className="text-gray-500 text-sm mb-4">No enrolled courses yet.</p>
            <Button size="sm" asChild><Link href="/courses">Browse Courses <ArrowRight size={14} className="ml-1" /></Link></Button>
          </GlassCard>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map((enrollment: unknown) => {
              const e = enrollment as Record<string, unknown>;
              const course = (e.course ?? e) as Record<string, unknown>;
              const id = course.id ?? e.courseId;
              const title = (course.title as string) ?? "Untitled Course";
              return (
                <Link key={String(id)} href={`/courses/${id}`}>
                  <GlassCard hover className="h-full">
                    <div className="h-28 -mx-6 -mt-6 mb-4 rounded-t-2xl bg-gradient-to-br from-[#0E6B6B]/10 to-[#5FA3A3]/20 flex items-center justify-center">
                      <BookOpen size={24} className="text-[#0E6B6B]/30" />
                    </div>
                    <h3 className="font-semibold text-sm text-[#1a1a1a] line-clamp-2">{title}</h3>
                    {typeof course.shortDescription === "string" && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{course.shortDescription}</p>}
                  </GlassCard>
                </Link>
              );
            })}
          </div>
        )}
          </>
        )}

        {/* ── Mentor Sessions (all roles) ─────────────────────────── */}
        <h2 className="text-xl font-bold text-[#0E6B6B] mb-4 mt-10">Mentor Sessions</h2>
        <SessionsList />
      </motion.div>
    </section>
  );
}
