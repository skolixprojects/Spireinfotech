"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const baseTransition = { duration: 0.6, ease: "easeOut" as const };

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#F0EDE8] pt-24">
      {/* Soft teal glow — slow scale-in so it feels alive without being a graphic */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.5 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="absolute top-0 -left-32 w-[420px] h-[420px] rounded-full bg-[#5FE0E3]/10 blur-3xl pointer-events-none"
      />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.5 }}
        transition={{ duration: 1.4, ease: "easeOut", delay: 0.1 }}
        className="absolute bottom-0 -right-32 w-[360px] h-[360px] rounded-full bg-[#00B4B8]/8 blur-3xl pointer-events-none"
      />

      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...baseTransition, delay: 0.15 }}
          className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-[1.05]"
        >
          Courses with
          <br />
          <span className="text-[#00A3A8]">real human mentorship</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...baseTransition, delay: 0.3 }}
          className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed"
        >
          Self-paced learning isn&apos;t lonely when you have a mentor. Every
          Spire Info Tech course comes with a dedicated expert who guides you
          personally.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...baseTransition, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center"
        >
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-[#00A3A8] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#00A3A8]/20 transition-all duration-200 hover:bg-[#00858A] hover:scale-[1.02] hover:shadow-xl hover:shadow-[#00A3A8]/30 active:scale-[0.98]"
          >
            Create Your Account
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[#00A3A8] hover:underline underline-offset-4"
          >
            Already have an account? Sign In
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
