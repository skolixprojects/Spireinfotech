"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function CTASection() {
  return (
    <section className="relative">
      {/* Wave decoration at top */}
      <div className="absolute top-0 left-0 w-full -translate-y-[99%] pointer-events-none">
        <svg
          viewBox="0 0 1440 100"
          fill="none"
          preserveAspectRatio="none"
          className="w-full h-16 sm:h-24"
        >
          <path
            d="M0 100V60C240 0 480 80 720 60C960 40 1200 80 1440 40V100H0Z"
            fill="#0F766E"
          />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative bg-[#0F766E] py-24 overflow-hidden"
      >
        {/* Subtle pattern decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern
                id="cta-dots"
                x="0"
                y="0"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cta-dots)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
            Ready to start learning?
          </h2>

          <p className="mt-5 text-[#14B8A6] text-lg sm:text-xl">
            Create your free account and browse courses with real mentorship.
          </p>

          <Link
            href="/enroll"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-base font-semibold text-[#0F766E] shadow-lg transition-all duration-200 hover:bg-[#F0EDE8] hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
          >
            Get Started
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
