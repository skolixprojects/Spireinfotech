"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getCourse, getCourseLessons, getCourseAssignments, enroll,
  checkCertificate, generateCertificate, getCourseModules,
  getMyMentorForCourse, getCourseProgress, getEnrollments,
  listCourseQuizzes, getMySessions,
  type CourseProgress, type Quiz,
} from "@/lib/api";
import { friendlyEnrollmentError } from "@/lib/utils";
import type { MentorInfo, SessionRequest } from "@/lib/types";
import { ContactSalesModal } from "@/components/sales/ContactSalesModal";
import { RequestSessionModal } from "@/components/mentorship/RequestSessionModal";
import ProfileGateModal from "@/components/dashboard/ProfileGateModal";
import {
  CourseSalesView,
  type SalesCourseData, type SalesModule, type SalesLesson,
} from "@/components/courses/views/CourseSalesView";
import {
  CourseLearningView,
  type LearningCourseData, type LearningModule, type LearningLesson,
  type LearningAssignment,
} from "@/components/courses/views/CourseLearningView";

// Wire-level shapes mirroring the backend DTOs. Kept here (rather
// than imported from @/lib/types) because the orchestrator holds the
// authoritative cross-cutting view of the data.
interface CourseData {
  id: number;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  level: string;
  price: number;
  isFree: boolean;
  durationHours: number;
  category: string;
  rating: number;
  ratingsCount: number;
  lessonsCount: number;
  enrolledCount: number;
  thumbnailUrl: string | null;
  isPublished: boolean;
  tags?: string | null;
  type?: string;
  instructor: {
    id: number;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    bio?: string | null;
  } | null;
}

interface LessonData {
  id: number;
  courseId: number;
  title: string;
  description: string | null;
  videoUrl: string | null;
  orderIndex: number;
  durationMinutes: number | null;
  isFree: boolean;
}

interface ModuleData {
  id: number;
  courseId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons: LessonData[];
}

/**
 * /courses/{id} — orchestrator.
 *
 * Routes the viewer to one of two views based on access:
 *   - canManage (course owner or admin)   → CourseLearningView (supervisorMode)
 *   - enrolled student                    → CourseLearningView
 *   - anyone else (anon or non-enrolled)  → CourseSalesView
 *
 * Service-type courses redirect to /services/{id}; lesson playback
 * happens at /learn/{courseId}/{lessonId} (a different route entirely).
 *
 * Inline instructor CRUD (add/delete lesson/module forms) lives at
 * /instructor/courses/{id}/content — this page is read-only.
 */
