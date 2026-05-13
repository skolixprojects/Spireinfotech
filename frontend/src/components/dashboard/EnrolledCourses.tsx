"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";

interface EnrolledCourse {
  course: Course;
  progress: number;
  lastAccessed: boolean;
}

interface EnrolledCoursesProps {
  courses: EnrolledCourse[];
  className?: string;
}

const gradients: Record<string, string> = {
  "Web Development": "from-teal-500 to-teal-600",
  Frontend: "from-sky-500 to-indigo-600",
  "Data Science": "from-violet-500 to-purple-600",
  "Cloud & DevOps": "from-orange-500 to-red-500",
  Design: "from-pink-500 to-rose-600",
  "Mobile Development": "from-cyan-500 to-blue-600",
};

export function EnrolledCourses({ courses, className }: EnrolledCoursesProps) {
  if (courses.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-gray-100 bg-white p-6 text-center text-gray-400", className)}>
        <p className="font-medium">No enrolled courses yet.</p>
        <Link href="/courses" className="mt-2 inline-block text-sm text-teal-700 hover:underline">
          Browse courses
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {courses.map(({ course, progress, lastAccessed }) => (
        <motion.div
          key={course.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
        >
          {/* Mini thumbnail */}
          <div
            className={cn(
              "h-14 w-14 flex-shrink-0 rounded-lg bg-gradient-to-br flex items-center justify-center",
              gradients[course.category] ?? "from-gray-500 to-gray-700"
            )}
          >
            <span className="text-sm font-bold text-white/80 font-mono select-none">
              {course.title.charAt(0)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {course.title}
            </p>
            {/* Progress bar */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" as const }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                {progress}%
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center gap-1.5">
            {lastAccessed ? (
              <Link
                href={`/courses/${course.slug}`}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 transition-colors"
              >
                <Play className="h-3 w-3" />
                Resume
              </Link>
            ) : (
              <Link
                href={`/courses/${course.slug}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </Link>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
