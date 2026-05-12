"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileSignature, Loader2 } from "lucide-react";

import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { useAuth } from "@/lib/auth-context";
import { getOnboardingRoute, getParticipantMe, isDashboardStatus } from "@/lib/api";

/**
 * Step 7 placeholder. Real DocuSign integration ships with
 * Phase 3B; this page just acknowledges that the participant has
 * completed program selection and is waiting on the agreement
 * envelope.
 *
 * Gates the same way every onboarding page does — bounces a user
 * who shouldn't be here back to their canonical route. Users with
 * `currentStatus = PROGRAM_SELECTED` (just submitted Phase 3A) and
 * users mid-DocuSign (DOCUSIGN_SENT, CHECK_COPY_UPLOADED) stay on
 * this page until Phase 3B replaces it with the real envelope UI.
 *
 * NOTE: the old Terms-of-Service + email-reply flow that used to
 * live at this URL has been moved to /agreement-legacy. New
 * onboarding traffic should never reach it.
 */
export default function AgreementPlaceholderPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await getParticipantMe();
        if (cancelled) return;
        const status = profile.currentStatus;

        // These statuses mean "you're at the agreement step" —
        // stay on this placeholder.
        const stayHere = [
          "PROGRAM_SELECTED",
          "DOCUSIGN_SENT",
          "CHECK_COPY_UPLOADED",
        ];
        if (stayHere.includes(status ?? "") || isDashboardStatus(status)) {
          setChecking(false);
          return;
        }
        // Anything else — send the user to their canonical page.
        router.replace(getOnboardingRoute(status));
      } catch {
        // If the profile lookup fails, leave the placeholder up
        // rather than bouncing into an error loop.
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <OnboardingLayout currentStep={7} contentMaxWidth="xl">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#f0fdf9] text-[#0F766E] mb-4">
          <FileSignature size={22} />
        </div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          Agreement signing — coming next
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Your program selection has been recorded. The Operations team is preparing
          your agreement envelope. You&apos;ll receive an email with a link to review
          and sign the agreement shortly.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          DocuSign integration rolls out with Phase 3B. For now, the operations team
          will reach out to you directly.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center gap-2 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm hover:shadow-md transition"
        >
          Back to dashboard
        </Link>
      </motion.section>
    </OnboardingLayout>
  );
}
