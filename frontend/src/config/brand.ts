/**
 * Single source of truth for brand identity on the frontend.
 *
 * Every value is overridable via NEXT_PUBLIC_BRAND_* env vars set
 * at build time (Vercel → Project Settings → Environment Variables).
 * Defaults match the original Spire Info Tech deployment so the
 * existing build is byte-equivalent if no overrides are set.
 *
 * To re-deploy under a different brand:
 *   1. Set the relevant NEXT_PUBLIC_BRAND_* env vars in Vercel.
 *   2. Replace `/public/logo.png` (or set NEXT_PUBLIC_BRAND_LOGO_URL).
 *   3. Set the matching BRAND_* env vars on Railway for the backend.
 *   4. Redeploy. No code changes needed.
 *
 * See themes/ at the repo root for ready-made templates.
 */
export const BRAND = {
  // Core identity
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Spire Info Tech",
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || "Spire",
  legalName: process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME || "Spire Info Tech",
  tagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE
    || "Advance your career with expert coaching and personalized guidance",

  // Logo and visual
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/logo.png",
  logoAlt: process.env.NEXT_PUBLIC_BRAND_LOGO_ALT || "Spire Info Tech logo",
  faviconUrl: process.env.NEXT_PUBLIC_BRAND_FAVICON || "/favicon.ico",

  // Colors. These flow through CSS variables (--brand-primary etc.)
  // set in app/layout.tsx, so most components don't need to read
  // them directly — they can use the Tailwind `bg-brand` / `text-brand`
  // utilities or `var(--brand-primary)` inline.
  colors: {
    primary: process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#0F766E",
    primaryDark: process.env.NEXT_PUBLIC_BRAND_PRIMARY_DARK || "#115E59",
    primaryLight: process.env.NEXT_PUBLIC_BRAND_PRIMARY_LIGHT || "#E6F7F5",
    accent: process.env.NEXT_PUBLIC_BRAND_ACCENT || "#D97706",
  },

  // Contact and email
  contactEmail:
    process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL || "info@spireitco.com",
  supportEmail:
    process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL || "support@spireitco.com",
  noreplyEmail:
    process.env.NEXT_PUBLIC_BRAND_NOREPLY_EMAIL || "noreply@spireitco.com",

  // Address
  address: {
    line1:
      process.env.NEXT_PUBLIC_BRAND_ADDRESS_LINE1
      || "H No. 2-91/5, Flat No. 1605",
    line2:
      process.env.NEXT_PUBLIC_BRAND_ADDRESS_LINE2
      || "Trendset Jayabheri Enclave, Hitech City",
    city: process.env.NEXT_PUBLIC_BRAND_CITY || "Hyderabad",
    state: process.env.NEXT_PUBLIC_BRAND_STATE || "Telangana",
    postalCode: process.env.NEXT_PUBLIC_BRAND_POSTAL_CODE || "500084",
    country: process.env.NEXT_PUBLIC_BRAND_COUNTRY || "India",
  },

  // URLs
  website:
    process.env.NEXT_PUBLIC_BRAND_WEBSITE
    || "https://spireinfotech.vercel.app",
  marketingSite:
    process.env.NEXT_PUBLIC_BRAND_MARKETING_SITE
    || "https://spireinfotech.vercel.app",

  // Participant ID format. Display-only on the frontend — the
  // backend mints actual IDs using the matching BRAND_ID_PREFIX env.
  idPrefix: process.env.NEXT_PUBLIC_BRAND_ID_PREFIX || "SIT",

  // Footer
  copyrightYear:
    process.env.NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR
    || new Date().getFullYear().toString(),
} as const;

/** One-line postal address for footers and contact blocks. */
export function getFullAddress(): string {
  const a = BRAND.address;
  return `${a.line1}, ${a.line2}, ${a.city}, ${a.state} ${a.postalCode}, ${a.country}`;
}
