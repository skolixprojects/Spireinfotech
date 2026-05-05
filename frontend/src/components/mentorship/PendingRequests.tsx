"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, Loader2, Clock, CalendarPlus } from "lucide-react";
import { getMentorPendingRequests } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { SessionRequest } from "@/lib/types";
import { AcceptSessionForm } from "./AcceptSessionForm";

interface PendingRequestsProps {
  // Optional: parent dashboard can react to accepts (e.g. to refresh other lists)
  onAccepted?: (updated: SessionRequest) => void;
}

export function PendingRequests({ onAccepted }: PendingRequestsProps) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SessionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openFormId, setOpenFormId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    getMentorPendingRequests()
      .then((data) => setRequests(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load pending requests"))
      .finally(() => setLoading(false));
  }, []);

  const handleAccepted = (updated: SessionRequest) => {
    setRequests((prev) => prev.filter((r) => r.id !== updated.id));
    setOpenFormId(null);
    toast("success", "Session scheduled");
    onAccepted?.(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[#14B8A6]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">
          No pending requests. Your students are doing well!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {requests.map((r, i) => {
          const isFormOpen = openFormId === r.id;
          return (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-amber-400 shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{r.studentName}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                      {r.courseTitle}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.topic}</p>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                  Awaiting you
                </span>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                  <Clock size={11} /> Requested {new Date(r.requestedAt).toLocaleDateString()}
                </span>
                {!isFormOpen && (
                  <button
                    onClick={() => setOpenFormId(r.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] inline-flex items-center gap-1"
                  >
                    <CalendarPlus size={12} /> Accept &amp; Schedule
                  </button>
                )}
              </div>

              {isFormOpen && (
                <AcceptSessionForm
                  sessionId={r.id}
                  onAccepted={handleAccepted}
                  onCancel={() => setOpenFormId(null)}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
