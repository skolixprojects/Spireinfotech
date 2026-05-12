"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import OnboardingProgressBar from "@/components/OnboardingProgressBar";

/**
 * Minimal full-viewport layout for every Phase 1B onboarding page
 * (/enroll, /verify-email, /participant-id, /acknowledgment,
 * /document-upload, /program-selection, /welcome).
 *
 *   ┌──── viewport ────────────────────────────────────────┐
 *   │           [Spire logo]    (small, centered)          │
 *   │           [OnboardingProgressBar]                    │
 *   │                                                      │
 *   │           {children}    (centered, max-w-2xl card)   │
 *   │                                                      │
 *   │           © 2026 Spire Info Tech                     │
 *   └──────────────────────────────────────────────────────┘
 *
 * Owns no auth logic and reads no auth context — each page wraps
 * its own auth checks. Owns the visual chrome only.
 *
 * Pages MUST also live OUTSIDE the {@code (auth)} route group or
 * its two-column marketing layout will stack on top of this one.
 * The /enroll and /verify-email routes were relocated to the app
 * root for exactly that reason.
 */
export interface OnboardingLayoutProps {
  /** 1-9 step number — drives the progress bar. */
  currentStep: number;
  /** Page-specific content (the form card, etc.). */
  children: ReactNode;
  /** Max width of the inner content area. Defaults to {@code 2xl}. */
  contentMaxWidth?: "xl" | "2xl" | "3xl";
}

const MAX_WIDTH_CLASS: Record<NonNullable<OnboardingLayoutProps["contentMaxWidth"]>, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};

export default function OnboardingLayout({
  currentStep,
  children,
  contentMaxWidth = "2xl",
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Header: logo only, centred, links back to public site. */}
      <header className="pt-8 sm:pt-10 pb-4 flex justify-center">
        <Link href="/" className="inline-flex items-center gap-2" aria-label="Spire Info Tech home">
          <Image
            src="/logo.png"
            alt="Spire Info Tech"
            width={36}
            height={36}
            priority
            className="h-9 w-9 object-contain"
          />
          <span className="font-serif text-base font-bold text-[#0F766E]">
            Spire Info Tech
          </span>
        </Link>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 pb-12 ${MAX_WIDTH_CLASS[contentMaxWidth]}`}>
        <div className="mb-6">
          <OnboardingProgressBar currentStep={currentStep} />
        </div>
        {children}
      </main>

      <footer className="py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Spire Info Tech. All rights reserved.
      </footer>
    </div>
  );
}
