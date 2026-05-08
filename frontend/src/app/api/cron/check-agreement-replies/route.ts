import { NextRequest, NextResponse } from "next/server";
import { runImapScan } from "@/lib/agreement-imap";

/**
 * Vercel Cron — checks the support inbox via IMAP for "YES" replies
 * to agreement-acceptance emails and forwards each match to the
 * Spring backend's process-reply endpoint.
 *
 * Triggered every minute by `vercel.json`'s `crons` entry. Vercel
 * sends an `Authorization: Bearer <CRON_SECRET>` header on each
 * scheduled invocation; we reject anything missing that header so
 * the route can't be fired by random callers.
 *
 * The actual IMAP / matching logic lives in
 * {@link runImapScan} (`@/lib/agreement-imap`) so the debug
 * route can reuse the exact same code path.
 */

// Force the Node runtime — imapflow uses raw TCP/TLS sockets which
// the Edge runtime can't do.
export const runtime = "nodejs";

// Vercel cron timeouts default low; allow up to 60s in case the
// IMAP handshake is slow.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runImapScan({ scopeEmail: null, collectLogs: false });
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  // Cron view: drop the verbose logs from the JSON response — they're
  // already in stdout, and Vercel cron output gets ingested verbatim.
  // Debug callers get the full log array via the dedicated route.
  return NextResponse.json({
    ok: true,
    totalMessages: result.totalMessages,
    unseenMessages: result.unseenMessages,
    processed: result.processed,
    results: result.results,
  });
}
