"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Copy, Loader2, Mail } from "lucide-react";

import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { stepFromStatus } from "@/components/OnboardingProgressBar";
import { useAuth } from "@/lib/auth-context";
import { getParticipantMe, getOnboardingRoute, isDashboardStatus } from "@/lib/api";

/**
 * Step 3 — confirmation screen shown after OTP verification.
 *
 * Reads the freshly-issued participant ID from
 * {@code GET /api/participants/me}. Includes a routing-guard
 * useEffect that bounces the user to the correct onboarding page
 * if their {@code currentStatus} says they don't belong here yet
 * (or are already past it).
 *
 * Wrapped in {@link OnboardingLayout} so the logo + progress bar +
 * footer are consistent across every onboarding step.
 */
export default function ParticipantIdPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Auth + routing guard ──────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getParticipantMe()
      .then((profile) => {
        if (cancelled) return;
        setParticipantId(profile.participantId ?? null);
        setStatus(profile.currentStatus ?? null);

        // Routing guard — bounce the user to whichever onboarding
        // page matches their current status. Dashboard-grade legacy
        // users without an ID still see this page (don't break them).
        const target = getOnboardingRoute(profile.currentStatus);
        if (target !== "/participant-id" && !isDashboardStatus(profile.currentStatus)) {
          router.replace(target);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load participant ID");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, router]);

  const handleCopy = async () => {
    if (!participantId) return;
    try {
      await navigator.clipboard.writeText(participantId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <OnboardingLayout
      currentStep={stepFromStatus(status ?? "PARTICIPANT_ID_CREATED")}
      contentMaxWidth="xl"
    >
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-10 text-center"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 mb-4">
          <CheckCircle2 size={22} />
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
          Your Participant ID has been created
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          We&apos;ve sent this ID to your email as well. Please save it — it&apos;ll
          appear in all future communications and documents.
        </p>

        {error && (
          <div className="mt-5 mx-auto max-w-md p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm text-left">
            {error}
          </div>
        )}

        <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-[#f0fdf9] px-5 py-4 shadow-sm">
          <code className="font-mono font-bold text-xl sm:text-2xl tracking-[0.2em] text-[#0F766E]">
            {participantId ?? "—"}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!participantId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F766E] bg-white px-3 py-1.5 text-xs font-bold text-[#0F766E] hover:bg-[#0F766E] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Copy size={12} /> {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-500">
          <Mail size={12} /> A copy of this ID has been emailed to {user?.email ?? "your inbox"}.
        </p>

        <Link
          href="/agreement"
          className="mt-8 inline-flex items-center justify-center gap-2 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition"
        >
          Continue to Acknowledgment →
        </Link>

        <p className="mt-3 text-[11px] text-gray-400">
          The acknowledgment + document upload + program selection pages roll out
          with Phase 1C. For now, this button takes you to the existing agreement flow.
        </p>
      </motion.section>
    </OnboardingLayout>
  );
}
