import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ShellWrapper } from "@/components/layout/ShellWrapper";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/Toast";
import { BRAND } from "@/config/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.tagline,
  icons: {
    icon: BRAND.faviconUrl,
    shortcut: BRAND.logoUrl,
    apple: BRAND.logoUrl,
  },
  openGraph: {
    title: `${BRAND.name} — Courses with real human mentorship`,
    description: BRAND.tagline,
    images: [{ url: BRAND.logoUrl }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inject brand colors as CSS variables on :root so the rest of
  // the app can pick them up via `var(--brand-primary)` or the
  // Tailwind `bg-brand` / `text-brand` utilities. Build-time inline
  // style is fine here — the values are baked at build time from
  // env vars, no client mutation.
  const brandCssVars = `:root {
    --brand-primary: ${BRAND.colors.primary};
    --brand-primary-dark: ${BRAND.colors.primaryDark};
    --brand-primary-light: ${BRAND.colors.primaryLight};
    --brand-accent: ${BRAND.colors.accent};
  }`;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCssVars }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#F0EDE8] text-[#0F172A] font-sans">
        <AuthProvider>
          <ToastProvider>
            <ShellWrapper>{children}</ShellWrapper>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
