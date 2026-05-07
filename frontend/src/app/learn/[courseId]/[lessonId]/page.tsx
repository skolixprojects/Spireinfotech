"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Menu, Search, Settings as SettingsIcon, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, ChevronDown, Check, Play,
  Loader2, GraduationCap, FileQuestion, Brain,
  Keyboard, Sparkles, ArrowRight, Trophy, Folder, Download, Share2,
  PartyPopper,
} from "lucide-react";
import {
  getCourse, getCourseProgress, getCourseLessons, getMyMentorForCourse,
  completeLesson, saveLessonPosition, listCourseQuizzes, checkCertificate,
  type CourseProgress, type LessonProgress as LessonProgressDTO,
  type Quiz, type CertificateCheck,
} from "@/lib/api";
import type { MentorInfo } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { RequestSessionModal } from "@/components/mentorship/RequestSessionModal";
import { cn } from "@/lib/utils";
import SecureVideoPlayer from "@/components/player/SecureVideoPlayer";
import { useAuth } from "@/lib/auth-context";

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

const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

/**
 * Cisco-inspired full-screen course player.
 *
 * Three regions stacked top-to-bottom: a 48px dark top bar, a 280px
 * collapsible sidebar with module/lesson outline, and a main content
 * area that holds the breadcrumb, video player, and lesson info. The
 * page itself is `h-screen overflow-hidden` so only the inner panels
 * scroll — no chrome fights for vertical space.
 *
 * The global Navbar is suppressed for /learn/* by ShellWrapper, so
 * this page owns its own top bar.
 */
