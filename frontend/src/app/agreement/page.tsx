"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, ShieldCheck, AlertCircle, CheckCircle2, ArrowDown,
  Mail, Inbox, PenLine, Upload, X,
  BookOpen, PenTool, CheckSquare, Reply, KeyRound, Check,
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "@/lib/auth-context";
import {
  acceptAgreement, getAgreementStatus, getTerms, resendAgreementCode,
  verifyAgreementCode,
  type AgreementStatusValue, type TermsResponse,
} from "@/lib/api";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // 2 MB upload cap (raw file)

/**
 * /agreement — Terms of Service acceptance gate, email-reply edition.
 *
 * Four UI states matching the backend's row state:
 *   READ_TERMS    — show terms + signature + checkboxes; click Accept
 *                   to fire the "Reply YES" email and transition to
 *                   WAITING_REPLY.
 *   WAITING_REPLY — poll /check-status every 5s; user is replying YES
 *                   from their inbox; the IMAP cron flips the row to
 *                   CODE_SENT once it sees the reply.
 *   CODE_SENT     — six OTP boxes activate; user enters the code we
 *                   emailed after the reply.
 *   VERIFIED      — green tick, redirect /dashboard.
 *
 * Until the OTP is consumed, every other authenticated API call is
 * rejected with 403 AGREEMENT_REQUIRED by the backend filter, so
 * there's no way for a user to slip past this page.
 */

const RESEND_COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 5_000;
const CODE_LENGTH = 6;

type Phase = "READ_TERMS" | "WAITING_REPLY" | "CODE_SENT" | "VERIFIED";

// ── Visible step tracker ───────────────────────────────────────────
//
// Seven phases the user passes through. Drives both the horizontal
// stepper at the top of the page and which bucket of log entries
// we surface below it.
type StepId = "read" | "sign" | "consent" | "email" | "reply" | "otp" | "done";
type StepStatus = "pending" | "active" | "completed" | "error";

const STEPS: ReadonlyArray<{
  id: StepId;
  label: string;
  Icon: typeof BookOpen;
}> = [
  { id: "read",    label: "Read terms",  Icon: BookOpen },
  { id: "sign",    label: "Sign",        Icon: PenTool },
  { id: "consent", label: "Consent",     Icon: CheckSquare },
  { id: "email",   label: "Email sent",  Icon: Mail },
  { id: "reply",   label: "Reply",       Icon: Reply },
  { id: "otp",     label: "Verify code", Icon: KeyRound },
  { id: "done",    label: "Done",        Icon: ShieldCheck },
];

type StatusLogType =
  | "success" | "info" | "sending" | "waiting" | "checking" | "tip" | "error";

interface StatusLog {
  id: number;
  time: string;          // pre-formatted IST timestamp
  icon: string;          // emoji glyph
  message: string;
  type: StatusLogType;
}

const LOG_TYPE_COLOR: Record<StatusLogType, string> = {
  success: "text-emerald-400",
  info:    "text-gray-300",
  sending: "text-sky-300",
  waiting: "text-yellow-300",
  checking:"text-gray-400",
  tip:     "text-teal-300",
  error:   "text-red-400",
};

function formatIstClock(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric", minute: "2-digit", second: "2-digit",
    hour12: true,
  });
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "your email";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  const head = local.slice(0, Math.min(4, Math.max(1, local.length - 2)));
  const tail = local.slice(-1);
  return `${head}***${tail}${domain}`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusToPhase(status: AgreementStatusValue, currentPhase: Phase): Phase {
  // Don't downgrade phases — once the user advanced (clicked Accept),
  // the page sticks with that phase even if the server hasn't
  // surfaced the row yet on the very next poll.
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "CODE_SENT") return "CODE_SENT";
  if (status === "WAITING_REPLY") {
    return currentPhase === "READ_TERMS" ? "WAITING_REPLY" : currentPhase;
  }
  // NOT_STARTED — keep the user wherever they are; the page mounts
  // in READ_TERMS by default.
  return currentPhase;
}

