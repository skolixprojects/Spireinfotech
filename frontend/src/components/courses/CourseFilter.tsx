"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseLevel } from "@/lib/types";

const LEVELS: (CourseLevel | "All")[] = ["All", "Beginner", "Intermediate", "Advanced"];

interface CourseFilterProps {
  selectedLevel: CourseLevel | "All";
  onLevelChange: (level: CourseLevel | "All") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function CourseFilter({
  selectedLevel,
  onLevelChange,
  searchQuery,
  onSearchChange,
}: CourseFilterProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Level pills */}
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => onLevelChange(level)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              selectedLevel === level
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {level}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search courses..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
    </div>
  );
}