export default function LearnPage({
  params,
}: {
  params: { courseId: string; lessonId: string };
}) {
  const courseIdNum = Number(params.courseId);
  const lessonIdNum = Number(params.lessonId);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [course, setCourse] = useState<CourseHeader | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [mentor, setMentor] = useState<MentorInfo | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"outline" | "resources">("outline");
  const [outlineSearch, setOutlineSearch] = useState("");
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [pageFullscreen, setPageFullscreen] = useState(false);
  // Course-completion celebration: surfaced once per session when the
  // student transitions from <100% → 100% complete. Cert may or may
  // not be ready (auto-gen can be blocked by pending quizzes); the
  // modal handles both states.
  const [celebrationCert, setCelebrationCert] = useState<CertificateCheck | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Refs
  const positionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const celebrationFiredRef = useRef(false);

  // ── Data load ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      getCourse(params.courseId).catch(() => null),
      getCourseProgress(params.courseId), // 401/403 → not enrolled, throws
      getCourseLessons(params.courseId).catch(() => []),
      getMyMentorForCourse(params.courseId).catch(() => null),
      listCourseQuizzes(courseIdNum).catch(() => []),
    ])
      .then(([c, p, l, m, q]) => {
        if (cancelled) return;
        setCourse(c as CourseHeader | null);
        setProgress(p as CourseProgress);
        setLessons((l as LessonRow[]) ?? []);
        setMentor(m as MentorInfo | null);
        setQuizzes((q as Quiz[]) ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // courseIdNum is derived from params.courseId, no extra dep.
  }, [params.courseId, courseIdNum]);

  // Flat ordered list of lessons with completion + position.
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
  const currentLessonRow = lessons.find((l) => l.id === lessonIdNum) ?? null;

  // Quizzes scoped to this lesson (rendered in main content) and
  // grouped by module (rendered in sidebar at end of each module).
  const lessonQuizzes = quizzes.filter((q) => q.lessonId === lessonIdNum);
  const quizzesByModule = useMemo(() => {
    const map = new Map<number, Quiz[]>();
    quizzes.forEach((q) => {
      if (q.moduleId == null) return;
      const list = map.get(q.moduleId) ?? [];
      list.push(q);
      map.set(q.moduleId, list);
    });
    return map;
  }, [quizzes]);

  // ── Cleanup throttle on lesson change ────────────────────────────
  useEffect(() => {
    return () => {
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
    };
  }, [lessonIdNum]);

  // ── Page-level right-click / DevTools shortcut hardening ─────────
  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && ["s", "S", "p", "P", "u", "U"].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === "F12") e.preventDefault();
      if (ctrl && e.shiftKey && ["I", "i", "J", "j"].includes(e.key)) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // ── Body overflow lock — page itself never scrolls ───────────────
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // ── Mark complete (no uncomplete API — once true, stays true) ────
  const refetchProgress = useCallback(async () => {
    try {
      const p = await getCourseProgress(params.courseId);
      setProgress(p);
    } catch {}
  }, [params.courseId]);

  const handleMarkComplete = useCallback(async (autoAdvance = false) => {
    if (!currentLesson || marking || currentLesson.completed) return;
    setMarking(true);
    try {
      await completeLesson(currentLesson.lessonId);
      await refetchProgress();
      toast("success", "Lesson marked complete");

      // Re-read progress directly to detect course completion (the
      // setProgress in refetch is async — the local var is fresh).
      // The backend has already attempted auto-cert-gen at this point,
      // so checkCertificate may return the freshly-issued cert.
      try {
        const p = await getCourseProgress(params.courseId);
        setProgress(p);
        if (
          !celebrationFiredRef.current &&
          p.totalLessons > 0 &&
          p.completedLessons >= p.totalLessons
        ) {
          celebrationFiredRef.current = true;
          // Small delay so the backend's auto-gen transaction commits
          // before we ask for the certificate. 500ms is plenty given
          // we're on the same DB.
          setTimeout(async () => {
            try {
              const cert = await checkCertificate(courseIdNum);
              setCelebrationCert(cert);
            } catch {
              setCelebrationCert({ exists: false });
            }
            setShowCelebration(true);
          }, 500);
        }
      } catch {}

      if (autoAdvance && nextLesson) {
        router.push(`/learn/${courseIdNum}/${nextLesson.lessonId}`);
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to mark complete");
    } finally {
      setMarking(false);
    }
  }, [currentLesson, marking, nextLesson, courseIdNum, router, refetchProgress, toast, params.courseId]);

  const handleVideoEnded = useCallback(async () => {
    if (currentLesson && !currentLesson.completed) {
      await handleMarkComplete(false);
    }
  }, [currentLesson, handleMarkComplete]);

  // ── Page-level fullscreen toggle (entire player, not just video) ─
  const togglePageFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setPageFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Playback speed control via direct <video> access ─────────────
  // SecureVideoPlayer doesn't expose a speed prop, so we query its
  // inner <video> element (rendered inside playerWrapperRef) and
  // mutate playbackRate directly. Also re-applies on lesson change.
  const applyPlaybackSpeed = useCallback((speed: number) => {
    const video = playerWrapperRef.current?.querySelector("video");
    if (video) video.playbackRate = speed;
  }, []);

  useEffect(() => {
    // Wait one tick for the new player to mount on lesson change.
    const t = setTimeout(() => applyPlaybackSpeed(playbackSpeed), 100);
    return () => clearTimeout(t);
  }, [lessonIdNum, playbackSpeed, applyPlaybackSpeed]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when the user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Skip when modifier keys are held (those go to Ctrl+S etc).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const video = playerWrapperRef.current?.querySelector("video");

      switch (e.key) {
        case " ":
          if (video) {
            e.preventDefault();
            if (video.paused) void video.play(); else video.pause();
          }
          break;
        case "ArrowLeft":
          if (video) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
        case "ArrowRight":
          if (video) {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          }
          break;
        case "n":
        case "N":
          if (nextLesson) {
            e.preventDefault();
            router.push(`/learn/${courseIdNum}/${nextLesson.lessonId}`);
          }
          break;
        case "p":
        case "P":
          if (prevLesson) {
            e.preventDefault();
            router.push(`/learn/${courseIdNum}/${prevLesson.lessonId}`);
          }
          break;
        case "m":
        case "M":
          e.preventDefault();
          void handleMarkComplete(false);
          break;
        case "s":
        case "S":
          e.preventDefault();
          setSidebarOpen((v) => !v);
          break;
        case "f":
        case "F":
          e.preventDefault();
          togglePageFullscreen();
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        case "Escape":
          if (showShortcuts) setShowShortcuts(false);
          else if (mobileSidebarOpen) setMobileSidebarOpen(false);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    nextLesson, prevLesson, courseIdNum, router, handleMarkComplete,
    togglePageFullscreen, showShortcuts, mobileSidebarOpen,
  ]);

  // Search shortcut from top bar focuses the sidebar input. The
  // input lives inside a child component, so we locate it by data
  // attribute rather than threading a ref through props (avoids the
  // RefObject<T | null> vs <T> typing friction in React 19).
  const focusSearch = useCallback(() => {
    setSidebarOpen(true);
    setActiveTab("outline");
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>("[data-outline-search]");
      el?.focus();
    }, 100);
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#111827]">
        <Loader2 className="animate-spin text-white/60" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#111827] text-white px-6">
        <p className="mb-4 text-base">{error}</p>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-xl bg-white text-gray-900 text-sm font-bold hover:bg-gray-100"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const sidebarVisible = sidebarOpen;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white text-gray-900 select-none">
      {/* ── 1. TOP BAR ─────────────────────────────────────────────── */}
      <TopBar
        courseTitle={course?.title}
        progressPercent={progress?.progressPercent ?? 0}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        onFocusSearch={focusSearch}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        playbackSpeed={playbackSpeed}
        onChangeSpeed={(s) => {
          setPlaybackSpeed(s);
          applyPlaybackSpeed(s);
          setSettingsOpen(false);
        }}
        pageFullscreen={pageFullscreen}
        onToggleFullscreen={togglePageFullscreen}
        onShowShortcuts={() => setShowShortcuts(true)}
        exitHref={`/courses/${courseIdNum}`}
      />

      {/* ── 2 + 3. SIDEBAR + MAIN CONTENT ──────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar — width animated to support smooth collapse. */}
        <motion.aside
          initial={false}
          animate={{
            width: sidebarVisible ? 280 : 0,
            opacity: sidebarVisible ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="hidden md:flex flex-col bg-[#f8f9fa] border-r border-gray-200 overflow-hidden"
        >
          {sidebarVisible && (
            <Sidebar
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              outlineSearch={outlineSearch}
              onSearchChange={setOutlineSearch}
              progress={progress}
              quizzesByModule={quizzesByModule}
              currentLessonId={lessonIdNum}
              courseId={courseIdNum}
              mentor={mentor}
              onRequestSession={() => setSessionModalOpen(true)}
            />
          )}
        </motion.aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Breadcrumb */}
          <BreadcrumbBar
            moduleTitle={currentLesson?.moduleTitle}
            lessonTitle={currentLesson?.title}
            prevHref={prevLesson ? `/learn/${courseIdNum}/${prevLesson.lessonId}` : null}
            nextHref={nextLesson ? `/learn/${courseIdNum}/${nextLesson.lessonId}` : null}
          />

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Video */}
            <div ref={playerWrapperRef} className="bg-[#111827]">
              <div className="aspect-video w-full">
                {currentLessonRow?.videoUrl ? (
                  <SecureVideoPlayer
                    key={currentLessonRow.id}
                    videoUrl={currentLessonRow.videoUrl}
                    initialPosition={currentLesson?.videoPositionSec ?? 0}
                    autoPlay
                    onProgress={(position) => {
                      if (!currentLesson) return;
                      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
                      positionSaveTimer.current = setTimeout(() => {
                        saveLessonPosition(courseIdNum, currentLesson.lessonId, position).catch(() => {});
                      }, 5000);
                    }}
                    onEnded={handleVideoEnded}
                    userEmail={user?.email}
                    userName={user?.fullName}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/50 gap-2">
                    <Play size={32} />
                    <p className="text-sm">Video coming soon</p>
                  </div>
                )}
              </div>
            </div>

            {/* Lesson info — keyed on lesson id so it fades in on change. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={lessonIdNum}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-6 py-6"
              >
                <LessonInfo
                  lessonTitle={currentLesson?.title ?? "Lesson"}
                  description={currentLessonRow?.description ?? null}
                  completed={!!currentLesson?.completed}
                  marking={marking}
                  onMarkComplete={() => handleMarkComplete(false)}
                  lessonQuizzes={lessonQuizzes}
                  courseId={courseIdNum}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ── Mobile sidebar overlay ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="absolute inset-y-0 left-0 w-[85%] max-w-[320px] bg-[#f8f9fa] border-r border-gray-200 flex flex-col shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
                <p className="text-sm font-bold text-gray-900">Course Content</p>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  aria-label="Close sidebar"
                >
                  <X size={18} />
                </button>
              </div>
              <Sidebar
                activeTab={activeTab}
                onChangeTab={setActiveTab}
                outlineSearch={outlineSearch}
                onSearchChange={setOutlineSearch}
                progress={progress}
                quizzesByModule={quizzesByModule}
                currentLessonId={lessonIdNum}
                courseId={courseIdNum}
                mentor={mentor}
                onRequestSession={() => {
                  setMobileSidebarOpen(false);
                  setSessionModalOpen(true);
                }}
                onLessonClick={() => setMobileSidebarOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals & overlays ──────────────────────────────────────── */}
      {mentor && (
        <RequestSessionModal
          enrollmentId={mentor.enrollmentId}
          isOpen={sessionModalOpen}
          onClose={() => setSessionModalOpen(false)}
        />
      )}

      <ShortcutsOverlay
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <CelebrationModal
        isOpen={showCelebration}
        cert={celebrationCert}
        courseTitle={course?.title ?? "this course"}
        courseId={courseIdNum}
        onClose={() => setShowCelebration(false)}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// TOP BAR
// ───────────────────────────────────────────────────────────────────

function TopBar({
  courseTitle, progressPercent, sidebarOpen, onToggleSidebar, onOpenMobileSidebar,
  onFocusSearch, settingsOpen, onToggleSettings, playbackSpeed, onChangeSpeed,
  pageFullscreen, onToggleFullscreen, onShowShortcuts, exitHref,
}: {
  courseTitle?: string;
  progressPercent: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
  onFocusSearch: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  playbackSpeed: number;
  onChangeSpeed: (s: number) => void;
  pageFullscreen: boolean;
  onToggleFullscreen: () => void;
  onShowShortcuts: () => void;
  exitHref: string;
}) {
  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-[#111827] border-b border-black/30 z-30 relative">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu */}
        <button
          onClick={onOpenMobileSidebar}
          className="md:hidden p-1.5 rounded-md hover:bg-white/10 text-gray-300"
          aria-label="Open course outline"
        >
          <Menu size={18} />
        </button>
        {/* Desktop sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex p-1.5 rounded-md hover:bg-white/10 text-gray-300"
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={sidebarOpen ? "Hide sidebar (S)" : "Show sidebar (S)"}
        >
          <Menu size={18} />
        </button>
        <Link
          href="/dashboard"
          className="shrink-0 flex items-center"
          aria-label="Back to dashboard"
        >
          <Image src="/logo.png" alt="Spire" width={24} height={24} className="h-6 w-6 object-contain" />
        </Link>
        <span className="hidden sm:inline text-gray-600">·</span>
        <p className="hidden sm:block text-sm font-medium text-gray-300 truncate max-w-[180px] md:max-w-[300px]">
          {courseTitle ?? "Course"}
        </p>
        <span className="hidden md:inline text-gray-600">·</span>
        <p className="hidden md:block text-xs text-gray-500 tabular-nums">
          {progressPercent}% complete
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 shrink-0">
        <TopBarIconButton title="Search outline (focus)" onClick={onFocusSearch}>
          <Search size={16} />
        </TopBarIconButton>

        <div className="relative">
          <TopBarIconButton
            title="Playback speed"
            onClick={onToggleSettings}
            active={settingsOpen}
          >
            <SettingsIcon size={16} />
          </TopBarIconButton>
          {settingsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={onToggleSettings}
                aria-hidden
              />
              <div className="absolute right-0 top-full mt-1 w-44 bg-[#1f2937] border border-white/10 rounded-lg shadow-xl py-1 z-50">
                <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Playback speed
                </p>
                {PLAYBACK_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onChangeSpeed(s)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 transition-colors",
                      playbackSpeed === s ? "text-[#5eead4] font-semibold" : "text-gray-300"
                    )}
                  >
                    <span>{s}x{s === 1 ? "  (Normal)" : ""}</span>
                    {playbackSpeed === s && <Check size={14} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <TopBarIconButton
          title="Keyboard shortcuts (?)"
          onClick={onShowShortcuts}
        >
          <Keyboard size={16} />
        </TopBarIconButton>

        <TopBarIconButton
          title={pageFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          onClick={onToggleFullscreen}
        >
          {pageFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </TopBarIconButton>

        <Link
          href={exitHref}
          className="ml-1 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          title="Exit player"
        >
          <X size={13} /> Exit
        </Link>
      </div>
    </header>
  );
}

function TopBarIconButton({
  children, onClick, title, active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-300 transition-colors",
        active ? "bg-white/10 text-white" : "hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────
// SIDEBAR
// ───────────────────────────────────────────────────────────────────

function Sidebar({
  activeTab, onChangeTab, outlineSearch, onSearchChange,
  progress, quizzesByModule, currentLessonId, courseId, mentor,
  onRequestSession, onLessonClick,
}: {
  activeTab: "outline" | "resources";
  onChangeTab: (t: "outline" | "resources") => void;
  outlineSearch: string;
  onSearchChange: (s: string) => void;
  progress: CourseProgress | null;
  quizzesByModule: Map<number, Quiz[]>;
  currentLessonId: number;
  courseId: number;
  mentor: MentorInfo | null;
  onRequestSession: () => void;
  onLessonClick?: () => void;
}) {
  const filteredModules = (() => {
    if (!progress) return [];
    const term = outlineSearch.trim().toLowerCase();
    if (!term) return progress.modules;
    return progress.modules
      .map((m) => ({
        ...m,
        lessons: m.lessons.filter((l) => l.title.toLowerCase().includes(term)),
      }))
      .filter((m) => m.moduleTitle.toLowerCase().includes(term) || m.lessons.length > 0);
  })();

  const filteredOrphans = (() => {
    if (!progress) return [];
    const term = outlineSearch.trim().toLowerCase();
    if (!term) return progress.orphanLessons;
    return progress.orphanLessons.filter((l) => l.title.toLowerCase().includes(term));
  })();

  return (
    <div className="flex flex-col min-w-0 w-[280px] h-full">
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white">
        <SidebarTab
          label="Course Outline"
          active={activeTab === "outline"}
          onClick={() => onChangeTab("outline")}
        />
        <SidebarTab
          label="Resources"
          active={activeTab === "resources"}
          onClick={() => onChangeTab("resources")}
        />
      </div>

      {activeTab === "outline" ? (
        <>
          {/* Search */}
          <div className="px-3 py-2 shrink-0">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                data-outline-search
                type="text"
                value={outlineSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search outline…"
                className="w-full bg-white border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>

          {/* Module list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1.5">
            {filteredModules.map((m) => (
              <ModuleSection
                key={m.moduleId}
                moduleId={m.moduleId}
                moduleTitle={m.moduleTitle}
                totalLessons={m.totalLessons}
                completedLessons={m.completedLessons}
                progressPercent={m.progressPercent}
                lessons={m.lessons}
                quizzes={quizzesByModule.get(m.moduleId) ?? []}
                currentLessonId={currentLessonId}
                courseId={courseId}
                onLessonClick={onLessonClick}
              />
            ))}

            {filteredOrphans.length > 0 && (
              <ModuleSection
                key="orphans"
                moduleId={-1}
                moduleTitle="Other lessons"
                totalLessons={filteredOrphans.length}
                completedLessons={filteredOrphans.filter((l) => l.completed).length}
                progressPercent={
                  Math.round(
                    (filteredOrphans.filter((l) => l.completed).length /
                      Math.max(1, filteredOrphans.length)) * 100
                  )
                }
                lessons={filteredOrphans}
                quizzes={[]}
                currentLessonId={currentLessonId}
                courseId={courseId}
                onLessonClick={onLessonClick}
              />
            )}

            {filteredModules.length === 0 && filteredOrphans.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-8">
                {outlineSearch ? "No lessons match your search." : "No content yet."}
              </p>
            )}
          </div>
        </>
      ) : (
        // Resources tab — placeholder until per-lesson resources land
        // as a real backend feature. Keeps the tab discoverable without
        // shipping fake data.
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
          <Folder size={28} className="text-gray-300 mb-2" />
          <p className="text-sm font-bold text-gray-700">No resources yet</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Lesson downloads, slide decks, and reference links will appear here when your instructor adds them.
          </p>
        </div>
      )}

      {/* Mentor card — sticky at the bottom */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
        {mentor && mentor.mentorName ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#f0fdf9] text-[#0F766E] flex items-center justify-center text-xs font-bold shrink-0">
              {mentor.mentorName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none">
                Your Mentor
              </p>
              <p className="text-xs font-semibold text-gray-900 truncate mt-0.5">
                {mentor.mentorName}
              </p>
            </div>
            <button
              onClick={onRequestSession}
              className="text-[10px] font-semibold text-[#0F766E] border border-[#0F766E]/20 hover:bg-[#f0fdf9] px-2 py-1 rounded transition-colors shrink-0"
            >
              Ask
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <GraduationCap size={14} className="text-gray-400" />
            <span>Mentor pending</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarTab({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-3 text-xs transition-colors border-b-2",
        active
          ? "font-bold text-[#0F766E] border-[#0F766E]"
          : "text-gray-400 border-gray-200 hover:text-gray-600"
      )}
    >
      {label}
    </button>
  );
}

function ModuleSection({
  moduleId, moduleTitle, totalLessons, completedLessons, progressPercent,
  lessons, quizzes, currentLessonId, courseId, onLessonClick,
}: {
  moduleId: number;
  moduleTitle: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  lessons: Array<{ lessonId: number; title: string; completed: boolean }>;
  quizzes: Quiz[];
  currentLessonId: number;
  courseId: number;
  onLessonClick?: () => void;
}) {
  // Auto-expand the module that contains the current lesson; collapse
  // the rest. Once mounted, the user controls expand/collapse.
  const containsCurrent = lessons.some((l) => l.lessonId === currentLessonId);
  const [expanded, setExpanded] = useState(containsCurrent);
  void moduleId;

  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-3 flex items-start gap-2 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 leading-snug">
            {moduleTitle}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0F766E] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
              {completedLessons}/{totalLessons}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-gray-400 mt-0.5 transition-transform duration-200 shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-100"
          >
            {lessons.map((l) => (
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
            {quizzes.map((q) => {
              const passed = q.bestScorePercent != null && q.bestScorePercent >= q.passThreshold;
              return (
                <Link
                  key={q.id}
                  href={`/quiz/${q.id}/take?return=${encodeURIComponent(`/learn/${courseId}/${currentLessonId}`)}`}
                  onClick={onLessonClick}
                  className="flex items-center gap-2 py-2 px-3 pl-5 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-4 h-4 rounded-full bg-[#f0fdf9] flex items-center justify-center shrink-0">
                    <FileQuestion size={10} className="text-[#0F766E]" />
                  </span>
                  <span className="text-xs text-gray-700 flex-1 truncate font-semibold">
                    Module Quiz
                  </span>
                  {passed && <Check size={11} className="text-[#0D9488]" />}
                </Link>
              );
            })}
            {lessons.length === 0 && quizzes.length === 0 && (
              <p className="px-3 py-2 pl-5 text-[11px] text-gray-400 italic">
                No lessons yet.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLessonRow({
  courseId, lessonId, title, completed, isCurrent, onClick,
}: {
  courseId: number;
  lessonId: number;
  title: string;
  completed: boolean;
  isCurrent: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={`/learn/${courseId}/${lessonId}`}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-2 px-3 pl-5 transition-colors",
        isCurrent
          ? "bg-[#f0fdf9] border-l-2 border-[#0F766E] pl-[18px]"
          : "hover:bg-gray-50 border-l-2 border-transparent"
      )}
    >
      <LessonStatusDot completed={completed} isCurrent={isCurrent} />
      <span className={cn(
        "text-xs flex-1 truncate",
        completed ? "text-gray-500" :
        isCurrent ? "font-semibold text-gray-900" :
        "text-gray-400"
      )}>
        {title}
      </span>
    </Link>
  );
}

function LessonStatusDot({
  completed, isCurrent,
}: { completed: boolean; isCurrent: boolean }) {
  if (completed) {
    return (
      <span className="w-4 h-4 rounded-full bg-[#0D9488] flex items-center justify-center shrink-0">
        <Check size={10} className="text-white" strokeWidth={3} />
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className="w-4 h-4 rounded-full bg-[#0F766E] flex items-center justify-center shrink-0">
        <Play size={8} className="text-white" fill="currentColor" />
      </span>
    );
  }
  return (
    <span className="w-4 h-4 rounded-full border-[1.5px] border-gray-300 shrink-0" />
  );
}

// ───────────────────────────────────────────────────────────────────
// MAIN CONTENT — breadcrumb, lesson info
// ───────────────────────────────────────────────────────────────────

function BreadcrumbBar({
  moduleTitle, lessonTitle, prevHref, nextHref,
}: {
  moduleTitle: string | null | undefined;
  lessonTitle: string | undefined;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="h-11 shrink-0 px-5 flex items-center justify-between border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2 min-w-0">
        {moduleTitle && (
          <>
            <span className="text-xs text-gray-400 truncate">{moduleTitle}</span>
            <ChevronRight size={12} className="text-gray-300 shrink-0" />
          </>
        )}
        <span className="text-sm font-semibold text-gray-900 truncate">
          {lessonTitle ?? "Lesson"}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {prevHref ? (
          <Link
            href={prevHref}
            className="inline-flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            title="Previous lesson (P)"
          >
            <ChevronLeft size={13} /> Prev
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-gray-300 border border-gray-100 px-3 py-1.5 rounded-md cursor-not-allowed">
            <ChevronLeft size={13} /> Prev
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#0F766E] px-3 py-1.5 rounded-md hover:bg-[#0D9488] transition-colors"
            title="Next lesson (N)"
          >
            Next <ChevronRight size={13} />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-gray-300 border border-gray-100 px-3 py-1.5 rounded-md cursor-not-allowed">
            Next <ChevronRight size={13} />
          </span>
        )}
      </div>
    </div>
  );
}

function LessonInfo({
  lessonTitle, description, completed, marking, onMarkComplete,
  lessonQuizzes, courseId,
}: {
  lessonTitle: string;
  description: string | null;
  completed: boolean;
  marking: boolean;
  onMarkComplete: () => void;
  lessonQuizzes: Quiz[];
  courseId: number;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0">
          {lessonTitle}
        </h1>
        {completed ? (
          <motion.span
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-1.5 bg-[#f0fdf9] text-[#0D9488] border border-[#0D9488]/20 px-4 py-2 rounded-lg text-sm font-bold"
          >
            <Check size={15} strokeWidth={3} /> Completed
          </motion.span>
        ) : (
          <button
            onClick={onMarkComplete}
            disabled={marking}
            title="Mark complete (M)"
            className="inline-flex items-center gap-1.5 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200 disabled:opacity-60 cursor-pointer"
          >
            {marking
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Check size={14} strokeWidth={3} /> Mark complete</>}
          </button>
        )}
      </div>

      {description && (
        <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap" style={{ lineHeight: 1.7 }}>
          {description}
        </p>
      )}

      {lessonQuizzes.length > 0 && (
        <div className="mt-5 space-y-3">
          {lessonQuizzes.map((q) => (
            <LessonQuizCard key={q.id} quiz={q} courseId={courseId} />
          ))}
        </div>
      )}
    </>
  );
}

function LessonQuizCard({ quiz, courseId }: { quiz: Quiz; courseId: number }) {
  const attemptCount = quiz.attemptCount ?? 0;
  const best = quiz.bestScorePercent;
  const passed = best != null && best >= quiz.passThreshold;
  const href = `/quiz/${quiz.id}/take?return=${encodeURIComponent(`/learn/${courseId}/${quiz.lessonId}`)}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
            <Brain size={16} className="text-[#0F766E]" />
            {quiz.title || "Lesson Quiz"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {quiz.description || "Test your understanding of this lesson."}
          </p>
          {best != null && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold">
              <Trophy size={12} className={passed ? "text-[#0F766E]" : "text-amber-500"} />
              <span className={passed ? "text-[#0F766E]" : "text-amber-600"}>
                Best score: {best}% {passed && "· Passed"}
              </span>
            </div>
          )}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 shrink-0"
        >
          {attemptCount > 0 ? "Retake quiz" : "Start quiz"} <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// CELEBRATION MODAL — shown once when a student finishes their last
// lesson. Three states: certificate ready (download/share), still
// pending (backend auto-gen blocked by quizzes), or just plain done.
// ───────────────────────────────────────────────────────────────────

function CelebrationModal({
  isOpen, cert, courseTitle, courseId, onClose,
}: {
  isOpen: boolean;
  cert: CertificateCheck | null;
  courseTitle: string;
  courseId: number;
  onClose: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const certReady = !!(cert?.exists && cert.certificateUrl);
  const downloadHref = certReady && cert!.certificateUrl!.startsWith("http")
    ? cert!.certificateUrl
    : certReady ? `${apiBase}${cert!.certificateUrl}` : "#";

  const linkedInShareUrl = (() => {
    if (typeof window === "undefined" || !cert?.certificateId) return null;
    const verifyUrl = `${window.location.origin}/verify/${cert.certificateId}`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`;
  })();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-6"
          onClick={onClose}
        >
          {/* Decorative confetti — pure CSS so we don't pull a deps. */}
          <ConfettiBurst />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 250, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-gray-100 text-gray-400 z-10"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div
              className="px-8 pt-10 pb-6 text-center"
              style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F766E] to-[#0D9488] shadow-lg mb-4"
              >
                <PartyPopper size={32} className="text-white" />
              </motion.div>
              <h2 className="text-3xl font-bold text-gray-900">Congratulations!</h2>
              <p className="text-base text-gray-600 mt-2 leading-relaxed">
                You&apos;ve completed{" "}
                <span className="font-bold text-[#0F766E]">{courseTitle}</span>!
              </p>
            </div>

            <div className="px-8 pb-7 pt-2">
              {certReady ? (
                <>
                  <p className="text-sm text-gray-600 text-center mb-4">
                    Your certificate has been generated and is ready to download.
                  </p>
                  {cert?.certificateId && (
                    <p className="text-xs font-mono text-center text-[#0F766E] mb-4">
                      ID: {cert.certificateId}
                    </p>
                  )}
                  <div className="space-y-2">
                    <a
                      href={downloadHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#0F766E] hover:bg-[#0D9488] text-white text-base font-bold px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      <Download size={16} /> Download Certificate
                    </a>
                    {linkedInShareUrl && (
                      <a
                        href={linkedInShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-base font-semibold px-5 py-3 rounded-xl transition-all duration-200"
                      >
                        <Share2 size={16} /> Share on LinkedIn
                      </a>
                    )}
                    <Link
                      href="/dashboard"
                      onClick={onClose}
                      className="w-full inline-flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 text-sm font-semibold px-5 py-2.5 transition-colors"
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 text-center mb-4 leading-relaxed">
                    Almost there! Complete the remaining quiz or assignment
                    requirements on the course page to unlock your certificate.
                  </p>
                  <div className="space-y-2">
                    <Link
                      href={`/courses/${courseId}`}
                      onClick={onClose}
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#0F766E] hover:bg-[#0D9488] text-white text-base font-bold px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      <ArrowRight size={16} /> Open course page
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={onClose}
                      className="w-full inline-flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 text-sm font-semibold px-5 py-2.5 transition-colors"
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Pure-CSS confetti — 30 colored squares falling from the top with
 * staggered delays. Avoids pulling a JS confetti dep for one moment.
 */
function ConfettiBurst() {
  const COLORS = ["#0F766E", "#0D9488", "#5eead4", "#fbbf24", "#f472b6", "#60a5fa"];
  const PIECES = Array.from({ length: 36 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {PIECES.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.8;
        const duration = 2.5 + Math.random() * 1.5;
        const color = COLORS[i % COLORS.length];
        const size = 6 + Math.random() * 6;
        const rotation = Math.random() * 360;
        return (
          <motion.span
            key={i}
            initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: "100vh", rotate: rotation + 540, opacity: [1, 1, 0] }}
            transition={{ duration, delay, ease: "linear" }}
            className="absolute block rounded-sm"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SHORTCUTS OVERLAY
// ───────────────────────────────────────────────────────────────────

function ShortcutsOverlay({
  isOpen, onClose,
}: { isOpen: boolean; onClose: () => void }) {
  const SHORTCUTS: Array<{ keys: string; label: string }> = [
    { keys: "Space", label: "Play / pause video" },
    { keys: "←", label: "Seek back 10s" },
    { keys: "→", label: "Seek forward 10s" },
    { keys: "N", label: "Next lesson" },
    { keys: "P", label: "Previous lesson" },
    { keys: "M", label: "Mark lesson complete" },
    { keys: "S", label: "Toggle sidebar" },
    { keys: "F", label: "Fullscreen" },
    { keys: "?", label: "Show this help" },
    { keys: "Esc", label: "Close overlays" },
  ];
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
                <Sparkles size={16} className="text-[#0F766E]" />
                Keyboard shortcuts
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="px-5 py-3">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-700">{s.label}</span>
                  <kbd className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-1 rounded-md min-w-[36px] text-center">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