// ── Step tracker (horizontal pill row with circles + connectors) ──
function StepTracker({
  statuses,
}: {
  statuses: Record<StepId, StepStatus>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <ol className="flex items-start justify-between gap-1 sm:gap-2 overflow-x-auto">
        {STEPS.map((step, idx) => {
          const status = statuses[step.id];
          const next = STEPS[idx + 1];
          const nextStatus = next ? statuses[next.id] : null;

          // Connector lights up when both this step and the next are
          // at least active — a half-tone bridge while transitioning.
          const connectorClass = nextStatus
            ? (status === "completed"
                ? "bg-[#0F766E]"
                : "bg-gray-200 [background-image:repeating-linear-gradient(90deg,transparent_0_4px,#d1d5db_4px_8px)]")
            : "";

          let circleClass = "border border-gray-300 bg-white text-gray-400";
          if (status === "completed") {
            circleClass = "bg-emerald-600 border-emerald-600 text-white";
          } else if (status === "active") {
            circleClass = "bg-[#0F766E] border-[#0F766E] text-white ring-4 ring-[#0F766E]/20";
          } else if (status === "error") {
            circleClass = "bg-red-500 border-red-500 text-white";
          }

          let labelClass = "text-gray-400";
          if (status === "completed") labelClass = "text-emerald-700 font-semibold";
          else if (status === "active") labelClass = "text-[#0F766E] font-bold";
          else if (status === "error") labelClass = "text-red-600 font-semibold";

          return (
            <li key={step.id} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-[2px] -mr-1 ${
                      statuses[STEPS[idx - 1].id] === "completed" ? "bg-[#0F766E]" : "bg-gray-200 [background-image:repeating-linear-gradient(90deg,transparent_0_4px,#d1d5db_4px_8px)]"
                    }`}
                  />
                )}
                <div
                  className={
                    "shrink-0 inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all "
                    + circleClass
                    + (status === "active" ? " animate-pulse" : "")
                  }
                  aria-current={status === "active" ? "step" : undefined}
                >
                  {status === "completed" ? (
                    <Check size={16} />
                  ) : status === "error" ? (
                    <X size={16} />
                  ) : (
                    <step.Icon size={14} />
                  )}
                </div>
                {next && (
                  <div className={`flex-1 h-[2px] -ml-1 ${connectorClass}`} />
                )}
              </div>
              <span className={`mt-2 text-[10px] sm:text-xs text-center leading-tight ${labelClass}`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Live status log (terminal-style, auto-scrolls to bottom) ──────
function StatusLogPanel({ logs }: { logs: StatusLog[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="bg-[#111827] rounded-xl border border-gray-800 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
        <span className="w-2 h-2 rounded-full bg-red-500/60" />
        <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
        <span className="ml-2 text-[11px] text-gray-400 font-mono">
          agreement.log
        </span>
      </div>
      <div
        ref={scrollRef}
        className="px-4 py-3 font-mono text-[11px] leading-6 overflow-y-auto"
        style={{ maxHeight: 280 }}
      >
        {logs.length === 0 ? (
          <p className="text-gray-500 italic">Waiting for first event…</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-gray-500 shrink-0">{log.time}</span>
              <span className="shrink-0">{log.icon}</span>
              <span className={LOG_TYPE_COLOR[log.type] + " break-all"}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AgreementPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>("READ_TERMS");

  // Terms / consent state.
  const [terms, setTerms] = useState<TermsResponse | null>(null);
  const [termsError, setTermsError] = useState("");
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [contentPolicyChecked, setContentPolicyChecked] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<"draw" | "upload">("draw");
  const sigRef = useRef<SignatureCanvas | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const [signatureError, setSignatureError] = useState("");
  // SignatureCanvas pokes at the DOM during render, which crashes the
  // SSR pass even on a "use client" page (the initial HTML render
  // still runs server-side). Defer it to post-mount.
  const [signatureMounted, setSignatureMounted] = useState(false);
  useEffect(() => { setSignatureMounted(true); }, []);

  // ── Step tracker state ────────────────────────────────────────
  const [stepStatuses, setStepStatuses] = useState<Record<StepId, StepStatus>>({
    read: "active",
    sign: "pending",
    consent: "pending",
    email: "pending",
    reply: "pending",
    otp: "pending",
    done: "pending",
  });
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const logIdRef = useRef(0);
  // Counts polls during WAITING_REPLY so we only push a log entry
  // every Nth poll (keeps the panel readable rather than spamming it
  // every 5s).
  const pollCounterRef = useRef(0);

  const addLog = useCallback(
    (icon: string, message: string, type: StatusLogType) => {
      logIdRef.current += 1;
      const entry: StatusLog = {
        id: logIdRef.current,
        time: formatIstClock(),
        icon, message, type,
      };
      setStatusLogs((prev) => [...prev, entry]);
    },
    [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Reply-window countdown.
  const [agreementExpiresAt, setAgreementExpiresAt] = useState<string | null>(null);
  const [agreementSecondsLeft, setAgreementSecondsLeft] = useState<number>(0);

  // OTP state.
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [shake, setShake] = useState(0);
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendInfo, setResendInfo] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // ── Auth + initial status ───────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.agreementAccepted) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, user, router]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getTerms(), getAgreementStatus()])
      .then(([termsRes, statusRes]) => {
        if (cancelled) return;
        if (termsRes.status === "fulfilled") setTerms(termsRes.value);
        else setTermsError("Couldn't load Terms of Service. Please refresh.");
        if (statusRes.status === "fulfilled") {
          const s = statusRes.value;
          if (s.status === "VERIFIED") {
            router.replace("/dashboard");
            return;
          }
          // Resume mid-flow: if a row already exists, jump straight
          // to the matching phase instead of re-asking for the name.
          setPhase((prev) => statusToPhase(s.status, prev));
          if (s.agreementExpiresAt) setAgreementExpiresAt(s.agreementExpiresAt);

          // Reflect a resumed flow on the step tracker so a returning
          // user doesn't see all-pending circles when half the flow
          // is already done server-side.
          if (s.status === "WAITING_REPLY") {
            setStepStatuses({
              read: "completed", sign: "completed", consent: "completed",
              email: "completed", reply: "active",
              otp: "pending", done: "pending",
            });
            addLog("📨", "Resumed: agreement email already sent — awaiting your reply", "info");
          } else if (s.status === "CODE_SENT") {
            setStepStatuses({
              read: "completed", sign: "completed", consent: "completed",
              email: "completed", reply: "completed", otp: "active", done: "pending",
            });
            addLog("📨", "Resumed: reply received — enter the verification code", "info");
          }
        }
      });
    return () => { cancelled = true; };
  }, [router, addLog]);

  // ── Step-status flips driven by form progress ────────────────────
  useEffect(() => {
    if (!hasScrolledToBottom) return;
    setStepStatuses((prev) => {
      if (prev.read === "completed") return prev;
      addLog("✅", "Terms of Service read completely", "success");
      return { ...prev, read: "completed", sign: prev.sign === "pending" ? "active" : prev.sign };
    });
  }, [hasScrolledToBottom, addLog]);

  useEffect(() => {
    const words = legalName.trim().split(/\s+/).filter(Boolean).length;
    if (words < 2 || !hasScrolledToBottom) return;
    setStepStatuses((prev) => {
      if (prev.sign === "completed") return prev;
      addLog("✅", "Legal name provided: " + legalName.trim(), "success");
      return { ...prev, sign: "completed", consent: prev.consent === "pending" ? "active" : prev.consent };
    });
    // Note: we don't roll back the step if the user clears the field
    // mid-flow — the tracker reads forward-only.
  }, [legalName, hasScrolledToBottom, addLog]);

  useEffect(() => {
    if (!termsChecked || !contentPolicyChecked || !hasScrolledToBottom) return;
    setStepStatuses((prev) => {
      if (prev.consent === "completed") return prev;
      addLog("✅", "Consent boxes confirmed", "success");
      return { ...prev, consent: "completed", email: prev.email === "pending" ? "active" : prev.email };
    });
  }, [termsChecked, contentPolicyChecked, hasScrolledToBottom, addLog]);

  useEffect(() => {
    if (!signatureData) return;
    addLog(
      signatureMethod === "draw" ? "✍️" : "🖼️",
      signatureMethod === "draw" ? "Signature drawn on canvas" : "Signature image uploaded",
      "info",
    );
    // signatureMethod intentionally left out of deps — we only want
    // the log on the data transition, not a method swap mid-stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureData, addLog]);

  // ── Reply-window countdown tick ─────────────────────────────────
  useEffect(() => {
    if (!agreementExpiresAt || phase !== "WAITING_REPLY") return;
    const tick = () => {
      const ms = new Date(agreementExpiresAt).getTime() - Date.now();
      setAgreementSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [agreementExpiresAt, phase]);

  // ── Resend cooldown countdown ───────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ── Status polling: only while WAITING_REPLY ────────────────────
  useEffect(() => {
    if (phase !== "WAITING_REPLY") return;
    pollCounterRef.current = 0;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getAgreementStatus();
        if (cancelled) return;
        pollCounterRef.current += 1;
        // ~30s heartbeat — surface a "Checking…" line every 6th poll
        // (5s × 6 = 30s) so the panel doesn't fill up with chatter
        // while still proving the cron is alive.
        if (pollCounterRef.current % 6 === 0) {
          addLog("🔍", "Checking for your reply… (" + pollCounterRef.current + ")", "checking");
        }
        if (s.status === "CODE_SENT") {
          setPhase("CODE_SENT");
          addLog("✅", "Reply received — verification code on its way", "success");
          addLog("📤", "Verification code sent to your email", "sending");
          addLog("💡", "Check your inbox for the 6-digit code", "tip");
          setStepStatuses((prev) => ({
            ...prev,
            reply: "completed",
            otp: "active",
          }));
          setTimeout(() => inputRefs.current[0]?.focus(), 80);
        } else if (s.status === "VERIFIED") {
          setPhase("VERIFIED");
          setStepStatuses((prev) => ({
            ...prev,
            reply: "completed", otp: "completed", done: "completed",
          }));
          addLog("🎉", "Agreement complete — redirecting to dashboard", "success");
          setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
        }
      } catch {
        // Network blip — next tick will retry.
      }
    };
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase, addLog]);

  // ── Computed flags ──────────────────────────────────────────────
  const nameWordCount = useMemo(
    () => legalName.trim().split(/\s+/).filter(Boolean).length,
    [legalName],
  );
  const canAccept =
    hasScrolledToBottom
    && nameWordCount >= 2
    && termsChecked
    && contentPolicyChecked
    && !!signatureData
    && !submitting;
  const code = digits.join("");
  const codeReady = code.length === CODE_LENGTH && /^\d{6}$/.test(code);
  const replyExpired = phase === "WAITING_REPLY" && agreementSecondsLeft === 0
    && agreementExpiresAt !== null;

  // ── Signature handlers ──────────────────────────────────────────

  const switchSignatureMethod = (next: "draw" | "upload") => {
    setSignatureMethod(next);
    setSignatureData(null);
    setSignatureError("");
    sigRef.current?.clear();
    if (sigFileInputRef.current) sigFileInputRef.current.value = "";
  };

  const handleDrawEnd = () => {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      setSignatureData(null);
      return;
    }
    setSignatureData(pad.toDataURL("image/png"));
    setSignatureError("");
  };

  const handleClearDrawn = () => {
    sigRef.current?.clear();
    setSignatureData(null);
  };

  const handleSignatureFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setSignatureError("Use a PNG or JPG file.");
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setSignatureError("File too large (max 2 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        setSignatureError("Couldn't read this file.");
        return;
      }
      setSignatureData(dataUrl);
      setSignatureError("");
    };
    reader.onerror = () => setSignatureError("Couldn't read this file.");
    reader.readAsDataURL(file);
  };

  // ── Submit accept → moves to WAITING_REPLY ──────────────────────
  const handleAccept = async () => {
    if (!canAccept || !signatureData) return;
    setSubmitting(true);
    setSubmitError("");
    addLog("📄", "Generating agreement PDF…", "info");
    addLog("📤", "Sending email to " + maskEmail(user?.email) + "…", "sending");
    try {
      const r = await acceptAgreement({
        legalName: legalName.trim(),
        termsAccepted: termsChecked,
        contentPolicyAccepted: contentPolicyChecked,
        signatureImage: signatureData,
        signatureMethod,
      });
      if (r.alreadyAccepted) {
        addLog("✅", "Agreement was already accepted on this account", "success");
        router.replace("/dashboard");
        return;
      }
      addLog("✅", "Email sent successfully with PDF attachment", "success");
      addLog("⏳", "Waiting for your reply…", "waiting");
      addLog("💡", "Open your email and reply 'Yes, I agree'", "tip");
      setStepStatuses((prev) => ({
        ...prev,
        email: "completed",
        reply: "active",
      }));
      setPhase("WAITING_REPLY");
      if (r.expiresAt) setAgreementExpiresAt(r.expiresAt);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send the agreement email";
      addLog("❌", msg, "error");
      setSubmitError(msg);
      setStepStatuses((prev) => ({ ...prev, email: "error" }));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Scroll tracking ─────────────────────────────────────────────
  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 12) {
      setHasScrolledToBottom(true);
    }
  };

  // ── OTP input wiring ────────────────────────────────────────────
  const setDigitAt = (i: number, v: string) =>
    setDigits((prev) => { const n = [...prev]; n[i] = v; return n; });

  const handleDigitChange = (i: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) { setDigitAt(i, ""); return; }
    if (cleaned.length === 1) {
      setDigitAt(i, cleaned);
      if (i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    } else {
      const chars = cleaned.slice(0, CODE_LENGTH - i).split("");
      setDigits((prev) => {
        const n = [...prev];
        chars.forEach((c, k) => { n[i + k] = c; });
        return n;
      });
      inputRefs.current[Math.min(CODE_LENGTH - 1, i + chars.length)]?.focus();
    }
  };

  const handleDigitKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) setDigitAt(i, "");
      else if (i > 0) {
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
    } else if (e.key === "Enter" && codeReady) {
      e.preventDefault();
      void handleVerify();
    }
  };

  const handleDigitPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const chars = pasted.slice(0, CODE_LENGTH - i).split("");
    setDigits((prev) => {
      const n = [...prev];
      chars.forEach((c, k) => { n[i + k] = c; });
      return n;
    });
    inputRefs.current[Math.min(CODE_LENGTH - 1, i + chars.length)]?.focus();
  };

  // ── Verify OTP ──────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!codeReady || verifying) return;
    setVerifying(true);
    setVerifyError("");
    addLog("🔢", "Submitting verification code…", "info");
    try {
      await verifyAgreementCode(code);
      addLog("✅", "Code verified successfully", "success");
      addLog("📤", "Generating signed agreement PDF…", "sending");
      addLog("✅", "Signed PDF emailed to you", "success");
      addLog("✅", "Welcome email sent", "success");
      addLog("🎉", "Agreement complete — redirecting to dashboard", "success");
      setStepStatuses((prev) => ({
        ...prev,
        otp: "completed", done: "completed",
      }));
      setPhase("VERIFIED");
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      addLog("❌", msg, "error");
      setVerifyError(msg);
      setShake((n) => n + 1);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // ── Resend ──────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setResendInfo("");
    setVerifyError("");
    addLog("🔄", "Resending email…", "info");
    try {
      await resendAgreementCode();
      const msg = phase === "CODE_SENT"
        ? "New code sent. Check your inbox."
        : "Agreement email resent. Reply YES to confirm.";
      setResendInfo(msg);
      addLog("✅", msg, "success");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (phase === "CODE_SENT") {
        setDigits(Array(CODE_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send another email";
      addLog("❌", msg, "error");
      setVerifyError(msg);
    } finally {
      setResending(false);
    }
  };

  // ── Restart from expiry ─────────────────────────────────────────
  const handleRestart = () => {
    setPhase("READ_TERMS");
    setAgreementExpiresAt(null);
    setAgreementSecondsLeft(0);
    setSubmitError("");
    setVerifyError("");
    setDigits(Array(CODE_LENGTH).fill(""));
  };

  // ── Render ──────────────────────────────────────────────────────
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo.png" alt="Spire" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="font-serif text-lg font-bold text-[#0F766E]">Spire Info Tech</span>
          </Link>
          <p className="text-xs text-gray-500 hidden sm:block">
            Logged in as <span className="font-mono text-gray-700">{user.email}</span>
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <StepTracker statuses={stepStatuses} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-6">
          <div>
            <AnimatePresence mode="wait">
          {phase === "READ_TERMS" && (
            <motion.section
              key="read"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-[#0F766E] mb-2">
                <ShieldCheck size={14} /> Step 3 of 3 — Accept the Terms
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Terms of Service & Privacy Policy
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Version <span className="font-mono">{terms?.version ?? "v1.0"}</span>
                {terms?.lastUpdated && <> · Last updated {terms.lastUpdated}</>}
              </p>

              <div
                onScroll={handleTermsScroll}
                className="mt-5 rounded-xl border border-gray-200 bg-white overflow-y-auto p-5 sm:p-6 text-sm text-gray-700 leading-relaxed"
                style={{ height: "min(60vh, 400px)" }}
              >
                {termsError ? (
                  <p className="text-sm text-red-600">{termsError}</p>
                ) : !terms ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={14} className="animate-spin" /> Loading terms…
                  </div>
                ) : (
                  <div className="space-y-5">
                    {terms.sections.map((s) => (
                      <div key={s.title}>
                        <h3 className="text-base font-bold text-gray-900">{s.title}</h3>
                        <p className="mt-1.5 text-sm text-gray-700" style={{ lineHeight: 1.7 }}>
                          {s.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!hasScrolledToBottom && terms && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                  <ArrowDown size={12} /> Scroll to read all terms before accepting.
                </p>
              )}

              <div className="mt-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Your legal name <span className="text-gray-400">(as digital signature)</span>
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Type your full legal name"
                  disabled={!hasScrolledToBottom}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#14B8A6]/30 disabled:bg-gray-50 disabled:text-gray-400"
                />
                {legalName.trim() && nameWordCount < 2 && (
                  <p className="text-xs text-red-500 mt-1">
                    Please enter both first and last name.
                  </p>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsChecked}
                    onChange={(e) => setTermsChecked(e.target.checked)}
                    disabled={!hasScrolledToBottom}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6] disabled:opacity-50"
                  />
                  <span>
                    I have read and agree to the{" "}
                    <span className="font-bold">Terms of Service</span> and{" "}
                    <span className="font-bold">Privacy Policy</span> of Spire Info Tech.
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contentPolicyChecked}
                    onChange={(e) => setContentPolicyChecked(e.target.checked)}
                    disabled={!hasScrolledToBottom}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6] disabled:opacity-50"
                  />
                  <span>
                    I understand that course content is protected by copyright and may
                    not be recorded, screenshotted, or shared with others.
                  </span>
                </label>
              </div>

              {/* ── Digital signature ─────────────────────────── */}
              <div className="mt-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Your digital signature
                </label>

                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 mb-3">
                  <button
                    type="button"
                    onClick={() => switchSignatureMethod("draw")}
                    disabled={!hasScrolledToBottom}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition "
                      + (signatureMethod === "draw"
                          ? "bg-[#0F766E] text-white shadow-sm"
                          : "bg-transparent text-gray-600 hover:text-[#0F766E]")
                      + " disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    }
                  >
                    <PenLine size={12} /> Draw signature
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSignatureMethod("upload")}
                    disabled={!hasScrolledToBottom}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition "
                      + (signatureMethod === "upload"
                          ? "bg-[#0F766E] text-white shadow-sm"
                          : "bg-transparent text-gray-600 hover:text-[#0F766E]")
                      + " disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    }
                  >
                    <Upload size={12} /> Upload signature
                  </button>
                </div>

                {signatureMethod === "draw" ? (
                  <div>
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ height: 160 }}>
                      {signatureMounted ? (
                        <SignatureCanvas
                          ref={(el) => { sigRef.current = el; }}
                          penColor="#111827"
                          canvasProps={{
                            className: "w-full h-full",
                            style: {
                              width: "100%",
                              height: 160,
                              background: "#ffffff",
                              cursor: hasScrolledToBottom ? "crosshair" : "not-allowed",
                              touchAction: "none",
                            },
                          }}
                          onEnd={handleDrawEnd}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400">
                          Loading…
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        Sign here with your mouse or finger.
                      </p>
                      <button
                        type="button"
                        onClick={handleClearDrawn}
                        disabled={!signatureData || submitting}
                        className="text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="sig-upload"
                      className={
                        "block rounded-xl border-2 border-dashed bg-gray-50 px-4 py-6 text-center transition "
                        + (hasScrolledToBottom
                            ? "border-gray-300 hover:border-[#0F766E] hover:bg-[#f0fdf9] cursor-pointer"
                            : "border-gray-200 opacity-60 cursor-not-allowed")
                      }
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!hasScrolledToBottom) return;
                        handleSignatureFile(e.dataTransfer.files?.[0]);
                      }}
                    >
                      <Upload size={20} className="mx-auto text-gray-400 mb-2" />
                      <p className="text-sm font-semibold text-gray-700">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        PNG, JPG, JPEG (max 2 MB) — transparent background recommended
                      </p>
                      <input
                        ref={sigFileInputRef}
                        id="sig-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        disabled={!hasScrolledToBottom}
                        onChange={(e) => handleSignatureFile(e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {signatureError && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle size={12} /> {signatureError}
                  </p>
                )}

                {signatureData && (
                  <div className="mt-3 flex items-start gap-3">
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureData}
                        alt="Your signature"
                        style={{ maxWidth: 240, maxHeight: 90, display: "block" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => switchSignatureMethod(signatureMethod)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600 cursor-pointer"
                    >
                      <X size={12} /> Remove
                    </button>
                  </div>
                )}
              </div>

              {submitError && (
                <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle size={14} /> {submitError}
                </p>
              )}

              <button
                type="button"
                onClick={handleAccept}
                disabled={!canAccept}
                className={
                  "mt-6 w-full inline-flex items-center justify-center gap-2 text-base font-bold py-3 rounded-xl transition-all "
                  + (canAccept
                      ? "bg-[#0F766E] hover:bg-[#0D9488] text-white shadow-md hover:shadow-lg cursor-pointer active:scale-[0.99]"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed")
                }
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {submitting ? "Sending email…" : "I Accept — Send Agreement Email"}
              </button>

              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                By accepting, an agreement email will be sent to your inbox.
                Reply YES to that email to complete your acceptance.
              </p>
            </motion.section>
          )}

          {(phase === "WAITING_REPLY" || phase === "CODE_SENT" || phase === "VERIFIED") && (
            <motion.section
              key="reply-flow"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 text-center"
            >
              {phase === "WAITING_REPLY" && (
                <>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#f0fdf9] text-[#0F766E] mb-3">
                    <Mail size={22} />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">Agreement email sent!</h1>
                  <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                    We sent an email to{" "}
                    <span className="font-mono text-gray-800">{maskEmail(user.email)}</span>.<br />
                    Open your email and <strong>reply with the word YES</strong> to accept.
                  </p>

                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                    <Loader2 size={14} className="animate-spin" />
                    Waiting for your reply… checking every {POLL_INTERVAL_MS / 1000}s
                  </div>
                  {agreementExpiresAt && !replyExpired && (
                    <p className="mt-3 text-xs text-gray-500">
                      Time remaining:{" "}
                      <span className="font-mono">{formatCountdown(agreementSecondsLeft)}</span>
                    </p>
                  )}
                  {replyExpired && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      This agreement request has expired. Please restart.
                      <button
                        onClick={handleRestart}
                        className="ml-2 underline font-semibold"
                      >
                        Restart
                      </button>
                    </div>
                  )}
                </>
              )}

              {phase === "CODE_SENT" && (
                <>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
                    <Inbox size={22} />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Reply detected!
                  </h1>
                  <p className="text-sm text-gray-600 mt-2">
                    Enter the verification code we just sent to{" "}
                    <span className="font-mono text-gray-800">{maskEmail(user.email)}</span>.
                  </p>
                </>
              )}

              {phase === "VERIFIED" && (
                <>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
                    <CheckCircle2 size={22} />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">Agreement accepted!</h1>
                  <p className="text-sm text-gray-600 mt-2">
                    Taking you to your dashboard…
                  </p>
                </>
              )}

              {/* OTP boxes — disabled until CODE_SENT */}
              {phase !== "VERIFIED" && (
                <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  {phase === "WAITING_REPLY" && (
                    <p className="text-xs text-gray-500 mb-3">
                      Once we detect your reply, a verification code will appear here.
                    </p>
                  )}
                  <motion.div
                    key={shake}
                    animate={shake > 0 ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex justify-center gap-2 sm:gap-3"
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
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(i, e)}
                        onPaste={(e) => handleDigitPaste(i, e)}
                        disabled={phase !== "CODE_SENT" || verifying}
                        aria-label={`Digit ${i + 1}`}
                        className={
                          "w-11 h-14 sm:w-12 text-center text-2xl font-bold rounded-lg border-2 "
                          + "transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed "
                          + (d
                              ? "border-[#0F766E] bg-[#f0fdf9] text-gray-900"
                              : "border-gray-200 bg-white text-gray-700 focus:border-[#0F766E]")
                        }
                      />
                    ))}
                  </motion.div>

                  <AnimatePresence>
                    {verifyError && (
                      <motion.p
                        key={shake || "error"}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600"
                      >
                        <AlertCircle size={14} /> {verifyError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={phase !== "CODE_SENT" || !codeReady || verifying}
                    className="mt-4 w-full inline-flex items-center justify-center gap-1.5 bg-[#0F766E] text-white text-sm font-bold py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {verifying && <Loader2 size={14} className="animate-spin" />}
                    {verifying ? "Verifying…" : "Verify Code"}
                  </button>
                </div>
              )}

              {phase !== "VERIFIED" && (
                <div className="mt-5 text-sm text-gray-500">
                  <p>
                    Didn&apos;t receive the {phase === "CODE_SENT" ? "code" : "email"}?
                  </p>
                  {resendCooldown > 0 ? (
                    <p className="mt-1 text-gray-400">
                      Resend in{" "}
                      <span className="font-mono">{formatCountdown(resendCooldown)}</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className="mt-1 text-[#0F766E] hover:text-[#0D9488] font-semibold disabled:opacity-50"
                    >
                      {resending ? "Sending…" : "Resend"}
                    </button>
                  )}
                  {resendInfo && (
                    <p className="mt-1 text-emerald-700 text-xs">{resendInfo}</p>
                  )}
                </div>
              )}

              <p className="mt-6 text-xs text-gray-400">
                Wrong account?{" "}
                <Link href="/login" className="text-[#0F766E] font-semibold hover:underline">
                  Sign in with another email
                </Link>
              </p>
            </motion.section>
          )}
            </AnimatePresence>
          </div>

          <aside className="lg:sticky lg:top-6 self-start">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500">
                Live status
              </p>
              {phase === "WAITING_REPLY" && agreementExpiresAt && !replyExpired && (
                <p className="text-[11px] text-gray-500 font-mono">
                  ⏱ {formatCountdown(agreementSecondsLeft)}
                </p>
              )}
            </div>
            <StatusLogPanel logs={statusLogs} />
            <p className="mt-2 text-[10px] text-gray-400 leading-relaxed">
              Updates appear in real time as your agreement moves through
              each stage. The log resets if you reload the page.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
