import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(price);
}

// Translates backend enrollment/cart errors into user-facing copy.
// The backend's GlobalExceptionHandler classifies DB integrity
// violations (duplicates, NOT NULL, FK) and returns specific messages
// — for the enrollment/cart flow the only legitimate 409 is a
// duplicate, so we map the "already exists" wording to the
// context-specific "you're already enrolled" copy. Anything else
// (e.g. missing field, FK violation) passes through as the backend's
// own message so the user sees what actually went wrong rather than
// a misleading "you're enrolled".
export function friendlyEnrollmentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const lower = raw.toLowerCase();
  if (
    lower.includes("already exist") ||
    lower.includes("duplicate") ||
    lower.includes("same identifier")
  ) {
    return "You're already enrolled in this course.";
  }
  return raw || "Something went wrong. Please try again.";
}
