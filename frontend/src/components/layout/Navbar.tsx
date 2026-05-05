"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, User, LayoutDashboard, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";

// Links by audience. /courses and /services are now login-protected,
// so the public nav doesn't reference them — visitors must sign up
// to browse. Logged-in nav varies by role: students get cart access;
// instructors don't see Services (they don't author them); trainers
// don't see Courses (they don't author them); admins see everything.
const PUBLIC_LINKS = [
  { label: "About", href: "/about" },
  { label: "Support", href: "/support" },
];

const STUDENT_LINKS = [
  { label: "Courses", href: "/courses" },
  { label: "Services", href: "/services" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
  { label: "Cart", href: "/cart" },
];

const INSTRUCTOR_LINKS = [
  { label: "Courses", href: "/courses" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
];

const TRAINER_LINKS = [
  { label: "Services", href: "/services" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
];

const ADMIN_LINKS = [
  { label: "Courses", href: "/courses" },
  { label: "Services", href: "/services" },
  { label: "Admin", href: "/admin" },
  { label: "Profile", href: "/profile" },
];

function pickNavLinks(isAuthenticated: boolean, role?: string) {
  if (!isAuthenticated) return PUBLIC_LINKS;
  switch (role?.toUpperCase()) {
    case "ADMIN": return ADMIN_LINKS;
    case "INSTRUCTOR": return INSTRUCTOR_LINKS;
    case "TRAINER": return TRAINER_LINKS;
    default: return STUDENT_LINKS;
  }
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();

  const navLinks = pickNavLinks(isAuthenticated, user?.role);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Navbar */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-200/50"
            : "bg-white/50 backdrop-blur-sm"
        )}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* Logo + wordmark */}
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="flex items-center gap-2 font-serif text-2xl font-bold text-[#0F766E] tracking-tight"
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

          {/* Desktop nav links */}
          <ul className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
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

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-4">
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-[#0F766E] transition-colors"
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
                        className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
                      >
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-sm font-semibold text-gray-900">{user.fullName}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                          <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                            {user.role}
                          </span>
                        </div>
                        <Link href="/dashboard" onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                          <LayoutDashboard size={16} /> Dashboard
                        </Link>
                        <Link href="/courses" onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                          <BookOpen size={16} /> Courses
                        </Link>
                        <Link href="/profile" onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                          <User size={16} /> Profile
                        </Link>
                        {user.role?.toUpperCase() === "ADMIN" && (
                          <Link href="/admin" onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                            <LayoutDashboard size={16} /> Admin Panel
                          </Link>
                        )}
                        <hr className="my-1 border-gray-100" />
                        <button onClick={() => { logout(); setDropdownOpen(false); }}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition w-full text-left">
                          <LogOut size={16} /> Sign Out
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-[#0F766E] transition-colors">
                  Sign In
                </Link>
                <Link href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D9488] transition-colors shadow-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="lg:hidden text-[#0F766E] cursor-pointer" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>

        {/* Mobile menu */}
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
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href}
                    className={cn(
                      "text-sm font-medium py-1",
                      pathname === link.href ? "text-[#0F766E] font-semibold" : "text-gray-700 hover:text-[#0F766E]"
                    )}>
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
                      <div>
                        <p className="text-sm font-semibold">{user.fullName}</p>
                        <p className="text-xs text-gray-500 uppercase">{user.role}</p>
                      </div>
                    </div>
                    {user.role?.toUpperCase() === "ADMIN" && (
                      <Link href="/admin" className="text-sm font-medium text-gray-700 hover:text-[#0F766E] py-1">Admin Panel</Link>
                    )}
                    <button onClick={() => logout()}
                      className="text-sm font-medium text-red-600 hover:text-red-700 py-1 text-left">Sign Out</button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-[#0F766E] py-1">Sign In</Link>
                    <Link href="/signup"
                      className="inline-flex items-center justify-center rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D9488] transition-colors mt-1">
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
