/**
 * IST (Asia/Kolkata, UTC+5:30) date/time formatters used everywhere
 * the UI surfaces a timestamp. Centralised here so a future timezone
 * switch (or a per-user preference) is a single-file change.
 *
 * Backend already serialises timestamps in IST via
 * `spring.jackson.time-zone=Asia/Kolkata`, but every helper here
 * passes `timeZone: "Asia/Kolkata"` to `Intl.DateTimeFormat` anyway —
 * defensive against any payload that comes from a third party (Razorpay
 * webhooks, Cloudinary, hand-crafted seed dates) and bypasses the
 * Jackson conversion.
 *
 * All helpers tolerate null/undefined/invalid input and return an
 * em-dash so callers don't need a defensive ternary at every site.
 */

const IST = "Asia/Kolkata";
const FALLBACK = "—";

type DateLike = string | number | Date | null | undefined;

function safeDate(input: DateLike): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** "7 May 2026, 8:00 PM" — full timestamp for activity feeds, audit. */
export function formatIST(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  return d.toLocaleString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "7 May, 8:00 PM" — drops the year (for current-year contexts). */
export function formatISTShort(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  return d.toLocaleString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "7 May 2026" — calendar date, no time. */
export function formatISTDate(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  return d.toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "7 May" — short month-day, no year. */
export function formatISTDateShort(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  return d.toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
  });
}

/** "8:00 PM" — wall-clock time only. */
export function formatISTTime(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  return d.toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * "just now" / "5 min ago" / "3h ago" / "2d ago" / "7 May, 8:00 PM"
 * for older. The "now" comparison is in real time (UTC under the
 * hood) so the rebase to IST doesn't matter for the math; only the
 * fallback formatting respects the timezone.
 */
export function timeAgoIST(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) {
    // Future timestamp — fall through to absolute display rather
    // than show a negative "ago" reading.
    return formatISTShort(d);
  }
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatISTShort(d);
}

/**
 * "8:00 PM" if today; "7 May, 8:00 PM" otherwise. Used in chat
 * threads and activity rows where same-day messages should show
 * just the wall-clock time.
 */
export function formatISTContextual(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return FALLBACK;
  const today = new Date().toLocaleDateString("en-IN", { timeZone: IST });
  const dateDay = d.toLocaleDateString("en-IN", { timeZone: IST });
  return dateDay === today ? formatISTTime(d) : formatISTShort(d);
}
