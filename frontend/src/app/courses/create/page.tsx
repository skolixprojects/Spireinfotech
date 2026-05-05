"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BookPlus, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createCourse } from "@/lib/api";

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export default function CreateCoursePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [form, setForm] = useState({
    title: "",
    description: "",
    shortDescription: "",
    price: "",
    level: "BEGINNER",
    category: "",
    tags: "",
    thumbnailUrl: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        shortDescription: form.shortDescription || undefined,
        level: form.level,
        price: form.price ? parseFloat(form.price) : 0,
        category: form.category || undefined,
        tags: form.tags || undefined,
        thumbnailUrl: form.thumbnailUrl || undefined,
      };

      await createCourse(payload);
      setSuccess(true);
      setTimeout(() => router.push("/courses"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-24">
        <Loader2 className="animate-spin text-teal-600" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push("/login?redirect=/courses/create");
    return null;
  }

  const role = user?.role?.toUpperCase();
  if (role !== "INSTRUCTOR") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-24 px-6">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 text-center max-w-md">
          Only approved instructors and admins can create courses.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-24">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <CheckCircle size={64} className="text-teal-500 mb-4" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Course Created!</h2>
        <p className="text-gray-500">Redirecting to courses...</p>
      </div>
    );
  }

  return (
    <section className="min-h-screen pt-32 pb-20 px-6">
      <div className="mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[#00A3A8] text-white flex items-center justify-center">
              <BookPlus size={24} />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold text-gray-900">Create Course</h1>
              <p className="text-gray-500 text-sm">Fill in the details to publish a new course</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-6">

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Course Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                placeholder="e.g., Full-Stack Web Development"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
              />
            </div>

            {/* Short Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Short Description
              </label>
              <input
                type="text"
                name="shortDescription"
                value={form.shortDescription}
                onChange={handleChange}
                placeholder="One-line summary of the course"
                maxLength={200}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={4}
                placeholder="Detailed course description..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition resize-none"
              />
            </div>

            {/* Price + Level row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Price (₹)
                </label>
                <input
                  type="number"
                  name="price"
                  value={form.price}
                  onChange={handleChange}
                  min="0"
                  step="1"
                  placeholder="0 = Free"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
                />
                <p className="text-xs text-gray-400 mt-1">Leave empty or 0 for free courses</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Level <span className="text-red-400">*</span>
                </label>
                <select
                  name="level"
                  value={form.level}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
                >
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0) + level.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category + Tags row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Category
                </label>
                <input
                  type="text"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  placeholder="e.g., Web Development"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tags
                </label>
                <input
                  type="text"
                  name="tags"
                  value={form.tags}
                  onChange={handleChange}
                  placeholder="react, javascript, web"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Thumbnail URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Thumbnail URL (optional)
              </label>
              <input
                type="url"
                name="thumbnailUrl"
                value={form.thumbnailUrl}
                onChange={handleChange}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !form.title.trim()}
              className="w-full py-3.5 rounded-xl bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00B4B8] focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Creating..." : "Create Course"}
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
