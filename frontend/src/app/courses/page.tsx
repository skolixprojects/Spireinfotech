"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { Search, Clock, Loader2, ShoppingCart, ShieldCheck, Eye } from "lucide-react";
import { getCourses, addToCart, enroll, getDashboardSummary } from "@/lib/api";
import { LEVELS } from "@/lib/constants";
import { cn, friendlyEnrollmentError } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAuth } from "@/lib/auth-context";

const allLevels = ["All", ...LEVELS] as const;

interface CourseItem {
  id: number;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  level: string;
  price: number;
  isFree: boolean;
  durationHours: number;
  category: string;
  rating: number;
  ratingsCount: number;
  lessonsCount: number;
  enrolledCount: number;
  thumbnailUrl: string | null;
  instructor: { id: number; fullName: string; email: string } | null;
}

export default function CoursesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role?.toUpperCase() === "ADMIN";
  const role = user?.role?.toUpperCase() ?? "";
  // Staff roles (instructors authoring content, admins) need /courses
  // unconditionally — the profile-completion gate only applies to
  // participants. Anonymous visitors can still browse the catalog;
  // they hit /enroll the moment they click "Enroll".
  const isStaff = role === "ADMIN" || role === "INSTRUCTOR"
    || role === "TRAINER" || role === "SYSTEM_ADMIN"
    || role === "OPERATIONS_ADMIN" || role === "ERM"
    || role === "FINANCE";
  const [selectedLevel, setSelectedLevel] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Map courseId -> progressPercent for the logged-in user. /courses
  // is route-protected so we can assume the user is authenticated;
  // worst case the fetch fails silently and we show no progress bars.
  const [progressByCourseId, setProgressByCourseId] = useState<Record<number, number>>({});

  // Phase 1C strict gate — logged-in participants with an incomplete
  // profile can't see the catalog. Bounce them to the dashboard's
  // Complete Profile tab. Public visitors and staff fall through.
  useEffect(() => {
    if (user && !isStaff && user.profileComplete === false) {
      router.replace("/dashboard?tab=complete-profile");
    }
  }, [user, isStaff, router]);

  useEffect(() => {
    getDashboardSummary()
      .then((summary) => {
        const map: Record<number, number> = {};
        for (const c of summary.enrolledCourses) {
          map[c.id] = c.progressPercent;
        }
        setProgressByCourseId(map);
      })
      .catch(() => setProgressByCourseId({}));
  }, []);

  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true);
      setError("");
      try {
        const params: Record<string, string> = {};
        if (selectedLevel !== "All") params.level = selectedLevel.toUpperCase();
        if (search.trim()) params.search = search.trim();
        const data = await getCourses(params);
        setCourses(data as CourseItem[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load courses");
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [selectedLevel, search]);

  return (
    <section className="mx-auto max-w-7xl px-6 pt-32 pb-20">
      <h1 className="font-serif text-4xl font-bold text-[#0F766E] mb-2">
        Explore Courses
      </h1>
      <p className="text-gray-600 mb-8">
        Find the perfect course to advance your skills.
      </p>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-10">
        <div className="flex flex-wrap gap-2">
          {allLevels.map((level) => (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer",
                selectedLevel === level
                  ? "bg-[#0F766E] text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72 sm:ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-full border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-teal-600" size={32} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-20">
          <p className="text-red-500 mb-2">{error}</p>
          <p className="text-gray-500 text-sm">Make sure the backend is running at {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && courses.length === 0 && (
        <p className="text-center text-gray-500 py-20">
          No courses found. Try adjusting your filters.
        </p>
      )}

      {/* Course grid */}
      {!loading && !error && courses.length > 0 && (
        <motion.div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {courses.map((course) => (
            <motion.div
              key={course.id}
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4 }}
            >
              <Link href={`/courses/${course.id}`} className="block group">
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden transition-shadow hover:shadow-md">
                  {/* Thumbnail */}
                  <div className="h-44 bg-gradient-to-br from-[#0F766E]/10 to-[#0D9488]/20 flex items-center justify-center overflow-hidden">
                    {course.thumbnailUrl ? (
                      <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-[#0F766E]/40 text-sm font-medium">{course.category}</span>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                        course.level === "BEGINNER" && "bg-teal-100 text-teal-700",
                        course.level === "INTERMEDIATE" && "bg-amber-100 text-amber-700",
                        course.level === "ADVANCED" && "bg-red-100 text-red-700",
                      )}>
                        {course.level}
                      </span>
                      {course.isFree && (
                        <span className="text-xs font-semibold text-teal-600">FREE</span>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 group-hover:text-[#0F766E] transition-colors line-clamp-1">
                      {course.title}
                    </h3>

                    <p className="text-sm text-gray-500 mt-1">
                      {course.instructor?.fullName || "Unknown instructor"}
                    </p>

                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                      {course.durationHours > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {course.durationHours}h
                        </span>
                      )}
                      {course.lessonsCount > 0 && (
                        <span>{course.lessonsCount} lessons</span>
                      )}
                      {course.ratingsCount > 0 && (
                        <span className="ml-auto font-medium text-amber-600">
                          {course.rating} / 5
                        </span>
                      )}
                    </div>

                    {isAdmin ? (
                      <div className="mt-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <ShieldCheck size={12} /> Preview <Eye size={12} />
                        </span>
                      </div>
                    ) : progressByCourseId[course.id] !== undefined ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-700">
                            {progressByCourseId[course.id] === 0
                              ? "Not started"
                              : progressByCourseId[course.id] >= 100
                                ? "Completed"
                                : `${progressByCourseId[course.id]}% complete`}
                          </span>
                          <span className="text-[10px] font-semibold text-[#0F766E] tabular-nums">
                            {progressByCourseId[course.id]}%
                          </span>
                        </div>
                        <ProgressBar percent={progressByCourseId[course.id]} size="sm" />
                      </div>
                    ) : (
                      <>
                        {!course.isFree && (
                          <p className="mt-2 text-sm font-semibold text-gray-900">₹{Number(course.price).toLocaleString("en-IN")}</p>
                        )}
                        <div className="mt-3" onClick={(e) => e.preventDefault()}>
                          {course.isFree ? (
                            <button
                              onClick={async () => {
                                try { await enroll(course.id); toast("success", "Enrolled successfully!"); } catch (err) { const msg = friendlyEnrollmentError(err); toast(msg.startsWith("You're already enrolled") ? "info" : "error", msg); }
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#0F766E] text-white hover:bg-[#0D9488] transition-colors cursor-pointer"
                            >
                              Enroll Free
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                try { await addToCart(course.id); toast("cart", "Course added to cart!"); } catch (err) { const msg = friendlyEnrollmentError(err); toast(msg.startsWith("You're already enrolled") ? "info" : "error", msg); }
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#0F766E] text-white hover:bg-[#0D9488] transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <ShoppingCart size={12} /> Add to Cart
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
