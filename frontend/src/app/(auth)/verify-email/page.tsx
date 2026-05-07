"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { resendVerificationCode, verifyCode } from "@/lib/api";

/**
 * /verify-email?email=… — OTP gate for new signups.
 *
 * The user lands here straight from /signup with their email
 * pre-populated. They paste or type the 6-digit code we emailed
 * them; on success the backend hands back an AuthResponse and the
 * page promotes the session and routes to /dashboard.
 *
 * UX details:
 *   - Six input boxes, auto-advancing on input, backspace-aware,
 *     paste-aware (paste a 6-digit code into any box and it spreads
 *     across all boxes).
 *   - Email is partially masked in the copy ("abhi***5@gmail.com")
 *     for shoulder-surfing privacy.
 *   - Wrong code → boxes shake + clear, message highlights remaining
 *     attempts (server enforces a 5-strike lockout).
 *   - Resend button has a 150-second cooldown the user can see;
 *     server enforces 60s independently.
 */

const RESEND_COOLDOWN_SECONDS = 150;
const CODE_LENGTH = 6;

function maskEmail(email: string | null | undefined): string {
  if (!email) return "your email";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  // Keep first 1–2 chars + last char of the local part; mask the
  // middle. "abhizoe5" -> "abhi***5", "ab" -> "a***", "a" -> "a***".
  const head = local.slice(0, Math.min(4, Math.max(1, local.length - 2)));
  const tail = local.slice(-1);
  return `${head}***${tail}${domain}`;
}

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendInfo, setResendInfo] = useState("");

  // refs for the 6 input boxes — used for autoadvance/backspace/focus.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const masked = useMemo(() => maskEmail(email), [email]);
  const code = digits.join("");
  const ready = code.length === CODE_LENGTH && /^\d{6}$/.test(code);

  // Autofocus the first box on mount.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Resend cooldown countdown — runs every second while > 0.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ── Input handlers ──────────────────────────────────────────────

  const setDigitAt = (i: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  const handleChange = (i: number, raw: string) => {
    // Strip non-digits; if a paste lands here we'll route via
    // handlePaste, but be defensive in case it slips through.
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigitAt(i, "");
      return;
    }
    if (cleaned.length === 1) {
      setDigitAt(i, cleaned);
      // Auto-advance.
      if (i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    } else {
      // Multi-char input (some Android keyboards, autofill) — spread
      // across boxes starting at i.
      const chars = cleaned.slice(0, CODE_LENGTH - i).split("");
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((c, k) => { next[i + k] = c; });
        return next;
      });
      const target = Math.min(CODE_LENGTH - 1, i + chars.length);
      inputRefs.current[target]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) {
        setDigitAt(i, "");
      } else if (i > 0) {
        e.preventDefault();
        setDigitAt(i - 1, "");
        inputRefs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[i + 1]?.focus();
    } else if (e.key === "Enter" && ready) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const chars = pasted.slice(0, CODE_LENGTH - i).split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, k) => { next[i + k] = c; });
      return next;
    });
    const target = Math.min(CODE_LENGTH - 1, i + chars.length);
    inputRefs.current[target]?.focus();
  };

  // ── Submit / resend ─────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!email || !ready || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const auth = await verifyCode(email, code);
      setSuccess(true);
      setSession(auth);
      // Brief celebratory pause so the user sees the success state,
      // then route based on whether the agreement has been accepted.
      // Brand-new signups always land on /agreement next; returning
      // users who'd already accepted skip ahead to /dashboard.
      const target = auth.user?.agreementAccepted ? "/dashboard" : "/agreement";
      setTimeout(() => {
        window.location.href = target;
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      // Trigger shake by bumping a counter — the framer-motion
      // animation re-fires when its key changes.
      setShake((n) => n + 1);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendCooldown > 0 || resending) return;
    setResending(true);
    setResendInfo("");
    setError("");
    try {
      await resendVerificationCode(email);
      setResendInfo("New code sent. Check your inbox.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a new code");
    } finally {
      setResending(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  // Defensive: if the user reached this page directly without an
  // email param, send them back to /signup. Same outcome as if the
  // backend hadn't issued a code.
  useEffect(() => {
    if (!email) router.replace("/signup");
  }, [email, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      <div className="flex justify-center mb-5">
        <Image
          src="/logo.png"
          alt="Spire Info Tech"
          width={56}
          height={56}
          priority
          className="h-14 w-14 object-contain"
        />
      </div>

      <h1 className="font-serif text-2xl font-bold text-gray-900">
        <span className="inline-flex items-center gap-2">
          <MailCheck size={20} className="text-[#0F766E]" />
          Verify your email
        </span>
      </h1>
      <p className="text-sm text-gray-500 mt-2">
        We sent a 6-digit code to <span className="font-mono text-gray-700">{masked}</span>
      </p>

      {/* Six input boxes — shake animation re-fires when shake counter changes. */}
      <motion.div
        key={shake}
        animate={shake > 0 ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.5 }}
        className="flex justify-center gap-2 sm:gap-3 mt-7"
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            disabled={submitting || success}
            aria-label={`Digit ${i + 1}`}
            className={
              "w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold rounded-lg border-2 " +
              "transition-colors focus:outline-none disabled:opacity-60 " +
              (d
                ? "border-[#0F766E] bg-[#f0fdf9] text-gray-900"
                : "border-gray-200 bg-white text-gray-700 focus:border-[#0F766E]")
            }
            style={{ height: "3.5rem" }}
          />
        ))}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            key={shake || "error"}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-600"
          >
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {success && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"
        >
          ✅ Email verified! Taking you to your dashboard…
        </motion.div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!ready || submitting || success}
        className="mt-6 w-full inline-flex items-center justify-center gap-1.5 bg-[#0F766E] text-white text-sm font-bold py-3 rounded-xl shadow-md hover:shadow-lg hover:bg-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitting && <Loader2 size={15} className="animate-spin" />}
        {submitting ? "Verifying…" : success ? "Verified" : "Verify Email"}
      </button>

      <div className="mt-5 text-sm text-gray-500">
        <p>Didn&apos;t receive the code?</p>
        {resendCooldown > 0 ? (
          <p className="mt-1 text-gray-400">
            Resend code in{" "}
            <span className="font-mono">
              {Math.floor(resendCooldown / 60)}:
              {String(resendCooldown % 60).padStart(2, "0")}
            </span>
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="mt-1 text-[#0F766E] hover:text-[#0D9488] font-semibold disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
        {resendInfo && (
          <p className="mt-1 text-emerald-700 text-xs">{resendInfo}</p>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Wrong email?{" "}
        <Link href="/signup" className="text-[#0F766E] font-semibold hover:underline">
          Go back to signup
        </Link>
      </p>
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
