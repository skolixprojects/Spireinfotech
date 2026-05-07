"use client";

import { useState } from "react";
import { Loader2, Mail, Wrench, CheckCircle2, XCircle } from "lucide-react";
import { sendTestEmail } from "@/lib/api";

/**
 * TODO: Remove this widget before production launch.
 *
 * Tiny diagnostic block at the bottom of the homepage that pokes
 * the public /api/test/send-email endpoint. Used during the email
 * rollout to confirm SMTP creds + From-header rendering without
 * needing to sign up. Styled deliberately small and muted so it
 * doesn't compete with the marketing content above it.
 */
export function TestEmailWidget() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await sendTestEmail(email.trim());
      setResult(r);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white border-t border-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={14} className="text-gray-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Email test (temporary)
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {submitting ? "Sending…" : "Send Test Email"}
            </button>
          </form>

          {result && (
            <div
              className={
                "mt-3 flex items-start gap-2 text-sm " +
                (result.success ? "text-emerald-700" : "text-red-600")
              }
            >
              {result.success
                ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                : <XCircle size={15} className="mt-0.5 shrink-0" />}
              <span>{result.message}</span>
            </div>
          )}

          <p className="mt-3 text-[11px] text-gray-400">
            Remove this section before going live.
          </p>
        </div>
      </div>
    </section>
  );
}
