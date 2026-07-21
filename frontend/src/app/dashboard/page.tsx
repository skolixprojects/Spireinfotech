"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { getOnboardingRoute, isDashboardStatus, routeAfterAuth } from "@/lib/api";
import ParticipantDashboard from "@/components/dashboard/ParticipantDashboard";

/**
 * /dashboard — single surface for participants.
 *
 * Routing rules (in order):
 *   1. Not signed in → /login
 *   2. Staff role → role-specific dashboard
 *   3. No currentStatus or participantId → refresh profile; if still
 *      missing, send to /enroll. If the refresh reveals a real
 *      participant lifecycle status, route to that step.
 *   4. currentStatus exists but isn't a dashboard-tier value → route
 *      to the matching onboarding step.
 *   5. Otherwise → render the participant sidebar dashboard.
 *
 * The "Complete your enrollment" dead-end card was removed because
 * it was masking the underlying auth-context staleness bug. Instead
 * of showing a fallback, we always either redirect to the right
 * route or render the dashboard.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, refreshUser } = useAuth();
  const [routingDecided, setRoutingDecided] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // Staff roles never render the participant dashboard.
      const role = (user.role ?? "").toUpperCase();
      if (role === "ERM") { router.replace("/erm-dashboard"); return; }
      if (role === "ACCOUNTS") { router.replace("/accounts-dashboard"); return; }
      if (role === "ADMIN") { router.replace("/admin"); return; }
      if (role === "INSTRUCTOR") { router.replace("/instructor"); return; }

      // Two-pipeline routing: a null-pipeline user must answer the
      // attribution screen first; a REFERENCE-PENDING user waits on
      // /referral-pending; only DIRECT + REFERENCE-APPROVED users
      // reach the dashboard body. Refresh first so a late-arriving
      // ERM decision or attribution submission is visible immediately.
      let currentUser = user;
      if (!currentUser.pipeline) {
        const fresh = await refreshUser();
        if (cancelled) return;
        currentUser = fresh ?? currentUser;
      }
      const target = routeAfterAuth(currentUser);
      if (target !== "/dashboard") {
        router.replace(target);
        return;
      }

      // Participant lifecycle. Pull a fresh profile if the in-memory
      // copy is missing critical fields — the auth context can hold
      // stale data after soft navigations.
      let status = currentUser.currentStatus;
      let participantId = currentUser.participantId;
      if (!status || !participantId) {
        const fresh = await refreshUser();
        if (cancelled) return;
        status = fresh?.currentStatus ?? status;
        participantId = fresh?.participantId ?? participantId;
      }

      if (!participantId) {
        // Genuinely no participant profile yet — start enrollment.
        router.replace("/enroll");
        return;
      }

      if (status && !isDashboardStatus(status)) {
        // Mid-onboarding — route to the matching step.
        router.replace(getOnboardingRoute(status));
        return;
      }

      // All checks passed — render the participant dashboard.
      if (!cancelled) setRoutingDecided(true);
    })();

    return () => { cancelled = true; };
  }, [isLoading, user, router, refreshUser]);

  if (isLoading || !routingDecided) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return <ParticipantDashboard />;
}
