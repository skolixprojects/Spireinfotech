import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left - Branding panel */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0F766E] p-12 text-white">
        <Link href="/" className="inline-flex items-center gap-3 font-serif text-3xl font-bold w-fit">
          <Image
            src="/logo.png"
            alt="Spire Info Tech"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <span>Spire Info Tech</span>
        </Link>

        <div>
          <h2 className="font-serif text-4xl font-bold leading-tight mb-4">
            Master skills.<br />Transform careers.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed max-w-md">
            Self-paced courses in tech, design, and data science — every one comes with a
            dedicated mentor who guides you 1:1.
          </p>
        </div>

        <p className="text-sm text-white/60">
          Built for one-on-one mentorship from day one.
        </p>
      </div>

      {/* Right - Form area (logo is shown above the form by login/signup pages directly) */}
      <div className="flex items-center justify-center bg-[#F0EDE8] px-6 py-12">
        <div className="w-full max-w-[420px]">
          {children}
        </div>
      </div>
    </div>
  );
}
