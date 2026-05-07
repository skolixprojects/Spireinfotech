"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { verifyEmailToken } from "@/lib/api";

/**
 * /verify-email?token=… — the destination of the verification email
 * link. Hits the public verify endpoint on mount, shows a friendly
 * status, and redirects to /login?verified=true after 3s on success.
 *
 * Failure modes (expired/invalid token) render a static error card
 * instead of redirecting; the user can request a new verification
 * link by signing up or contacting support.
 */
function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState("fail");
      setReason("Verification link is missing its token.");
      return;
    }
    verifyEmailToken(token)
      .then((d) => {
        if (cancelled) return;
        if (d?.valid) {
          setState("ok");
          // Brief celebratory pause, then bounce to login with the
          // banner cue so the user sees confirmation in two places.
          setTimeout(() => router.push("/login?verified=true"), 3000);
        } else {
          setState("fail");
          setReason(d?.reason ?? "This verification link is invalid or has expired.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState("fail");
        setReason(err instanceof Error ? err.message : "Verification failed");
      });
    return () => { cancelled = true; };
  }, [token, router]);

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

      {state === "loading" && (
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-[#0F766E] mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold text-gray-900">Verifying your email…</h1>
          <p className="text-sm text-gray-500 mt-2">This only takes a moment.</p>
        </div>
      )}

      {state === "ok" && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mb-4">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Email verified!</h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Your account is ready to go. You&apos;ll be redirected to the sign-in page in a moment.
          </p>
          <Link
            href="/login?verified=true"
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#0F766E] text-white text-sm font-bold hover:bg-[#0D9488] transition-colors"
          >
            Sign in now
          </Link>
        </div>
      )}

      {state === "fail" && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
            <XCircle size={28} className="text-red-600" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Verification failed</h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            {reason}
          </p>
          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            If your link expired, sign in to your account — we&apos;ll send a
            fresh verification email automatically. If you&apos;re still stuck,
            contact support.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-gray-400">Loading…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
