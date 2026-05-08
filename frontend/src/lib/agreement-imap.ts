import { ImapFlow, type FetchMessageObject } from "imapflow";

/**
 * Shared IMAP scan logic — used by both the every-minute cron route
 * (`/api/cron/check-agreement-replies`) and the user-triggered debug
 * route (`/api/debug/check-replies`). Lives outside both routes so
 * Next.js's route-handler export rules don't reject the helper.
 *
 * Sender-first matching strategy (replaces the brittle
 * [AGREE-{userId}-{ts}] subject marker approach):
 *   1. Scan unread INBOX messages — narrowed to a single sender if
 *      `scopeEmail` is set (debug "Check Now" path).
 *   2. For each message, try the legacy tracking marker for a fast
 *      path; otherwise call `/api/auth/agreement/check-pending-user`
 *      to resolve the sender to an open agreement row.
 *   3. Scan the body for an acceptance phrase; if matched, forward
 *      to `/api/auth/agreement/process-reply`.
 *   4. Mark forwarded messages \Seen so the next sweep skips them.
 */

const TRACKING_REGEX = /\[AGREE-(\d+)-(\d+)\]/i;
const ACCEPT_REGEX = /\b(yes|agreed|i\s+agree|accept|yep|yup|yeah|haan|sure|ok|okay)\b/i;

export interface ImapScanResult {
  ok: boolean;
  error?: string;
  totalMessages?: number;
  unseenMessages?: number;
  processed?: number;
  results?: ProcessResult[];
  logs: string[];
}

export interface ProcessResult {
  userId: number | null;
  email: string | null;
  subject: string | null;
  matchedBy: "tracking-id" | "sender-lookup" | "no-match";
  reply: string;
  forwarded: boolean;
  backendStatus?: number;
}

export interface ImapScanOptions {
  scopeEmail?: string | null;
  collectLogs?: boolean;
}

