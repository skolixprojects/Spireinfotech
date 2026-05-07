"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronDown, CheckCircle2, Play, Lock,
  Award, Download, Loader2, Clock, MessageCircle, Mail, Calendar,
  Video, FileText,
} from "lucide-react";
import { QuizCard } from "@/components/quiz/QuizCard";
import { cn } from "@/lib/utils";
import type { CourseProgress, Quiz } from "@/lib/api";
import type { MentorInfo, SessionRequest } from "@/lib/types";

// Local data shapes — narrowed slices of the orchestrator's state.
export interface LearningCourseData {
  id: number;
  title: string;
  level: string;
}

export interface LearningLesson {
  id: number;
  title: string;
  durationMinutes: number | null;
  isFree: boolean;
}

export interface LearningModule {
  id: number;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons: LearningLesson[];
}

export interface LearningAssignment {
  id: number;
  title: string;
  description: string;
  assignmentType: string;
  dueDate: string | null;
  unlocked: boolean;
}

interface Props {
  course: LearningCourseData;
  modules: LearningModule[];
  orphanLessons: LearningLesson[];
  progress: CourseProgress | null;
  mentor: MentorInfo | null;
  quizzes: Quiz[];
  sessions: SessionRequest[];
  assignments: LearningAssignment[];
  certificate: { exists: boolean; certificateUrl?: string } | null;
  generatingCert: boolean;
  certError: string;
  /** True when the viewer is the course owner or admin — they get full
      access without enrolling. UI hides progress/mentor/cert in that case. */
  supervisorMode: boolean;
  onContinueLearning: () => void;
  onOpenLesson: (lessonId: number) => void;
  onRequestSession: () => void;
  onGenerateCertificate: () => void;
}

const LEVEL_PILL: Record<string, string> = {
  BEGINNER: "bg-green-50 text-green-700 border-green-200",
  INTERMEDIATE: "bg-amber-50 text-amber-700 border-amber-200",
  ADVANCED: "bg-red-50 text-red-700 border-red-200",
};

const SESSION_STATUS: Record<string, {
  dot: string; label: string; pill: string; leftBorder: string;
}> = {
  PENDING: {
    dot: "bg-amber-400",
    label: "Awaiting mentor",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    leftBorder: "border-l-[3px] border-l-amber-400",
  },
  ACCEPTED: {
    dot: "bg-green-500",
    label: "Scheduled",
    pill: "bg-green-50 text-green-700 border-green-200",
    leftBorder: "border-l-[3px] border-l-green-400",
  },
  COMPLETED: {
    dot: "bg-gray-400",
    label: "Completed",
    pill: "bg-gray-50 text-gray-600 border-gray-200",
    leftBorder: "border-l-[3px] border-l-gray-300",
  },
  CANCELLED: {
    dot: "bg-gray-300",
    label: "Cancelled",
    pill: "bg-gray-50 text-gray-500 border-gray-200",
    leftBorder: "border-l-[3px] border-l-gray-200",
  },
};

/**
 * Learning hub layout for /courses/{id} when the viewer is enrolled
 * (or supervising — instructor / admin). Shows progress, mentor,
 * unlocked curriculum with completion states, sessions, and certificate.
 */
