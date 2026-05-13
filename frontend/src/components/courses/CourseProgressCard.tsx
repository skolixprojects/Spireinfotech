"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface CourseProgressCardProps {
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
}

export function CourseProgressCard({
  completedLessons,
  totalLessons,
  progressPercent,
}: CourseProgressCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-[#E3DED7] bg-white shadow-sm p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0F766E]/10 flex items-center justify-center">
            <TrendingUp size={16} className="text-[#0F766E]" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Your Progress</p>
        </div>
        <p className="text-2xl font-bold text-[#0F766E] tabular-nums">
          {progressPercent}%
        </p>
      </div>
      <ProgressBar percent={progressPercent} size="md" />
      <p className="mt-2 text-xs text-gray-500">
        {completedLessons} of {totalLessons} lesson{totalLessons === 1 ? "" : "s"} completed
      </p>
    </motion.div>
  );
}
