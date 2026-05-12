"use client";

import { Check } from "lucide-react";

/**
 * 9-step progress bar shown across every Phase 1B onboarding page.
 * Steps mirror the workflow ladder grouped into user-visible
 * phases (Enroll, Verify, ID, Acknowledge, Documents, Program,
 * Agreement, Welcome, Dashboard).
 *
 * Callers pass {@code currentStep} (1-9) explicitly rather than
 * having the component read auth context — keeps it pure and lets
 * a page short-circuit the auto-derived step if it needs to.
 */
const STEPS: ReadonlyArray<string> = [
  "Enroll",
  "Verify",
  "ID",
  "Acknowledge",
  "Documents",
  "Program",
  "Agreement",
  "Welcome",
  "Dashboard",
];

export interface OnboardingProgressBarProps {
  /** 1-indexed step the user is currently on. Values outside [1, STEPS.length] clamp. */
  currentStep: number;
}

/**
 * Derives the 1-9 step number from a backend workflow status string.
 * Kept here so any onboarding page can do
 * {@code <OnboardingProgressBar currentStep={stepFromStatus(s)} />}
 * without re-implementing the mapping.
 */
export function stepFromStatus(status: string | null | undefined): number {
  switch (status) {
    case "DRAFT_STARTED":
    case "BASIC_INFO_SUBMITTED":
      return 1;
    case "EMAIL_VERIFICATION_PENDING":
    case "EMAIL_VERIFIED":
      return 2;
    case "PARTICIPANT_ID_CREATED":
    case "ID_EMAIL_SENT":
      return 3;
    case "ACKNOWLEDGMENT_ACCEPTED":
      return 4;
    case "DOCUMENTS_SUBMITTED":
    case "DOC_REVIEW_PENDING":
      return 5;
    case "PROGRAM_SELECTED":
      return 6;
    case "DOCUSIGN_SENT":
    case "CHECK_COPY_UPLOADED":
    case "DOCUSIGN_COMPLETED":
    case "SIGNED_AGREEMENT_SENT_TO_ERM":
      return 7;
    case "WELCOME_SENT":
    case "DEEPTHI_INTRO_SENT":
    case "ERM_ASSIGNED":
    case "COACHES_ASSIGNED":
      return 8;
    case "DASHBOARD_ENABLED":
    case "WEEKLY_REPORTING_ACTIVE":
    case "EMPLOYMENT_ACCEPTED":
    case "PHASE_1_COMPLETED":
    case "PAYMENT_PLAN_ACCEPTED":
    case "CHECK_TRACKING_ADDED":
    case "INVOICING_ACTIVE":
    case "PAYMENTS_TRACKED":
      return 9;
    default:
      return 1;
  }
}

export default function OnboardingProgressBar({ currentStep }: OnboardingProgressBarProps) {
  const clamped = Math.max(1, Math.min(STEPS.length, currentStep));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <ol className="flex items-start justify-between gap-1 sm:gap-2 overflow-x-auto">
        {STEPS.map((label, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = stepNumber < clamped;
          const isActive = stepNumber === clamped;
          const isPending = stepNumber > clamped;

          let circleClass = "border border-gray-300 bg-white text-gray-400";
          if (isCompleted) circleClass = "bg-emerald-600 border-emerald-600 text-white";
          else if (isActive) circleClass = "bg-[#0F766E] border-[#0F766E] text-white ring-4 ring-[#0F766E]/20 animate-pulse";

          let labelClass = "text-gray-400";
          if (isCompleted) labelClass = "text-emerald-700 font-semibold";
          else if (isActive) labelClass = "text-[#0F766E] font-bold";

          const prevDone = idx > 0 && stepNumber <= clamped;

          return (
            <li key={label} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-[2px] -mr-1 ${
                      prevDone
                        ? "bg-[#0F766E]"
                        : "bg-gray-200 [background-image:repeating-linear-gradient(90deg,transparent_0_4px,#d1d5db_4px_8px)]"
                    }`}
                  />
                )}
                <div
                  className={
                    "shrink-0 inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all text-[10px] sm:text-xs font-bold "
                    + circleClass
                  }
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted ? <Check size={14} /> : stepNumber}
                </div>
                {stepNumber < STEPS.length && (
                  <div
                    className={`flex-1 h-[2px] -ml-1 ${
                      isCompleted
                        ? "bg-[#0F766E]"
                        : "bg-gray-200 [background-image:repeating-linear-gradient(90deg,transparent_0_4px,#d1d5db_4px_8px)]"
                    }`}
                  />
                )}
              </div>
              <span className={`mt-1.5 text-[9px] sm:text-[11px] text-center leading-tight ${labelClass} ${isPending && stepNumber !== clamped + 1 && stepNumber !== clamped - 1 ? "hidden sm:block" : ""}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-gray-500 text-center">
        Step {clamped} of {STEPS.length}: <span className="font-semibold text-gray-700">{STEPS[clamped - 1]}</span>
      </p>
    </div>
  );
}
