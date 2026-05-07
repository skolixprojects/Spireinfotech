"use client";

import { useState } from "react";
import { Loader2, Mail, Wrench } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

/**
 * TODO: Remove this widget before production launch.
 *
 * Diagnostic block at the bottom of the homepage. Two paths:
 *
 *  1. "Test Direct" — POSTs straight to the Vercel relay
 *     (/api/send-email). Bypasses the Spring backend entirely, so
 *     a success here means SMTP creds + Nodemailer are wired up.
 *
 *  2. "Test via Backend" — hits the Railway-hosted backend at
 *     /api/test/send-email, which then calls the Vercel relay.
 *     Success here proves the full chain end-to-end.
 *
 * Run Test Direct first; if it fails, the issue is on Vercel/SMTP.
 * If Test Direct succeeds but Test via Backend fails, the gap is
 * in Railway's outbound HTTPS or the EMAIL_RELAY_* env vars.
 *
 * Note on the leaked secret in Test Direct: the
 * EMAIL_RELAY_SECRET is necessarily inlined in client JS for this
 * direct path, so reading the page source recovers it. Acceptable
 * while the widget is dev-only and TODO-marked for removal.
 */

type LogIcon = "⏳" | "📡" | "✅" | "❌" | "📬" | "💡";

interface LogLine {
  time: string;
  icon: LogIcon;
  message: string;
}

const ICON_COLOR: Record<LogIcon, string> = {
  "⏳": "text-yellow-400",
  "📡": "text-cyan-400",
  "✅": "text-green-400",
  "❌": "text-red-400",
  "📬": "text-green-400",
  "💡": "text-yellow-300",
};

// Same value the Spring backend uses; baked in here so the direct
// path can authenticate. Override at build time via
// NEXT_PUBLIC_EMAIL_RELAY_SECRET if rotated.
const RELAY_SECRET =
  process.env.NEXT_PUBLIC_EMAIL_RELAY_SECRET || "SPIRE_EMAIL_SECRET_2026";

export function TestEmailWidget() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState<"direct" | "backend" | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  const stamp = (): string =>
    new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const appendLog = (icon: LogIcon, message: string) => {
    setLogs((prev) => [...prev, { time: stamp(), icon, message }]);
  };

  // ── Path 1: Vercel relay direct (skips Spring) ──────────────────
  const testDirect = async () => {
    const to = email.trim();
    if (!to || submitting) return;
    setSubmitting("direct");
    setLogs([]);

    const url = "/api/send-email";
    appendLog("⏳", "Sending directly via Vercel relay…");
    appendLog("📡", `URL: ${url} (same-origin)`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: "Test Email from Spire Info Tech",
          html:
            "<div style='font-family:Arial,Helvetica,sans-serif; padding:24px; max-width:520px; margin:0 auto;'>"
            + "<h2 style='color:#0F766E; margin:0 0 12px;'>It works!</h2>"
            + "<p style='color:#374151;'>Email sent via Vercel + Nodemailer (direct path).</p>"
            + "</div>",
          secret: RELAY_SECRET,
        }),
      });
      appendLog(res.ok ? "✅" : "❌", `Vercel responded: ${res.status} ${res.statusText || ""}`.trim());
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        appendLog("✅", `Email sent to ${to}`);
        appendLog("📬", "Check your inbox (and spam folder)");
      } else {
        appendLog("❌", `Failed: ${data?.message ?? "no body"}`);
      }
    } catch (err) {
      appendLog("❌", `Network error: ${err instanceof Error ? err.message : String(err)}`);
      appendLog("💡", "Check: nodemailer installed and SMTP_* env vars set on Vercel?");
    } finally {
      setSubmitting(null);
    }
  };

  // ── Path 2: Railway backend → Vercel relay (full flow) ──────────
  const testViaBackend = async () => {
    const to = email.trim();
    if (!to || submitting) return;
    setSubmitting("backend");
    setLogs([]);

    const url = `${API_BASE_URL}/api/test/send-email?to=${encodeURIComponent(to)}`;
    appendLog("⏳", "Sending via backend (Railway → Vercel relay)…");
    appendLog("📡", `URL: ${url}`);

    try {
      const res = await fetch(url);
      appendLog(res.ok ? "✅" : "❌", `Backend responded: ${res.status} ${res.statusText || ""}`.trim());
      const data = await res.json().catch(() => null);
      if (data?.success) {
        appendLog("✅", `Email sent to ${to}`);
        appendLog("📬", "Check your inbox (and spam folder)");
      } else if (data?.message) {
        appendLog("❌", `Failed: ${data.message}`);
      } else if (!res.ok) {
        appendLog("❌", "Request failed with no diagnostic message");
      }
    } catch (err) {
      appendLog("❌", `Network error: ${err instanceof Error ? err.message : String(err)}`);
      appendLog("💡", "Check: Is the backend running on Railway?");
      appendLog("💡", "Check: Are EMAIL_RELAY_URL + EMAIL_RELAY_SECRET set on Railway?");
    } finally {
      setSubmitting(null);
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

          <div className="flex flex-col sm:flex-row gap-2 mb-2">
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
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={testDirect}
              disabled={submitting !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              title="POST /api/send-email — skips Spring, tests SMTP only"
            >
              {submitting === "direct" && <Loader2 size={13} className="animate-spin" />}
              Test Direct
            </button>
            <button
              type="button"
              onClick={testViaBackend}
              disabled={submitting !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              title="GET /api/test/send-email — exercises Railway -> Vercel -> SMTP"
            >
              {submitting === "backend" && <Loader2 size={13} className="animate-spin" />}
              Test via Backend
            </button>
          </div>

          <p className="mt-2 text-[11px] text-gray-400">
            Test Direct hits Vercel only (proves SMTP works). Test via Backend goes through Railway (proves the full relay).
          </p>

          {logs.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                ── Logs ──
              </p>
              <div
                className="rounded-lg px-4 py-3 max-h-[200px] overflow-y-auto font-mono text-xs leading-relaxed"
                style={{ background: "#111827" }}
              >
                {logs.map((line, i) => (
                  <div key={i} className="flex gap-2 text-gray-300 break-all">
                    <span className="text-gray-500 shrink-0">{line.time}</span>
                    <span className={`shrink-0 ${ICON_COLOR[line.icon]}`}>
                      {line.icon}
                    </span>
                    <span className={ICON_COLOR[line.icon]}>{line.message}</span>
                  </div>
                ))}
              </div>
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
