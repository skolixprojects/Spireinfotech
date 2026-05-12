"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { enrollParticipant } from "@/lib/api";

const TECHNOLOGY_OPTIONS = [
  "Java Full Stack",
  "Python Full Stack",
  ".NET Full Stack",
  "Data Engineering",
  "Cloud & DevOps",
  "React / Angular Frontend",
  "QA / Testing",
  "Data Science & AI",
  "Salesforce",
  "ServiceNow",
  "Cybersecurity",
  "Other",
] as const;

const AVAILABILITY_OPTIONS = [
  "Full-time",
  "Part-time",
  "Weekends only",
  "Flexible",
] as const;

const EXPERIENCE_OPTIONS = [
  "Entry Level (0-2 years)",
  "Mid Level (3-5 years)",
  "Senior Level (6+ years)",
] as const;

const enrollSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full legal name is required")
    .refine((v) => v.trim().split(/\s+/).length >= 2, {
      message: "Enter your full legal name (first and last)",
    }),
  email: z.string().email("Please enter a valid email address"),
  phone: z
    .string()
    .min(7, "Phone number is required")
    .regex(/^[+\d\s()-]{7,20}$/, "Use only digits, spaces, +, -, or parentheses"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  location: z.string().optional(),
  availability: z.enum(AVAILABILITY_OPTIONS),
  selectedTechnology: z.enum(TECHNOLOGY_OPTIONS),
  targetExperienceLevel: z.enum(EXPERIENCE_OPTIONS),
});

type EnrollValues = z.infer<typeof enrollSchema>;

// Tailwind helpers shared by every input so the visual rhythm stays
// constant across labels / inputs / selects.
const INPUT_CLASS =
  "w-full px-4 py-3 text-base rounded-lg border border-gray-200 bg-white " +
  "text-gray-900 placeholder-gray-400 transition focus:outline-none " +
  "focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] " +
  "disabled:bg-gray-50 disabled:cursor-not-allowed";
const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1";

export default function EnrollPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EnrollValues>({
    resolver: zodResolver(enrollSchema),
  });

  const onSubmit = async (data: EnrollValues) => {
    setError("");
    try {
      const result = await enrollParticipant({
        fullName: data.fullName.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        password: data.password,
        location: data.location?.trim() || undefined,
        availability: data.availability,
        selectedTechnology: data.selectedTechnology,
        targetExperienceLevel: data.targetExperienceLevel,
      });
      const target = result?.requiresVerification
        ? `/verify-email?email=${encodeURIComponent(data.email.trim())}`
        : "/participant-id";
      router.push(target);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enrollment failed. Please try again.");
    }
  };

  return (
    <OnboardingLayout currentStep={1} contentMaxWidth="xl">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8"
      >
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-2 text-center">
          Start your journey with Spire Info Tech
        </h1>
        <p className="text-gray-500 mb-7 text-center text-sm">
          Tell us a bit about yourself — this kicks off your participant lifecycle.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>
              Full legal name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              {...register("fullName")}
              className={INPUT_CLASS + (errors.fullName ? " !border-red-500" : "")}
              placeholder="Arjun Mehta"
            />
            {errors.fullName && <p className="text-xs text-red-500 mt-1.5">{errors.fullName.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              className={INPUT_CLASS + (errors.email ? " !border-red-500" : "")}
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              autoComplete="tel"
              {...register("phone")}
              className={INPUT_CLASS + (errors.phone ? " !border-red-500" : "")}
              placeholder="+91 90000 00000"
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1.5">{errors.phone.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                {...register("password")}
                className={INPUT_CLASS + " pr-11" + (errors.password ? " !border-red-500" : "")}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1.5">{errors.password.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Location <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              autoComplete="address-level2"
              {...register("location")}
              className={INPUT_CLASS}
              placeholder="City, state, country"
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Availability <span className="text-red-500">*</span>
            </label>
            <select
              {...register("availability")}
              defaultValue=""
              className={INPUT_CLASS + (errors.availability ? " !border-red-500" : "")}
            >
              <option value="" disabled>Choose availability…</option>
              {AVAILABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.availability && <p className="text-xs text-red-500 mt-1.5">{errors.availability.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Technology / Skillset <span className="text-red-500">*</span>
            </label>
            <select
              {...register("selectedTechnology")}
              defaultValue=""
              className={INPUT_CLASS + (errors.selectedTechnology ? " !border-red-500" : "")}
            >
              <option value="" disabled>Choose a track…</option>
              {TECHNOLOGY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.selectedTechnology && <p className="text-xs text-red-500 mt-1.5">{errors.selectedTechnology.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Target Experience Level <span className="text-red-500">*</span>
            </label>
            <select
              {...register("targetExperienceLevel")}
              defaultValue=""
              className={INPUT_CLASS + (errors.targetExperienceLevel ? " !border-red-500" : "")}
            >
              <option value="" disabled>Choose experience level…</option>
              {EXPERIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.targetExperienceLevel && <p className="text-xs text-red-500 mt-1.5">{errors.targetExperienceLevel.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {isSubmitting ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-7">
          Already have an account?{" "}
          <Link href="/login" className="text-[#0F766E] font-semibold hover:underline">Sign in</Link>
        </p>
      </motion.section>
    </OnboardingLayout>
  );
}
