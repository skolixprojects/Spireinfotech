"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  IndianRupee,
  Download,
  TrendingUp,
  Megaphone,
  Plus,
  Edit3,
  Save,
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
  getAdminEnrollments,
  getAdminSessions,
  type AdminEnrollmentRow,
  type AdminSessionRow,
  getRevenueSummary,
  getRevenueTransactions,
  downloadAdminCsv,
  type RevenueSummary,
  type RevenueTransaction,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type Announcement,
} from "@/lib/api";
import { Eye, Trash2, Globe, GlobeLock, Calendar, ClipboardList, ExternalLink } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Users", icon: Users },
  { label: "Courses", icon: BookOpen },
  { label: "Enrollments", icon: ClipboardList },
  { label: "Sessions", icon: Calendar },
  { label: "Revenue", icon: IndianRupee },
  { label: "Announcements", icon: Megaphone },
  { label: "Mentor Pools", icon: GraduationCap },
  { label: "Instructor Requests", icon: UserCheck },
];

interface Analytics {
  totalUsers: number;
  totalStudents?: number;
  totalInstructors?: number;
  totalTrainers?: number;
  totalCourses: number;
  totalServices?: number;
  totalEnrollments: number;
  totalCompletions?: number;
  totalCertificates?: number;
  totalSessionRequests?: number;
  totalSessionsPending?: number;
  totalSessionsAccepted?: number;
  totalSessionsCompleted?: number;
  activeUsersLast7Days?: number;
  activeUsersLast30Days?: number;
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
  const router = useRouter();
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

