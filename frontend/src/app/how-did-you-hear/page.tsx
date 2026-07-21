"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle, ArrowRight, Building2, MessageCircle,
  Loader2, Search, Users,
} from "lucide-react";

import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { useAuth } from "@/lib/auth-context";
import {
  routeAfterAuth, submitAttribution,
  type AttributionSource,
} from "@/lib/api";

/**
 * Two-pipeline attribution screen — shown once, immediately after
 * email verification. Every user picks one option; "Reference" forks
 * them into the reference pipeline (holding page + ERM approval);
 * every other option flips them to DIRECT and unlocks the dashboard.
 *
 * Idempotent: users who already picked a pipeline never see this
 * page — the guard below re-routes them via routeAfterAuth.
 */

const QUICK_SIGNUP_STEPS = ["Sign Up", "Verify", "About"] as const;

interface Option {
  value: AttributionSource;
  label: string;
  description: string;
  Icon: typeof Users;
}

const OPTIONS: ReadonlyArray<Option> = [
  {
    value: "SOCIAL_MEDIA",
    label: "Social media",
    description: "Facebook, Instagram, LinkedIn, YouTube.",
    Icon: MessageCircle,
  },
  {
    value: "GOOGLE_SEARCH",
    label: "Google search",
    description: "I searched for something and found Spire.",
    Icon: Search,
  },
  {
    value: "FRIEND_COLLEAGUE",
    label: "Friend or colleague",
    description: "Someone I know mentioned Spire in passing.",
    Icon: Users,
  },
  {
    value: "EVENT_WEBINAR",
    label: "Event or webinar",
    description: "A meetup, conference, workshop, or webinar.",
    Icon: Building2,
  },
  {
    value: "REFERENCE",
    label: "Reference",
    description:
      "I was referred through a formal partnership. My referral will be reviewed by the team.",
    Icon: ArrowRight,
  },
];

export default function HowDidYouHearPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, refreshUser } = useAuth();

  const [selected, setSelected] = useState<AttributionSource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Gate: must be signed in + email verified + pipeline still null.
  // If any prior state is set, re-route via the canonical helper.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!user) return;
    if (!user.emailVerified) {
      router.replace("/verify-email");
      return;
    }
    if (user.pipeline) {
      router.replace(routeAfterAuth(user));
    }
  }, [isLoading, isAuthenticated, user, router]);

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitAttribution(selected);
      const fresh = await refreshUser();
      router.replace(routeAfterAuth(fresh ?? user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answer");
      setSubmitting(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <OnboardingLayout currentStep={3} steps={QUICK_SIGNUP_STEPS} contentMaxWidth="xl">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 py-6 sm:px-7 sm:py-7"
      >
        <h1 className="font-serif text-xl sm:text-2xl font-bold text-gray-900 text-center">
          How did you hear about us?
        </h1>
        <p className="text-gray-500 mt-2 text-center text-xs sm:text-sm">
          One quick question so we can point you in the right direction.
        </p>

        <div className="mt-6 space-y-2.5">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                disabled={submitting}
                className={
                  "w-full text-left rounded-xl border p-3.5 transition cursor-pointer flex items-start gap-3 " +
                  (isSelected
                    ? "border-[#0F766E] bg-[#f0fdf9] ring-2 ring-[#0F766E]/20 shadow-sm"
                    : "border-gray-200 bg-white hover:border-[#0F766E]/40 hover:bg-[#f0fdf9]/40")
                  + " disabled:opacity-60 disabled:cursor-not-allowed"
                }
              >
                <div
                  className={
                    "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center " +
                    (isSelected ? "bg-[#0F766E] text-white" : "bg-gray-100 text-gray-500")
                  }
                >
                  <opt.Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={
                    "text-sm font-bold " +
                    (isSelected ? "text-[#0F766E]" : "text-gray-900")
                  }>
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className={
            "mt-6 w-full inline-flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-lg transition-all "
            + (selected && !submitting
              ? "bg-[#0F766E] hover:bg-[#0D9488] text-white shadow-md hover:shadow-lg cursor-pointer active:scale-[0.99]"
              : "bg-gray-200 text-gray-500 cursor-not-allowed")
          }
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          {submitting ? "Saving…" : (<>Continue <ArrowRight size={14} /></>)}
        </button>
      </motion.section>
    </OnboardingLayout>
  );
}
