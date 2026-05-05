"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { UserPlus, Users, Award } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: "easeOut" as const },
  }),
};

const steps = [
  {
    icon: UserPlus,
    label: "01",
    title: "Sign up and choose a course",
    body:
      "Create your free account, browse courses in tech, design, and data science, and enroll in the one that fits your goals.",
  },
  {
    icon: Users,
    label: "02",
    title: "Learn with a dedicated mentor",
    body:
      "When you enroll, we assign you a personal mentor from the course's expert pool. Request 1:1 sessions whenever you're stuck.",
  },
  {
    icon: Award,
    label: "03",
    title: "Complete and get certified",
    body:
      "Finish all lessons, pass quizzes, and submit your final assignment. Earn a verified certificate to showcase your skills.",
  },
];

export default function HowSpireWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="how-spire-works" ref={ref} className="py-20 bg-[#F0EDE8]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="text-center mb-12"
        >
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900">
            How Spire works
          </h2>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            Three steps from &ldquo;I want to learn X&rdquo; to certified.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.label}
                custom={i + 1}
                variants={fadeUp}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
                className="rounded-2xl border border-[#E3DED7] bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[#00A3A8]/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-[#00A3A8]" />
                  </div>
                  <span className="text-sm font-semibold text-[#5FE0E3]">
                    {step.label}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-lg leading-snug">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                  {step.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
