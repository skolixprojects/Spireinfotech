"use client";

import { useState } from "react";
import { Loader2, Mail, Wrench } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

/**
 * TODO: Remove this widget before production launch.
 *
 * Diagnostic block at the bottom of the homepage that pokes the
 * public /api/test/send-email endpoint. Designed to surface every
 * step (URL, status code, response body, network errors) in a
 * terminal-style log panel so misconfigured backends (wrong
 * NEXT_PUBLIC_API_URL, CORS, SMTP creds) are debuggable without
 * opening DevTools.
 *
 * Builds the URL inline rather than going through apiFetch so the
 * exact string we're hitting is visible in the log — that was the
 * thing we couldn't see when the routing accidentally landed on
 * the Vercel origin instead of Railway.
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

export function TestEmailWidget() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);

  const stamp = (): string =>
    new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  // Append a single log line. We pass the new array to the setter
  // (rather than relying on the previous state) so consecutive calls
  // inside one async handler don't drop entries due to stale closures.
  const appendLog = (icon: LogIcon, message: string) => {
    setLogs((prev) => [...prev, { time: stamp(), icon, message }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to || submitting) return;
    setSubmitting(true);
    setLogs([]);

    const url = `${API_BASE_URL}/api/test/send-email?to=${encodeURIComponent(to)}`;
    appendLog("⏳", "Sending request to backend…");
    appendLog("📡", `URL: ${url}`);

    try {
      const response = await fetch(url);
      appendLog(
        response.ok ? "✅" : "❌",
        `Backend responded: ${response.status} ${response.statusText || ""}`.trim(),
      );

      let data: { success?: boolean; message?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        appendLog("❌", "Response was not valid JSON");
      }

      if (data?.success) {
        appendLog("✅", `Email sent to ${to}`);
        appendLog("📬", "Check your inbox (and spam folder)");
      } else if (data?.message) {
        appendLog("❌", `Failed: ${data.message}`);
      } else if (!response.ok) {
        appendLog("❌", "Request failed with no diagnostic message");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog("❌", `Network error: ${msg}`);
      appendLog("💡", "Check: Is the backend running on Railway?");
      appendLog("💡", "Check: Does CORS allow this origin?");
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
