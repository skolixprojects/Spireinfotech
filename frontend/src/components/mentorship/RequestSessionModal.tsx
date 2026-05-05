"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Send } from "lucide-react";
import { requestSession } from "@/lib/api";


interface RequestSessionModalProps {
  enrollmentId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RequestSessionModal({
  enrollmentId,
  isOpen,
  onClose,
  onSuccess,
}: RequestSessionModalProps) {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await requestSession(enrollmentId, topic.trim());
      setSuccess(true);
      setTimeout(() => {
        setTopic("");
        setSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setError("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-serif text-xl font-bold text-gray-900">Request a Session</h2>
              <button
                onClick={handleClose}
                disabled={submitting}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Describe your question or what you&apos;re stuck on. Your mentor will respond with a time and meeting link.
            </p>

            {success ? (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                <p className="text-teal-700 font-semibold">Request sent!</p>
                <p className="text-sm text-teal-600 mt-1">Your mentor will schedule a time.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <label htmlFor="session-topic" className="block text-sm font-medium text-gray-700 mb-2">
                  What do you need help with?
                </label>
                <textarea
                  id="session-topic"
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Describe your question or what you're stuck on..."
                  rows={5}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  disabled={submitting}
                />
                {error && (
                  <p className="text-sm text-red-500 mt-2">{error}</p>
                )}
                <div className="flex gap-3 mt-5 justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !topic.trim()}
                    className="px-5 py-2.5 rounded-lg bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00B4B8] disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Sending...
                      </>
                    ) : (
                      <>
                        <Send size={14} /> Send Request
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
