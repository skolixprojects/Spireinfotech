"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users,
  CreditCard,
  BookOpen,
  LayoutDashboard,
  LogOut,
  UserCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  UserPlus,
  UserMinus,
  GraduationCap,
} from "lucide-react";
import {
  getAnalytics,
  getUsers,
  getAdminCourses,
  getPendingInstructorRequests,
  approveInstructor,
  rejectInstructor,
  deleteCourse,
  publishCourse,
  unpublishCourse,
  getCourseMentors,
  addMentorToCourse,
  removeMentorFromCourse,
  type CourseMentor,
} from "@/lib/api";
import { Eye, Trash2, Globe, GlobeLock } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Users", icon: Users },
  { label: "Courses", icon: BookOpen },
  { label: "Mentor Pools", icon: GraduationCap },
  { label: "Instructor Requests", icon: UserCheck },
];

interface Analytics {
  totalUsers: number;
  totalCourses: number;
  totalEnrollments: number;
}

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
}

interface CourseItem {
  id: number;
  title: string;
  slug: string;
  level: string;
  price: number;
  isFree: boolean;
  isPublished: boolean;
  category: string;
  enrolledCount: number;
  lessonsCount: number;
  rating: number;
  instructor: { id: number; fullName: string; email: string } | null;
}

interface InstructorRequest {
  id: number;
  userId: number;
  userEmail: string;
  userFullName: string;
  status: string;
  createdAt: string;
}

