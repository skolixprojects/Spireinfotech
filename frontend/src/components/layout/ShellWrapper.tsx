"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const AUTH_ROUTES = ["/login", "/signup"];
// Routes that own their full chrome (or none). The course player has
// its own dark top bar; the certificate verify page has its own
// public-facing header so a recruiter doesn't see a logged-in user's
// nav when they paste the link. Both opt out of the global Navbar/Footer.
const FULLSCREEN_ROUTES = ["/learn", "/verify"];

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
