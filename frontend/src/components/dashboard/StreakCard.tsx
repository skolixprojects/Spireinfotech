"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AchievementLevel } from "@/lib/types";

interface StreakCardProps {
  streak: number;
  xp: number;
  level: AchievementLevel;
  className?: string;
}

const levelColors: Record<AchievementLevel, string> = {
  Rookie: "bg-gray-100 text-gray-700",
  Developer: "bg-teal-100 text-teal-800",
  Expert: "bg-violet-100 text-violet-800",
  Master: "bg-amber-100 text-amber-800",
};

export function StreakCard({ streak, xp, level, className }: StreakCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-teal-100 bg-teal-50/60 p-5 space-y-4",
        className
      )}
    >
      {/* Streak */}
      <div className="flex items-center gap-3">
        <motion.span
          className="text-3xl select-none"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2 }}
        >
          🔥
        </motion.span>
        <div>
          <p className="text-lg font-bold text-gray-900">
            {streak} Day Streak
          </p>
          <p className="text-xs text-gray-500">Keep it going!</p>
        </div>
      </div>

      {/* XP + Level */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-teal-700 tabular-nums">
            {xp.toLocaleString()} <span className="text-sm font-medium">XP</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
            levelColors[level]
          )}
        >
          {level}
        </span>
      </div>
    </div>
  );
}
