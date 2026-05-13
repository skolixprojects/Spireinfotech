"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, BookOpen, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";

const categoryIcons: Record<string, string> = {
  "Web Development": "{ }",
  Frontend: "< />",
  "Data Science": "f(x)",
  "Cloud & DevOps": ">>>",
  Design: "UI",
  "Mobile Development": "[ ]",
};

const gradients: Record<string, string> = {
  "Web Development": "from-teal-500 to-teal-600",
  Frontend: "from-sky-500 to-indigo-600",
  "Data Science": "from-violet-500 to-purple-600",
  "Cloud & DevOps": "from-orange-500 to-red-500",
  Design: "from-pink-500 to-rose-600",
  "Mobile Development": "from-cyan-500 to-blue-600",
};

interface CourseCardProps {
  course: Course;
  progress?: number;
}

export function CourseCard({ course, progress }: CourseCardProps) {
  const gradient = gradients[course.category] ?? "from-gray-500 to-gray-700";
  const icon = categoryIcons[course.category] ?? "< >";

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "relative h-44 bg-gradient-to-br overflow-hidden",
          gradient
        )}
      >
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            loading="lazy"
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-4xl font-bold text-white/80 font-mono select-none">
              {icon}
            </span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <Badge variant="level" level={course.level} />
        </div>
        {course.is_free && (
          <span className="absolute top-3 right-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
            Free
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-gray-900 line-clamp-1 group-hover:text-teal-700 transition-colors">
          {course.title}
        </h3>

        <p className="text-sm text-gray-500">
          {course.instructor?.name ?? "Unknown Instructor"}
        </p>

        {/* Info row */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {course.duration_hours}h
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {course.lessons_count} lessons
          </span>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "h-3.5 w-3.5",
                i < Math.round(course.rating)
                  ? "fill-amber-400 text-amber-400"
                  : "fill-gray-200 text-gray-200"
              )}
            />
          ))}
          <span className="ml-1 text-xs text-gray-500">
            {course.rating} ({course.ratings_count.toLocaleString()})
          </span>
        </div>

        {/* Progress bar */}
        {progress !== undefined && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" as const }}
              />
            </div>
          </div>
        )}

        {/* CTA */}
        <Link
          href={`/courses/${course.slug}`}
          className="mt-2 block w-full rounded-lg bg-teal-700 py-2 text-center text-sm font-medium text-white hover:bg-teal-800 transition-colors"
        >
          View Course
        </Link>
      </div>
    </motion.div>
  );
}
