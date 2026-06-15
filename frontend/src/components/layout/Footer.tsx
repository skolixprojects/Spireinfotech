import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { BRAND } from "@/config/brand";
import { Mail } from "lucide-react";

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
    <footer className="bg-brand text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* Company info */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-serif text-2xl font-bold">
              <Image
                src={BRAND.logoUrl}
                alt={BRAND.logoAlt}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <span>{APP_NAME}</span>
            </Link>
            <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-xs">
              {BRAND.tagline}
            </p>
            <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
              <Mail size={14} />
              <a href={`mailto:${BRAND.contactEmail}`} className="hover:text-white transition-colors">
                {BRAND.contactEmail}
              </a>
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
          &copy; {BRAND.copyrightYear} {BRAND.legalName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
