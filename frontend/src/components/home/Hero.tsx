"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#F0EDE8] pt-24">
      {/* Soft teal glow — backdrop only, not a graphic */}
      <div className="absolute top-0 -left-32 w-[420px] h-[420px] rounded-full bg-[#5FE0E3]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-32 w-[360px] h-[360px] rounded-full bg-[#00B4B8]/8 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
        <motion.h1
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-[1.05]"
        >
          Courses with
          <br />
          <span className="text-[#00A3A8]">real human mentorship</span>
        </motion.h1>

        <motion.p
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed"
        >
          Self-paced learning isn&apos;t lonely when you have a mentor. Every
          Spire course comes with a dedicated expert who guides you personally.
        </motion.p>

        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center"
        >
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-[#00A3A8] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#00A3A8]/20 hover:bg-[#00858A] transition-colors"
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
