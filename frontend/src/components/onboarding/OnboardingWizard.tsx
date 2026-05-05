"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowRight, ArrowLeft, BookOpen, Users, Award, Loader2,
  Code2, BarChart3, Palette, Cloud, Smartphone, Briefcase,
  type LucideIcon,
} from "lucide-react";
import { completeOnboarding } from "@/lib/api";

interface OnboardingWizardProps {
  studentName: string;
  onClose: () => void;
}

const TOTAL_STEPS = 3;

const CATEGORY_TILES: Array<{
  label: string;
  icon: LucideIcon;
  redirect: string;
  bg: string;
  iconColor: string;
}> = [
  { label: "Web Dev",   icon: Code2,       redirect: "/courses?category=Web%20Development", bg: "bg-teal-50",     iconColor: "text-teal-600" },
  { label: "Data Sci",  icon: BarChart3,   redirect: "/courses?category=Data%20Science",    bg: "bg-violet-50",   iconColor: "text-violet-600" },
  { label: "Design",    icon: Palette,     redirect: "/courses?category=Design",            bg: "bg-pink-50",     iconColor: "text-pink-600" },
  { label: "Cloud",     icon: Cloud,       redirect: "/courses?category=Cloud",             bg: "bg-sky-50",      iconColor: "text-sky-600" },
  { label: "Mobile",    icon: Smartphone,  redirect: "/courses?category=Mobile",            bg: "bg-amber-50",    iconColor: "text-amber-600" },
  { label: "Career",    icon: Briefcase,   redirect: "/services",                            bg: "bg-emerald-50",  iconColor: "text-emerald-600" },
];

export function OnboardingWizard({ studentName, onClose }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Fire-and-forget completion. We optimistically close on success;
  // network errors are silent — worst case the wizard shows again
  // next refresh, which is recoverable.
  const finish = async (then?: () => void) => {
    setBusy(true);
    try {
      await completeOnboarding();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      onClose();
      then?.();
    }
  };

  const handleSkip = () => finish();
  const handleBrowseAll = () => finish(() => router.push("/courses"));
  const handleCategoryClick = (redirect: string) => finish(() => router.push(redirect));

  const dots = Array.from({ length: TOTAL_STEPS }, (_, i) => (
    <span
      key={i}
      className={`block h-2 rounded-full transition-all ${
        i === step ? "bg-[#00A3A8] w-6" : "bg-gray-300 w-2"
      }`}
    />
  ));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome onboarding"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 pt-5 pb-3">
          <div className="flex items-center gap-2">{dots}</div>
          <button
            onClick={handleSkip}
            disabled={busy}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
            aria-label="Skip onboarding"
          >
            Skip <X size={14} />
          </button>
        </div>

        {/* Step body */}
        <div className="px-6 sm:px-10 pb-2">
          <AnimatePresence mode="wait">
            {step === 0 && <WelcomeStep key="0" name={studentName} />}
            {step === 1 && <HowItWorksStep key="1" />}
            {step === 2 && (
              <ChoosePathStep key="2" onPick={handleCategoryClick} disabled={busy} />
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-10 py-5 border-t border-gray-100 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={busy}
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <span />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00B4B8] transition shadow-sm"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleBrowseAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00B4B8] disabled:opacity-50 transition shadow-sm"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Browse All Courses <ArrowRight size={14} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22 }}
      className="py-4 sm:py-6"
    >
      {children}
    </motion.div>
  );
}

function WelcomeStep({ name }: { name: string }) {
  const firstName = name?.split(" ")[0] ?? "";
  return (
    <StepShell>
      <div className="text-center">
        <div className="text-4xl mb-3" aria-hidden="true">👋</div>
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          Welcome to Spire Info Tech{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="text-gray-600 leading-relaxed max-w-md mx-auto">
          You&apos;ve joined a learning platform where every course comes with a
          personal mentor. Let&apos;s get you started in 3 quick steps.
        </p>
      </div>
    </StepShell>
  );
}

function HowItWorksStep() {
  const steps: Array<{ icon: LucideIcon; title: string; body: string; n: string }> = [
    {
      n: "1",
      icon: BookOpen,
      title: "Choose a course",
      body: "Browse tech, design, and data science courses at your own pace.",
    },
    {
      n: "2",
      icon: Users,
      title: "Get a mentor",
      body: "Every course pairs you with a dedicated expert who guides you 1:1.",
    },
    {
      n: "3",
      icon: Award,
      title: "Learn and get certified",
      body: "Complete lessons, quizzes, and assignments to earn your certificate.",
    },
  ];

  return (
    <StepShell>
      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-1 text-center">
        How Spire Info Tech works
      </h2>
      <p className="text-sm text-gray-500 text-center mb-6">
        Three simple steps from sign-up to certificate.
      </p>
      <div className="space-y-4">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-[#00A3A8]/10 text-[#00A3A8] flex items-center justify-center font-bold shrink-0">
                {s.n}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Icon size={14} className="text-[#00A3A8] shrink-0" />
                  <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </StepShell>
  );
}

function ChoosePathStep({
  onPick,
  disabled,
}: {
  onPick: (redirect: string) => void;
  disabled: boolean;
}) {
  return (
    <StepShell>
      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-1 text-center">
        What do you want to learn?
      </h2>
      <p className="text-sm text-gray-500 text-center mb-6">
        Pick a path — or hit "Browse All Courses" below.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CATEGORY_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.label}
              onClick={() => onPick(tile.redirect)}
              disabled={disabled}
              className={`group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 ${tile.bg} hover:border-[#00A3A8]/40 hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center group-hover:scale-105 transition">
                <Icon size={20} className={tile.iconColor} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{tile.label}</span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
