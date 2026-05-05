"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Loader2, Calendar, ExternalLink, Clock, X, CheckCircle } from "lucide-react";
import { getMySessions, cancelSession } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { SessionRequest } from "@/lib/types";


const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  ACCEPTED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting for mentor", className: "bg-amber-100 text-amber-700" },
  ACCEPTED: { label: "Scheduled", className: "bg-teal-100 text-teal-700" },
  COMPLETED: { label: "Completed", className: "bg-gray-100 text-gray-600" },
  CANCELLED: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
};

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionsList() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getMySessions()
      .then((data) => setSessions(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  const sortedSessions = [...sessions].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    // ACCEPTED: soonest scheduled first; otherwise newest requestedAt first
    if (a.status === "ACCEPTED" && a.scheduledAt && b.scheduledAt) {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });

  const handleCancel = async (sessionId: number) => {
    if (!confirm("Cancel this session?")) return;
    try {
      const updated = await cancelSession(sessionId);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      toast("success", "Session cancelled");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[#5FE0E3]" />
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

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          No sessions yet. When you need help with a course, request a session with your mentor from the course page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedSessions.map((s, i) => {
        const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.PENDING;
        const canCancel = s.status === "PENDING" || s.status === "ACCEPTED";
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-1">{s.courseTitle}</p>
                <p className="text-sm font-medium text-gray-900">{s.topic}</p>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {s.status === "ACCEPTED" && s.scheduledAt && (
              <div className="flex items-center gap-2 text-sm text-teal-700 mt-3 flex-wrap">
                <Calendar size={14} />
                <span className="font-semibold">{formatScheduledAt(s.scheduledAt)}</span>
                {s.meetingUrl && (
                  <a
                    href={s.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#00A3A8] text-white text-xs font-semibold hover:bg-[#00B4B8] transition"
                  >
                    <ExternalLink size={12} /> Join Meeting
                  </a>
                )}
              </div>
            )}

            {s.status === "COMPLETED" && s.completedAt && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-3">
                <CheckCircle size={12} />
                Completed {new Date(s.completedAt).toLocaleDateString()}
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                <Clock size={11} /> Requested {new Date(s.requestedAt).toLocaleDateString()}
              </span>
              {canCancel && (
                <button
                  onClick={() => handleCancel(s.id)}
                  className="text-xs text-red-400 hover:text-red-600 font-medium inline-flex items-center gap-1"
                >
                  <X size={12} /> Cancel
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
