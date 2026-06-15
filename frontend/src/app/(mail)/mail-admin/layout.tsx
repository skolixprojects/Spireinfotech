"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mail, LogOut, ArrowLeft } from "lucide-react";
import { useMailAuth } from "@/lib/mail-auth-context";

const isAdminRole = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

export default function MailAdminLayout({ children }: { children: ReactNode }) {
  const { account, status, logout } = useMailAuth();
  const router = useRouter();
  const pathname = usePathname();

  // UX role gate (the backend is the real boundary): anonymous → login;
  // a signed-in non-admin USER → the regular mail client.
  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/mail/login");
    } else if (status === "authenticated" && !isAdminRole(account?.role)) {
      router.replace("/mail");
    }
  }, [status, account, router]);

  if (status !== "authenticated" || !account || !isAdminRole(account.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  const isSuper = account.role === "SUPER_ADMIN";
  const tabs = [
    { label: "Mailboxes", href: "/mail-admin" },
    ...(isSuper ? [{ label: "Domains", href: "/mail-admin/domains" }] : []),
    { label: "Audit", href: "/mail-admin/audit" },
  ];

  return (
    <div className="min-h-screen bg-[#F0EDE8]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F766E] text-white">
                <Mail size={18} />
              </div>
              <div className="leading-tight">
                <p className="font-serif text-lg font-bold text-gray-900">Mail Admin</p>
                <p className="text-xs text-gray-500">{account.entityName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden sm:inline text-gray-500">
                {account.email} · <span className="font-medium text-gray-700">{account.role}</span>
              </span>
              <Link href="/mail" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#0F766E]">
                <ArrowLeft size={14} /> Mail
              </Link>
              <button onClick={logout} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#0F766E]">
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
          <nav className="flex gap-1 -mb-px">
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? "border-[#0F766E] text-[#0F766E]"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
