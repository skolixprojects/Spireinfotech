"use client";

import { Check } from "lucide-react";

/**
 * 9-step progress bar shown across every Phase 1B onboarding page.
 *
 * Layout strategy:
 *   - Desktop (≥ sm): all 9 circles + short labels inline, no
 *     horizontal scroll, labels capped at 7 characters so they
 *     don't fight for width.
 *   - Mobile (< sm): the row of circles hides; we render a
 *     compact "Step X of 9: Name" pill instead so a 320 px screen
 *     never overflows.
 *
 * Callers pass {@code currentStep} (1-9) explicitly rather than
 * having the component read auth context — keeps it pure and lets
 * a page short-circuit the auto-derived step if it needs to.
 */
/**
 * Default labels — historical 9-step lifecycle, kept so any caller
 * that doesn't pass an explicit {@code steps} prop renders the same
 * progress bar it always did. Phase 1C's quick-signup pages pass a
 * compact 2-step list instead.
 */
const STEPS: ReadonlyArray<string> = [
  "Enroll",
  "Verify",
  "ID",
  "Accept",
  "Docs",
  "Program",
  "Sign",
  "Welcome",
  "Done",
];

export interface OnboardingProgressBarProps {
  /** 1-indexed step the user is currently on. Clamped to the steps array. */
  currentStep: number;
  /** Optional override — pass a shorter list (e.g. ["Sign Up", "Verify"]) to render a 2-step bar. */
  steps?: ReadonlyArray<string>;
}

/**
 * Derives the 1-9 step number from a backend workflow status string.
 * Kept here so any onboarding page can do
 * {@code <OnboardingProgressBar currentStep={stepFromStatus(s)} />}
 * without re-implementing the mapping.
 */
export function stepFromStatus(status: string | null | undefined): number {
  // Phase 5B: collapsed to survivor-only cases. The pre-dashboard
  // onboarding is a single step now (the 6 sub-steps live inside the
  // "Complete Your Profile" tab and drive off the boolean flags).
  switch (status) {
    case "DRAFT_STARTED":
      return 1;
    case "WELCOME_SENT":
      return 2;
    case "DEEPTHI_INTRO_SENT":
    case "ERM_ASSIGNED":
      return 3;
    case "DASHBOARD_ENABLED":
    case "WEEKLY_REPORTING_ACTIVE":
    case "EMPLOYMENT_ACCEPTED":
    case "PHASE_1_COMPLETED":
    case "PAYMENT_PLAN_ACCEPTED":
    case "CHECK_TRACKING_ADDED":
    case "INVOICING_ACTIVE":
    case "PAYMENTS_TRACKED":
      return 4;
    default:
      return 1;
  }
}

export default function OnboardingProgressBar({
  currentStep,
  steps,
}: OnboardingProgressBarProps) {
  const STEPS_TO_RENDER = steps && steps.length > 0 ? steps : STEPS;
  const clamped = Math.max(1, Math.min(STEPS_TO_RENDER.length, currentStep));
  const activeLabel = STEPS_TO_RENDER[clamped - 1];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 sm:px-5 sm:py-3.5">
      {/* Mobile-only compact summary. Phones can't fit 9 circles
          legibly so we collapse to one line. */}
      <div className="sm:hidden flex items-center justify-between gap-3">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#0F766E] text-white text-xs font-bold animate-pulse">
          {clamped}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
            Step {clamped} of {STEPS_TO_RENDER.length}
          </p>
          <p className="text-sm font-bold text-[#0F766E] truncate">{activeLabel}</p>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {clamped}/{STEPS_TO_RENDER.length}
        </div>
      </div>

      {/* Desktop layout: 9 circles + short labels inline. */}
      <ol className="hidden sm:flex items-start justify-between gap-1">
        {STEPS_TO_RENDER.map((label, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = stepNumber < clamped;
          const isActive = stepNumber === clamped;

          let circleClass = "border border-gray-300 bg-white text-gray-400";
          if (isCompleted) circleClass = "bg-emerald-600 border-emerald-600 text-white";
          else if (isActive) circleClass = "bg-[#0F766E] border-[#0F766E] text-white ring-4 ring-[#0F766E]/20 animate-pulse";

          let labelClass = "text-gray-400";
          if (isCompleted) labelClass = "text-emerald-700 font-semibold";
          else if (isActive) labelClass = "text-[#0F766E] font-bold";

          // Connector lights up between any two completed-or-active steps.
          const leftConnectorActive = idx > 0 && stepNumber <= clamped;
          const rightConnectorActive = isCompleted; // line to the right is teal only if THIS step is done

          return (
            <li key={label} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center w-full">
                {idx > 0 ? (
                  <div
                    className={
                      "flex-1 h-[2px] " + (leftConnectorActive ? "bg-[#0F766E]" : "bg-gray-200")
                    }
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <div
                  className={
                    "shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full transition-all text-xs font-bold mx-1 "
                    + circleClass
                  }
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted ? <Check size={14} /> : stepNumber}
                </div>
                {stepNumber < STEPS_TO_RENDER.length ? (
                  <div
                    className={
                      "flex-1 h-[2px] " + (rightConnectorActive ? "bg-[#0F766E]" : "bg-gray-200")
                    }
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              <span className={`mt-1.5 text-[11px] text-center ${labelClass}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="hidden sm:block mt-2 text-[11px] text-gray-500 text-center">
        Step {clamped} of {STEPS_TO_RENDER.length}: <span className="font-semibold text-gray-700">{activeLabel}</span>
      </p>
    </div>
  );
}
