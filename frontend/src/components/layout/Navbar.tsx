"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { dashboardRouteForRole } from "@/lib/api";

/**
 * Marketing-site navbar. Career-development focus — no LMS links.
 * Public visitors see: About, Support, Sign In, Get Started.
 * Authed visitors get a user dropdown that takes them to their
 * role-specific dashboard.
 */
const PUBLIC_LINKS = [
  { label: "About", href: "/about" },
  { label: "Support", href: "/support" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();

  const dashboardHref = isAuthenticated
    ? dashboardRouteForRole(user?.role)
    : "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-200/50"
          : "bg-white/50 backdrop-blur-sm"
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link
          href={isAuthenticated ? dashboardHref : "/"}
          className="flex items-center gap-2 font-serif text-lg font-bold text-[#0F766E] tracking-tight"
        >
          <Image
            src="/logo.png"
            alt="Spire Info Tech"
            width={36}
            height={36}
            priority
            className="h-9 w-9 object-contain"
          />
          <span>{APP_NAME}</span>
        </Link>

        <ul className="hidden lg:flex items-center gap-8">
          {PUBLIC_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-[#0F766E] font-semibold"
                    : "text-gray-600 hover:text-[#0F766E]"
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden lg:flex items-center gap-4">
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-[#0F766E] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-xs font-bold">
                  {user.fullName?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <span>{user.fullName}</span>
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
                    >
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">{user.fullName}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                          {user.role}
                        </span>
                      </div>
                      <Link href={dashboardHref} onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition cursor-pointer">
                        <LayoutDashboard size={16} /> Dashboard
                      </Link>
                      <hr className="my-1 border-gray-100" />
                      <button onClick={() => { logout(); setDropdownOpen(false); }}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition w-full text-left cursor-pointer">
                        <LogOut size={16} /> Sign Out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 hover:text-[#0F766E] transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/enroll"
                className="inline-flex items-center justify-center rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D9488] transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          className="lg:hidden text-[#0F766E] cursor-pointer"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:hidden overflow-hidden bg-white border-b border-gray-200"
          >
            <div className="flex flex-col gap-3 px-6 py-5">
              {PUBLIC_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium py-1",
                    pathname === link.href
                      ? "text-[#0F766E] font-semibold"
                      : "text-gray-700 hover:text-[#0F766E]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <hr className="border-gray-200 my-1" />
              {isAuthenticated && user ? (
                <>
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-8 h-8 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-xs font-bold">
                      {user.fullName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{user.fullName}</p>
                      <p className="text-xs text-gray-500 uppercase">{user.role}</p>
                    </div>
                  </div>
                  <Link
                    href={dashboardHref}
                    className="text-sm font-medium text-gray-700 hover:text-[#0F766E] py-1"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => logout()}
                    className="text-sm font-medium text-red-600 hover:text-red-700 py-1 text-left cursor-pointer"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-gray-700 hover:text-[#0F766E] py-1"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/enroll"
                    className="inline-flex items-center justify-center rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D9488] transition-colors mt-1"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
