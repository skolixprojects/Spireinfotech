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
// The backend's GlobalExceptionHandler returns a generic
// "Data conflict — this record may already exist." for 409s on
// duplicate enrollments and cart inserts; surface a friendly version.
export function friendlyEnrollmentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const lower = raw.toLowerCase();
  if (
    lower.includes("already exist") ||
    lower.includes("duplicate") ||
    lower.includes("data conflict") ||
    lower.includes("conflict")
  ) {
    return "You're already enrolled in this course.";
  }
  return raw || "Something went wrong. Please try again.";
}
