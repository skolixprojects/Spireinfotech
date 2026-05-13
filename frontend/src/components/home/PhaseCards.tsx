"use client";

import { motion } from "framer-motion";
import { GraduationCap, Briefcase } from "lucide-react";

/**
 * Two-card section under the hero: Phase 1 (pre-employment) and
 * Phase 2 (post-offer). Mirrors PRD Sections 6.1 + 6.2 verbatim.
 */
export default function PhaseCards() {
  return (
    <section
      id="phases"
      className="px-6 md:px-12 lg:px-20 py-20 md:py-24 bg-white"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900">
            Two phases. One outcome.
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            Spire&apos;s program walks you from preparation through to a signed
            offer, then keeps supporting you through your first months on the job.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PhaseCard
            tag="Phase 1"
            title="Pre-employment readiness"
            description="Career coaching, resume administration, interview
            preparation, technical development modules, job-market orientation,
            and weekly progress tracking."
            Icon={GraduationCap}
          />
          <PhaseCard
            tag="Phase 2"
            title="Post-offer support"
            description="Post-offer technical enhancement, documentation support,
            transition support, role-aligned coaching, and onboarding resources."
            Icon={Briefcase}
          />
        </div>
      </div>
    </section>
  );
}

function PhaseCard({
  tag,
  title,
  description,
  Icon,
}: {
  tag: string;
  title: string;
  description: string;
  Icon: typeof GraduationCap;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8 hover:shadow-md transition-shadow"
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#f0fdf9] text-[#0F766E] mb-4">
        <Icon size={22} />
      </div>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#0F766E]">
        {tag}
      </p>
      <h3 className="font-serif text-xl font-bold text-gray-900 mt-1">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{description}</p>
    </motion.div>
  );
}