  // Admin oversight tabs — lazy-loaded when the tab is first opened
  const [enrollmentsRows, setEnrollmentsRows] = useState<AdminEnrollmentRow[] | null>(null);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentCourseFilter, setEnrollmentCourseFilter] = useState<string>("All");
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<"All" | "Active" | "Completed">("All");

  const [sessionsRows, setSessionsRows] = useState<AdminSessionRow[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionStatusFilter, setSessionStatusFilter] = useState<string>("All");
  const [addPanelFor, setAddPanelFor] = useState<number | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string>("");
  const [poolBusy, setPoolBusy] = useState(false);

  // Revenue tab — lazy loaded on first open
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [transactions, setTransactions] = useState<RevenueTransaction[] | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [revenueStatusFilter, setRevenueStatusFilter] = useState<string>("All");

  // Announcements tab — full list (active + inactive + expired)
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | "new" | null>(null);
  const [annDraft, setAnnDraft] = useState<{
    title: string;
    message: string;
    type: "INFO" | "SUCCESS" | "WARNING";
    isActive: boolean;
    expiresAt: string;
  }>({ title: "", message: "", type: "INFO", isActive: true, expiresAt: "" });
  const [annBusy, setAnnBusy] = useState(false);

  // CSV export — track which export is in flight to disable its button.
  const [exportingKind, setExportingKind] = useState<string | null>(null);
  const beginCreateAnnouncement = () => {
    setEditingAnnouncementId("new");
    setAnnDraft({ title: "", message: "", type: "INFO", isActive: true, expiresAt: "" });
  };
  const beginEditAnnouncement = (a: Announcement) => {
    setEditingAnnouncementId(a.id);
    setAnnDraft({
      title: a.title,
      message: a.message,
      type: a.type,
      isActive: a.isActive,
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : "",
    });
  };
  const cancelAnnouncementEdit = () => {
    setEditingAnnouncementId(null);
  };
  const saveAnnouncement = async () => {
    if (!annDraft.title.trim() || !annDraft.message.trim()) {
      setActionMsg({ type: "error", text: "Title and message are required." });
      return;
    }
    setAnnBusy(true);
    try {
      const payload = {
        title: annDraft.title.trim(),
        message: annDraft.message.trim(),
        type: annDraft.type,
        isActive: annDraft.isActive,
        expiresAt: annDraft.expiresAt ? annDraft.expiresAt : null,
      };
      if (editingAnnouncementId === "new") {
        const created = await createAnnouncement(payload);
        setAnnouncements((prev) => [created, ...(prev ?? [])]);
        setActionMsg({ type: "success", text: "Announcement created." });
      } else if (typeof editingAnnouncementId === "number") {
        const updated = await updateAnnouncement(editingAnnouncementId, payload);
        setAnnouncements((prev) =>
          (prev ?? []).map((a) => (a.id === updated.id ? updated : a))
        );
        setActionMsg({ type: "success", text: "Announcement updated." });
      }
      setEditingAnnouncementId(null);
    } catch (err) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setAnnBusy(false);
    }
  };
  const removeAnnouncement = async (id: number) => {
    if (!confirm("Delete this announcement? Students who haven't dismissed it will stop seeing it.")) return;
    setAnnBusy(true);
    try {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => (prev ?? []).filter((a) => a.id !== id));
      setActionMsg({ type: "success", text: "Announcement deleted." });
    } catch (err) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setAnnBusy(false);
    }
  };

  const handleExport = async (kind: "users" | "enrollments" | "sessions" | "revenue") => {
    setExportingKind(kind);
    try {
      await downloadAdminCsv(kind);
      setActionMsg({ type: "success", text: `${kind[0].toUpperCase()}${kind.slice(1)} CSV downloaded.` });
    } catch (err) {
      setActionMsg({ type: "error", text: err instanceof Error ? err.message : "Export failed" });
    } finally {
      setExportingKind(null);
    }
  };

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

  // Lazy-load oversight tabs the first time their sidebar entry is opened
  useEffect(() => {
    if (activeTab === "Enrollments" && enrollmentsRows === null && !enrollmentsLoading) {
      setEnrollmentsLoading(true);
      getAdminEnrollments()
        .then((rows) => setEnrollmentsRows(rows ?? []))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load enrollments"))
        .finally(() => setEnrollmentsLoading(false));
    }
    if (activeTab === "Sessions" && sessionsRows === null && !sessionsLoading) {
      setSessionsLoading(true);
      getAdminSessions()
        .then((rows) => setSessionsRows(rows ?? []))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sessions"))
        .finally(() => setSessionsLoading(false));
    }
    if (activeTab === "Revenue" && revenue === null && !revenueLoading) {
      setRevenueLoading(true);
      getRevenueSummary()
        .then((data) => setRevenue(data))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load revenue"))
        .finally(() => setRevenueLoading(false));
    }
    if (activeTab === "Revenue" && transactions === null && !transactionsLoading) {
      setTransactionsLoading(true);
      getRevenueTransactions()
        .then((rows) => setTransactions(rows ?? []))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transactions"))
        .finally(() => setTransactionsLoading(false));
    }
    if (activeTab === "Announcements" && announcements === null && !announcementsLoading) {
      setAnnouncementsLoading(true);
      getAllAnnouncements()
        .then((rows) => setAnnouncements(rows ?? []))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load announcements"))
        .finally(() => setAnnouncementsLoading(false));
    }
  }, [activeTab, enrollmentsRows, enrollmentsLoading, sessionsRows, sessionsLoading, revenue, revenueLoading, transactions, transactionsLoading, announcements, announcementsLoading]);

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

  // Stats cards derived from analytics — extended set for full oversight.
  const statCards = analytics
    ? [
        { label: "Total Users", value: analytics.totalUsers.toLocaleString(), icon: Users },
        { label: "Courses", value: (analytics.totalCourses ?? 0).toLocaleString(), icon: BookOpen },
        { label: "Services", value: (analytics.totalServices ?? 0).toLocaleString(), icon: BookOpen },
        { label: "Enrollments", value: analytics.totalEnrollments.toLocaleString(), icon: CreditCard },
        { label: "Completions", value: (analytics.totalCompletions ?? 0).toLocaleString(), icon: GraduationCap },
        { label: "Certificates", value: (analytics.totalCertificates ?? 0).toLocaleString(), icon: UserCheck },
        { label: "Pending Sessions", value: (analytics.totalSessionsPending ?? 0).toLocaleString(), icon: Calendar },
        { label: "Active (7d)", value: (analytics.activeUsersLast7Days ?? 0).toLocaleString(), icon: Users },
      ]
    : [];

  const Spinner = () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[#0F766E]" size={32} />
    </div>
  );

  return (
    <div className="flex min-h-screen pt-20">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white/60 backdrop-blur-sm border-r border-white/40 px-4 py-8 shrink-0">
        <h2 className="font-[family-name:var(--font-playfair)] text-xl font-bold text-[#0F766E] px-3 mb-8">
          Admin
        </h2>
        <nav className="flex-1 space-y-1">
          {sidebarLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => setActiveTab(link.label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === link.label
                  ? "bg-[#0F766E] text-white"
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
              <h1 className="text-2xl font-bold text-[#0F766E] mb-6">
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
                        <div className="w-10 h-10 rounded-full bg-[#0F766E]/10 flex items-center justify-center">
                          <stat.icon size={18} className="text-[#0F766E]" />
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
              <h2 className="text-lg font-bold text-[#0F766E] mb-4">
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
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-[#0F766E]">All Users</h1>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400 hidden sm:block">Click any row to view full profile + activity</p>
                  <button
                    onClick={() => handleExport("users")}
                    disabled={exportingKind === "users"}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                  >
                    {exportingKind === "users" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Export CSV
                  </button>
                </div>
              </div>
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
                        <tr
                          key={user.id}
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                          className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-[#0F766E]/5 transition-colors"
                        >
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
                <h1 className="text-2xl font-bold text-[#0F766E]">Manage Courses</h1>
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
                            coursePage === i + 1 ? "bg-[#0F766E] text-white" : "border border-gray-200 hover:bg-gray-50"
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

          {/* ──────────── Enrollments Tab ──────────── */}
          {activeTab === "Enrollments" && (
            <>
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-[#0F766E]">All Enrollments</h1>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">
                    {enrollmentsRows ? `${enrollmentsRows.length} total` : ""}
                  </p>
                  <button
                    onClick={() => handleExport("enrollments")}
                    disabled={exportingKind === "enrollments"}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                  >
                    {exportingKind === "enrollments" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 text-sm">
                <select
                  value={enrollmentCourseFilter}
                  onChange={(e) => setEnrollmentCourseFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white"
                >
                  <option value="All">All courses & services</option>
                  {(enrollmentsRows ?? [])
                    .map((r) => r.courseTitle)
                    .filter((t, i, arr) => arr.indexOf(t) === i)
                    .sort()
                    .map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                </select>
                <select
                  value={enrollmentStatusFilter}
                  onChange={(e) => setEnrollmentStatusFilter(e.target.value as "All" | "Active" | "Completed")}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white"
                >
                  <option value="All">All statuses</option>
                  <option value="Active">Active (in progress)</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {enrollmentsLoading ? (
                <Spinner />
              ) : !enrollmentsRows || enrollmentsRows.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No enrollments yet.</p>
                </GlassCard>
              ) : (
                <GlassCard className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-3 font-medium">Student</th>
                        <th className="pb-3 font-medium">Course / Service</th>
                        <th className="pb-3 font-medium">Mentor</th>
                        <th className="pb-3 font-medium">Progress</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Enrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollmentsRows
                        .filter((r) => enrollmentCourseFilter === "All" || r.courseTitle === enrollmentCourseFilter)
                        .filter((r) => {
                          if (enrollmentStatusFilter === "All") return true;
                          if (enrollmentStatusFilter === "Completed") return r.completed;
                          return !r.completed;
                        })
                        .map((r) => (
                          <tr
                            key={r.enrollmentId}
                            onClick={() => router.push(`/admin/users/${r.userId}`)}
                            className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-[#0F766E]/5 transition-colors"
                          >
                            <td className="py-3">
                              <p className="font-medium text-[#1a1a1a]">{r.studentName}</p>
                              <p className="text-xs text-gray-400">{r.studentEmail}</p>
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full mr-2",
                                r.courseType === "SERVICE" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"
                              )}>
                                {r.courseType === "SERVICE" ? "Service" : "Course"}
                              </span>
                              {r.courseTitle}
                            </td>
                            <td className="py-3 text-gray-700">
                              {r.mentorName ?? (r.courseType === "SERVICE" ? "—" : <span className="text-amber-600 text-xs">{r.mentorAssignmentStatus ?? "Unassigned"}</span>)}
                            </td>
                            <td className="py-3 min-w-[160px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      r.completed ? "bg-emerald-500" : "bg-gradient-to-r from-[#0F766E] to-[#0D9488]"
                                    )}
                                    style={{ width: `${Math.max(0, Math.min(100, r.progressPercent))}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-700 tabular-nums w-10 text-right">
                                  {r.progressPercent}%
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5">{r.completedLessons}/{r.totalLessons} lessons</p>
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                r.completed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-gray-100 text-gray-600"
                              )}>
                                {r.completed ? "Completed" : "Active"}
                              </span>
                            </td>
                            <td className="py-3 text-xs text-gray-400">
                              {r.enrolledAt ? new Date(r.enrolledAt).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </GlassCard>
              )}
            </>
          )}

          {/* ──────────── Sessions Tab ──────────── */}
          {activeTab === "Sessions" && (
            <>
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-[#0F766E]">All Mentor Sessions</h1>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">
                    {sessionsRows ? `${sessionsRows.length} total` : ""}
                  </p>
                  <button
                    onClick={() => handleExport("sessions")}
                    disabled={exportingKind === "sessions"}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                  >
                    {exportingKind === "sessions" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-4 text-sm">
                <select
                  value={sessionStatusFilter}
                  onChange={(e) => setSessionStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white"
                >
                  <option value="All">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ACCEPTED">Accepted (scheduled)</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              {sessionsLoading ? (
                <Spinner />
              ) : !sessionsRows || sessionsRows.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No session requests yet.</p>
                </GlassCard>
              ) : (
                <GlassCard className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-3 font-medium">Student</th>
                        <th className="pb-3 font-medium">Mentor</th>
                        <th className="pb-3 font-medium">Course</th>
                        <th className="pb-3 font-medium">Topic</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">When</th>
                        <th className="pb-3 font-medium">Meeting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsRows
                        .filter((s) => sessionStatusFilter === "All" || s.status === sessionStatusFilter)
                        .map((s) => (
                          <tr key={s.sessionId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                            <td className="py-3">
                              <p className="font-medium text-[#1a1a1a]">{s.studentName ?? "—"}</p>
                              {s.studentEmail && <p className="text-xs text-gray-400">{s.studentEmail}</p>}
                            </td>
                            <td className="py-3 text-gray-700">{s.mentorName ?? <span className="text-amber-600 text-xs">Unassigned</span>}</td>
                            <td className="py-3 text-gray-700">{s.courseTitle ?? "—"}</td>
                            <td className="py-3 text-gray-600 max-w-[260px]">
                              <span className="line-clamp-2">{s.topic ?? "—"}</span>
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                s.status === "PENDING" && "bg-amber-100 text-amber-700",
                                s.status === "ACCEPTED" && "bg-teal-100 text-teal-700",
                                s.status === "COMPLETED" && "bg-emerald-100 text-emerald-700",
                                s.status === "CANCELLED" && "bg-gray-100 text-gray-500",
                              )}>
                                {s.status}
                              </span>
                            </td>
                            <td className="py-3 text-xs text-gray-500">
                              {s.scheduledAt
                                ? new Date(s.scheduledAt).toLocaleString(undefined, {
                                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                                  })
                                : s.requestedAt
                                  ? `Requested ${new Date(s.requestedAt).toLocaleDateString()}`
                                  : "—"}
                            </td>
                            <td className="py-3">
                              {s.meetingUrl ? (
                                <a
                                  href={s.meetingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline"
                                >
                                  <ExternalLink size={11} /> Open
                                </a>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </GlassCard>
              )}
            </>
          )}

          {/* ──────────── Revenue Tab ──────────── */}
          {activeTab === "Revenue" && (
            <>
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-[#0F766E]">Revenue & Payments</h1>
                <button
                  onClick={() => handleExport("revenue")}
                  disabled={exportingKind === "revenue"}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                >
                  {exportingKind === "revenue" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Export CSV
                </button>
              </div>

              {/* Action feedback (shared with mentor pools — appears here for export confirmations) */}
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

              {revenueLoading ? (
                <Spinner />
              ) : !revenue ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">No revenue data yet.</p>
                </GlassCard>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    <GlassCard>
                      <div className="w-10 h-10 rounded-full bg-[#0F766E]/10 flex items-center justify-center mb-3">
                        <IndianRupee size={18} className="text-[#0F766E]" />
                      </div>
                      <p className="text-2xl font-bold text-[#1a1a1a]">
                        ₹{Number(revenue.totalRevenue ?? 0).toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500">Total revenue (lifetime)</p>
                    </GlassCard>
                    <GlassCard>
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <TrendingUp size={18} className="text-emerald-600" />
                      </div>
                      <p className="text-2xl font-bold text-[#1a1a1a]">
                        ₹{Number(revenue.revenueThisMonth ?? 0).toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500">This month</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Last month: ₹{Number(revenue.revenueLastMonth ?? 0).toLocaleString("en-IN")}
                      </p>
                    </GlassCard>
                    <GlassCard>
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                        <CreditCard size={18} className="text-blue-600" />
                      </div>
                      <p className="text-2xl font-bold text-[#1a1a1a]">
                        {Number(revenue.totalTransactions ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">Completed transactions</p>
                    </GlassCard>
                    <GlassCard>
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                        <IndianRupee size={18} className="text-amber-600" />
                      </div>
                      <p className="text-2xl font-bold text-[#1a1a1a]">
                        ₹{Number(revenue.avgOrderValue ?? 0).toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500">Avg order value</p>
                    </GlassCard>
                  </div>

                  {/* Top courses by revenue */}
                  <h2 className="text-lg font-bold text-[#0F766E] mb-4">Top earners</h2>
                  {!revenue.topCoursesByRevenue || revenue.topCoursesByRevenue.length === 0 ? (
                    <GlassCard className="mb-10">
                      <p className="text-center text-gray-400 py-6">No paid enrollments yet.</p>
                    </GlassCard>
                  ) : (
                    <GlassCard className="mb-10 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="pb-3 font-medium">Course / Service</th>
                            <th className="pb-3 font-medium">Type</th>
                            <th className="pb-3 font-medium">Enrollments</th>
                            <th className="pb-3 font-medium text-right">Revenue (approx)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenue.topCoursesByRevenue.map((c) => (
                            <tr key={c.courseId} className="border-b border-gray-50 last:border-0">
                              <td className="py-3 font-medium text-[#1a1a1a]">{c.courseTitle}</td>
                              <td className="py-3">
                                <span className={cn(
                                  "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                  c.type === "SERVICE" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"
                                )}>
                                  {c.type === "SERVICE" ? "Service" : "Course"}
                                </span>
                              </td>
                              <td className="py-3 text-gray-700">{c.enrollments}</td>
                              <td className="py-3 text-right font-semibold text-[#0F766E] tabular-nums">
                                ₹{Number(c.revenue ?? 0).toLocaleString("en-IN")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-gray-400 mt-3 px-1">
                        Per-course revenue is derived from enrollments × course price (payments don&apos;t link directly to courses yet).
                      </p>
                    </GlassCard>
                  )}

                  {/* Transactions */}
                  <div className="flex items-center justify-between mb-4 gap-4">
                    <h2 className="text-lg font-bold text-[#0F766E]">Transactions</h2>
                    <select
                      value={revenueStatusFilter}
                      onChange={(e) => setRevenueStatusFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                    >
                      <option value="All">All statuses</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="PENDING">Pending</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>

                  {transactionsLoading ? (
                    <Spinner />
                  ) : !transactions || transactions.length === 0 ? (
                    <GlassCard>
                      <p className="text-center text-gray-400 py-8">No transactions yet.</p>
                    </GlassCard>
                  ) : (
                    <GlassCard className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="pb-3 font-medium">ID</th>
                            <th className="pb-3 font-medium">Student</th>
                            <th className="pb-3 font-medium">Amount</th>
                            <th className="pb-3 font-medium">Status</th>
                            <th className="pb-3 font-medium">Razorpay ID</th>
                            <th className="pb-3 font-medium">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions
                            .filter((t) => revenueStatusFilter === "All" || t.status === revenueStatusFilter)
                            .map((t) => (
                              <tr key={t.id} className="border-b border-gray-50 last:border-0">
                                <td className="py-3 text-gray-400">#{t.id}</td>
                                <td className="py-3">
                                  <p className="font-medium text-[#1a1a1a]">{t.studentName ?? "—"}</p>
                                  {t.studentEmail && <p className="text-xs text-gray-400">{t.studentEmail}</p>}
                                </td>
                                <td className="py-3 font-semibold text-[#1a1a1a] tabular-nums">
                                  ₹{Number(t.amount ?? 0).toLocaleString("en-IN")}
                                </td>
                                <td className="py-3">
                                  <span className={cn(
                                    "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                    t.status === "COMPLETED" && "bg-emerald-100 text-emerald-700",
                                    t.status === "PENDING" && "bg-amber-100 text-amber-700",
                                    t.status === "FAILED" && "bg-red-100 text-red-700",
                                  )}>
                                    {t.status ?? "—"}
                                  </span>
                                </td>
                                <td className="py-3 text-xs font-mono text-gray-500 max-w-[180px] truncate">
                                  {t.razorpayPaymentId ?? t.razorpayOrderId ?? "—"}
                                </td>
                                <td className="py-3 text-xs text-gray-500">
                                  {t.createdAt ? new Date(t.createdAt).toLocaleString(undefined, {
                                    month: "short", day: "numeric", year: "numeric",
                                    hour: "numeric", minute: "2-digit",
                                  }) : "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </GlassCard>
                  )}
                </>
              )}
            </>
          )}

          {/* ──────────── Announcements Tab ──────────── */}
          {activeTab === "Announcements" && (
            <>
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-[#0F766E]">Announcements</h1>
                <button
                  onClick={beginCreateAnnouncement}
                  disabled={editingAnnouncementId === "new"}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                >
                  <Plus size={12} /> New Announcement
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Active announcements appear at the top of every student dashboard. Students can dismiss them; setting <span className="font-mono text-xs">isActive=false</span> or an expiry hides them platform-wide.
              </p>

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

              {/* New / edit form */}
              {editingAnnouncementId !== null && (
                <GlassCard className="mb-6">
                  <h3 className="font-semibold text-[#0F766E] mb-3 text-sm">
                    {editingAnnouncementId === "new" ? "Create announcement" : `Edit announcement #${editingAnnouncementId}`}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Title</label>
                      <input
                        type="text"
                        value={annDraft.title}
                        onChange={(e) => setAnnDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="e.g., Scheduled maintenance Sunday 9pm IST"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Message</label>
                      <textarea
                        value={annDraft.message}
                        onChange={(e) => setAnnDraft((d) => ({ ...d, message: e.target.value }))}
                        rows={3}
                        placeholder="Body text shown under the title"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
                      />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Type</label>
                        <select
                          value={annDraft.type}
                          onChange={(e) => setAnnDraft((d) => ({ ...d, type: e.target.value as Announcement["type"] }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        >
                          <option value="INFO">Info (teal)</option>
                          <option value="SUCCESS">Success (green)</option>
                          <option value="WARNING">Warning (amber)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Expires (optional)</label>
                        <input
                          type="date"
                          value={annDraft.expiresAt}
                          onChange={(e) => setAnnDraft((d) => ({ ...d, expiresAt: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={annDraft.isActive}
                            onChange={(e) => setAnnDraft((d) => ({ ...d, isActive: e.target.checked }))}
                            className="w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#0F766E]"
                          />
                          Active (visible to students)
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={saveAnnouncement}
                        disabled={annBusy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
                      >
                        {annBusy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {editingAnnouncementId === "new" ? "Create" : "Save changes"}
                      </button>
                      <button
                        onClick={cancelAnnouncementEdit}
                        disabled={annBusy}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* List */}
              {announcementsLoading ? (
                <Spinner />
              ) : !announcements || announcements.length === 0 ? (
                <GlassCard>
                  <p className="text-center text-gray-400 py-8">
                    No announcements yet. Click <span className="font-semibold text-[#0F766E]">New Announcement</span> to broadcast one.
                  </p>
                </GlassCard>
              ) : (
                <div className="space-y-3">
                  {announcements.map((a) => {
                    const expired = a.expiresAt && new Date(a.expiresAt) < new Date();
                    return (
                      <GlassCard key={a.id}>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-gray-900">{a.title}</h3>
                              <span className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                a.type === "INFO" && "bg-teal-100 text-teal-700",
                                a.type === "SUCCESS" && "bg-emerald-100 text-emerald-700",
                                a.type === "WARNING" && "bg-amber-100 text-amber-700",
                              )}>
                                {a.type}
                              </span>
                              {a.isActive && !expired ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  LIVE
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                  {expired ? "EXPIRED" : "INACTIVE"}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{a.message}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                              <span>Created {new Date(a.createdAt).toLocaleDateString()}</span>
                              {a.createdByName && <span>by {a.createdByName}</span>}
                              {a.expiresAt && (
                                <span>Expires {new Date(a.expiresAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => beginEditAnnouncement(a)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
                            >
                              <Edit3 size={12} /> Edit
                            </button>
                            <button
                              onClick={() => removeAnnouncement(a.id)}
                              disabled={annBusy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition cursor-pointer"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ──────────── Mentor Pools Tab ──────────── */}
          {activeTab === "Mentor Pools" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-[#0F766E]">Mentor Pools</h1>
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
                            <ChevronDown size={18} className="text-[#0F766E] shrink-0" />
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
                                <Loader2 size={20} className="animate-spin text-[#14B8A6]" />
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
                                          <div className="w-8 h-8 rounded-full bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center text-xs font-bold shrink-0">
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
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#0F766E] bg-[#0F766E]/10 hover:bg-[#0F766E]/15 transition"
                                    >
                                      <UserPlus size={12} /> Add Mentor
                                    </button>
                                  ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                      {loadingUsers ? (
                                        <Loader2 size={14} className="animate-spin text-[#14B8A6]" />
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
                                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition inline-flex items-center gap-1"
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
              <h1 className="text-2xl font-bold text-[#0F766E] mb-6">
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
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen pt-24"><Loader2 className="animate-spin text-[#0F766E]" size={32} /></div>}>
      <AdminContent />
    </Suspense>
  );
}
