"use client";

import { motion } from "framer-motion";
import { Target, Users, Shield, Award } from "lucide-react";

const values = [
  { icon: Target, title: "Focused Learning", description: "Structured paths that eliminate distractions and centre on skill mastery." },
  { icon: Users, title: "Expert Instructors", description: "Learn from industry veterans with 7-10+ years of real-world experience." },
  { icon: Shield, title: "Premium Content", description: "High-quality video lessons produced for focused, self-paced learning." },
  { icon: Award, title: "Recognised Certificates", description: "Earn certificates on completion that showcase your expertise to employers." },
];

export default function AboutPage() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="mx-auto max-w-5xl">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-4xl font-bold text-gray-900 mb-6"
        >
          About Spire Info Tech
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-gray-600 mb-16 max-w-3xl leading-relaxed"
        >
          Spire Info Tech is a self-paced learning platform designed to feel focused, motivating, and premium.
          We combine structured course delivery, self-paced learning, progress tracking,
          and gamification to help you advance your career in tech.
        </motion.p>

        <div className="grid gap-8 sm:grid-cols-2 mb-20">
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 * i, ease: "easeOut" as const }}
              className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-100 text-teal-700 mb-4">
                <v.icon size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{v.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{v.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl bg-[#00A3A8] text-white p-10 text-center"
        >
          <h2 className="font-serif text-2xl font-bold mb-3">Our Mission</h2>
          <p className="text-teal-100 max-w-2xl mx-auto leading-relaxed">
            To make high-quality, structured learning accessible to everyone.
            We believe that career growth should be intentional, measurable, and rewarding.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
