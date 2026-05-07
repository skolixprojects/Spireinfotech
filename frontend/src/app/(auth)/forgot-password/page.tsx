"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { requestPasswordReset } from "@/lib/api";

/**
 * /forgot-password — single-input form that asks the backend for a
 * reset link. The backend deliberately reports success regardless
 * of whether the email is on file (account-enumeration defense), so
 * this page just shows a generic "if that email is registered..."
 * confirmation on submit; we never tell the visitor whether the
 * account exists.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      // Even network failures shouldn't block the friendly response —
      // but show the actual error so the user knows to retry.
      setError(err instanceof Error ? err.message : "Could not send reset link");
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
        Reset your password
      </h1>
      <p className="text-gray-500 mb-8 text-center text-sm">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      {submitted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-base font-bold text-emerald-800">Check your email</p>
            <p className="text-sm text-emerald-700 mt-1 leading-relaxed">
              If that email is registered with us, a reset link is on its way.
              The link expires in 1 hour.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900 mt-3"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-[#0F766E] text-white text-sm font-bold hover:bg-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? "Sending…" : "Send reset link"}
          </button>

          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0F766E] transition-colors"
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </form>
      )}
    </motion.div>
  );
}
