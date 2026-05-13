"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Code2, BarChart3, Palette, Cloud, Smartphone, Briefcase,
} from "lucide-react";
import { getCourses, getServices } from "@/lib/api";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

interface CourseRow {
  category: string | null;
  type?: string;
}

const TILES = [
  {
    icon: Code2,
    label: "Web Development",
    matchers: ["Web Development", "Frontend"],
    redirect: "/courses?category=Web%20Development",
  },
  {
    icon: BarChart3,
    label: "Data Science",
    matchers: ["Data Science"],
    redirect: "/courses?category=Data%20Science",
  },
  {
    icon: Palette,
    label: "UI/UX Design",
    matchers: ["Design"],
    redirect: "/courses?category=Design",
  },
  {
    icon: Cloud,
    label: "Cloud & DevOps",
    matchers: ["Cloud"],
    redirect: "/courses?category=Cloud",
  },
  {
    icon: Smartphone,
    label: "Mobile Development",
    matchers: ["Mobile"],
    redirect: "/courses?category=Mobile",
  },
  {
    icon: Briefcase,
    label: "Career Services",
    matchers: [],
    redirect: "/services",
    isServices: true,
  },
];

export default function WhatYouCanLearn() {
  const [courseCounts, setCourseCounts] = useState<Record<string, number>>({});
  const [serviceCount, setServiceCount] = useState<number | null>(null);

  useEffect(() => {
    getCourses()
      .then((data) => {
        const counts: Record<string, number> = {};
        for (const row of (data ?? []) as CourseRow[]) {
          const c = row.category ?? "Uncategorized";
          counts[c] = (counts[c] ?? 0) + 1;
        }
        setCourseCounts(counts);
      })
      .catch(() => setCourseCounts({}));

    getServices()
      .then((data) => setServiceCount(((data ?? []) as unknown[]).length))
      .catch(() => setServiceCount(0));
  }, []);

  const countFor = (tile: (typeof TILES)[number]): number | null => {
    if (tile.isServices) return serviceCount;
    return tile.matchers.reduce((sum, m) => sum + (courseCounts[m] ?? 0), 0);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="py-20 bg-[#F0EDE8]"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900">
            What you can learn on Spire Info Tech
          </h2>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            Pick a path. Sign up to browse courses inside each one.
          </p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={containerVariants}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {TILES.map((tile) => {
            const Icon = tile.icon;
            const count = countFor(tile);
            const href = `/signup?redirect=${encodeURIComponent(tile.redirect)}`;
            return (
              <motion.div key={tile.label} variants={itemVariants}>
                <Link
                  href={href}
                  className="group block rounded-2xl border border-[#E3DED7] bg-white p-6 transition-all duration-200 hover:bg-[#e0f7f7] hover:border-[#0F766E]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#0F766E]/10 flex items-center justify-center mb-4 group-hover:bg-[#0F766E]/15 transition-colors">
                    <Icon className="h-5 w-5 text-[#0F766E]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-base">
                    {tile.label}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {count === null
                      ? "Loading…"
                      : count === 0
                        ? "Coming soon"
                        : tile.isServices
                          ? `${count} service${count === 1 ? "" : "s"} available`
                          : `${count} course${count === 1 ? "" : "s"} available`}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
          className="mt-10 text-center text-sm text-gray-500"
        >
          Click any path above to sign up and start learning.
        </motion.p>
      </div>
    </motion.section>
  );
}
