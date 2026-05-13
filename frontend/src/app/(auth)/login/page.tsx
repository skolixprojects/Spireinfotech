"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, MailWarning } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { EmailNotVerifiedError } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  // Set when login is rejected because the account isn't verified.
  // Carries the email so we can render a "Verify Now" link that
  // routes straight to /verify-email with the address pre-filled.
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const { login, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  // Banner cues from email-confirmation flows. ?verified=true after
  // a fresh email-verification click; ?reset=true after a password
  // reset succeeds. Both are positive — render as a green note above
  // the form so the user knows their action landed.
  const verified = searchParams.get("verified") === "true";
  const resetDone = searchParams.get("reset") === "true";

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      // Already-logged-in shortcut — bounce to whichever dashboard
      // matches the user's role.
      (async () => {
        const { dashboardRouteForRole } = await import("@/lib/api");
        router.push(dashboardRouteForRole(user?.role));
      })();
    }
  }, [authLoading, isAuthenticated, user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginValues) => {
    setError("");
    setNeedsVerification(null);
    try {
      const auth = await login(data.email, data.password);
      // Routing after login:
      //   - New participant lifecycle (has currentStatus) → route
      //     to whichever onboarding step matches the status.
      //   - Staff roles → role-specific dashboard.
      //   - Everyone else → original redirect target.
      const status = auth.user?.currentStatus;
      const role = auth.user?.role ?? "";
      // Lazy import to avoid pulling the helpers into every page
      // bundle just for this branch.
      const { getOnboardingRoute, isDashboardStatus, dashboardRouteForRole } =
        await import("@/lib/api");
      // Staff roles route to their own dashboards regardless of
      // currentStatus (they don't have a participant lifecycle).
      // Resolve via dashboardRouteForRole so legacy ADMIN, SYSTEM_ADMIN,
      // OPERATIONS_ADMIN, INSTRUCTOR, etc. all funnel through the
      // same map — no hand-maintained role list to forget on.
      const roleRoute = dashboardRouteForRole(role);
      if (roleRoute !== "/dashboard") {
        window.location.href = roleRoute;
        return;
      }
      if (status) {
        if (!isDashboardStatus(status)) {
          window.location.href = getOnboardingRoute(status);
          return;
        }
      }
      window.location.href = redirect;
    } catch (err: unknown) {
      if (err instanceof EmailNotVerifiedError) {
        // Stash the email so the banner below can render a deep link
        // to /verify-email with it pre-filled. No "wrong password"
        // copy in this case — credentials are fine, account isn't.
        setNeedsVerification(err.email);
        return;
      }
      setError(err instanceof Error ? err.message : "Invalid email or password");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex justify-center mb-6">
        <Image
          src="/logo.png"
          alt="Spire Info Tech"
          width={64}
          height={64}
          priority
          className="h-16 w-16 object-contain"
        />
      </div>
      <h1 className="font-serif text-3xl font-bold text-gray-900 mb-2 text-center">
        Welcome back
      </h1>
      <p className="text-gray-500 mb-8">
        Sign in to continue your learning journey.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {needsVerification && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
          <MailWarning size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">Your email isn&apos;t verified yet.</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Check your inbox for the 6-digit code we sent when you signed up,
              then verify your account before logging in.
            </p>
            <Link
              href={`/verify-email?email=${encodeURIComponent(needsVerification)}`}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[#0F766E] hover:text-[#0D9488]"
            >
              Verify Now →
            </Link>
          </div>
        </div>
      )}

      {verified && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          Email verified. You can now sign in.
        </div>
      )}

      {resetDone && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          Password reset. Sign in with your new password.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
          <input
            type="email"
            {...register("email")}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
            placeholder="you@example.com"
          />
          {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <Link href="/forgot-password" className="text-xs text-[#0D9488] hover:text-[#0F766E] font-medium transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              {...register("password")}
              className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500 mt-1.5">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0F766E]/90 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="mt-6 p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
        <strong>Demo:</strong> admin@spire.dev / admin123
      </div>

      <p className="text-sm text-center text-gray-500 mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[#0F766E] font-semibold hover:underline">Create one</Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-gray-400">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
