"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { resetPassword } from "@/lib/api";

/**
 * /reset-password?token=… — final step of the password reset flow.
 * Two password fields (new + confirm) and a submit; on success the
 * user lands on /login?reset=true so the login page can show the
 * "Password reset! Sign in with your new password" banner.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Reset link is missing or malformed. Request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await resetPassword(token, password);
      router.push("/login?reset=true");
    } catch (err) {
      // Server-side messages cover "expired" and "invalid"; surface
      // them verbatim so the user knows to request a fresh link.
      setError(err instanceof Error
        ? err.message
        : "Could not reset password. The link may have expired.");
    } finally {
      setSubmitting(false);
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
        Set a new password
      </h1>
      <p className="text-gray-500 mb-8 text-center text-sm">
        Choose a new password for your account.
      </p>

      {!token && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            This link is missing its token. Please request a new reset link.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            New password
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              className="w-full pl-10 pr-11 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm new password
          </label>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="Re-enter password"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !token}
          className="w-full py-3 rounded-lg bg-[#0F766E] text-white text-sm font-bold hover:bg-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? "Updating…" : "Update password"}
        </button>

        <p className="text-sm text-center text-gray-500">
          Remember it now?{" "}
          <Link href="/login" className="text-[#0F766E] font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-gray-400">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
