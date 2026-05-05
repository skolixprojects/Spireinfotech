"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Play, Users, Award, Rocket, type LucideIcon } from "lucide-react";

const easeOut = "easeOut" as const;

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

const NODE_DELAYS = [0.5, 1.1, 1.7, 2.3, 2.9];
const FULL_PATH = "M 70 60 L 280 60 L 280 180 L 70 180 L 175 300";

export default function Hero() {
  const handleExplore = () => {
    document.getElementById("how-spire-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative py-16 md:py-20 px-6 md:px-12 lg:px-20"
      style={{
        background: "linear-gradient(180deg, #F0FDFA 0%, #ffffff 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        {/* ── LEFT — Text content (centered on mobile, left on desktop) ── */}
        <div className="text-center md:text-left">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
            className="mx-auto md:mx-0 inline-flex items-center gap-2 rounded-full border-[0.5px] border-[#0F766E]/20 bg-[#0F766E]/[0.08] px-4 py-1.5 w-fit"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#0D9488] [animation:pulse-dot_2s_ease-in-out_infinite]"
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-[#115E59]">
              Your path starts here
            </span>
          </motion.div>

          {/* Heading — two lines, line 2 in gradient teal */}
          <h1 className="mt-5 font-bold text-4xl md:text-5xl lg:text-6xl text-[#1a1a2e] leading-[1.1]">
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
              className="block bg-gradient-to-br from-[#14B8A6] to-[#0F766E] bg-clip-text text-transparent"
            >
              Get hired.
            </motion.span>
          </h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease: easeOut }}
            className="mt-4 mx-auto md:mx-0 max-w-lg text-base md:text-lg leading-relaxed text-gray-500"
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
            className="mt-6 flex flex-col sm:flex-row gap-3 justify-center md:justify-start"
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-[#0F766E] px-7 py-3 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] active:scale-[0.98]"
            >
              Start for free
            </Link>
            <button
              type="button"
              onClick={handleExplore}
              className="inline-flex items-center justify-center rounded-xl border-[0.5px] border-gray-300 bg-white px-7 py-3 text-sm font-medium text-[#1a1a2e] transition-all duration-200 hover:bg-gray-50 hover:border-[#0F766E]/30 active:scale-[0.98]"
            >
              Explore courses
            </button>
          </motion.div>

          {/* Trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.0, ease: easeOut }}
            className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400 justify-center md:justify-start"
          >
            {["Self-paced", "Mentor included", "Verified certificates"].map(
              (t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span
                    className="h-[5px] w-[5px] rounded-full bg-[#0D9488]"
                    aria-hidden="true"
                  />
                  {t}
                </span>
              )
            )}
          </motion.div>
        </div>

        {/* ── RIGHT — Animated journey node map (centered in column) ── */}
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-[280px] md:max-w-[400px] aspect-square">
            <svg
              viewBox="0 0 400 400"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {LINES.map((line, i) => (
                <motion.path
                  key={i}
                  d={line.d}
                  stroke="#0D9488"
                  strokeWidth={1.5}
                  strokeOpacity={0.4}
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6, delay: line.delay, ease: easeOut }}
                />
              ))}

              <circle r="4" fill="#0D9488" opacity="0.5">
                <animateMotion
                  dur="7s"
                  repeatCount="indefinite"
                  begin="3.3s"
                  path={FULL_PATH}
                  rotate="auto"
                />
              </circle>
            </svg>

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
                      <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[#0F766E] shadow-[0_0_24px_rgba(15,118,110,0.35)]">
                        <Icon size={24} className="text-white" />
                      </div>
                    ) : (
                      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[#0D9488] bg-[#0D9488]/[0.06]">
                        <Icon size={20} className="text-[#0D9488]" />
                      </div>
                    )}
                    <span
                      className={
                        node.special
                          ? "text-[10px] font-semibold text-[#0F766E]"
                          : "text-[10px] font-medium text-[#115E59]"
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
      </div>
    </section>
  );
}
