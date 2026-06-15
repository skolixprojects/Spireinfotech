"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { BRAND } from "@/config/brand";
import { useMailAuth } from "@/lib/mail-auth-context";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type Values = z.infer<typeof schema>;

export default function MailLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login, status } = useMailAuth();
  const router = useRouter();

  // Already-signed-in shortcut — bounce an authenticated mail session
  // straight to /mail instead of showing the login form (mirrors the
  // LMS login page's behavior).
  useEffect(() => {
    if (status === "authenticated") router.replace("/mail");
  }, [status, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setError("");
    try {
      const result = await login(data.email, data.password);
      // Must-change accounts get no session — route to set-password with
      // the single-use change token in the URL.
      if (result.mustChangePassword && result.changeToken) {
        router.push(`/mail/set-password?token=${encodeURIComponent(result.changeToken)}`);
        return;
      }
      router.push("/mail");
    } catch (err: unknown) {
      // Surface the backend's generic message verbatim — no client-side
      // enumeration hints ("Invalid email or password.", etc.).
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
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
            {BRAND.shortName} Mail
          </h1>
          <p className="text-gray-500 mb-8 text-center text-sm">
            Sign in to your mailbox.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="username"
                {...register("email")}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
                placeholder="you@yourdomain.com"
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1.5">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
                  placeholder="Enter your password"
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
              {errors.password && (
                <p className="text-xs text-red-500 mt-1.5">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin mr-2" />}
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}
