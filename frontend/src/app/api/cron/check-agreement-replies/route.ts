import { ImapFlow, type FetchMessageObject } from "imapflow";
import { NextRequest, NextResponse } from "next/server";

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
 * IMAP search is constrained to:
 *   - INBOX
 *   - unread messages
 *   - subject contains "AGREE-" (the tracking marker we embed in
 *     the agreement-request email)
 *
 * For each candidate we extract:
 *   - the user id from the [AGREE-{userId}-{timestamp}] marker
 *   - the from-address (must match the user's account email)
 *   - the body text — we accept YES / AGREED / I AGREE / ACCEPT
 *
 * Any matching message gets forwarded to the backend, then
 * marked Seen so the next cron run doesn't reprocess it. Backend
 * verifies the cron secret + the from-address before generating
 * the verification code.
 */

// Force the Node runtime — imapflow uses raw TCP/TLS sockets which
// the Edge runtime can't do.
export const runtime = "nodejs";

// Vercel cron timeouts default low; allow up to 60s in case the
// IMAP handshake is slow.
export const maxDuration = 60;

const TRACKING_REGEX = /\[AGREE-(\d+)-(\d+)\]/i;
const ACCEPT_REGEX = /\b(yes|agreed|i\s+agree|accept)\b/i;

interface ProcessResult {
  userId: number;
  email: string | null;
  reply: string;
  forwarded: boolean;
  backendStatus?: number;
}

export async function GET(req: NextRequest) {
  // Vercel's scheduler sends `Authorization: Bearer <CRON_SECRET>`
  // automatically when CRON_SECRET is set in env. Reject without it.
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json(
      { ok: false, error: "IMAP credentials missing" },
      { status: 500 },
    );
  }

  const imapHost = process.env.IMAP_HOST || "imap.gmail.com";
  const imapPort = Number(process.env.IMAP_PORT || 993);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: false,
  });

  const results: ProcessResult[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // imapflow's `search` honours { seen: false, subject: "..." }.
      // The search runs server-side so we don't pull every message
      // through. {body: "..."} would be even tighter but is dialect-
      // dependent across IMAP servers; subject is universally indexed.
      const messages = client.fetch(
        { seen: false, subject: "AGREE-" },
        { source: true, envelope: true, uid: true },
      );

      for await (const msg of messages) {
        const handled = await handleMessage(msg);
        if (handled) {
          results.push(handled);
          // Mark Seen so the next cron run skips it. Best-effort —
          // a failure here just means we'll try once more, which
          // is harmless because the backend's processReply is
          // idempotent on rows already in CODE_SENT or VERIFIED.
          try {
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
          } catch {
            // ignore
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP error";
    console.error("[CRON][agreement-replies]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}

async function handleMessage(msg: FetchMessageObject): Promise<ProcessResult | null> {
  const subject = msg.envelope?.subject ?? "";
  const match = TRACKING_REGEX.exec(subject);
  if (!match) return null;

  const userId = Number(match[1]);
  if (!Number.isFinite(userId)) return null;

  const fromEmail = msg.envelope?.from?.[0]?.address ?? null;
  if (!fromEmail) return null;

  // Pull the visible body text out of the raw RFC 822 source. We
  // don't need anything fancy — just look for YES / agreed / etc.
  // anywhere in the message before any quoted reply ("On … wrote:").
  const raw = msg.source ? msg.source.toString("utf8") : "";
  const beforeQuote = raw.split(/^On .+wrote:$/m)[0] ?? raw;
  const acceptMatch = ACCEPT_REGEX.exec(beforeQuote);
  if (!acceptMatch) {
    return {
      userId,
      email: fromEmail,
      reply: "",
      forwarded: false,
    };
  }

  // Forward to the backend. The backend re-checks the from-address
  // against the user record before generating a code.
  const backendBase =
    process.env.NEXT_PUBLIC_API_URL
    || "https://spireinfotech-production.up.railway.app";
  const cronSecret = process.env.AGREEMENT_CRON_SECRET || process.env.CRON_SECRET;

  let status = 0;
  let forwarded = false;
  try {
    const res = await fetch(`${backendBase}/api/auth/agreement/process-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret ?? "",
      },
      body: JSON.stringify({
        userId,
        fromEmail,
        replyContent: acceptMatch[0].toUpperCase(),
      }),
    });
    status = res.status;
    forwarded = res.ok;
  } catch (err) {
    console.error("[CRON][agreement-replies] backend forward failed:",
      err instanceof Error ? err.message : err);
  }

  return {
    userId,
    email: fromEmail,
    reply: acceptMatch[0].toUpperCase(),
    forwarded,
    backendStatus: status,
  };
}
