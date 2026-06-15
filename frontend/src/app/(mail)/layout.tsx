import type { ReactNode } from "react";
import { MailAuthProvider } from "@/lib/mail-auth-context";
import { ToastProvider } from "@/components/ui/Toast";

// Isolated layout for the internal mail module. Wraps its OWN
// MailAuthProvider (independent of the LMS AuthProvider) plus a toast
// context. The LMS Navbar/Footer are already suppressed for /mail*
// routes via ShellWrapper.FULLSCREEN_ROUTES, so the mail tree owns its
// full chrome.
export default function MailLayout({ children }: { children: ReactNode }) {
  return (
    <MailAuthProvider>
      <ToastProvider>
        <div className="min-h-screen bg-[#F0EDE8] font-sans text-[#0F172A]">
          {children}
        </div>
      </ToastProvider>
    </MailAuthProvider>
  );
}