function roleBadgeColor(role: string) {
  switch (role.toUpperCase()) {
    case "ADMIN":
      return "bg-purple-100 text-purple-700";
    case "INSTRUCTOR":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function AdminContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "Overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Data states
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<InstructorRequest[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);

  // Loading / error
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Mentor Pools tab state — lazy per-course pool fetch + cache
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const [mentorsByCourse, setMentorsByCourse] = useState<Record<number, CourseMentor[]>>({});
  const [loadingPoolFor, setLoadingPoolFor] = useState<number | null>(null);
  const [addPanelFor, setAddPanelFor] = useState<number | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string>("");
  const [poolBusy, setPoolBusy] = useState(false);

  // Fetch analytics
  useEffect(() => {
    setLoadingAnalytics(true);
    getAnalytics()
      .then((data) => setAnalytics(data as Analytics))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingAnalytics(false));
  }, []);

  // Fetch users
  useEffect(() => {
    setLoadingUsers(true);
    getUsers()
      .then((data) => setUsers(data as User[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingUsers(false));
  }, []);

  // Pagination
  const [coursePage, setCoursePage] = useState(1);
  const COURSES_PER_PAGE = 8;

  // Fetch ALL courses (including unpublished) for admin
  useEffect(() => {
    setLoadingCourses(true);
    getAdminCourses()
      .then((data) => setCourses((data ?? []) as CourseItem[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCourses(false));
  }, []);

  // Fetch instructor requests
  const fetchRequests = () => {
    setLoadingRequests(true);
    getPendingInstructorRequests()
      .then((data) => setRequests(data as InstructorRequest[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingRequests(false));
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Handle course actions
  const handleDeleteCourse = async (courseId: number) => {
    if (!confirm("Are you sure you want to delete this course? This cannot be undone.")) return;
    try {
      await deleteCourse(courseId);
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      setActionMsg({ type: "success", text: "Course deleted." });
    } catch (err: unknown) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to delete" });
    }
  };

  const handleTogglePublish = async (courseId: number, isPublished: boolean) => {
    try {
      if (isPublished) {
        await unpublishCourse(courseId);
      } else {
        await publishCourse(courseId);
      }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, isPublished: !isPublished } : c));
      setActionMsg({ type: "success", text: isPublished ? "Course unpublished." : "Course published." });
    } catch (err: unknown) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Action failed" });
    }
  };

  // ── Mentor Pools handlers ────────────────────────────────────
  const fetchPool = async (courseId: number) => {
    setLoadingPoolFor(courseId);
    try {
      const data = await getCourseMentors(courseId);
      setMentorsByCourse((prev) => ({ ...prev, [courseId]: data ?? [] }));
    } catch (err: unknown) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to load pool" });
    } finally {
      setLoadingPoolFor(null);
    }
  };

  const handleToggleCourse = (courseId: number) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      setAddPanelFor(null);
      return;
    }
    setExpandedCourseId(courseId);
    setAddPanelFor(null);
    if (mentorsByCourse[courseId] === undefined) {
      fetchPool(courseId);
    }
  };

  const handleAddMentor = async (courseId: number) => {
    if (!selectedMentorId) return;
    setPoolBusy(true);
    try {
      await addMentorToCourse(courseId, Number(selectedMentorId));
      await fetchPool(courseId);
      setActionMsg({ type: "success", text: "Mentor added to pool." });
      setSelectedMentorId("");
      setAddPanelFor(null);
    } catch (err: unknown) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to add mentor" });
    } finally {
      setPoolBusy(false);
    }
  };

  const handleRemoveMentor = async (courseId: number, mentorId: number) => {
    if (!confirm("Remove this mentor from the pool? Their existing student assignments will not change.")) return;
    setPoolBusy(true);
    try {
      await removeMentorFromCourse(courseId, mentorId);
      await fetchPool(courseId);
      setActionMsg({ type: "success", text: "Mentor removed from pool." });
    } catch (err: unknown) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to remove mentor" });
    } finally {
      setPoolBusy(false);
    }
  };

  // Handle approve / reject
  const handleAction = async (requestId: number, action: "approve" | "reject") => {
    setProcessingId(requestId);
    setActionMsg(null);
    try {
      if (action === "approve") {
        await approveInstructor(requestId);
      } else {
        await rejectInstructor(requestId);
      }
      setActionMsg({ type: "success", text: `Instructor request ${action}d successfully.` });
      fetchRequests();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed";
      setActionMsg({ type: "error", text: message });
    } finally {
      setProcessingId(null);
    }
  };

  // Stats cards derived from analytics
  const statCards = analytics
    ? [
        { label: "Total Users", value: analytics.totalUsers.toLocaleString(), icon: Users },
        { label: "Total Courses", value: analytics.totalCourses.toLocaleString(), icon: BookOpen },
        { label: "Enrollments", value: analytics.totalEnrollments.toLocaleString(), icon: CreditCard },
      ]
    : [];

  const Spinner = () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[#00A3A8]" size={32} />
    </div>
  );

  return (
    <div className="flex min-h-screen pt-20">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white/60 backdrop-blur-sm border-r border-white/40 px-4 py-8 shrink-0">
        <h2 className="font-[family-name:var(--font-playfair)] text-xl font-bold text-[#00A3A8] px-3 mb-8">
          Admin
        </h2>
        <nav className="flex-1 space-y-1">
          {sidebarLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => setActiveTab(link.label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === link.label
                  ? "bg-[#00A3A8] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <link.icon size={18} />
              {link.label}
            </button>
          ))}
        </nav>
        <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-6 lg:px-10 py-8 overflow-auto">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Global error banner */}
          {error && (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer">
                <XCircle size={16} />
              </button>
            </div>
          )}

          {/* ──────────── Overview Tab ──────────── */}
          {activeTab === "Overview" && (
            <>
              <h1 className="text-2xl font-bold text-[#00A3A8] mb-6">
                Dashboard Overview
              </h1>

              {/* Stats cards */}
              {loadingAnalytics ? (
                <Spinner />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                  {statCards.map((stat) => (
                    <GlassCard key={stat.label}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-full bg-[#00A3A8]/10 flex items-center justify-center">
                          <stat.icon size={18} className="text-[#00A3A8]" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-[#1a1a1a]">
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-500">{stat.label}</p>
                    </GlassCard>
                  ))}
                </div>
              )}

              {/* Recent users table */}
              <h2 className="text-lg font-bold text-[#00A3A8] mb-4">
                Recent Users
              </h2>
              {loadingUsers ? (
                <Spinner />
              ) : (
                <GlassCard className="mb-10 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-3 font-medium">Name</th>
                        <th className="pb-3 font-medium">Email</th>
                        <th className="pb-3 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.slice(0, 5).map((user) => (
                        <tr key={user.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 font-medium text-[#1a1a1a]">{user.fullName}</td>
                          <td className="py-3 text-gray-500">{user.email}</td>
                          <td className="py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor(user.role)}`}>
                              {user.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-gray-400">No users found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </GlassCard>
              )}
            </>
          )}

          {/* ──────────── Users Tab ──────────── */}
          {activeTab === "Users" && (
            <>
              <h1 className="text-2xl font-bold text-[#00A3A8] mb-6">
                All Users
              </h1>
              {loadingUsers ? (
                <Spinner />
              ) : (
                <GlassCard className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-3 font-medium">ID</th>
                        <th className="pb-3 font-medium">Name</th>
                        <th className="pb-3 font-medium">Email</th>
                        <th className="pb-3 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 text-gray-400">#{user.id}</td>
                          <td className="py-3 font-medium text-[#1a1a1a]">{user.fullName}</td>
                          <td className="py-3 text-gray-500">{user.email}</td>
                          <td className="py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor(user.role)}`}>
                              {user.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-gray-400">No users found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </GlassCard>
              )}
            </>
          )}

          {/* ──────────── Courses Tab ──────────── */}
          {activeTab === "Courses" && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-[#00A3A8]">Manage Courses</h1>
                <span className="text-sm text-gray-500">{courses.length} total courses</span>
              </div>
              {loadingCourses ? (
                <Spinner />
              ) : courses.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No courses found.</p>
                </GlassCard>
              ) : (
                <>
                  <div className="space-y-4">
                    {courses
                      .slice((coursePage - 1) * COURSES_PER_PAGE, coursePage * COURSES_PER_PAGE)
                      .map((course) => (
                      <GlassCard key={course.id}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-gray-900 truncate">{course.title}</h3>
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                course.isPublished ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"
                              )}>
                                {course.isPublished ? "Published" : "Draft"}
                              </span>
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                course.level === "BEGINNER" && "bg-teal-50 text-teal-600",
                                course.level === "INTERMEDIATE" && "bg-amber-50 text-amber-600",
                                course.level === "ADVANCED" && "bg-red-50 text-red-600",
                              )}>
                                {course.level}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">
                              by {course.instructor?.fullName || "Unknown"} · {course.category || "Uncategorized"}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                              <span>{course.lessonsCount} lessons</span>
                              <span>{course.enrolledCount} enrolled</span>
                              <span>Rating: {course.rating}/5</span>
                              <span className="font-medium text-gray-700">
                                {course.isFree ? "Free" : `₹${course.price}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/courses/${course.id}`}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
                              <Eye size={12} /> View
                            </Link>
                            <button onClick={() => handleTogglePublish(course.id, course.isPublished)}
                              className={cn("flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition",
                                course.isPublished ? "text-amber-700 bg-amber-100 hover:bg-amber-200" : "text-teal-700 bg-teal-100 hover:bg-teal-200"
                              )}>
                              {course.isPublished ? <><GlobeLock size={12} /> Unpublish</> : <><Globe size={12} /> Publish</>}
                            </button>
                            <button onClick={() => handleDeleteCourse(course.id)}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition">
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </div>

                  {/* Pagination */}
                  {courses.length > COURSES_PER_PAGE && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                      <button onClick={() => setCoursePage((p) => Math.max(1, p - 1))} disabled={coursePage === 1}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition">
                        Previous
                      </button>
                      {Array.from({ length: Math.ceil(courses.length / COURSES_PER_PAGE) }, (_, i) => (
                        <button key={i + 1} onClick={() => setCoursePage(i + 1)}
                          className={cn("w-9 h-9 rounded-lg text-sm font-medium transition",
                            coursePage === i + 1 ? "bg-[#00A3A8] text-white" : "border border-gray-200 hover:bg-gray-50"
                          )}>
                          {i + 1}
                        </button>
                      ))}
                      <button onClick={() => setCoursePage((p) => Math.min(Math.ceil(courses.length / COURSES_PER_PAGE), p + 1))}
                        disabled={coursePage >= Math.ceil(courses.length / COURSES_PER_PAGE)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition">
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ──────────── Mentor Pools Tab ──────────── */}
          {activeTab === "Mentor Pools" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-[#00A3A8]">Mentor Pools</h1>
                <span className="text-sm text-gray-500">{courses.length} courses</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Each course has its own mentor pool. Capacity is 10 students per mentor across all their courses.
              </p>

              {/* Action feedback */}
              {actionMsg && (
                <div
                  className={`mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                    actionMsg.type === "success"
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {actionMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {actionMsg.text}
                  <button onClick={() => setActionMsg(null)} className="ml-auto opacity-60 hover:opacity-100 cursor-pointer">
                    <XCircle size={16} />
                  </button>
                </div>
              )}

              {loadingCourses ? (
                <Spinner />
              ) : courses.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No courses found.</p>
                </GlassCard>
              ) : (
                <div className="space-y-4">
                  {courses.map((course) => {
                    const expanded = expandedCourseId === course.id;
                    const pool = mentorsByCourse[course.id];
                    const isLoadingPool = loadingPoolFor === course.id;
                    const showAddPanel = addPanelFor === course.id;

                    const instructorOptions = users.filter(
                      (u) =>
                        u.role?.toUpperCase() === "INSTRUCTOR" &&
                        !(pool ?? []).some((m) => m.mentorId === u.id)
                    );

                    return (
                      <GlassCard key={course.id}>
                        {/* Header row — click to expand */}
                        <button
                          onClick={() => handleToggleCourse(course.id)}
                          className="w-full flex items-center gap-3 text-left cursor-pointer"
                        >
                          {expanded ? (
                            <ChevronDown size={18} className="text-[#00A3A8] shrink-0" />
                          ) : (
                            <ChevronRight size={18} className="text-gray-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 truncate">{course.title}</h3>
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                course.isPublished ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"
                              )}>
                                {course.isPublished ? "Published" : "Draft"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {pool
                                ? `${pool.length} mentor${pool.length === 1 ? "" : "s"} in pool`
                                : "Click to view pool"}
                            </p>
                          </div>
                        </button>

                        {/* Expanded body */}
                        {expanded && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            {isLoadingPool ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 size={20} className="animate-spin text-[#5FE0E3]" />
                              </div>
                            ) : (
                              <>
                                {(pool ?? []).length === 0 ? (
                                  <p className="text-sm text-gray-400 py-4">
                                    No mentors in this pool yet. Students enrolling in this course will be marked
                                    <span className="font-mono text-xs"> pending_assignment</span> until you add a mentor.
                                  </p>
                                ) : (
                                  <ul className="space-y-2">
                                    {(pool ?? []).map((m) => {
                                      const atCapacity = m.activeStudentCount >= m.maxStudents;
                                      const nearCapacity =
                                        !atCapacity && m.activeStudentCount >= m.maxStudents - 2;
                                      const capColor = atCapacity
                                        ? "bg-red-100 text-red-700"
                                        : nearCapacity
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-teal-100 text-teal-700";
                                      return (
                                        <li
                                          key={m.id}
                                          className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50/60"
                                        >
                                          <div className="w-8 h-8 rounded-full bg-[#00A3A8]/10 text-[#00A3A8] flex items-center justify-center text-xs font-bold shrink-0">
                                            {m.mentorName?.charAt(0)?.toUpperCase() ?? "?"}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{m.mentorName}</p>
                                            <p className="text-xs text-gray-500 truncate">{m.mentorEmail}</p>
                                          </div>
                                          <span className={cn(
                                            "text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
                                            capColor
                                          )}>
                                            {m.activeStudentCount}/{m.maxStudents} students
                                          </span>
                                          <button
                                            onClick={() => handleRemoveMentor(course.id, m.mentorId)}
                                            disabled={poolBusy}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition"
                                          >
                                            <UserMinus size={12} /> Remove
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}

                                {/* Add Mentor affordance */}
                                <div className="mt-3">
                                  {!showAddPanel ? (
                                    <button
                                      onClick={() => {
                                        setAddPanelFor(course.id);
                                        setSelectedMentorId("");
                                      }}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#00A3A8] bg-[#00A3A8]/10 hover:bg-[#00A3A8]/15 transition"
                                    >
                                      <UserPlus size={12} /> Add Mentor
                                    </button>
                                  ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                      {loadingUsers ? (
                                        <Loader2 size={14} className="animate-spin text-[#5FE0E3]" />
                                      ) : instructorOptions.length === 0 ? (
                                        <span className="text-xs text-gray-500 flex-1">
                                          All instructors are already in this pool.
                                        </span>
                                      ) : (
                                        <select
                                          value={selectedMentorId}
                                          onChange={(e) => setSelectedMentorId(e.target.value)}
                                          disabled={poolBusy}
                                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        >
                                          <option value="">Select an instructor…</option>
                                          {instructorOptions.map((u) => (
                                            <option key={u.id} value={u.id}>
                                              {u.fullName} — {u.email}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          onClick={() => handleAddMentor(course.id)}
                                          disabled={poolBusy || !selectedMentorId || instructorOptions.length === 0}
                                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#00A3A8] text-white hover:bg-[#00B4B8] disabled:opacity-50 transition inline-flex items-center gap-1"
                                        >
                                          {poolBusy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                                          Add
                                        </button>
                                        <button
                                          onClick={() => {
                                            setAddPanelFor(null);
                                            setSelectedMentorId("");
                                          }}
                                          disabled={poolBusy}
                                          className="px-3 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 transition"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ──────────── Instructor Requests Tab ──────────── */}
          {activeTab === "Instructor Requests" && (
            <>
              <h1 className="text-2xl font-bold text-[#00A3A8] mb-6">
                Pending Instructor Requests
              </h1>

              {/* Action feedback */}
              {actionMsg && (
                <div
                  className={`mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                    actionMsg.type === "success"
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {actionMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {actionMsg.text}
                  <button onClick={() => setActionMsg(null)} className="ml-auto opacity-60 hover:opacity-100 cursor-pointer">
                    <XCircle size={16} />
                  </button>
                </div>
              )}

              {loadingRequests ? (
                <Spinner />
              ) : requests.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No pending instructor requests.</p>
                </GlassCard>
              ) : (
                <div className="space-y-4">
                  {requests.map((req) => (
                    <GlassCard key={req.id}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#1a1a1a]">{req.userFullName}</p>
                          <p className="text-sm text-gray-500">{req.userEmail}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-gray-400">
                              {new Date(req.createdAt).toLocaleDateString()}
                            </span>
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              PENDING
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleAction(req.id, "approve")}
                            disabled={processingId === req.id}
                            className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {processingId === req.id ? (
                              <Loader2 size={14} className="animate-spin inline mr-1" />
                            ) : null}
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(req.id, "reject")}
                            disabled={processingId === req.id}
                            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {processingId === req.id ? (
                              <Loader2 size={14} className="animate-spin inline mr-1" />
                            ) : null}
                            Reject
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen pt-24"><Loader2 className="animate-spin text-[#00A3A8]" size={32} /></div>}>
      <AdminContent />
    </Suspense>
  );
}
