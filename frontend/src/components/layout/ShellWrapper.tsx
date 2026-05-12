"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const AUTH_ROUTES = ["/login", "/signup"];
// Routes that own their full chrome (or none). The course player has
// its own dark top bar; the certificate verify page has its own
// public-facing header so a recruiter doesn't see a logged-in user's
// nav when they paste the link. The /agreement gate hides the nav
// so the user can't navigate away mid-flow. All opt out of the
// global Navbar/Footer.
// Phase 1B onboarding pages own their own chrome (OnboardingLayout
// provides logo + progress bar + footer), so they opt out of the
// public Navbar/Footer too. /verify already matched /verify-email
// via startsWith; the explicit /verify-email + /enroll entries
// document the intent and stay correct if /verify ever needs to
// narrow.
const FULLSCREEN_ROUTES = [
  "/learn", "/verify", "/agreement",
  "/enroll", "/verify-email", "/participant-id",
  "/acknowledgment", "/document-upload",
];

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isFullscreen = FULLSCREEN_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuth || isFullscreen) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