export function CourseLearningView({
  course, modules, orphanLessons, progress, mentor, quizzes, sessions,
  assignments, certificate, generatingCert, certError, supervisorMode,
  onContinueLearning, onOpenLesson, onRequestSession, onGenerateCertificate,
}: Props) {
  // Per-lesson completion lookup. progress.modules[].lessons[]
  // already encodes this; flatten for O(1) lookup.
  const lessonState = new Map<number, { completed: boolean }>();
  if (progress) {
    progress.modules.forEach((m) =>
      m.lessons.forEach((l) =>
        lessonState.set(l.lessonId, { completed: l.completed })
      )
    );
    progress.orphanLessons.forEach((l) =>
      lessonState.set(l.lessonId, { completed: l.completed })
    );
  }

  // First uncompleted lesson, in module-then-orphan order.
  // Drives both the Next Up card and the "current" lesson highlight.
  const nextLesson = (() => {
    if (!progress) {
      const first = modules[0]?.lessons[0] ?? orphanLessons[0];
      if (!first) return null;
      const moduleTitle = modules[0]?.lessons[0] ? modules[0].title : null;
      return { id: first.id, title: first.title, moduleTitle };
    }
    for (const m of progress.modules) {
      for (const l of m.lessons) {
        if (!l.completed) return { id: l.lessonId, title: l.title, moduleTitle: m.moduleTitle };
      }
    }
    for (const l of progress.orphanLessons) {
      if (!l.completed) return { id: l.lessonId, title: l.title, moduleTitle: null };
    }
    return null;
  })();

  const totalLessons = progress?.totalLessons
    ?? (modules.reduce((s, m) => s + m.lessons.length, 0) + orphanLessons.length);
  const completedLessons = progress?.completedLessons ?? 0;
  const progressPercent = progress?.progressPercent ?? 0;

  // Quizzes scoped to a specific module, rendered inline under it.
  const quizzesByModule = new Map<number, Quiz[]>();
  const courseLevelQuizzes: Quiz[] = [];
  quizzes.forEach((q) => {
    if (q.moduleId != null) {
      const list = quizzesByModule.get(q.moduleId) ?? [];
      list.push(q);
      quizzesByModule.set(q.moduleId, list);
    } else if (q.lessonId == null) {
      courseLevelQuizzes.push(q);
    }
  });

  return (
    <div className="bg-[#f8f9fa] pt-[88px] pb-12 min-h-screen">
      <div className="max-w-[1000px] mx-auto pt-6 px-4 md:px-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0F766E] transition-colors mb-6"
        >
          <ChevronLeft size={16} /> Back to dashboard
        </Link>

        {/* ── Progress header ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-gray-100 mb-8"
          style={{
            background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)",
            padding: "32px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          }}
        >
          <span className={cn(
            "inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border",
            LEVEL_PILL[course.level] ?? "bg-gray-50 text-gray-700 border-gray-200"
          )}>
            {course.level}
          </span>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-3">
            {course.title}
          </h1>

          {!supervisorMode && totalLessons > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">
                  Course progress
                </span>
                <span className="text-lg font-bold text-[#0F766E] tabular-nums">
                  {progressPercent}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-200 mt-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {completedLessons} of {totalLessons} lesson{totalLessons === 1 ? "" : "s"} complete
              </p>
            </>
          )}

          {nextLesson ? (
            <button
              onClick={onContinueLearning}
              className="mt-4 inline-flex items-center gap-2 bg-[#0F766E] text-white text-base font-bold px-8 py-3.5 rounded-xl shadow-lg hover:shadow-xl hover:bg-[#0D9488] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              {completedLessons === 0 ? "Start learning" : "Continue learning"}
            </button>
          ) : (
            <div className="mt-4 inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-base font-bold px-6 py-3 rounded-xl">
              <CheckCircle2 size={18} /> All lessons complete!
            </div>
          )}
        </motion.div>

        {/* ── Mentor + Next Up cards ────────────────────────────── */}
        {!supervisorMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <MentorMiniCard mentor={mentor} onRequestSession={onRequestSession} />
            <NextUpCard
              nextLesson={nextLesson}
              onOpen={() => nextLesson && onOpenLesson(nextLesson.id)}
            />
          </div>
        )}

        {/* ── Curriculum ─────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Curriculum</h2>
          {modules.length === 0 && orphanLessons.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 shadow-sm text-gray-500 text-sm">
              No lessons published yet.
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((mod, mIdx) => {
                const modProgress = progress?.modules.find((mp) => mp.moduleId === mod.id);
                const modQuizzes = quizzesByModule.get(mod.id) ?? [];
                return (
                  <ModuleSection
                    key={mod.id}
                    module={mod}
                    moduleProgress={modProgress}
                    lessonState={lessonState}
                    nextLessonId={nextLesson?.id ?? null}
                    moduleQuizzes={modQuizzes}
                    courseId={course.id}
                    openByDefault={mIdx === 0}
                    onOpenLesson={onOpenLesson}
                  />
                );
              })}
              {orphanLessons.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-gray-50/50">
                    <h3 className="text-base font-bold text-gray-900">Other lessons</h3>
                  </div>
                  <div>
                    {orphanLessons.map((l) => (
                      <UnlockedLessonRow
                        key={l.id}
                        lesson={l}
                        completed={!!lessonState.get(l.id)?.completed}
                        isCurrent={l.id === nextLesson?.id}
                        onOpen={() => onOpenLesson(l.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Course-level quizzes ───────────────────────────────── */}
        {courseLevelQuizzes.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Final assessment</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {courseLevelQuizzes.map((q) => (
                <QuizCard key={q.id} quiz={q} returnTo={`/courses/${course.id}`} />
              ))}
            </div>
          </section>
        )}

        {/* ── Assignments ───────────────────────────────────────── */}
        {assignments.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Assignments</h2>
            <div className="space-y-3">
              {assignments.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </div>
          </section>
        )}

        {/* ── Sessions ──────────────────────────────────────────── */}
        {!supervisorMode && sessions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Mentorship sessions</h2>
            <div className="space-y-3">
              {sessions.map((s) => <SessionRow key={s.id} session={s} />)}
            </div>
          </section>
        )}

        {/* ── Certificate ───────────────────────────────────────── */}
        {!supervisorMode && (
          <section className="mb-2">
            <div
              className="rounded-2xl border border-gray-100 px-6 sm:px-10 py-10 text-center shadow-sm"
              style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
            >
              <Award size={36} className="text-[#0F766E] mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Course certificate</h2>

              {certificate?.exists && certificate.certificateUrl ? (
                <>
                  <p className="text-[#0F766E] font-semibold mb-4 text-sm">
                    You&apos;ve earned your certificate!
                  </p>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}${certificate.certificateUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0F766E] text-white text-sm font-semibold shadow-md hover:shadow-lg hover:bg-[#0D9488] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Download size={14} /> Download certificate (PDF)
                  </a>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-4 text-sm max-w-md mx-auto">
                    Complete all lessons, pass all quizzes, and submit all assignments to earn your certificate.
                  </p>
                  {certError && <p className="text-red-500 text-xs mb-3">{certError}</p>}
                  <button
                    onClick={onGenerateCertificate}
                    disabled={generatingCert}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0F766E] text-white text-sm font-semibold shadow-md hover:shadow-lg hover:bg-[#0D9488] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
                  >
                    {generatingCert
                      ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                      : <><Award size={14} /> Generate certificate</>}
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function MentorMiniCard({
  mentor, onRequestSession,
}: { mentor: MentorInfo | null; onRequestSession: () => void }) {
  const isPending = !mentor || mentor.status === "PENDING_ASSIGNMENT" || !mentor.mentorName;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <p className="text-[10px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
        Your mentor
      </p>
      {isPending ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-amber-600 mb-1.5">
            <Clock size={14} />
            <p className="text-base font-bold">Mentor coming soon</p>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            We&apos;ll match you with an expert shortly. Start learning in the meantime.
          </p>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-bold text-[#0F766E] mt-3">{mentor.mentorName}</h3>
          {mentor.mentorEmail && (
            <a
              href={`mailto:${mentor.mentorEmail}`}
              className="text-sm text-gray-500 hover:text-[#0F766E] inline-flex items-center gap-1.5 mt-1 break-all transition-colors"
            >
              <Mail size={13} className="flex-shrink-0" /> {mentor.mentorEmail}
            </a>
          )}
          <button
            onClick={onRequestSession}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#0F766E] text-white text-sm font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            <MessageCircle size={14} /> Request a session
          </button>
        </>
      )}
    </div>
  );
}

function NextUpCard({
  nextLesson, onOpen,
}: {
  nextLesson: { id: number; title: string; moduleTitle: string | null } | null;
  onOpen: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <p className="text-[10px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
        Next up
      </p>
      {nextLesson ? (
        <>
          {nextLesson.moduleTitle && (
            <p className="text-xs text-gray-400 mt-3">{nextLesson.moduleTitle}</p>
          )}
          <h3 className={cn(
            "text-base font-bold text-gray-900 line-clamp-2",
            nextLesson.moduleTitle ? "mt-1" : "mt-3"
          )}>
            {nextLesson.title}
          </h3>
          <button
            onClick={onOpen}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-white border border-[#0F766E] text-[#0F766E] text-sm font-semibold py-2.5 rounded-xl hover:bg-[#f0fdf9] active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            <Play size={13} fill="currentColor" /> Open lesson
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-green-600 mt-3">
          <CheckCircle2 size={18} />
          <p className="text-base font-bold">All lessons complete</p>
        </div>
      )}
    </div>
  );
}

function ModuleSection({
  module: m, moduleProgress, lessonState, nextLessonId, moduleQuizzes,
  courseId, openByDefault, onOpenLesson,
}: {
  module: LearningModule;
  moduleProgress: { totalLessons: number; completedLessons: number; progressPercent: number } | undefined;
  lessonState: Map<number, { completed: boolean }>;
  nextLessonId: number | null;
  moduleQuizzes: Quiz[];
  courseId: number;
  openByDefault: boolean;
  onOpenLesson: (lessonId: number) => void;
}) {
  const total = m.lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
  return (
    <details
      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
      open={openByDefault}
    >
      <summary className="cursor-pointer px-5 py-4 bg-gray-50/50 flex items-center justify-between hover:bg-gray-50 [&::-webkit-details-marker]:hidden transition-colors">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900">{m.title}</h3>
          {m.description && (
            <p className="text-sm text-gray-500 mt-1">{m.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3">
            <p className="text-xs text-gray-400 whitespace-nowrap">
              {moduleProgress
                ? `${moduleProgress.completedLessons}/${moduleProgress.totalLessons} lessons`
                : `${m.lessons.length} lesson${m.lessons.length === 1 ? "" : "s"}`}
              {total > 0 && ` · ${total} min`}
            </p>
            {moduleProgress && moduleProgress.totalLessons > 0 && (
              <div className="flex-1 max-w-[200px] flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] rounded-full transition-all duration-500"
                    style={{ width: `${moduleProgress.progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-[#0F766E] tabular-nums">
                  {moduleProgress.progressPercent}%
                </span>
              </div>
            )}
          </div>
        </div>
        <ChevronDown
          size={16}
          className="text-gray-400 ml-3 transition-transform duration-200 group-open:rotate-180 shrink-0"
        />
      </summary>
      <div>
        {m.lessons.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-5 py-4">
            No lessons in this module yet.
          </p>
        ) : (
          m.lessons.map((l) => (
            <UnlockedLessonRow
              key={l.id}
              lesson={l}
              completed={!!lessonState.get(l.id)?.completed}
              isCurrent={l.id === nextLessonId}
              onOpen={() => onOpenLesson(l.id)}
            />
          ))
        )}
        {moduleQuizzes.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-50 space-y-2">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">
              Module quiz
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {moduleQuizzes.map((q) => (
                <QuizCard key={q.id} quiz={q} returnTo={`/courses/${courseId}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function UnlockedLessonRow({
  lesson, completed, isCurrent, onOpen,
}: {
  lesson: LearningLesson;
  completed: boolean;
  isCurrent: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "w-full flex items-center gap-3 px-5 py-3 border-t border-gray-50 text-sm transition-colors text-left cursor-pointer",
        isCurrent ? "bg-[#f0fdf9]" : "hover:bg-gray-50"
      )}
    >
      <span className="shrink-0">
        {completed ? (
          <CheckCircle2 size={16} className="text-[#0D9488]" fill="currentColor" />
        ) : isCurrent ? (
          <Play size={14} className="text-[#0F766E]" fill="currentColor" />
        ) : (
          <Play size={14} className="text-gray-300" />
        )}
      </span>
      <span className={cn(
        "flex-1 truncate",
        completed ? "text-gray-700" : isCurrent ? "text-gray-900 font-semibold" : "text-gray-700"
      )}>
        {lesson.title}
      </span>
      {completed && (
        <span className="text-xs text-[#0F766E] font-semibold shrink-0">Revisit</span>
      )}
      {!completed && isCurrent && (
        <span className="text-xs font-bold text-white bg-[#0F766E] px-3 py-1 rounded-full shrink-0">
          Watch
        </span>
      )}
      {lesson.durationMinutes != null && lesson.durationMinutes > 0 && (
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
          {lesson.durationMinutes}m
        </span>
      )}
    </button>
  );
}

function AssignmentRow({ assignment: a }: { assignment: LearningAssignment }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-5 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm transition-all duration-200",
        a.unlocked ? "hover:shadow-md" : "opacity-70"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        a.unlocked ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-400"
      )}>
        {a.unlocked ? <FileText size={16} /> : <Lock size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{a.title}</p>
        {a.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{a.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
          <span className="uppercase tracking-wide font-semibold">{a.assignmentType}</span>
          {a.dueDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={10} /> Due {new Date(a.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session: s }: { session: SessionRequest }) {
  const style = SESSION_STATUS[s.status] ?? SESSION_STATUS.PENDING;
  const scheduled = s.scheduledAt ? new Date(s.scheduledAt) : null;

  return (
    <div className={cn(
      "flex items-start gap-3 px-5 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200",
      style.leftBorder
    )}>
      <div className="w-9 h-9 rounded-xl bg-[#f0fdf9] text-[#0F766E] flex items-center justify-center shrink-0">
        <Video size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 truncate">{s.topic}</p>
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border",
            style.pill
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} /> {style.label}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          With {s.mentorName} · Requested {new Date(s.requestedAt).toLocaleDateString()}
        </p>
        {scheduled && (
          <p className="text-xs text-[#0F766E] font-semibold mt-1 inline-flex items-center gap-1">
            <Calendar size={11} /> {scheduled.toLocaleString()}
          </p>
        )}
      </div>
      {s.status === "ACCEPTED" && s.meetingUrl && (
        <a
          href={s.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold shadow-md hover:shadow-lg hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-200 self-center"
        >
          <Video size={12} /> Join
        </a>
      )}
    </div>
  );
}
