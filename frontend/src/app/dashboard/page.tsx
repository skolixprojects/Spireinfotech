"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import ParticipantDashboard from "@/components/dashboard/ParticipantDashboard";

/**
 * /dashboard — single surface for participants.
 *
 *   - Participants (with a participantId) get the Phase 5A
 *     sidebar dashboard.
 *   - Staff roles never land here: the login redirect bounces them
 *     to their role-specific dashboard. If they somehow arrive here
 *     directly (deep link, bookmark), we re-route them.
 *   - Legacy users without a participantId see a short "complete
 *     your enrollment" prompt. The old LMS dashboard (enrolled
 *     courses, mentor sessions, etc.) lives on the dedicated
 *     /instructor and /admin routes; it is no longer rendered here.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const role = (user.role ?? "").toUpperCase();
    // Staff roles have their own dashboards.
    if (role === "ERM") { router.replace("/erm-dashboard"); return; }
    if (role === "COACH" || role === "TECHNICAL_ADVISOR") {
      router.replace("/coach-dashboard"); return;
    }
    if (role === "FINANCE") { router.replace("/finance-dashboard"); return; }
    if (role === "OPERATIONS_ADMIN" || role === "SYSTEM_ADMIN" || role === "ADMIN") {
      router.replace("/admin"); return;
    }
    if (role === "INSTRUCTOR") { router.replace("/instructor"); return; }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  if (!user) {
    // Effect will redirect; render nothing in the meantime.
    return null;
  }

  if (user.participantId) {
    return <ParticipantDashboard />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          Complete your enrollment
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account isn&apos;t paired with a participant profile yet. Start
          your onboarding to unlock the dashboard.
        </p>
        <Link
          href="/enroll"
          className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] cursor-pointer"
        >
          Begin enrollment →
        </Link>
        <p className="mt-4 text-xs text-gray-400">
          Already enrolled? Sign out and back in — your role may route you
          to a different dashboard.
        </p>
      </div>
    </div>
  );
}
