import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ShellWrapper } from "@/components/layout/ShellWrapper";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/Toast";
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
  title: "Spire — Advance Your Career with Structured Learning",
  description:
    "Learn at your own pace with courses in tech, design, and data science. Every course pairs you with a dedicated mentor who answers questions along the way.",
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "Spire — Courses with real human mentorship",
    description:
      "Self-paced courses in tech, design, and data science. Every course comes with a dedicated mentor.",
    images: [{ url: "/logo.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
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
