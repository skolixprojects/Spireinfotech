"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  MessageCircle, Loader2, Calendar, ExternalLink, Clock,
  CheckCircle, CheckCircle2, CalendarPlus,
} from "lucide-react";
import { getMentorSessions, completeSession } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { SessionRequest } from "@/lib/types";
import { AcceptSessionForm } from "./AcceptSessionForm";

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  ACCEPTED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Awaiting you", className: "bg-amber-100 text-amber-700" },
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

interface MentorSessionsListProps {
  // If provided, render only sessions matching this filter (e.g. completed-only history)
  filter?: (s: SessionRequest) => boolean;
  emptyMessage?: string;
  // If provided, the component skips its own fetch and uses this lifted state.
  // Lets the dashboard share one fetch across multiple sections (upcoming + history)
  // plus derive My Students enrichment from the same source of truth.
  sessions?: SessionRequest[];
  onSessionsChange?: (next: SessionRequest[]) => void;
}

export function MentorSessionsList({
  filter,
  emptyMessage = "No sessions yet.",
  sessions: sessionsProp,
  onSessionsChange,
}: MentorSessionsListProps) {
  const { toast } = useToast();
  const [internalSessions, setInternalSessions] = useState<SessionRequest[]>([]);
  const [loading, setLoading] = useState(sessionsProp === undefined);
  const [error, setError] = useState("");
  const [openFormId, setOpenFormId] = useState<number | null>(null);

  const isControlled = sessionsProp !== undefined;
  const sessions = isControlled ? sessionsProp! : internalSessions;

  useEffect(() => {
    if (isControlled) return;
    setLoading(true);
    getMentorSessions()
      .then((data) => setInternalSessions(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [isControlled]);

  const visible = filter ? sessions.filter(filter) : sessions;

  const sorted = [...visible].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.status === "ACCEPTED" && a.scheduledAt && b.scheduledAt) {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });

  const replaceSession = (updated: SessionRequest) => {
    const next = sessions.map((s) => (s.id === updated.id ? updated : s));
    if (isControlled) {
      onSessionsChange?.(next);
    } else {
      setInternalSessions(next);
    }
  };

  const handleAccepted = (updated: SessionRequest) => {
    replaceSession(updated);
    setOpenFormId(null);
    toast("success", "Session scheduled");
  };

  const handleComplete = async (sessionId: number) => {
    if (!confirm("Mark this session as complete?")) return;
    try {
      const updated = await completeSession(sessionId);
      replaceSession(updated);
      toast("success", "Session marked complete");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to mark complete");
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

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 max-w-md mx-auto">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((s, i) => {
        const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.PENDING;
        const isFormOpen = openFormId === s.id;
        const isPending = s.status === "PENDING";
        const isAccepted = s.status === "ACCEPTED";
        const isCompleted = s.status === "COMPLETED";

        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${
              isPending ? "border-l-4 border-l-amber-400" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{s.studentName}</p>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                    {s.courseTitle}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{s.topic}</p>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {isAccepted && s.scheduledAt && (
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

            {isCompleted && s.completedAt && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-3">
                <CheckCircle size={12} />
                Completed {new Date(s.completedAt).toLocaleDateString()}
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                <Clock size={11} /> Requested {new Date(s.requestedAt).toLocaleDateString()}
              </span>

              {isPending && !isFormOpen && (
                <button
                  onClick={() => setOpenFormId(s.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#00A3A8] text-white text-xs font-semibold hover:bg-[#00B4B8] inline-flex items-center gap-1"
                >
                  <CalendarPlus size={12} /> Accept &amp; Schedule
                </button>
              )}

              {isAccepted && (
                <button
                  onClick={() => handleComplete(s.id)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <CheckCircle2 size={12} /> Mark Complete
                </button>
              )}
            </div>

            {isPending && isFormOpen && (
              <AcceptSessionForm
                sessionId={s.id}
                onAccepted={handleAccepted}
                onCancel={() => setOpenFormId(null)}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
