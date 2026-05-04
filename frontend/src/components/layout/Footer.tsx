import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Mail, Phone } from "lucide-react";

// Trimmed to routes that actually exist. Categories sub-routes, Blog,
// Tutorials, Webinars, Docs, Contact, FAQ, Community, and the Legal
// pages were all 404s — kept out rather than scaffolding stubs we
// don't have content for. Social icons were all href="#" — dropped.
const columns = [
  {
    title: "Browse",
    links: [
      { label: "Courses", href: "/courses" },
      { label: "Services", href: "/services" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Support", href: "/support" },
      { label: "Sign In", href: "/login" },
      { label: "Sign Up", href: "/signup" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-[#0E6B6B] text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* Company info */}
          <div>
            <Link href="/" className="font-serif text-2xl font-bold">
              {APP_NAME}
            </Link>
            <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-xs">
              Self-paced courses with real human mentorship.
            </p>
            <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
              <Mail size={14} />
              <span>hello@spire.dev</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm text-white/60">
              <Phone size={14} />
              <span>+91 98765 43210</span>
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/90">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-sm text-white/50">
          &copy; 2026 Spire. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
