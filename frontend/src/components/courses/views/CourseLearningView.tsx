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
  BEGINNER: "bg-teal-100 text-teal-700",
  INTERMEDIATE: "bg-amber-100 text-amber-700",
  ADVANCED: "bg-red-100 text-red-700",
};

const SESSION_STATUS_STYLE: Record<string, { dot: string; label: string; pill: string }> = {
  PENDING: {
    dot: "bg-amber-400",
    label: "Awaiting mentor",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ACCEPTED: {
    dot: "bg-green-500",
    label: "Scheduled",
    pill: "bg-green-50 text-green-700 border-green-200",
  },
  COMPLETED: {
    dot: "bg-gray-400",
    label: "Completed",
    pill: "bg-gray-50 text-gray-600 border-gray-200",
  },
  CANCELLED: {
    dot: "bg-gray-300",
    label: "Cancelled",
    pill: "bg-gray-50 text-gray-500 border-gray-200",
  },
};

/**
 * Learning hub layout for /courses/{id} when the viewer is enrolled
 * (or supervising — instructor / admin). Shows progress, mentor,
 * unlocked curriculum with completion states, sessions, and certificate.
 *
 * Doesn't own the data — the parent page fetches everything and passes
 * it in. This component is purely presentational + click handlers.
 */
export function CourseLearningView({
  course, modules, orphanLessons, progress, mentor, quizzes, sessions,
  assignments, certificate, generatingCert, certError, supervisorMode,
  onContinueLearning, onOpenLesson, onRequestSession, onGenerateCertificate,
}: Props) {
  // Build a per-lesson completion lookup. progress.modules[].lessons[]
  // already encodes this; flatten it for O(1) lookup.
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
  // Used both for the Next Up card and to gate which lesson is "current".
  const nextLesson = (() => {
    if (!progress) {
      // Without progress data (supervisor mode), the first lesson is "next".
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
    return null; // all done
  })();

  const totalLessons = progress?.totalLessons
    ?? (modules.reduce((s, m) => s + m.lessons.length, 0) + orphanLessons.length);
  const completedLessons = progress?.completedLessons ?? 0;
  const progressPercent = progress?.progressPercent ?? 0;

  // Quizzes scoped to a particular module — rendered inline under that module.
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
    <section className="pt-28 pb-20 px-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0F766E] mb-6"
        >
          <ChevronLeft size={16} /> Back to dashboard
        </Link>

        {/* ── Progress hero ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-teal-100 mb-8 p-6 sm:p-8"
          style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
        >
          <span className={cn(
            "inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-3",
            LEVEL_PILL[course.level] ?? "bg-gray-100 text-gray-700"
          )}>
            {course.level}
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-5">
            {course.title}
          </h1>

          {!supervisorMode && totalLessons > 0 && (
            <>
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-medium text-gray-700">Course progress</span>
                <span className="font-semibold text-[#0F766E] tabular-nums">
                  {progressPercent}%
                </span>
              </div>
              <div className="h-2.5 bg-white rounded-full overflow-hidden border border-gray-100 mb-2">
                <div
                  className="h-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mb-5">
                {completedLessons} of {totalLessons} lesson{totalLessons === 1 ? "" : "s"} complete
              </p>
            </>
          )}

          {nextLesson ? (
            <button
              onClick={onContinueLearning}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] transition cursor-pointer"
            >
              <Play size={14} fill="currentColor" />
              {completedLessons === 0 ? "Start learning" : "Continue learning"}
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold">
              <CheckCircle2 size={16} /> All lessons complete!
            </div>
          )}
        </motion.div>

        {/* ── Mentor + Next Up cards ─────────────────────────────── */}
        {!supervisorMode && (
          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            <MentorMiniCard mentor={mentor} onRequestSession={onRequestSession} />
            <NextUpCard
              nextLesson={nextLesson}
              onOpen={() => nextLesson && onOpenLesson(nextLesson.id)}
            />
          </div>
        )}

        {/* ── Curriculum ─────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
            Curriculum
          </h2>
          {modules.length === 0 && orphanLessons.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-500 text-sm">
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
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Other lessons</h3>
                  <div className="space-y-2">
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

        {/* ── Course-level quizzes (no module) ──────────────────── */}
        {courseLevelQuizzes.length > 0 && (
          <section className="mb-10">
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
              Final assessment
            </h2>
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
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
              Assignments
            </h2>
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
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
              Mentorship sessions
            </h2>
            <div className="space-y-3">
              {sessions.map((s) => <SessionRow key={s.id} session={s} />)}
            </div>
          </section>
        )}

        {/* ── Certificate ───────────────────────────────────────── */}
        {!supervisorMode && (
          <section className="mb-2">
            <div
              className="rounded-2xl border border-teal-200 px-6 sm:px-10 py-8 text-center"
              style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
            >
              <Award size={36} className="text-teal-600 mx-auto mb-3" />
              <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
                Course certificate
              </h2>

              {certificate?.exists && certificate.certificateUrl ? (
                <>
                  <p className="text-teal-600 font-medium mb-4 text-sm">
                    You&apos;ve earned your certificate!
                  </p>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}${certificate.certificateUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] transition"
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
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-50 cursor-pointer"
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
    </section>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function MentorMiniCard({
  mentor, onRequestSession,
}: { mentor: MentorInfo | null; onRequestSession: () => void }) {
  const isPending = !mentor || mentor.status === "PENDING_ASSIGNMENT" || !mentor.mentorName;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-3">
        Your mentor
      </p>
      {isPending ? (
        <div>
          <div className="flex items-center gap-2 text-amber-600 mb-1.5">
            <Clock size={14} />
            <p className="text-sm font-semibold">Mentor coming soon</p>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            We&apos;ll match you with an expert shortly. Start learning in the meantime.
          </p>
        </div>
      ) : (
        <>
          <h3 className="font-bold text-[#0F766E] mb-0.5">{mentor.mentorName}</h3>
          {mentor.mentorEmail && (
            <a
              href={`mailto:${mentor.mentorEmail}`}
              className="text-xs text-gray-500 hover:text-teal-600 inline-flex items-center gap-1 mb-3 break-all"
            >
              <Mail size={11} className="flex-shrink-0" /> {mentor.mentorEmail}
            </a>
          )}
          <button
            onClick={onRequestSession}
            className="w-full py-2 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <MessageCircle size={13} /> Request a session
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
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-3">
        Next up
      </p>
      {nextLesson ? (
        <>
          {nextLesson.moduleTitle && (
            <p className="text-[11px] text-gray-400 mb-1">{nextLesson.moduleTitle}</p>
          )}
          <h3 className="font-semibold text-gray-900 mb-3 line-clamp-2">
            {nextLesson.title}
          </h3>
          <button
            onClick={onOpen}
            className="w-full py-2 rounded-lg border-2 border-[#0F766E] text-[#0F766E] text-xs font-semibold hover:bg-[#0F766E]/5 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play size={12} fill="currentColor" /> Open lesson
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 size={16} />
          <p className="text-sm font-semibold">All lessons complete</p>
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
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden"
      open={openByDefault}
    >
      <summary className="cursor-pointer px-5 py-4 flex items-center justify-between hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{m.title}</h3>
          {m.description && <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>}
          <div className="mt-1.5 flex items-center gap-3">
            <p className="text-xs text-gray-400 whitespace-nowrap">
              {moduleProgress
                ? `${moduleProgress.completedLessons}/${moduleProgress.totalLessons} lessons`
                : `${m.lessons.length} lesson${m.lessons.length === 1 ? "" : "s"}`}
              {total > 0 && ` · ${total} min`}
            </p>
            {moduleProgress && moduleProgress.totalLessons > 0 && (
              <div className="flex-1 max-w-[200px] flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] rounded-full transition-all"
                    style={{ width: `${moduleProgress.progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-[#0F766E] tabular-nums">
                  {moduleProgress.progressPercent}%
                </span>
              </div>
            )}
          </div>
        </div>
        <ChevronDown
          size={16}
          className="text-gray-400 ml-3 transition-transform group-open:rotate-180 shrink-0"
        />
      </summary>
      <div className="px-5 pb-4 pt-1 border-t border-gray-100 space-y-2">
        {m.lessons.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No lessons in this module yet.</p>
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
          <div className="pt-3 border-t border-gray-100 space-y-2">
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
        "w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition text-left cursor-pointer",
        isCurrent
          ? "bg-teal-50 border border-teal-200"
          : "hover:bg-gray-50 border border-transparent"
      )}
    >
      <span className="shrink-0">
        {completed ? (
          <CheckCircle2 size={16} className="text-green-500" fill="currentColor" />
        ) : isCurrent ? (
          <Play size={14} className="text-[#0F766E]" fill="currentColor" />
        ) : (
          <Play size={14} className="text-gray-300" />
        )}
      </span>
      <span className={cn(
        "flex-1 truncate",
        completed ? "text-gray-500" : isCurrent ? "text-[#0F766E] font-semibold" : "text-gray-700"
      )}>
        {lesson.title}
      </span>
      {completed && (
        <span className="text-[10px] uppercase tracking-wide font-semibold text-green-600 shrink-0">
          Revisit
        </span>
      )}
      {!completed && isCurrent && (
        <span className="text-[10px] uppercase tracking-wide font-semibold text-[#0F766E] shrink-0">
          Continue
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
        "flex items-start gap-3 px-4 py-3 rounded-xl bg-white border",
        a.unlocked ? "border-gray-200" : "border-gray-100 opacity-70"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
        a.unlocked ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-400"
      )}>
        {a.unlocked ? <FileText size={16} /> : <Lock size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{a.title}</p>
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
  const style = SESSION_STATUS_STYLE[s.status] ?? SESSION_STATUS_STYLE.PENDING;
  const scheduled = s.scheduledAt ? new Date(s.scheduledAt) : null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white border border-gray-200">
      <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
        <Video size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900 text-sm truncate">{s.topic}</p>
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
          <p className="text-xs text-teal-600 font-medium mt-1 inline-flex items-center gap-1">
            <Calendar size={11} /> {scheduled.toLocaleString()}
          </p>
        )}
      </div>
      {s.status === "ACCEPTED" && s.meetingUrl && (
        <a
          href={s.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] transition self-center"
        >
          <Video size={12} /> Join
        </a>
      )}
    </div>
  );
}

