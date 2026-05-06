"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Brain, Trophy, AlertCircle } from "lucide-react";
import type { Quiz } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  quiz: Quiz;
  /** Set on the lesson player; the Take Quiz link routes back here
   *  after submit. */
  returnTo?: string;
}

/**
 * Small entry card shown on a lesson / module / course-detail page
 * that links into the full-screen quiz player at /quiz/{id}/take.
 * Renders attempt + best-score state without forcing the student to
 * open the quiz.
 */
export function QuizCard({ quiz, returnTo }: Props) {
  const attemptCount = quiz.attemptCount ?? 0;
  const maxAttempts = quiz.maxAttempts ?? null;
  const exhausted = maxAttempts != null && attemptCount >= maxAttempts;
  const best = quiz.bestScorePercent;
  const passed = best != null && best >= quiz.passThreshold;
  const href = returnTo
    ? `/quiz/${quiz.id}/take?return=${encodeURIComponent(returnTo)}`
    : `/quiz/${quiz.id}/take`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="bg-gradient-to-r from-[#0F766E]/10 to-[#0D9488]/10 px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Brain size={18} className="text-[#0F766E]" />
        <h3 className="font-semibold text-gray-900 text-sm flex-1 truncate">{quiz.title}</h3>
        {passed && <Trophy size={14} className="text-emerald-600" />}
      </div>

      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>{quiz.questionCount ?? 0} questions</span>
          <span>· Pass: {quiz.passThreshold}%</span>
          {quiz.timeLimitMinutes != null && (
            <span>· {quiz.timeLimitMinutes} min limit</span>
          )}
          {best != null ? (
            <span className={cn(
              "font-semibold",
              passed ? "text-emerald-700" : "text-amber-700"
            )}>
              · Best: {best}%
            </span>
          ) : (
            <span>· Best score: —</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            Attempts: {attemptCount}{maxAttempts != null ? `/${maxAttempts}` : ""}
          </span>
          {exhausted ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-amber-700">
              <AlertCircle size={12} /> No attempts remaining
            </div>
          ) : (
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] transition cursor-pointer"
            >
              {attemptCount > 0 ? (passed ? "Retry Quiz" : "Try Again") : "Start Quiz"}
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}
