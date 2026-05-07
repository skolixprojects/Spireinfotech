"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    terms: z.literal(true, { message: "You must accept the terms" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { register: registerUser } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupValues) => {
    setError("");
    try {
      // Backend issues no JWT until OTP is verified — route to the
      // verify page with the email pre-populated so the user just
      // pastes the code from their inbox.
      const result = await registerUser(data.name, data.email, data.password);
      const target = result?.requiresVerification
        ? `/verify-email?email=${encodeURIComponent(data.email)}`
        : "/dashboard";
      window.location.href = target;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
        Create your account
      </h1>
      <p className="text-gray-500 mb-8">
        Start your learning journey with Spire Info Tech today.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
          <input
            type="text"
            {...register("name")}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
            placeholder="Arjun Mehta"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1.5">{errors.name.message}</p>}
        </div>

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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              {...register("password")}
              className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
              placeholder="At least 6 characters"
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
          <input
            type="password"
            {...register("confirmPassword")}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
            placeholder="Repeat your password"
          />
          {errors.confirmPassword && <p className="text-xs text-red-500 mt-1.5">{errors.confirmPassword.message}</p>}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            {...register("terms")}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6]"
          />
          <span className="text-xs text-gray-500">
            I agree to the{" "}
            <Link href="#" className="text-[#0F766E] hover:underline">Terms of Service</Link>{" "}and{" "}
            <Link href="#" className="text-[#0F766E] hover:underline">Privacy Policy</Link>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-500 -mt-3">{errors.terms.message}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#0F766E]/90 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-sm text-center text-gray-500 mt-8">
        Already have an account?{" "}
        <Link href="/login" className="text-[#0F766E] font-semibold hover:underline">Sign in</Link>
      </p>
    </motion.div>
  );
}
