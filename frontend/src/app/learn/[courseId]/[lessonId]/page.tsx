"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Menu, ArrowLeft, ArrowRight, CheckCircle, Play, Circle,
  Loader2, MessageCircle, GraduationCap,
} from "lucide-react";
import {
  getCourse, getCourseProgress, getCourseLessons, getMyMentorForCourse,
  completeLesson, saveLessonPosition,
  type CourseProgress, type LessonProgress as LessonProgressDTO,
} from "@/lib/api";
import type { MentorInfo } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { RequestSessionModal } from "@/components/mentorship/RequestSessionModal";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CourseHeader {
  id: number;
  title: string;
}

interface LessonRow {
  id: number;
  title: string;
  description: string | null;
  videoUrl: string | null;
  orderIndex: number;
  durationMinutes: number | null;
  isFree: boolean;
}

interface FlatLesson {
  lessonId: number;
  title: string;
  moduleTitle: string | null;
  completed: boolean;
  videoPositionSec: number;
}

export default function LearnPage({
  params,
}: {
  params: { courseId: string; lessonId: string };
}) {
  const courseIdNum = Number(params.courseId);
  const lessonIdNum = Number(params.lessonId);
  const router = useRouter();
  const { toast } = useToast();

  const [course, setCourse] = useState<CourseHeader | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [mentor, setMentor] = useState<MentorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const positionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load everything in parallel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      getCourse(params.courseId).catch(() => null),
      getCourseProgress(params.courseId).catch((err) => {
        // 401/403 → not enrolled. Bounce them out.
        throw err;
      }),
      getCourseLessons(params.courseId).catch(() => []),
      getMyMentorForCourse(params.courseId).catch(() => null),
    ])
      .then(([c, p, l, m]) => {
        if (cancelled) return;
        setCourse((c as CourseHeader | null));
        setProgress(p as CourseProgress);
        setLessons((l as LessonRow[]) ?? []);
        setMentor(m as MentorInfo | null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [params.courseId]);

  // Flat ordered list of lessons across modules + orphans, with completion + position.
  const flat: FlatLesson[] = useMemo(() => {
    if (!progress) return [];
    const out: FlatLesson[] = [];
    progress.modules.forEach((m) => {
      m.lessons.forEach((l) => {
        out.push({
          lessonId: l.lessonId,
          title: l.title,
          moduleTitle: m.moduleTitle,
          completed: l.completed,
          videoPositionSec: l.videoPositionSec ?? 0,
        });
      });
    });
    progress.orphanLessons.forEach((l: LessonProgressDTO) => {
      out.push({
        lessonId: l.lessonId,
        title: l.title,
        moduleTitle: null,
        completed: l.completed,
        videoPositionSec: l.videoPositionSec ?? 0,
      });
    });
    return out;
  }, [progress]);

  const currentIdx = flat.findIndex((l) => l.lessonId === lessonIdNum);
  const currentLesson = currentIdx >= 0 ? flat[currentIdx] : null;
  const prevLesson = currentIdx > 0 ? flat[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < flat.length - 1
    ? flat[currentIdx + 1] : null;

  // Lesson row from getCourseLessons (has videoUrl).
  const currentLessonRow = lessons.find((l) => l.id === lessonIdNum) ?? null;

  // ── Resume seek & periodic position save ──────────────────────────
  // Seek to saved position once metadata is loaded. Keep it idempotent.
  const seekedRef = useRef(false);
  useEffect(() => {
    seekedRef.current = false;
  }, [lessonIdNum]);
  const handleLoadedMetadata = () => {
    if (seekedRef.current || !videoRef.current || !currentLesson) return;
    const pos = currentLesson.videoPositionSec;
    if (pos > 5 && pos < (videoRef.current.duration || Infinity) - 5) {
      videoRef.current.currentTime = pos;
    }
    seekedRef.current = true;
  };

  // Throttle saves: ~5s after the last timeupdate.
  const handleTimeUpdate = () => {
    if (!videoRef.current || !currentLesson) return;
    const t = videoRef.current.currentTime;
    if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
    positionSaveTimer.current = setTimeout(() => {
      saveLessonPosition(courseIdNum, currentLesson.lessonId, t).catch(() => {});
    }, 5000);
  };

  // Save on unmount/navigation too.
  useEffect(() => {
    return () => {
      if (videoRef.current && currentLesson) {
        const t = videoRef.current.currentTime;
        saveLessonPosition(courseIdNum, currentLesson.lessonId, t).catch(() => {});
      }
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonIdNum]);

  // ── Mark complete ────────────────────────────────────────────────
  const refetchProgress = async () => {
    try {
      const p = await getCourseProgress(params.courseId);
      setProgress(p);
    } catch {}
  };

  const handleMarkComplete = async (autoAdvance = false) => {
    if (!currentLesson || marking) return;
    setMarking(true);
    try {
      await completeLesson(currentLesson.lessonId);
      await refetchProgress();
      toast("success", "Lesson marked complete");
      if (autoAdvance && nextLesson) {
        router.push(`/learn/${courseIdNum}/${nextLesson.lessonId}`);
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to mark complete");
    } finally {
      setMarking(false);
    }
  };

  const handleVideoEnded = async () => {
    if (currentLesson && !currentLesson.completed) {
      await handleMarkComplete(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="animate-spin text-white/60" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white px-6">
        <p className="mb-4">{error}</p>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-full bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-gray-950/95 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="font-serif text-xl font-bold text-white shrink-0"
          >
            {APP_NAME}
          </Link>
          <span className="text-white/30 mx-1">/</span>
          <p className="text-sm text-white/80 truncate">{course?.title ?? "Course"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-white/80"
            aria-label="Open lessons"
          >
            <Menu size={18} />
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium border border-white/15 text-white/80 hover:bg-white/10 transition"
          >
            <X size={14} /> Exit
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* LEFT — video + content (~70%) */}
        <main className="flex-1 lg:w-[70%] p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Video */}
          <div className="rounded-xl overflow-hidden bg-black aspect-video mb-5">
            {currentLessonRow?.videoUrl ? (
              <video
                key={currentLessonRow.id}
                ref={videoRef}
                src={currentLessonRow.videoUrl}
                controls
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                className="w-full h-full"
                playsInline
                autoPlay
              >
                <track kind="captions" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
                <Play size={32} className="mb-2" />
                <p className="text-sm">No video for this lesson yet.</p>
              </div>
            )}
          </div>

          {/* Lesson title + module crumb */}
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white">
            {currentLesson?.title ?? "Lesson"}
          </h1>
          {currentLesson?.moduleTitle && (
            <p className="text-sm text-white/60 mt-1">{currentLesson.moduleTitle}</p>
          )}

          {/* Action row */}
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
            {prevLesson ? (
              <Link
                href={`/learn/${courseIdNum}/${prevLesson.lessonId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border border-white/15 text-white/80 hover:bg-white/10 transition"
              >
                <ArrowLeft size={14} /> Previous
              </Link>
            ) : (
              <span className="hidden sm:inline-block w-px" />
            )}

            {!currentLesson?.completed ? (
              <button
                onClick={() => handleMarkComplete(true)}
                disabled={marking}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold disabled:opacity-50 transition shadow"
              >
                {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Mark Complete
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-teal-500/20 text-teal-300 text-sm font-semibold">
                <CheckCircle size={14} /> Completed
              </span>
            )}

            {nextLesson && (
              <Link
                href={`/learn/${courseIdNum}/${nextLesson.lessonId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border border-white/15 text-white/80 hover:bg-white/10 transition sm:ml-auto"
              >
                Next <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {/* Description */}
          {currentLessonRow?.description && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-2">
                Lesson Description
              </h2>
              <p className="text-white/85 leading-relaxed whitespace-pre-wrap">
                {currentLessonRow.description}
              </p>
            </section>
          )}
        </main>

        {/* RIGHT — sidebar (desktop) */}
        <aside className="hidden lg:flex lg:flex-col lg:w-[30%] lg:max-w-[420px] border-l border-white/10 bg-gray-900/60">
          <SidebarContent
            course={course}
            progress={progress}
            currentLessonId={lessonIdNum}
            courseId={courseIdNum}
            mentor={mentor}
            onRequestSession={() => setSessionModalOpen(true)}
          />
        </aside>
      </div>

      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="absolute inset-y-0 right-0 w-[85%] max-w-[400px] bg-gray-900 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <p className="text-sm font-semibold text-white">Course Content</p>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70"
                  aria-label="Close sidebar"
                >
                  <X size={18} />
                </button>
              </div>
              <SidebarContent
                course={course}
                progress={progress}
                currentLessonId={lessonIdNum}
                courseId={courseIdNum}
                mentor={mentor}
                onRequestSession={() => {
                  setSidebarOpen(false);
                  setSessionModalOpen(true);
                }}
                onLessonClick={() => setSidebarOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Request-session modal */}
      {mentor && (
        <RequestSessionModal
          enrollmentId={mentor.enrollmentId}
          isOpen={sessionModalOpen}
          onClose={() => setSessionModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Sidebar content (shared between desktop sticky panel + mobile drawer) ──

function SidebarContent({
  course,
  progress,
  currentLessonId,
  courseId,
  mentor,
  onRequestSession,
  onLessonClick,
}: {
  course: CourseHeader | null;
  progress: CourseProgress | null;
  currentLessonId: number;
  courseId: number;
  mentor: MentorInfo | null;
  onRequestSession: () => void;
  onLessonClick?: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Course header + overall progress */}
      <div className="px-5 py-4 border-b border-white/10">
        <p className="text-sm font-semibold text-white truncate">
          {course?.title ?? "Course"}
        </p>
        {progress && progress.totalLessons > 0 && (
          <>
            <div className="flex items-center justify-between mt-2 mb-1.5">
              <span className="text-[11px] text-white/60">
                {progress.completedLessons}/{progress.totalLessons} lessons
              </span>
              <span className="text-[11px] font-semibold text-teal-300 tabular-nums">
                {progress.progressPercent}%
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-cyan-300 transition-all"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Modules */}
      <div className="flex-1 px-3 py-3 space-y-4">
        {progress?.modules.map((m) => {
          const moduleDone = m.totalLessons > 0 && m.completedLessons >= m.totalLessons;
          return (
            <div key={m.moduleId}>
              <div className="px-2 mb-2 flex items-center gap-2">
                {moduleDone && <CheckCircle size={12} className="text-teal-400 shrink-0" />}
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 truncate">
                  {m.moduleTitle}
                </p>
                <span className="text-[10px] text-white/40 ml-auto whitespace-nowrap">
                  {m.completedLessons}/{m.totalLessons}
                </span>
              </div>
              <ul className="space-y-0.5">
                {m.lessons.map((l) => (
                  <SidebarLessonRow
                    key={l.lessonId}
                    courseId={courseId}
                    lessonId={l.lessonId}
                    title={l.title}
                    completed={l.completed}
                    isCurrent={l.lessonId === currentLessonId}
                    onClick={onLessonClick}
                  />
                ))}
              </ul>
            </div>
          );
        })}

        {progress && progress.orphanLessons.length > 0 && (
          <div>
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Other Lessons
            </p>
            <ul className="space-y-0.5">
              {progress.orphanLessons.map((l) => (
                <SidebarLessonRow
                  key={l.lessonId}
                  courseId={courseId}
                  lessonId={l.lessonId}
                  title={l.title}
                  completed={l.completed}
                  isCurrent={l.lessonId === currentLessonId}
                  onClick={onLessonClick}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Mentor card pinned at the bottom */}
      <div className="px-5 py-4 border-t border-white/10 bg-gray-950/40">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap size={14} className="text-teal-400" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
            Your Mentor
          </p>
        </div>
        {mentor && mentor.mentorName ? (
          <>
            <p className="text-sm font-semibold text-white truncate">
              {mentor.mentorName}
            </p>
            {mentor.mentorEmail && (
              <p className="text-xs text-white/50 truncate mb-3">{mentor.mentorEmail}</p>
            )}
            <button
              onClick={onRequestSession}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold transition"
            >
              <MessageCircle size={12} /> Request a Session
            </button>
          </>
        ) : mentor ? (
          <p className="text-xs text-white/60">
            Mentor assignment in progress — check back shortly.
          </p>
        ) : (
          <p className="text-xs text-white/60">
            No mentor for this content (services don&apos;t include mentorship).
          </p>
        )}
      </div>
    </div>
  );
}

function SidebarLessonRow({
  courseId,
  lessonId,
  title,
  completed,
  isCurrent,
  onClick,
}: {
  courseId: number;
  lessonId: number;
  title: string;
  completed: boolean;
  isCurrent: boolean;
  onClick?: () => void;
}) {
  const Icon = completed ? CheckCircle : isCurrent ? Play : Circle;
  return (
    <li>
      <Link
        href={`/learn/${courseId}/${lessonId}`}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition",
          isCurrent
            ? "bg-teal-500/15 text-white border-l-2 border-teal-400 pl-1.5"
            : completed
              ? "text-white/65 hover:text-white hover:bg-white/5"
              : "text-white/85 hover:text-white hover:bg-white/5"
        )}
      >
        <Icon
          size={14}
          className={cn(
            "shrink-0",
            completed ? "text-teal-400" : isCurrent ? "text-teal-300" : "text-white/40"
          )}
        />
        <span className="truncate">{title}</span>
      </Link>
    </li>
  );
}
