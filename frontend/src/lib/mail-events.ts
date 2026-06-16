"use client";

// Live new-mail stream over Server-Sent Events. Auth is via fetch + the mail
// Bearer token in the Authorization header (NEVER in the URL); the body is read
// as a ReadableStream and SSE frames are parsed by hand. On 401 it refreshes
// once and reconnects; on any drop it reconnects with capped exponential
// backoff. No EventSource (it can't send Authorization headers).
import { useEffect, useRef } from "react";
import { MAIL_API_BASE_URL, getMailAccessToken, mailRefresh } from "./mail-api";

export interface MailEvent {
  type: string;            // e.g. "NEW_MAIL"
  folder?: string;
  messageId?: number;
}

interface StreamOpts {
  onEvent: (e: MailEvent) => void;
  /** Fires on every successful (re)connect — resync point. */
  onConnect?: () => void;
  signal: AbortSignal;
}

const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** Parse one SSE frame (already CRLF-normalised, blank-line stripped). */
function parseFrame(raw: string): { event?: string; data: string } {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue; // blank or comment (heartbeat)
    const c = line.indexOf(":");
    const field = c === -1 ? line : line.slice(0, c);
    let val = c === -1 ? "" : line.slice(c + 1);
    if (val.startsWith(" ")) val = val.slice(1);
    if (field === "event") event = val;
    else if (field === "data") dataLines.push(val);
    // id:/retry: ignored in v1
  }
  return { event, data: dataLines.join("\n") };
}

async function readStream(body: ReadableStream<Uint8Array>, onEvent: (e: MailEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Accumulate across chunks; normalise CRLF so split on "\n\n" handles both.
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const rawFrame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const { data } = parseFrame(rawFrame);
        if (data) {
          try { onEvent(JSON.parse(data) as MailEvent); } catch { /* ignore non-JSON */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Open (and keep open, with reconnect) the mail event stream until the signal
 * aborts. Returns immediately; runs the connect loop in the background.
 */
export function openMailEventStream(opts: StreamOpts): void {
  const { signal } = opts;
  let attempt = 0;

  const connect = async (): Promise<void> => {
    if (signal.aborted) return;
    try {
      const token = getMailAccessToken();
      let res = await fetch(`${MAIL_API_BASE_URL}/api/mail/events`, {
        headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "text/event-stream" },
        signal,
      });
      if (res.status === 401 && (await mailRefresh())) {
        res = await fetch(`${MAIL_API_BASE_URL}/api/mail/events`, {
          headers: { Authorization: `Bearer ${getMailAccessToken() ?? ""}`, Accept: "text/event-stream" },
          signal,
        });
      }
      if (!res.ok || !res.body) throw new Error(`SSE open failed (${res.status})`);
      attempt = 0;            // connected — reset backoff
      opts.onConnect?.();     // resync on every (re)connect
      await readStream(res.body, opts.onEvent);
      // Stream ended (server closed / network) — fall through to reconnect.
    } catch {
      if (signal.aborted) return; // teardown — stop quietly
    }
    if (signal.aborted) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
    attempt++;
    await sleep(delay, signal);
    void connect();
  };

  void connect();
}

/**
 * Mount the live stream where the counts/list state lives. Callbacks are held in
 * refs so changing them doesn't tear down and re-open the stream; the stream is
 * (re)opened only when `enabled` flips. Aborts on unmount / disable (logout).
 */
export function useMailEvents(opts: {
  enabled: boolean;
  onNewMail: (e: MailEvent) => void;
  onResync: () => void;
}): void {
  const onNewMail = useRef(opts.onNewMail);
  const onResync = useRef(opts.onResync);
  onNewMail.current = opts.onNewMail;
  onResync.current = opts.onResync;

  useEffect(() => {
    if (!opts.enabled) return;
    const ctrl = new AbortController();
    openMailEventStream({
      signal: ctrl.signal,
      onConnect: () => onResync.current(),
      onEvent: (e) => { if (e.type === "NEW_MAIL") onNewMail.current(e); },
    });
    return () => ctrl.abort();
  }, [opts.enabled]);
}
