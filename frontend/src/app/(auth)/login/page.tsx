"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginValues) => {
    setError("");
    try {
      await login(data.email, data.password);
      window.location.href = redirect;
    } catch (err: unknown) {
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
          <input
            type="email"
            {...register("email")}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
            placeholder="you@example.com"
          />
          {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <Link href="#" className="text-xs text-[#00B4B8] hover:text-[#00A3A8] font-medium transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              {...register("password")}
              className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:border-transparent transition"
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
          className="w-full py-3 rounded-lg bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00A3A8]/90 focus:outline-none focus:ring-2 focus:ring-[#5FE0E3] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        <Link href="/signup" className="text-[#00A3A8] font-semibold hover:underline">Create one</Link>
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
