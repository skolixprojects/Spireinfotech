"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowDown, CheckCircle2, FileText, Loader2, Lock,
  PenLine, Trash2, Upload as UploadIcon, X, Inbox, Mail,
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

import OnboardingLayout from "@/components/layouts/OnboardingLayout";
import { useAuth } from "@/lib/auth-context";
import {
  getOnboardingRoute, getParticipantAgreementStatus, getParticipantMe,
  getProgramSelection, getTerms, isDashboardStatus,
  listMyChecks, markCheckNotApplicable, sendParticipantAgreement,
  uploadCheckSoftCopy, verifyParticipantAgreementCode,
  type CheckDocumentDTO, type ProgramSelectionDTO, type TermsResponse,
  type UserDTO,
} from "@/lib/api";

/**
 * Phase 3B — Agreement signing.
 *
 * Phases:
 *   PRE_SEND      — review + optional check upload + signature.
 *   WAITING_REPLY — agreement email sent, polling for IMAP detection.
 *   CODE_SENT     — IMAP saw "Yes, I agree"; user enters OTP.
 *   VERIFIED      — done; redirect.
 *
 * Underlying machinery is the same email-reply + OTP flow used by
 * the legacy /agreement-legacy page; this page wraps it with the
 * Phase 3B participant context (program selection details, optional
 * check soft-copy upload, workflow transitions).
 */

const AGREEMENT_VERSION = "v1.0";
const ACK_VERSION = "ACK-v1.0";
const SVC_VERSION = "SVC-v1.0";
const POLL_INTERVAL_MS = 5_000;
const CODE_LENGTH = 6;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

type Phase = "PRE_SEND" | "WAITING_REPLY" | "CODE_SENT" | "VERIFIED";

interface CheckDraft {
  id: string;            // client-only id, removed after upload
  file: File | null;
  checkNumber: string;
  amount: string;
  checkDate: string;
  notes: string;
  uploading: boolean;
  error: string;
  uploaded?: CheckDocumentDTO;
}

const newDraft = (): CheckDraft => ({
  id: Math.random().toString(36).slice(2),
  file: null,
  checkNumber: "",
  amount: "",
  checkDate: "",
  notes: "",
  uploading: false,
  error: "",
});

