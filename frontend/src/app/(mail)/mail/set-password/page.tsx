"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { BRAND } from "@/config/brand";
import { useMailAuth } from "@/lib/mail-auth-context";

const schema = z
  .object({
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

// Lightweight strength heuristic (length + character classes) — purely
// advisory UX; the backend enforces the 8-char minimum.
function strength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Strong"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#14B8A6", "#0F766E", "#0F766E"];
  return { score, label: labels[score], color: colors[score] };
}

function SetPasswordForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { setPassword } = useMailAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where both the must-change redirect AND (Phase 3) admin SETUP/RESET
  // links land.
  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const pw = watch("newPassword") ?? "";
  const meter = strength(pw);

  const onSubmit = async (data: Values) => {
    setError("");
    try {
      await setPassword(token, data.newPassword);
      router.push("/mail");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not set your password.");
    }
  };

  // No token in the URL → can't proceed. (Direct visit / stale bookmark.)
  if (!token) {
    return (
      <GlassCard className="p-8 text-center">
        <ShieldAlert size={28} className="mx-auto text-amber-500 mb-3" />
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          This link is incomplete
        </h1>
        <p className="text-sm text-gray-600">
          The password link is missing its token. Sign in again, or request a
          new link from your administrator.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-8">
      <div className="flex justify-center mb-6">
        <Image
          src={BRAND.logoUrl}
          alt={BRAND.logoAlt}
          width={56}
          height={56}
          priority
          className="h-14 w-14 object-contain"
        />
      </div>
      <h1 className="font-serif text-3xl font-bold text-gray-900 mb-1 text-center">
        Set a new password
      </h1>
      <p className="text-gray-500 mb-8 text-center text-sm">
        Choose a password for your {BRAND.shortName} mailbox.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <p>{error}</p>
          <p className="mt-1 text-xs text-red-500">
            If this link has expired, request a new one from your administrator.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            New password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("newPassword")}
              className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
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
          {pw.length > 0 && (
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(meter.score / 5) * 100}%`, backgroundColor: meter.color }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: meter.color }}>
                {meter.label}
              </p>
            </div>
          )}
          {errors.newPassword && (
            <p className="text-xs text-red-500 mt-1.5">{errors.newPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm password
          </label>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            {...register("confirm")}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
            placeholder="Re-enter your password"
          />
          {errors.confirm && (
            <p className="text-xs text-red-500 mt-1.5">{errors.confirm.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 size={16} className="animate-spin mr-2" />}
          {isSubmitting ? "Saving..." : "Set password & sign in"}
        </Button>
      </form>
    </GlassCard>
  );
}

export default function MailSetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Suspense
          fallback={
            <div className="text-center py-10 text-gray-400">Loading…</div>
          }
        >
          <SetPasswordForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
