"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  courseName: string;
  percent: number;
  className?: string;
}

function getGradient(percent: number) {
  if (percent >= 80) return "from-teal-500 to-green-400";
  if (percent >= 50) return "from-teal-500 to-cyan-400";
  if (percent >= 25) return "from-amber-500 to-yellow-400";
  return "from-orange-500 to-red-400";
}

export function ProgressBar({ courseName, percent, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 truncate pr-4">
          {courseName}
        </span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {clamped}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full bg-gradient-to-r", getGradient(clamped))}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 1, ease: "easeOut" as const }}
        />
      </div>
    </div>
  );
}
