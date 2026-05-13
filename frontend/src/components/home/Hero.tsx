"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const easeOut = "easeOut" as const;

/**
 * Career-development hero. Single-column, heading-led, no LMS
 * imagery. Matches the PRD's "Start your career development
 * journey" headline + "Get Started" CTA → /enroll.
 */
export default function Hero() {
  return (
    <section
      className="relative flex items-center min-h-[80vh] py-20 md:py-28 px-6 md:px-12 lg:px-20 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #F0FDFA 0%, #ffffff 100%)",
      }}
    >
      <div className="relative mx-auto w-full max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
          className="inline-flex items-center gap-2 rounded-full border-[0.5px] border-[#0F766E]/20 bg-[#0F766E]/[0.08] px-4 py-1.5 mx-auto"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#0D9488] [animation:pulse-dot_2s_ease-in-out_infinite]"
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-[#115E59]">
            Career development &amp; staffing
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: easeOut }}
          className="mt-5 font-serif font-bold text-4xl md:text-5xl lg:text-6xl text-[#1a1a2e] leading-[1.1]"
        >
          Start your career development journey
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5, ease: easeOut }}
          className="mt-5 mx-auto max-w-xl text-lg leading-relaxed text-gray-600"
        >
          Professional guidance, coaching, interview preparation, and
          job-navigation support — tailored to your technology and career goals.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7, ease: easeOut }}
          className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Link
            href="/enroll"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-8 py-3.5 text-base font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] active:scale-[0.98]"
          >
            Get Started <ArrowRight size={18} />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-8 py-3.5 text-base font-medium text-[#1a1a2e] transition-all duration-200 hover:bg-gray-50 hover:border-[#0F766E]/30 active:scale-[0.98]"
          >
            Sign In
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9, ease: easeOut }}
          className="mt-6 text-sm text-gray-400"
        >
          No course catalog. No subscriptions. Just structured 1-on-1 support
          from enrollment to employment.
        </motion.p>
      </div>
    </section>
  );
}
