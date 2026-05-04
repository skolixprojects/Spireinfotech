"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0..100 — clamped before rendering. */
  percent: number;
  /** sm = 4px, md = 8px (default), lg = 12px */
  size?: "sm" | "md" | "lg";
  /** Show "53%" text above the bar. */
  showLabel?: boolean;
  /** Tailwind class for the fill. Overrides the default 0/100/in-progress logic. */
  color?: string;
  className?: string;
}

const SIZE_CLASS = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
} as const;

function defaultFill(percent: number): string {
  if (percent <= 0) return "bg-gray-300";
  if (percent >= 100) return "bg-emerald-500";
  return "bg-gradient-to-r from-[#0E6B6B] to-[#5FA3A3]";
}

export function ProgressBar({
  percent,
  size = "md",
  showLabel = false,
  color,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const fill = color ?? defaultFill(clamped);

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-end mb-1">
          <span className="text-xs font-medium tabular-nums text-gray-600">
            {Math.round(clamped)}%
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className={cn(
          "w-full rounded-full bg-gray-100 overflow-hidden",
          SIZE_CLASS[size]
        )}
      >
        <motion.div
          className={cn("h-full rounded-full", fill)}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: "easeOut" as const }}
        />
      </div>
    </div>
  );
}
