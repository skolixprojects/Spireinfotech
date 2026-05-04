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
    <section className="relative overflow-hidden bg-[#F0EDE8] pt-32">
      {/* Decorative blobs */}
      <div className="absolute top-10 -left-40 w-[500px] h-[500px] rounded-full bg-[#95C8CB]/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#5FA3A3]/10 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6 py-20 lg:py-28 flex flex-col lg:flex-row items-center gap-16">
        {/* Text content */}
        <div className="flex-1 text-center lg:text-left">
          <motion.h1
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]"
          >
            Courses with
            <br />
            <span className="text-[#0E6B6B]">real human mentorship</span>
          </motion.h1>

          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-6 text-lg sm:text-xl text-gray-600 max-w-xl mx-auto lg:mx-0"
          >
            Self-paced learning isn&apos;t lonely when you have a mentor.
            Every Spire course comes with a dedicated expert who guides
            you personally.
          </motion.p>

          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-center lg:justify-start"
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#0E6B6B] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#0E6B6B]/25 hover:bg-[#0a5555] transition-colors"
            >
              Create Your Account
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-[#0E6B6B] hover:underline underline-offset-4"
            >
              Already have an account? Sign In
            </Link>
          </motion.div>
        </div>

        {/* Hero image */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex-1 w-full max-w-lg"
        >
          <img
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80"
            alt="Learners collaborating"
            loading="lazy"
            className="rounded-2xl object-cover w-full aspect-[4/3] shadow-2xl"
          />
        </motion.div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 w-full pointer-events-none">
        <svg
          viewBox="0 0 1440 80"
          fill="none"
          className="w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0 40C360 80 720 0 1080 40C1260 60 1380 50 1440 40V80H0V40Z"
            fill="white"
          />
        </svg>
      </div>
    </section>
  );
}
