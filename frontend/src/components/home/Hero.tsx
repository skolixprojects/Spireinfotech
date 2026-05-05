"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Play, Users, Award, Rocket, type LucideIcon } from "lucide-react";

const easeOut = "easeOut" as const;

// Node positions in SVG viewBox coordinates (0..400). Same coordinates
// drive both the SVG line endpoints and the absolute-positioned node
// divs (converted to percentages so they scale with the container).
interface NodeSpec {
  x: number;
  y: number;
  label: string;
  Icon: LucideIcon;
  special?: boolean;
}

const NODES: NodeSpec[] = [
  { x: 70,  y: 60,  label: "Enroll",  Icon: BookOpen },
  { x: 280, y: 60,  label: "Learn",   Icon: Play },
  { x: 280, y: 180, label: "Mentor",  Icon: Users },
  { x: 70,  y: 180, label: "Certify", Icon: Award },
  { x: 175, y: 300, label: "Career",  Icon: Rocket, special: true },
];

const LINES = [
  { d: "M 70 60 L 280 60",   delay: 0.8 },
  { d: "M 280 60 L 280 180", delay: 1.4 },
  { d: "M 280 180 L 70 180", delay: 2.0 },
  { d: "M 70 180 L 175 300", delay: 2.6 },
];

// Node entrance delays per spec: 0.5, 1.1, 1.7, 2.3, 2.9
const NODE_DELAYS = [0.5, 1.1, 1.7, 2.3, 2.9];

// Combined path used by the traveling-dot SMIL animation
const FULL_PATH = "M 70 60 L 280 60 L 280 180 L 70 180 L 175 300";

export default function Hero() {
  const handleExplore = () => {
    // Existing anchor on the HowSpireWorks section. Spec mentioned
    // #features, but we don't have one and the rule was "don't touch
    // any other section" — reusing the existing anchor instead.
    document.getElementById("how-spire-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative min-h-[80vh] py-16 md:py-28 px-6 md:px-12 lg:px-20"
      style={{
        background:
          "linear-gradient(135deg, #f0fdfd 0%, #ffffff 60%, #f8fafc 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* ── LEFT — Text content ── */}
        <div>
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
            className="inline-flex items-center gap-2 rounded-full border-[0.5px] border-[#00A8A8]/20 bg-[#00A8A8]/[0.08] px-4 py-1.5 w-fit"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#00A8A8] [animation:pulse-dot_2s_ease-in-out_infinite]"
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-[#00878A]">
              Your path starts here
            </span>
          </motion.div>

          {/* Heading — two lines, line 2 in gradient teal */}
          <h1 className="mt-5 font-bold leading-tight text-3xl md:text-5xl text-[#1a1a2e]">
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: easeOut }}
              className="block"
            >
              Learn. Build.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: easeOut }}
              className="block bg-gradient-to-br from-[#00CED1] to-[#00878A] bg-clip-text text-transparent"
            >
              Get hired.
            </motion.span>
          </h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease: easeOut }}
            className="mt-5 max-w-md text-base md:text-lg leading-relaxed text-gray-500"
          >
            Structured courses with personal mentorship, career services, and
            verified certificates — designed for India&apos;s next generation
            of tech talent.
          </motion.p>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8, ease: easeOut }}
            className="mt-7 flex flex-col sm:flex-row gap-3"
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-[#00A8A8] px-7 py-3 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_6px_20px_rgba(0,168,168,0.3)] active:scale-[0.98]"
            >
              Start for free
            </Link>
            <button
              type="button"
              onClick={handleExplore}
              className="inline-flex items-center justify-center rounded-xl border-[0.5px] border-gray-300 bg-white px-7 py-3 text-sm font-medium text-[#1a1a2e] transition-all duration-200 hover:bg-gray-50 hover:border-[#00A8A8]/30 active:scale-[0.98]"
            >
              Explore courses
            </button>
          </motion.div>

          {/* Trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.0, ease: easeOut }}
            className="mt-6 flex flex-wrap items-center gap-4 text-xs text-gray-400"
          >
            {["Self-paced", "Mentor included", "Verified certificates"].map(
              (t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span
                    className="h-[5px] w-[5px] rounded-full bg-[#00A8A8]"
                    aria-hidden="true"
                  />
                  {t}
                </span>
              )
            )}
          </motion.div>
        </div>

        {/* ── RIGHT — Animated journey node map ── */}
        <div className="relative mx-auto w-full max-w-[400px] aspect-square">
          <svg
            viewBox="0 0 400 400"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {/* Connecting lines — animate stroke draw via pathLength */}
            {LINES.map((line, i) => (
              <motion.path
                key={i}
                d={line.d}
                stroke="#00A8A8"
                strokeWidth={1.5}
                strokeOpacity={0.4}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: line.delay, ease: easeOut }}
              />
            ))}

            {/* Traveling dot — starts after all nodes finish drawing */}
            <circle r="4" fill="#00A8A8" opacity="0.5">
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                begin="3.3s"
                path={FULL_PATH}
                rotate="auto"
              />
            </circle>
          </svg>

          {/* Nodes — overlaid as absolute divs so we can use lucide-react
              icons + Tailwind directly. The outer div handles centering on
              the SVG point (translate -50%/-50%); the inner motion.div
              owns the entrance scale so the two transforms don't fight. */}
          {NODES.map((node, i) => {
            const Icon = node.Icon;
            const xPct = (node.x / 400) * 100;
            const yPct = (node.y / 400) * 100;
            return (
              <div
                key={node.label}
                className="absolute"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.4,
                    delay: NODE_DELAYS[i],
                    ease: easeOut,
                  }}
                  className="flex flex-col items-center gap-1.5"
                >
                  {node.special ? (
                    <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[#00A8A8] shadow-[0_0_24px_rgba(0,168,168,0.35)]">
                      <Icon size={24} className="text-white" />
                    </div>
                  ) : (
                    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[#00A8A8] bg-[#00A8A8]/[0.06]">
                      <Icon size={20} className="text-[#00A8A8]" />
                    </div>
                  )}
                  <span
                    className={
                      node.special
                        ? "text-[10px] font-semibold text-[#00A8A8]"
                        : "text-[10px] font-medium text-[#00878A]"
                    }
                  >
                    {node.label}
                  </span>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
