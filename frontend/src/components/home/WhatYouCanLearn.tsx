"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  Code2, BarChart3, Palette, Cloud, Smartphone, Briefcase,
} from "lucide-react";
import { getCourses, getServices } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

interface CourseRow {
  category: string | null;
  type?: string;
}

// Each tile maps to one or more backend `category` values. The label is
// the user-facing name; the matchers list the seed-data categories that
// belong under it. "Career Services" pulls from getServices() instead.
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
    matchers: [], // populated from /api/courses?type=SERVICE
    redirect: "/services",
    isServices: true,
  },
];

export default function WhatYouCanLearn() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
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
    <section ref={ref} className="py-20 bg-[#F0EDE8]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="text-center mb-12"
        >
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900">
            What you can learn on Spire
          </h2>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            Pick a path. Sign up to browse courses inside each one.
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((tile, i) => {
            const Icon = tile.icon;
            const count = countFor(tile);
            // Click → signup, with redirect param so the user lands on the
            // right page after creating an account.
            const href = `/signup?redirect=${encodeURIComponent(tile.redirect)}`;
            return (
              <motion.div
                key={tile.label}
                custom={i + 1}
                variants={fadeUp}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
              >
                <Link
                  href={href}
                  className="group block rounded-2xl border border-[#E3DED7] bg-white p-6 hover:shadow-md hover:border-[#5FE0E3] transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#00A3A8]/10 flex items-center justify-center mb-4 group-hover:bg-[#00A3A8]/15 transition-colors">
                    <Icon className="h-5 w-5 text-[#00A3A8]" />
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
        </div>

        <motion.p
          custom={TILES.length + 1}
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="mt-10 text-center text-sm text-gray-500"
        >
          Click any path above to sign up and start learning.
        </motion.p>
      </div>
    </section>
  );
}
