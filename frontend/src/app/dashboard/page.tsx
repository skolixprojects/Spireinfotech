"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { getDashboardSummary, getNextAction, type DashboardSummary, type NextAction } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const role = (user.role ?? "").toUpperCase();
    if (role === "ADMIN") { router.replace("/admin"); return; }
    if (role === "INSTRUCTOR") { router.replace("/instructor"); return; }

    let cancelled = false;
    (async () => {
      try {
        const [s, n] = await Promise.all([
          getDashboardSummary().catch(() => null),
          getNextAction().catch(() => null),
        ]);
        if (cancelled) return;
        setSummary(s);
        setNextAction(n);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  const role = (user.role ?? "").toUpperCase();
  if (role === "ADMIN" || role === "INSTRUCTOR") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return <StudentDashboard user={user} summary={summary} nextAction={nextAction} loading={loading} />;
}
