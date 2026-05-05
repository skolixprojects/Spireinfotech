"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Lock, CheckCircle, Loader2 } from "lucide-react";
import { submitAssignment } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AssignmentItemProps {
  id: number;
  title: string;
  description?: string;
  assignmentType: string;
  dueDate?: string | null;
  unlocked: boolean;
  index?: number;
}

export function AssignmentItem({ id, title, description, assignmentType, dueDate, unlocked, index = 0 }: AssignmentItemProps) {
  const [showSubmit, setShowSubmit] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await submitAssignment(id, content);
      setSubmitted(true);
      setShowSubmit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className={cn(
        "rounded-xl border p-5 transition-all",
        unlocked ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100",
        submitted && "border-teal-200 bg-teal-50/50"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
          submitted ? "bg-teal-100 text-teal-600" :
          unlocked ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-400"
        )}>
          {submitted ? <CheckCircle size={20} /> : unlocked ? <FileText size={20} /> : <Lock size={20} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn("font-medium text-sm", unlocked ? "text-gray-900" : "text-gray-400")}>{title}</h4>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
              assignmentType === "LESSON" ? "bg-purple-100 text-purple-600" : "bg-indigo-100 text-indigo-600"
            )}>
              {assignmentType}
            </span>
            {submitted && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-600">SUBMITTED</span>}
          </div>

          {description && <p className="text-xs text-gray-500 mb-2">{description}</p>}
          {dueDate && <p className="text-xs text-gray-400">Due: {new Date(dueDate).toLocaleDateString()}</p>}

          {!unlocked && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Lock size={12} /> Complete required lessons to unlock
            </p>
          )}

          {unlocked && !submitted && !showSubmit && (
            <button onClick={() => setShowSubmit(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] transition">
              Start Assignment
            </button>
          )}

          {/* Submit form */}
          {showSubmit && !submitted && (
            <div className="mt-3 space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Write your answer here..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleSubmit} disabled={submitting || !content.trim()}
                  className="px-4 py-2 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] transition disabled:opacity-50 flex items-center gap-1">
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                <button onClick={() => setShowSubmit(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {submitted && <p className="text-xs text-teal-600 mt-2 font-medium">Assignment submitted successfully!</p>}
        </div>
      </div>
    </motion.div>
  );
}
