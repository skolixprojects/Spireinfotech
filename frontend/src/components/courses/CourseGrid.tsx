"use client";

import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { CourseCard } from "./CourseCard";
import type { Course } from "@/lib/types";

interface CourseGridProps {
  courses: Course[];
  progressMap?: Record<string, number>;
}

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export function CourseGrid({ courses, progressMap }: CourseGridProps) {
  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <BookOpen className="h-12 w-12 mb-3" />
        <p className="text-lg font-medium">No courses found</p>
        <p className="text-sm">Try adjusting your filters or search query.</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {courses.map((course) => (
        <motion.div key={course.id} variants={item}>
          <CourseCard
            course={course}
            progress={progressMap?.[course.id]}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