export async function runImapScan(opts: ImapScanOptions = {}): Promise<ImapScanResult> {
  const collectLogs = opts.collectLogs ?? false;
  const logs: string[] = [];
  const log = (msg: string) => {
    // eslint-disable-next-line no-console
    console.log("[IMAP]", msg);
    if (collectLogs) logs.push(`${new Date().toISOString()} ${msg}`);
  };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    log("ERROR: SMTP_USER or SMTP_PASS not set");
    return { ok: false, error: "IMAP credentials missing", logs };
  }

  const imapHost = process.env.IMAP_HOST || "imap.gmail.com";
  const imapPort = Number(process.env.IMAP_PORT || 993);
  log(`Connecting to ${imapHost}:${imapPort} as ${process.env.SMTP_USER}`);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: false,
    // Tight timeouts — a hung TLS handshake otherwise burns the
    // whole 60s function budget for nothing.
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  const results: ProcessResult[] = [];
  let totalMessages: number | undefined;
  let unseenMessages: number | undefined;

  try {
    await client.connect();
    log("IMAP connected");
    const lock = await client.getMailboxLock("INBOX");
    log("INBOX opened");

    try {
      const status = await client.status("INBOX", { messages: true, unseen: true });
      totalMessages = status.messages;
      unseenMessages = status.unseen;
      log(`Mailbox stats: total=${totalMessages} unseen=${unseenMessages}`);

      // When scopeEmail is set we ask the server to narrow to that
      // sender; otherwise we sweep the whole unread bucket.
      const search: Record<string, unknown> = { seen: false };
      if (opts.scopeEmail) search.from = opts.scopeEmail;

      const messages = client.fetch(
        search,
        { source: true, envelope: true, uid: true },
      );

      for await (const msg of messages) {
        const handled = await handleMessage(msg, log);
        if (handled) {
          results.push(handled);
          if (handled.forwarded) {
            // Best-effort \Seen flag — if it fails the backend's
            // processReply is idempotent so a re-run is harmless.
            try {
              await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
            } catch { /* ignore */ }
          }
        }
      }
    } finally {
      lock.release();
      log("INBOX lock released");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP error";
    log(`ERROR: ${message}`);
    return { ok: false, error: message, logs };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  return {
    ok: true,
    totalMessages,
    unseenMessages,
    processed: results.length,
    results,
    logs,
  };
}

async function handleMessage(
  msg: FetchMessageObject,
  log: (msg: string) => void,
): Promise<ProcessResult | null> {
  const subject = msg.envelope?.subject ?? "";
  const fromEmail = msg.envelope?.from?.[0]?.address ?? null;
  log(`  scanning: from=${fromEmail || "?"} subject="${subject}"`);

  if (!fromEmail) {
    log("  skip — no from-address");
    return null;
  }

  // ── Resolve the userId. Try tracking-ID fast path; fall back to
  //    sender-based pending-user lookup against the backend.
  let userId: number | null = null;
  let matchedBy: "tracking-id" | "sender-lookup" = "sender-lookup";

  const trackingMatch = TRACKING_REGEX.exec(subject);
  if (trackingMatch) {
    userId = Number(trackingMatch[1]);
    matchedBy = "tracking-id";
    log(`  matched tracking marker AGREE-${userId}-${trackingMatch[2]}`);
  } else {
    log("  no tracking marker — calling backend check-pending-user");
    userId = await lookupPendingUserId(fromEmail, log);
    if (userId == null) {
      log(`  skip — no pending agreement for ${fromEmail}`);
      return {
        userId: null, email: fromEmail, subject,
        matchedBy: "no-match", reply: "", forwarded: false,
      };
    }
    log(`  pending user found: id=${userId}`);
  }

  // Strip headers + the quoted-reply tail so a previous "Yes!"
  // sitting in the original sent message can't trigger a false
  // acceptance.
  const raw = msg.source ? msg.source.toString("utf8") : "";
  const beforeQuote = raw.split(/^On .+wrote:$/m)[0] ?? raw;
  const bodyOnly = stripHeaders(beforeQuote);
  const acceptMatch = ACCEPT_REGEX.exec(bodyOnly);
  if (!acceptMatch) {
    log("  body has no acceptance phrase — skipping");
    return {
      userId, email: fromEmail, subject, matchedBy,
      reply: "", forwarded: false,
    };
  }
  log(`  accepted: "${acceptMatch[0]}"`);

  const backendBase = backendBaseUrl();
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
    log(`  backend forward: status=${status} ok=${forwarded}`);
  } catch (err) {
    log(`  backend forward FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    userId, email: fromEmail, subject, matchedBy,
    reply: acceptMatch[0].toUpperCase(),
    forwarded,
    backendStatus: status,
  };
}

async function lookupPendingUserId(
  fromEmail: string,
  log: (msg: string) => void,
): Promise<number | null> {
  const backendBase = backendBaseUrl();
  const cronSecret = process.env.AGREEMENT_CRON_SECRET || process.env.CRON_SECRET;
  try {
    const res = await fetch(`${backendBase}/api/auth/agreement/check-pending-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret ?? "",
      },
      body: JSON.stringify({ email: fromEmail }),
    });
    if (!res.ok) {
      log(`  check-pending-user returned ${res.status}`);
      return null;
    }
    const json = await res.json();
    const data = json?.data ?? json;
    if (!data?.hasPending) return null;
    const id = Number(data.userId);
    return Number.isFinite(id) ? id : null;
  } catch (err) {
    log(`  check-pending-user error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function backendBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL
    || "https://spireinfotech-production.up.railway.app"
  );
}

/**
 * Strips RFC-822 headers from a raw source dump so the regex doesn't
 * trip on header values like "Subject: Re: yes". We just look for
 * the first blank line, which separates headers from body.
 */
function stripHeaders(raw: string): string {
  const idx = raw.indexOf("\r\n\r\n");
  if (idx >= 0) return raw.slice(idx + 4);
  const idx2 = raw.indexOf("\n\n");
  if (idx2 >= 0) return raw.slice(idx2 + 2);
  return raw;
}
