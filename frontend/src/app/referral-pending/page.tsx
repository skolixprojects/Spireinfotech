"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clock, LogOut, RefreshCw, Loader2 } from "lucide-react";

import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { useAuth } from "@/lib/auth-context";
import { routeAfterAuth } from "@/lib/api";

/**
 * Holding page for pipeline=REFERENCE users after they submit their
 * attribution. The ERM approves or rejects from the ERM dashboard
 * (wiring in Prompt 4). Until then:
 *   - APPROVED → routeAfterAuth → /dashboard
 *   - REJECTED → routeAfterAuth → /login (account is dropped)
 *   - anything else non-REFERENCE-PENDING → routeAfterAuth handles it
 *
 * Manual "Check status" refresh + Log out are the only user actions.
 * (Auto-advance polling to be tightened in the ERM prompt.)
 */
export default function ReferralPendingPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, refreshUser, logout } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!user) return;
    // On mount, pull a fresh profile so late-arriving ERM decisions
    // surface immediately.
    let cancelled = false;
    (async () => {
      const fresh = await refreshUser();
      if (cancelled) return;
      const target = routeAfterAuth(fresh ?? user);
      if (target !== "/referral-pending") router.replace(target);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  const handleCheck = async () => {
    setRefreshing(true);
    try {
      const fresh = await refreshUser();
      const target = routeAfterAuth(fresh ?? user);
      if (target !== "/referral-pending") router.replace(target);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  const firstName = user.fullName?.split(" ")[0] ?? "there";

  return (
    <OnboardingLayout currentStep={3} contentMaxWidth="xl">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 py-6 sm:px-7 sm:py-7 text-center"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#f0fdf9] text-[#0F766E] mb-3">
          <Clock size={22} />
        </div>
        <h1 className="font-serif text-xl sm:text-2xl font-bold text-gray-900">
          Thanks, {firstName} — your referral is under review
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Our team is reviewing your referral. You&apos;ll get access to your
          dashboard as soon as an ERM approves you. We&apos;ll email you when
          there&apos;s news.
        </p>

        <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50/60 p-4 text-left">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
            Your details
          </p>
          <p className="text-xs text-gray-700">
            <span className="font-mono">{user.email}</span>
          </p>
          {user.participantId && (
            <p className="text-xs text-gray-500 mt-0.5">
              Participant ID: <span className="font-mono text-gray-700">{user.participantId}</span>
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleCheck}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[#0F766E] hover:bg-[#0D9488] text-white shadow-sm hover:shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Checking…" : "Check status"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 transition cursor-pointer"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </motion.section>
    </OnboardingLayout>
  );
}
