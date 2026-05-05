"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { MessageCircle, BookOpen, Briefcase, Award } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const props = [
  {
    icon: MessageCircle,
    title: "1:1 Mentorship on Every Course",
    body:
      "You're never stuck alone. Request a session with your mentor whenever you need help — they review your work and answer your questions.",
  },
  {
    icon: BookOpen,
    title: "Self-Paced, Structured Learning",
    body:
      "Video lessons, weekly assignments, and quizzes — all at your own speed. Structure without pressure.",
  },
  {
    icon: Briefcase,
    title: "Career Services",
    body:
      "Beyond courses — resume preparation, interview training, LinkedIn optimization, and placement assistance.",
  },
  {
    icon: Award,
    title: "Verified Certificates",
    body:
      "Complete a course, earn a certificate. Each one has a unique verification link employers can check.",
  },
];

export default function WhySpire() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-20 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="text-center mb-12"
        >
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900">
            Why learners choose Spire Info Tech
          </h2>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2">
          {props.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                custom={i + 1}
                variants={fadeUp}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
                className="rounded-2xl border border-[#E3DED7] bg-[#F0EDE8] p-7 hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 rounded-xl bg-[#00A3A8]/10 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-[#00A3A8]" />
                </div>
                <h3 className="font-semibold text-gray-900 text-lg leading-snug">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                  {p.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
