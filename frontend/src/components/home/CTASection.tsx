"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

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
            fill="#0E6B6B"
          />
        </svg>
      </div>

      <div ref={ref} className="relative bg-[#0E6B6B] py-24 overflow-hidden">
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
          <motion.h2
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-white"
          >
            Ready to start learning?
          </motion.h2>

          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            className="mt-5 text-[#95C8CB] text-lg sm:text-xl"
          >
            Create your free account and browse courses with real mentorship.
          </motion.p>

          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
          >
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-base font-semibold text-[#0E6B6B] shadow-lg hover:bg-[#F0EDE8] transition-colors"
            >
              Get Started
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
