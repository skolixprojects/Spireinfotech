/**
 * IST (Asia/Kolkata, UTC+5:30) date/time formatters used everywhere
 * the UI surfaces a timestamp. Centralised here so a future timezone
 * switch (or a per-user preference) is a single-file change.
 *
 * IMPORTANT — naive-ISO handling:
 * Spring's `LocalDateTime` fields serialise to JSON as
 * `"2026-05-07T18:08:00"` with no `Z` and no offset. JavaScript's
 * `new Date()` parses such strings as **browser-local time**, not
 * UTC, which means a Railway-served (UTC-clocked) timestamp would
 * render at the user's wall-clock instead of being rebased to IST.
 * `safeDate` below sniffs for that pattern and appends `Z` so the
 * value is interpreted as UTC, then `Intl.DateTimeFormat` rebases
 * to Asia/Kolkata correctly. {@link parseTimestamp} exposes the
 * same logic for components that need a raw `Date` (e.g. day-bucket
 * grouping in audit logs).
 *
 * `spring.jackson.time-zone=Asia/Kolkata` only affects timezone-
 * aware types (`Instant`, `ZonedDateTime`) — for tz-naive
 * `LocalDateTime` the frontend has to do the work. Every helper
 * here passes `timeZone: "Asia/Kolkata"` to `Intl.DateTimeFormat`
 * regardless, defensively.
 *
 * All helpers tolerate null/undefined/invalid input and return an
 * em-dash so callers don't need a defensive ternary at every site.
 */

const IST = "Asia/Kolkata";
const FALLBACK = "—";

type DateLike = string | number | Date | null | undefined;

// Matches an ISO-ish datetime that ends in seconds/fractional-seconds
// without a trailing `Z` and without a `±HH:MM` offset. Examples:
//   "2026-05-07T18:08:00"          — match
//   "2026-05-07T18:08:00.123"      — match
//   "2026-05-07T18:08:00Z"         — no match (already UTC)
//   "2026-05-07T18:08:00+05:30"    — no match (offset present)
const NAIVE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/**
 * Parses a backend timestamp into a {@link Date}, treating naive
 * ISO strings as UTC. Returns null on invalid input. Exported so
 * components that need to do their own grouping/comparison (rather
 * than display) parse with the same rules as the formatters.
 */
export function parseTimestamp(input: DateLike): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  let value = input;
  if (typeof value === "string" && NAIVE_ISO_RE.test(value)) {
    value = value + "Z";
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Internal alias kept so existing in-file references don't churn.
const safeDate = parseTimestamp;

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
 * "8:00 PM IST" — wall-clock with explicit zone label. Used on
 * admin and audit surfaces where two staff in different timezones
 * could be reading the same row and the unlabelled time is
 * ambiguous. Avoid on student-facing screens — they're already
 * implicitly IST.
 */
export function formatISTTimeWithZone(input: DateLike): string {
  const t = formatISTTime(input);
  return t === FALLBACK ? FALLBACK : `${t} IST`;
}

/** "7 May 2026, 8:00 PM IST" — full timestamp, zone-labelled. */
export function formatISTWithZone(input: DateLike): string {
  const t = formatIST(input);
  return t === FALLBACK ? FALLBACK : `${t} IST`;
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

/**
 * `YYYY-MM-DD` in IST — a stable, lexically-sortable bucket key for
 * grouping audit-log rows by calendar day. Uses {@link parseTimestamp}
 * so a naive UTC string at 23:30 on May 7 (UTC) correctly buckets
 * into May 8 (IST), instead of being grouped with the previous IST
 * day because the raw UTC clock hadn't ticked over yet.
 */
export function istDayKey(input: DateLike): string {
  const d = safeDate(input);
  if (!d) return "";
  // en-CA gives ISO-style YYYY-MM-DD which sorts lexically.
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}