export default function CourseDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // Phase 1C strict gate — logged-in participants with an incomplete
  // profile cannot view course detail. Staff and anonymous visitors
  // fall through (anonymous lands on the sales view; staff see the
  // supervisor view). isStaff mirrors /courses page.
  const role = user?.role?.toUpperCase() ?? "";
  const isStaff = role === "ADMIN" || role === "INSTRUCTOR"
    || role === "TRAINER" || role === "SYSTEM_ADMIN"
    || role === "OPERATIONS_ADMIN" || role === "ERM"
    || role === "FINANCE";
  useEffect(() => {
    if (user && !isStaff && user.profileComplete === false) {
      router.replace("/dashboard?tab=complete-profile");
    }
  }, [user, isStaff, router]);

  // ── Data state ─────────────────────────────────────────────────
  const [course, setCourse] = useState<CourseData | null>(null);
  const [lessons, setLessons] = useState<LessonData[]>([]);
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [mentor, setMentor] = useState<MentorInfo | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessions, setSessions] = useState<SessionRequest[]>([]);
  const [assignments, setAssignments] = useState<LearningAssignment[]>([]);
  const [certificate, setCertificate] = useState<{ exists: boolean; certificateUrl?: string } | null>(null);

  // ── UI state ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState("");
  // Phase 1C — pop the profile-completion gate modal whenever an
  // incomplete-profile user tries to enroll.
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [generatingCert, setGeneratingCert] = useState(false);
  const [certError, setCertError] = useState("");
  const [showContactSales, setShowContactSales] = useState(false);
  const [showMentorModal, setShowMentorModal] = useState(false);

  const isOwner = !!(user && course?.instructor?.id === user.id);
  const isAdmin = user?.role?.toUpperCase() === "ADMIN";
  const canManage = isOwner || isAdmin;

  // Load everything on mount. Anything gated server-side (assignments,
  // mentor, certificate, progress) is fired in parallel and tolerates
  // 401/403 without blocking the page.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const courseData = await getCourse(id) as CourseData;
        if (cancelled) return;

        // Service-type courses live at a different route.
        if (courseData?.type === "SERVICE") {
          router.replace(`/services/${id}`);
          return;
        }
        setCourse(courseData);

        const [lessonData, moduleData] = await Promise.all([
          getCourseLessons(id) as Promise<LessonData[]>,
          getCourseModules(id) as Promise<ModuleData[]>,
        ]);
        if (cancelled) return;
        setLessons(lessonData ?? []);
        setModules(moduleData ?? []);

        // Authoritative enrollment check. The earlier heuristic
        // (success of /assignments) was too lenient because that
        // endpoint returns 200 + empty list for non-enrolled users.
        let isEnrolled = false;
        try {
          const myEnrollments = await getEnrollments() as Array<{ id: number }>;
          isEnrolled = (myEnrollments ?? []).some((c) => c.id === Number(id));
        } catch {
          // Anonymous → leave isEnrolled false. The login redirect
          // happens in handleEnroll if they click a protected action.
        }
        if (cancelled) return;
        setEnrolled(isEnrolled);

        // Supervisor (admin or course owner) sees the learning view
        // even without enrolling — fetch the same gated data so the
        // page mirrors what students see, minus mentor / cert / sessions.
        const wantsLearningData = isEnrolled || courseData.instructor?.id === user?.id
          || user?.role?.toUpperCase() === "ADMIN";

        if (wantsLearningData) {
          const [a, m, c, p, qs, ss] = await Promise.allSettled([
            getCourseAssignments(id) as Promise<LearningAssignment[]>,
            getMyMentorForCourse(id),
            checkCertificate(id),
            getCourseProgress(id),
            listCourseQuizzes(Number(id)),
            getMySessions(),
          ]);
          if (cancelled) return;
          if (a.status === "fulfilled") setAssignments((a.value ?? []) as LearningAssignment[]);
          if (m.status === "fulfilled") setMentor(m.value);
          if (c.status === "fulfilled") setCertificate(c.value);
          if (p.status === "fulfilled") setProgress(p.value);
          if (qs.status === "fulfilled") setQuizzes(qs.value ?? []);
          if (ss.status === "fulfilled") setSessions(ss.value ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load course");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [id, router, user?.id, user?.role]);

  // ── Handlers ───────────────────────────────────────────────────

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/courses/${id}`);
      return;
    }
    // Phase 1C gate — incomplete profile pops the modal instead of
    // hitting the backend. The backend ships the same 403 if we get
    // through anyway (race against the auth context), and the catch
    // below also pops the modal in that case.
    if (user && user.profileComplete === false) {
      setShowProfileGate(true);
      return;
    }
    setEnrolling(true);
    setEnrollMsg("");
    try {
      await enroll(Number(id));
      setEnrollMsg("Enrolled successfully!");
      setEnrolled(true);
      // Refetch everything that's now visible.
      const [m, p, a, qs] = await Promise.allSettled([
        getMyMentorForCourse(id),
        getCourseProgress(id),
        getCourseAssignments(id) as Promise<LearningAssignment[]>,
        listCourseQuizzes(Number(id)),
      ]);
      if (m.status === "fulfilled") setMentor(m.value);
      if (p.status === "fulfilled") setProgress(p.value);
      if (a.status === "fulfilled") setAssignments((a.value ?? []) as LearningAssignment[]);
      if (qs.status === "fulfilled") setQuizzes(qs.value ?? []);
    } catch (err) {
      // Phase 1C — backend ships 403 PROFILE_INCOMPLETE if the gate
      // wasn't caught client-side. Pop the same modal.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("PROFILE_INCOMPLETE")) {
        setShowProfileGate(true);
        return;
      }
      const msg = friendlyEnrollmentError(err);
      setEnrollMsg(msg);
      if (msg.startsWith("You're already enrolled")) {
        setEnrolled(true);
        try { setMentor(await getMyMentorForCourse(id)); } catch {}
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleContactSales = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/courses/${id}`);
      return;
    }
    setShowContactSales(true);
  };

  const handleOpenLesson = (lessonId: number) => {
    router.push(`/learn/${id}/${lessonId}`);
  };

  const handleContinueLearning = () => {
    // Find the first uncompleted lesson and jump straight to the player.
    if (progress) {
      for (const m of progress.modules) {
        for (const l of m.lessons) {
          if (!l.completed) {
            router.push(`/learn/${id}/${l.lessonId}`);
            return;
          }
        }
      }
      for (const l of progress.orphanLessons) {
        if (!l.completed) {
          router.push(`/learn/${id}/${l.lessonId}`);
          return;
        }
      }
    }
    // Fallback: first lesson in the course (covers supervisor-mode and
    // fully-completed courses where they want to revisit).
    const first = modules[0]?.lessons[0]?.id ?? lessons[0]?.id;
    if (first != null) router.push(`/learn/${id}/${first}`);
  };

  const handleGenerateCertificate = async () => {
    setGeneratingCert(true);
    setCertError("");
    try {
      const result = await generateCertificate(id);
      setCertificate({ exists: true, certificateUrl: result.certificateUrl });
    } catch (err) {
      setCertError(err instanceof Error ? err.message : "Not eligible yet");
    } finally {
      setGeneratingCert(false);
    }
  };

  // ── Loading / error ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-24">
        <Loader2 className="animate-spin text-teal-600" size={32} />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-24 px-6">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <p className="text-gray-700 mb-4">{error || "Course not found"}</p>
        <Link href="/courses" className="text-teal-600 hover:underline">
          Back to courses
        </Link>
      </div>
    );
  }

  // ── View routing ───────────────────────────────────────────────

  // Lessons not nested in any module → "Other lessons" pile.
  const lessonIdsInModules = new Set(modules.flatMap((m) => m.lessons.map((l) => l.id)));
  const orphanLessons = lessons.filter((l) => !lessonIdsInModules.has(l.id));

  // Sessions tied to this course, scoped via mentor.enrollmentId.
  // (getMySessions returns sessions across all courses for the user.)
  const courseSessions = mentor
    ? sessions.filter((s) => s.enrollmentId === mentor.enrollmentId)
    : [];

  if (enrolled || canManage) {
    const learningCourse: LearningCourseData = {
      id: course.id,
      title: course.title,
      level: course.level,
    };
    const learningModules: LearningModule[] = modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      orderIndex: m.orderIndex,
      lessons: m.lessons.map(toLearningLesson),
    }));
    const learningOrphans: LearningLesson[] = orphanLessons.map(toLearningLesson);

    return (
      <>
        <CourseLearningView
          course={learningCourse}
          modules={learningModules}
          orphanLessons={learningOrphans}
          progress={progress}
          mentor={mentor}
          quizzes={quizzes}
          sessions={courseSessions}
          assignments={assignments}
          certificate={certificate}
          generatingCert={generatingCert}
          certError={certError}
          supervisorMode={canManage && !enrolled}
          onContinueLearning={handleContinueLearning}
          onOpenLesson={handleOpenLesson}
          onRequestSession={() => setShowMentorModal(true)}
          onGenerateCertificate={handleGenerateCertificate}
        />
        {mentor && (
          <RequestSessionModal
            enrollmentId={mentor.enrollmentId}
            isOpen={showMentorModal}
            onClose={() => setShowMentorModal(false)}
            onSuccess={async () => {
              try {
                const fresh = await getMySessions();
                setSessions(fresh ?? []);
              } catch {}
            }}
          />
        )}
      </>
    );
  }

  const salesCourse: SalesCourseData = {
    id: course.id,
    title: course.title,
    description: course.description,
    shortDescription: course.shortDescription,
    level: course.level,
    price: course.price,
    isFree: course.isFree,
    category: course.category,
    enrolledCount: course.enrolledCount,
    tags: course.tags ?? null,
    instructor: course.instructor,
  };
  const salesModules: SalesModule[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    orderIndex: m.orderIndex,
    lessons: m.lessons.map(toSalesLesson),
  }));
  const salesOrphans: SalesLesson[] = orphanLessons.map(toSalesLesson);

  return (
    <>
      <CourseSalesView
        course={salesCourse}
        modules={salesModules}
        orphanLessons={salesOrphans}
        enrolling={enrolling}
        enrollMsg={enrollMsg}
        onEnroll={handleEnroll}
        onContactSales={handleContactSales}
      />
      <ContactSalesModal
        isOpen={showContactSales}
        onClose={() => setShowContactSales(false)}
        courseId={course.id}
        courseTitle={course.title}
        listedPrice={course.price}
      />
      <ProfileGateModal
        open={showProfileGate}
        onClose={() => setShowProfileGate(false)}
      />
    </>
  );
}

// ─── Adapters ─────────────────────────────────────────────────────

function toSalesLesson(l: LessonData): SalesLesson {
  return { id: l.id, title: l.title, durationMinutes: l.durationMinutes };
}

function toLearningLesson(l: LessonData): LearningLesson {
  return {
    id: l.id,
    title: l.title,
    durationMinutes: l.durationMinutes,
    isFree: l.isFree,
  };
}
