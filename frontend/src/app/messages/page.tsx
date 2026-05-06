"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, MessageSquare, ChevronRight } from "lucide-react";
import { getMySalesInquiries, type SalesInquiry } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  QUOTED: "bg-violet-100 text-violet-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-gray-100 text-gray-600",
  LOST: "bg-gray-100 text-gray-500",
};

function relative(ts: string | null | undefined) {
  if (!ts) return "";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MessagesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [inquiries, setInquiries] = useState<SalesInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getMySalesInquiries()
      .then((rows) => setInquiries(rows ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) {
    return (
      <section className="mx-auto max-w-3xl px-6 pt-32 pb-20">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#0F766E]" />
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="mx-auto max-w-3xl px-6 pt-32 pb-20 text-center">
        <p className="text-gray-500 mb-4">Please log in to view your conversations.</p>
        <Link href="/login" className="text-[#0F766E] underline">Sign in</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pt-28 pb-20 min-h-screen">
      <h1 className="font-serif text-3xl font-bold text-[#0F766E] mb-2">My Conversations</h1>
      <p className="text-sm text-gray-500 mb-8">
        Your active sales inquiries with course instructors.
      </p>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-6">{error}</div>
      )}

      {inquiries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 bg-white rounded-2xl border border-gray-100"
        >
          <MessageSquare size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">No conversations yet.</p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] transition"
          >
            Browse courses
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((i) => (
            <Link
              key={i.id}
              href={`/messages/${i.id}`}
              className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-[#0F766E]/30 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{i.courseTitle}</h3>
                    <span className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      STATUS_STYLES[i.status] ?? "bg-gray-100 text-gray-600"
                    )}>
                      {i.status}
                    </span>
                  </div>
                  {i.lastMessagePreview && (
                    <p className="text-sm text-gray-600 line-clamp-1">
                      <span className="font-medium text-gray-700">
                        {i.lastMessageSenderName === user.fullName ? "You" : i.lastMessageSenderName}:
                      </span>{" "}
                      {i.lastMessagePreview}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{relative(i.lastMessageAt)}</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 mt-1 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