export default function AgreementPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // ── Gate state ────────────────────────────────────────────────
  const [gateChecked, setGateChecked] = useState(false);
  const [gateError, setGateError] = useState("");

  // ── Loaded context ────────────────────────────────────────────
  const [profile, setProfile] = useState<UserDTO | null>(null);
  const [program, setProgram] = useState<ProgramSelectionDTO | null>(null);
  const [terms, setTerms] = useState<TermsResponse | null>(null);

  // ── Flow phase ────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("PRE_SEND");

  // ── Review state ──────────────────────────────────────────────
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [legalName, setLegalName] = useState("");

  // ── Check upload state ────────────────────────────────────────
  const [checkMode, setCheckMode] = useState<"undecided" | "na" | "upload">("undecided");
  const [checks, setChecks] = useState<CheckDocumentDTO[]>([]);
  const [drafts, setDrafts] = useState<CheckDraft[]>([newDraft()]);

  // ── Signature state ───────────────────────────────────────────
  const [signatureMethod, setSignatureMethod] = useState<"draw" | "upload">("draw");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState("");
  const sigRef = useRef<SignatureCanvas | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const [signatureMounted, setSignatureMounted] = useState(false);
  useEffect(() => { setSignatureMounted(true); }, []);

  // ── Send / poll / OTP state ───────────────────────────────────
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // ── Initial load + gate ───────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await getParticipantMe();
        if (cancelled) return;
        const status = me.currentStatus;
        // Gate: must be at or past PROGRAM_SELECTED.
        const eligible = [
          "PROGRAM_SELECTED", "DOCUSIGN_SENT", "CHECK_COPY_UPLOADED",
        ].includes(status ?? "");
        if (!eligible && !isDashboardStatus(status)) {
          router.replace(getOnboardingRoute(status));
          return;
        }
        if (isDashboardStatus(status)) {
          router.replace("/dashboard");
          return;
        }
        setProfile(me);
        if (me.fullName) setLegalName(me.fullName);
        // Pull the program selection + terms + existing checks
        // in parallel — none of them block each other.
        const [progRes, termsRes, checksRes, statusRes] = await Promise.allSettled([
          getProgramSelection(),
          getTerms(),
          listMyChecks(),
          getParticipantAgreementStatus(),
        ]);
        if (progRes.status === "fulfilled") setProgram(progRes.value);
        if (termsRes.status === "fulfilled") setTerms(termsRes.value);
        if (checksRes.status === "fulfilled") setChecks(checksRes.value);
        if (statusRes.status === "fulfilled") {
          const s = statusRes.value;
          // Resume mid-flow: if a row already exists, jump
          // straight to whichever phase it represents.
          if (s.status === "VERIFIED") {
            setPhase("VERIFIED");
            setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
          } else if (s.status === "CODE_SENT") {
            setPhase("CODE_SENT");
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
          } else if (s.status === "WAITING_REPLY") {
            setPhase("WAITING_REPLY");
          }
        }
        setGateChecked(true);
      } catch (err) {
        if (!cancelled) {
          setGateError(err instanceof Error ? err.message : "Couldn't load agreement context");
          setGateChecked(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, router]);

  // ── Polling while WAITING_REPLY ────────────────────────────────
  useEffect(() => {
    if (phase !== "WAITING_REPLY") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getParticipantAgreementStatus();
        if (cancelled) return;
        if (s.status === "CODE_SENT") {
          setPhase("CODE_SENT");
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else if (s.status === "VERIFIED") {
          setPhase("VERIFIED");
          setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
        }
      } catch { /* poll retries */ }
    };
    const t = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase]);

  // ── Submit gating ─────────────────────────────────────────────
  const nameWordCount = legalName.trim().split(/\s+/).filter(Boolean).length;
  const checkPhaseSatisfied =
    checkMode === "na" || (checkMode === "upload" && checks.length > 0);
  const canSend =
    scrolledToBottom
    && confirmAccept
    && nameWordCount >= 2
    && !!signatureData
    && checkPhaseSatisfied
    && !sending;

  // ── Signature handlers ────────────────────────────────────────
  const switchSignatureMethod = (next: "draw" | "upload") => {
    setSignatureMethod(next);
    setSignatureData(null);
    setSignatureError("");
    sigRef.current?.clear();
    if (sigFileInputRef.current) sigFileInputRef.current.value = "";
  };
  const handleDrawEnd = () => {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) { setSignatureData(null); return; }
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
      setSignatureError("Use a PNG or JPG file."); return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setSignatureError("File too large (max 2 MB)."); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        setSignatureError("Couldn't read this file."); return;
      }
      setSignatureData(dataUrl);
      setSignatureError("");
    };
    reader.onerror = () => setSignatureError("Couldn't read this file.");
    reader.readAsDataURL(file);
  };

  // ── Scroll tracking ───────────────────────────────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 14) {
      setScrolledToBottom(true);
    }
  };

  // ── Check upload handlers ─────────────────────────────────────
  const handleMarkCheckNA = async () => {
    try {
      await markCheckNotApplicable();
      setCheckMode("na");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't mark check as N/A");
    }
  };

  const handleUploadCheck = async (draftId: string) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft || !draft.file) {
      patchDraft(draftId, { error: "Pick a file first" });
      return;
    }
    patchDraft(draftId, { uploading: true, error: "" });
    try {
      const result = await uploadCheckSoftCopy(draft.file, {
        checkNumber: draft.checkNumber || undefined,
        amount: draft.amount ? Number(draft.amount) : undefined,
        checkDate: draft.checkDate || undefined,
        notes: draft.notes || undefined,
      });
      setChecks((prev) => [...prev, result]);
      // Drop the uploaded draft; keep any unsubmitted siblings.
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      setCheckMode("upload");
    } catch (err) {
      patchDraft(draftId, { error: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      patchDraft(draftId, { uploading: false });
    }
  };

  const patchDraft = (id: string, patch: Partial<CheckDraft>) => {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  };

  // ── Send agreement email ──────────────────────────────────────
  const handleSend = async () => {
    if (!canSend || !signatureData) return;
    setSending(true);
    setSendError("");
    try {
      await sendParticipantAgreement({
        legalName: legalName.trim(),
        signatureImage: signatureData,
        signatureMethod,
      });
      setPhase("WAITING_REPLY");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Couldn't send agreement email");
    } finally {
      setSending(false);
    }
  };

  // ── OTP handlers ──────────────────────────────────────────────
  const setDigitAt = (i: number, v: string) =>
    setDigits((prev) => { const n = [...prev]; n[i] = v; return n; });
  const code = digits.join("");
  const codeReady = code.length === CODE_LENGTH && /^\d{6}$/.test(code);

  const handleDigit = (i: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) { setDigitAt(i, ""); return; }
    if (cleaned.length === 1) {
      setDigitAt(i, cleaned);
      if (i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    } else {
      const chars = cleaned.slice(0, CODE_LENGTH - i).split("");
      setDigits((prev) => {
        const n = [...prev]; chars.forEach((c, k) => { n[i + k] = c; }); return n;
      });
      inputRefs.current[Math.min(CODE_LENGTH - 1, i + chars.length)]?.focus();
    }
  };
  const handleDigitKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) setDigitAt(i, "");
      else if (i > 0) { e.preventDefault(); setDigitAt(i - 1, ""); inputRefs.current[i - 1]?.focus(); }
    } else if (e.key === "Enter" && codeReady) {
      e.preventDefault(); void handleVerify();
    }
  };
  const handleVerify = async () => {
    if (!codeReady || verifying) return;
    setVerifying(true); setVerifyError("");
    try {
      await verifyParticipantAgreementCode(code);
      setPhase("VERIFIED");
      setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const subSteps = useMemo(() => {
    const isPreSend = phase === "PRE_SEND";
    const isWaiting = phase === "WAITING_REPLY";
    const isCode = phase === "CODE_SENT";
    const isDone = phase === "VERIFIED";
    return [
      { label: "Review", state: isPreSend ? "active" : "done" },
      { label: "Check",  state: isPreSend ? "active" : "done" },
      { label: "Sign",   state: isPreSend ? "active" : "done" },
      { label: "Send",   state: isPreSend ? "pending" : "done" },
      { label: "Reply",  state: isWaiting ? "active" : (isPreSend ? "pending" : "done") },
      { label: "Code",   state: isCode ? "active" : (isDone ? "done" : "pending") },
      { label: "Done",   state: isDone ? "active" : "pending" },
    ];
  }, [phase]);

  if (authLoading || !gateChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }
  if (gateError) {
    return (
      <OnboardingLayout currentStep={7} contentMaxWidth="xl">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
          <AlertCircle size={20} className="text-red-600 inline-block mb-2" />
          <p className="text-sm text-red-700">{gateError}</p>
          <Link href="/program-selection" className="text-xs text-[#0F766E] font-semibold hover:underline mt-3 inline-block">
            ← Back to program selection
          </Link>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout currentStep={7} contentMaxWidth="3xl">
      {/* Sub-step tracker */}
      <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5">
        <ol className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px]">
          {subSteps.map((s, idx) => (
            <li key={s.label} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div className={`flex-1 h-[2px] ${s.state !== "pending" ? "bg-[#0F766E]" : "bg-gray-200"}`} />
                )}
                <div className={
                  "shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold mx-1 "
                  + (s.state === "done"
                      ? "bg-emerald-600 text-white"
                      : s.state === "active"
                        ? "bg-[#0F766E] text-white animate-pulse"
                        : "bg-white border border-gray-300 text-gray-400")
                }>
                  {s.state === "done" ? "✓" : idx + 1}
                </div>
                {idx < subSteps.length - 1 && (
                  <div className={`flex-1 h-[2px] ${s.state === "done" ? "bg-[#0F766E]" : "bg-gray-200"}`} />
                )}
              </div>
              <span className={`mt-1 text-center truncate ${s.state === "active" ? "text-[#0F766E] font-bold" : s.state === "done" ? "text-emerald-700" : "text-gray-400"}`}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        {phase === "PRE_SEND" && (
          <motion.section
            key="pre"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 py-5 sm:px-7 sm:py-6"
          >
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-gray-900">
              Review and sign your agreement
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Confirm your details, upload any required check soft-copies,
              add your digital signature, then email the agreement to yourself.
            </p>

            {/* Participant + program summary */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <SummaryRow label="Name" value={profile?.fullName} />
              <SummaryRow label="Participant ID" value={profile?.participantId} mono />
              <SummaryRow label="Email" value={profile?.email} />
              <SummaryRow label="Phone" value={profile?.phone} />
              <SummaryRow label="Program" value={program?.program} />
              <SummaryRow label="Phase" value={program?.phase} />
              <SummaryRow label="Skillset" value={program?.skillset} />
              <SummaryRow label="Target role" value={program?.targetJobTitle} />
              <SummaryRow label="Availability" value={program?.availability} />
              <SummaryRow
                label="Versions"
                value={`${AGREEMENT_VERSION} · ${ACK_VERSION} · ${SVC_VERSION}`}
                mono
              />
            </div>

            {/* Scrollable terms */}
            <div className="mt-5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">
                Terms of Service {terms?.version ?? AGREEMENT_VERSION}
              </p>
              <div
                onScroll={handleScroll}
                className="rounded-xl border border-gray-200 bg-white overflow-y-auto p-4 text-sm text-gray-700 leading-relaxed"
                style={{ height: "min(35vh, 240px)" }}
              >
                {!terms ? (
                  <p className="text-gray-400 italic">Loading terms…</p>
                ) : (
                  <div className="space-y-3">
                    {terms.sections.map((s) => (
                      <div key={s.title}>
                        <p className="text-sm font-bold text-gray-900">{s.title}</p>
                        <p className="text-sm text-gray-700 mt-1">{s.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!scrolledToBottom && terms && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
                  <ArrowDown size={11} /> Scroll to read all terms before continuing.
                </p>
              )}
            </div>

            <label className="mt-3 flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmAccept}
                onChange={(e) => setConfirmAccept(e.target.checked)}
                disabled={!scrolledToBottom}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0F766E] focus:ring-[#14B8A6] disabled:opacity-50"
              />
              <span>
                I confirm all information above is correct and I accept this agreement.{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>

            {/* Legal name + signature side by side on larger screens */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">
                  Legal name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Your full legal name"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                />
                {legalName.trim() && nameWordCount < 2 && (
                  <p className="text-[11px] text-red-500 mt-1">Enter first and last name.</p>
                )}
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">
                  Signature method
                </label>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                  <button
                    type="button"
                    onClick={() => switchSignatureMethod("draw")}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer "
                      + (signatureMethod === "draw"
                          ? "bg-[#0F766E] text-white shadow-sm"
                          : "bg-transparent text-gray-600 hover:text-[#0F766E]")
                    }
                  >
                    <PenLine size={12} /> Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSignatureMethod("upload")}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer "
                      + (signatureMethod === "upload"
                          ? "bg-[#0F766E] text-white shadow-sm"
                          : "bg-transparent text-gray-600 hover:text-[#0F766E]")
                    }
                  >
                    <UploadIcon size={12} /> Upload
                  </button>
                </div>
              </div>
            </div>

            {/* Signature pad */}
            <div className="mt-3">
              {signatureMethod === "draw" ? (
                <div>
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ height: 130 }}>
                    {signatureMounted ? (
                      <SignatureCanvas
                        ref={(el) => { sigRef.current = el; }}
                        penColor="#111827"
                        canvasProps={{
                          className: "w-full h-full",
                          style: { width: "100%", height: 130, background: "#fff", cursor: "crosshair", touchAction: "none" },
                        }}
                        onEnd={handleDrawEnd}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[11px] text-gray-500">Sign here with your mouse or finger.</p>
                    <button type="button" onClick={handleClearDrawn}
                      disabled={!signatureData}
                      className="text-[11px] font-semibold text-[#0F766E] hover:text-[#0D9488] disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer"
                    >Clear</button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="agree-sig-upload"
                  className="block rounded-xl border-2 border-dashed border-gray-300 hover:border-[#0F766E] hover:bg-[#f0fdf9] bg-gray-50 px-4 py-5 text-center cursor-pointer transition"
                >
                  <UploadIcon size={18} className="mx-auto text-gray-400 mb-1.5" />
                  <p className="text-sm font-semibold text-gray-700">Click to upload</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">PNG / JPG, max 2 MB</p>
                  <input ref={sigFileInputRef} id="agree-sig-upload" type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => handleSignatureFile(e.target.files?.[0])} className="hidden" />
                </label>
              )}
              {signatureError && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-red-600">
                  <AlertCircle size={11} /> {signatureError}
                </p>
              )}
              {signatureData && (
                <div className="mt-2 flex items-start gap-3">
                  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signatureData} alt="Your signature" style={{ maxWidth: 200, maxHeight: 60 }} />
                  </div>
                  <button type="button"
                    onClick={() => switchSignatureMethod(signatureMethod)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-red-600 cursor-pointer"
                  >
                    <X size={11} /> Remove
                  </button>
                </div>
              )}
            </div>

            {/* Check soft-copy upload */}
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
                Check soft-copies (Step 8)
              </p>
              <div className="flex items-center gap-2 mb-3">
                <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="checkMode"
                    checked={checkMode === "na"}
                    onChange={handleMarkCheckNA}
                    className="accent-[#0F766E]"
                  />
                  <span>Check upload is not applicable to me</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="checkMode"
                    checked={checkMode === "upload"}
                    onChange={() => setCheckMode("upload")}
                    className="accent-[#0F766E]"
                  />
                  <span>Upload check soft-copies</span>
                </label>
              </div>

              {/* Uploaded checks summary */}
              {checks.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {checks.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span className="font-medium text-gray-800">
                        Check #{c.checkNumber || c.id} uploaded
                      </span>
                      <span className="text-gray-500 ml-auto">{c.reviewStatus}</span>
                    </div>
                  ))}
                </div>
              )}

              {checkMode === "upload" && (
                <div className="mt-3 space-y-3">
                  {drafts.map((d) => (
                    <div key={d.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                            Check image <span className="text-red-500">*</span>
                          </label>
                          <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg"
                            onChange={(e) => patchDraft(d.id, { file: e.target.files?.[0] ?? null, error: "" })}
                            className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#0F766E] file:text-white hover:file:bg-[#0D9488] cursor-pointer"
                          />
                        </div>
                        <input type="text" placeholder="Check number" value={d.checkNumber}
                          onChange={(e) => patchDraft(d.id, { checkNumber: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
                        <input type="number" placeholder="Amount" value={d.amount}
                          onChange={(e) => patchDraft(d.id, { amount: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
                        <input type="date" value={d.checkDate}
                          onChange={(e) => patchDraft(d.id, { checkDate: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
                        <input type="text" placeholder="Notes" value={d.notes}
                          onChange={(e) => patchDraft(d.id, { notes: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
                      </div>
                      {d.error && (
                        <p className="text-[11px] text-red-600 mt-1.5">{d.error}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => handleUploadCheck(d.id)}
                          disabled={d.uploading || !d.file}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {d.uploading ? <Loader2 size={12} className="animate-spin" /> : <UploadIcon size={12} />}
                          {d.uploading ? "Uploading…" : "Upload check"}
                        </button>
                        {drafts.length > 1 && (
                          <button type="button"
                            onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                            className="text-gray-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setDrafts((prev) => [...prev, newDraft()])}
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] cursor-pointer"
                  >
                    + Add another check
                  </button>
                </div>
              )}

              <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-gray-500">
                <Lock size={11} className="mt-0.5 shrink-0" />
                Check images are stored in a restricted vault. Only Finance and authorised
                operations admins can view the underlying file.
              </p>
            </div>

            {sendError && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={14} /> {sendError}
              </p>
            )}

            <button type="button" onClick={handleSend} disabled={!canSend}
              className={
                "mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition "
                + (canSend
                    ? "bg-[#0F766E] text-white hover:bg-[#0D9488] shadow-md hover:shadow-lg cursor-pointer"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed")
              }
            >
              {sending && <Loader2 size={14} className="animate-spin" />}
              {sending ? "Sending…" : "Send Agreement Email →"}
            </button>
          </motion.section>
        )}

        {(phase === "WAITING_REPLY" || phase === "CODE_SENT") && (
          <motion.section
            key="reply"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 py-6 sm:px-7 sm:py-8 text-center"
          >
            {phase === "WAITING_REPLY" ? (
              <>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#f0fdf9] text-[#0F766E] mb-3">
                  <Mail size={22} />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Agreement email sent</h1>
                <p className="text-sm text-gray-600 mt-2">
                  Check <span className="font-mono">{profile?.email}</span>, open the email, review
                  the attached PDF, and reply with <strong>&ldquo;Yes, I agree&rdquo;</strong>.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                  <Loader2 size={14} className="animate-spin" />
                  Watching your inbox — checking every {POLL_INTERVAL_MS / 1000}s
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
                  <Inbox size={22} />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Reply detected!</h1>
                <p className="text-sm text-gray-600 mt-2">
                  Enter the 6-digit verification code we just sent to{" "}
                  <span className="font-mono">{profile?.email}</span>.
                </p>
              </>
            )}

            <div className="mt-6 flex justify-center gap-2 sm:gap-3">
              {digits.map((d, i) => (
                <input key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={CODE_LENGTH}
                  value={d}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKey(i, e)}
                  disabled={phase !== "CODE_SENT" || verifying}
                  aria-label={`Digit ${i + 1}`}
                  className={
                    "w-11 h-14 sm:w-12 text-center text-2xl font-bold rounded-lg border-2 transition focus:outline-none disabled:opacity-60 "
                    + (d
                        ? "border-[#0F766E] bg-[#f0fdf9] text-gray-900"
                        : "border-gray-200 bg-white text-gray-700 focus:border-[#0F766E]")
                  }
                />
              ))}
            </div>

            {verifyError && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={14} /> {verifyError}
              </p>
            )}

            <button type="button" onClick={handleVerify}
              disabled={phase !== "CODE_SENT" || !codeReady || verifying}
              className="mt-5 w-full max-w-sm mx-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {verifying && <Loader2 size={14} className="animate-spin" />}
              {verifying ? "Verifying…" : "Verify code"}
            </button>
          </motion.section>
        )}

        {phase === "VERIFIED" && (
          <motion.section
            key="verified"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 py-8 sm:py-10 text-center"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mb-4">
              <CheckCircle2 size={26} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Agreement complete</h1>
            <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
              Your signed agreement has been emailed to you and routed to the operations team.
              Taking you to your dashboard…
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </OnboardingLayout>
  );
}

function SummaryRow({ label, value, mono }: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-gray-800" : "text-[13px] text-gray-800"}>
        {value ?? <FileText size={12} className="inline text-gray-300" />}
      </span>
    </div>
  );
}
