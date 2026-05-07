"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronDown, Lock, Loader2, MessageSquare,
  Check, Clock, BookOpen, Award, Users, Video, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Local shapes — these mirror the slice of CourseDTO / Lesson /
// Module that this view actually renders. Defined here (rather than
// shared with the orchestrator page) so the component is portable
// and self-documenting.
export interface SalesCourseData {
  id: number;
  title: string;
  description: string;
  shortDescription: string;
  level: string;
  price: number;
  isFree: boolean;
  category: string;
  enrolledCount: number;
  tags?: string | null;
  instructor: {
    id: number;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    bio?: string | null;
  } | null;
}

export interface SalesLesson {
  id: number;
  title: string;
  durationMinutes: number | null;
}

export interface SalesModule {
  id: number;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons: SalesLesson[];
}

interface Props {
  course: SalesCourseData;
  modules: SalesModule[];
  /** Lessons not attached to a module — rendered under "Other lessons". */
  orphanLessons: SalesLesson[];
  enrolling: boolean;
  enrollMsg: string;
  onEnroll: () => void;
  onContactSales: () => void;
}

const LEVEL_PILL: Record<string, string> = {
  BEGINNER: "bg-teal-100 text-teal-700",
  INTERMEDIATE: "bg-amber-100 text-amber-700",
  ADVANCED: "bg-red-100 text-red-700",
};

/**
 * Marketing layout for /courses/{id} when the viewer is NOT enrolled.
 *
 * Conversion-oriented: hero with price card, key learning outcomes,
 * locked curriculum preview, instructor bio, "what's included"
 * inclusions, and a repeated bottom CTA. Lessons here have NO action
 * buttons — they're locked previews. Mentor / sessions / progress
 * UI is owned by CourseLearningView.
 */
export function CourseSalesView({
  course, modules, orphanLessons, enrolling, enrollMsg, onEnroll, onContactSales,
}: Props) {
  // Total duration computed from real lesson durations; if every
  // lesson has 0 we hide the line entirely rather than showing "0h".
  const totalMinutes = modules.flatMap((m) => m.lessons).concat(orphanLessons)
    .reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0)
    + orphanLessons.length;

  // Build a "What you'll learn" bullet list:
  //   1. comma-separated tags from the course (top 6)
  //   2. otherwise the first 6 module titles
  // This avoids hand-curated marketing copy that would go stale.
  const learningOutcomes: string[] = (() => {
    const tagList = (course.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (tagList.length >= 4) {
      return tagList.map((t) => t.replace(/-/g, " "));
    }
    return modules.slice(0, 6).map((m) => m.title);
  })();

  return (
    <section className="pt-28 pb-20 px-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0F766E] mb-6"
        >
          <ChevronLeft size={16} /> Back to courses
        </Link>

        {/* ── Hero banner ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl border border-teal-100 mb-12"
          style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
        >
          <div className="grid lg:grid-cols-3 gap-8 p-6 sm:p-8 lg:p-10">
            <div className="lg:col-span-2">
              <span className={cn(
                "inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-4",
                LEVEL_PILL[course.level] ?? "bg-gray-100 text-gray-700"
              )}>
                {course.level}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
                {course.title}
              </h1>
              <p className="text-gray-600 max-w-xl mb-5 leading-relaxed">
                {course.description || course.shortDescription}
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
                {course.instructor && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-xs font-bold">
                      {course.instructor.fullName.charAt(0)}
                    </span>
                    {course.instructor.fullName}
                  </span>
                )}
                {totalLessons > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen size={14} /> {totalLessons} lesson{totalLessons === 1 ? "" : "s"}
                  </span>
                )}
                {totalMinutes > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} /> {Math.round(totalMinutes / 60 * 10) / 10}h
                  </span>
                )}
                {course.enrolledCount > 0 && (
                  <span>{course.enrolledCount.toLocaleString()} enrolled</span>
                )}
              </div>
            </div>

            {/* Floating price card */}
            <div className="lg:col-span-1">
              <PriceCard
                course={course}
                enrolling={enrolling}
                enrollMsg={enrollMsg}
                onEnroll={onEnroll}
                onContactSales={onContactSales}
              />
            </div>
          </div>
        </motion.div>

        {/* ── What you'll learn ─────────────────────────────── */}
        {learningOutcomes.length > 0 && (
          <section className="mb-12">
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
              What you&apos;ll learn
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {learningOutcomes.map((outcome, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl bg-white border border-gray-100"
                >
                  <Check size={14} className="text-[#0F766E] mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700 capitalize">{outcome}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Course content (locked preview) ───────────────── */}
        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
            Course content
          </h2>
          {modules.length === 0 && orphanLessons.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-500 text-sm">
              Curriculum coming soon.
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((mod, mIdx) => (
                <ModulePreview key={mod.id} module={mod} openByDefault={mIdx === 0} />
              ))}
              {orphanLessons.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Other lessons</h3>
                  <div className="space-y-2">
                    {orphanLessons.map((l) => <LockedLessonRow key={l.id} lesson={l} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── About the instructor ──────────────────────────── */}
        {course.instructor && (
          <section className="mb-12">
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
              About the instructor
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-lg font-bold shrink-0">
                {course.instructor.fullName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{course.instructor.fullName}</h3>
                <p className="text-sm text-gray-500 mb-2">Instructor</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {course.instructor.bio?.trim() ||
                    `Instructor for ${course.title}.`}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── What's included ───────────────────────────────── */}
        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-5">
            What&apos;s included
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: Video, label: `${totalLessons || "Video"} lesson${totalLessons === 1 ? "" : "s"}` },
              { icon: Users, label: "Personal mentor" },
              { icon: Award, label: "Certificate on completion" },
              { icon: ListChecks, label: "Quizzes & assessments" },
              { icon: MessageSquare, label: "1:1 session requests" },
              { icon: BookOpen, label: "Lifetime access" },
            ].map(({ icon: Icon, label }, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100"
              >
                <Icon size={16} className="text-[#0F766E] shrink-0" />
                <span className="text-sm text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────── */}
        <section className="mb-4">
          <div
            className="rounded-2xl border border-teal-100 px-6 sm:px-10 py-8 sm:py-10 text-center"
            style={{ background: "linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%)" }}
          >
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Ready to start?
            </h2>
            <p className="text-gray-600 mb-5 text-sm">
              {course.isFree
                ? "Free to enroll · Personal mentor included"
                : `₹${Number(course.price).toLocaleString("en-IN")} · One-time payment`}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto">
              <button
                onClick={onEnroll}
                disabled={enrolling}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-xl bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
              >
                {enrolling
                  ? <><Loader2 size={14} className="animate-spin" /> Enrolling…</>
                  : (course.isFree ? "Enroll free" : "Add to cart")}
              </button>
              {!course.isFree && (
                <button
                  onClick={onContactSales}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-xl border-2 border-[#0F766E] text-[#0F766E] text-sm font-semibold hover:bg-[#0F766E]/5 transition cursor-pointer"
                >
                  <MessageSquare size={14} /> Contact sales
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function PriceCard({
  course, enrolling, enrollMsg, onEnroll, onContactSales,
}: {
  course: SalesCourseData;
  enrolling: boolean;
  enrollMsg: string;
  onEnroll: () => void;
  onContactSales: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5 lg:p-6">
      <div className="text-3xl font-bold text-gray-900">
        {course.isFree ? "Free" : `₹${Number(course.price).toLocaleString("en-IN")}`}
      </div>
      <p className="text-xs text-gray-500 mb-5">
        {course.isFree ? "No payment required" : "One-time payment"}
      </p>

      <button
        onClick={onEnroll}
        disabled={enrolling}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
      >
        {enrolling
          ? <><Loader2 size={14} className="animate-spin" /> Enrolling…</>
          : (course.isFree ? "Enroll free" : "Add to cart")}
      </button>

      {!course.isFree && (
        <button
          onClick={onContactSales}
          className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border-2 border-[#0F766E] text-[#0F766E] text-sm font-semibold hover:bg-[#0F766E]/5 transition cursor-pointer"
        >
          <MessageSquare size={14} /> Contact sales
        </button>
      )}
      {!course.isFree && (
        <p className="text-[11px] text-gray-500 mt-2 text-center">
          or contact our team for custom pricing
        </p>
      )}

      {enrollMsg && (
        <p className={cn(
          "text-xs mt-3 text-center",
          enrollMsg.toLowerCase().includes("success") ||
          enrollMsg.toLowerCase().startsWith("you're already enrolled")
            ? "text-teal-600" : "text-red-500"
        )}>
          {enrollMsg}
        </p>
      )}

      <div className="mt-5 pt-5 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
        <p>Category: <span className="font-medium text-gray-900">{course.category}</span></p>
        <p>Level: <span className="font-medium text-gray-900">{course.level}</span></p>
      </div>
    </div>
  );
}

function ModulePreview({ module: m, openByDefault }: { module: SalesModule; openByDefault: boolean }) {
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
          <p className="text-xs text-gray-400 mt-1.5">
            {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}
            {total > 0 && ` · ${total} min`}
          </p>
        </div>
        <ChevronDown
          size={16}
          className="text-gray-400 ml-3 transition-transform group-open:rotate-180 shrink-0"
        />
      </summary>
      <div className="px-5 pb-4 pt-1 border-t border-gray-100 space-y-2">
        {m.lessons.length === 0
          ? <p className="text-xs text-gray-400 italic py-2">No lessons in this module yet.</p>
          : m.lessons.map((l) => <LockedLessonRow key={l.id} lesson={l} />)}
      </div>
    </details>
  );
}

function LockedLessonRow({ lesson }: { lesson: SalesLesson }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm text-gray-600">
      <Lock size={14} className="text-gray-300 shrink-0" />
      <span className="flex-1 truncate">{lesson.title}</span>
      {lesson.durationMinutes != null && lesson.durationMinutes > 0 && (
        <span className="text-xs text-gray-400 shrink-0">{lesson.durationMinutes} min</span>
      )}
    </div>
  );
}
