"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Code, Database, Palette, Cloud, Smartphone, BarChart3 } from "lucide-react";

const categories = [
  { name: "Web Development", icon: Code, count: 24, color: "from-teal-500 to-teal-600", href: "/courses?category=web" },
  { name: "Data Science", icon: Database, count: 18, color: "from-blue-500 to-indigo-600", href: "/courses?category=data" },
  { name: "UI/UX Design", icon: Palette, count: 12, color: "from-pink-500 to-rose-600", href: "/courses?category=design" },
  { name: "Cloud & DevOps", icon: Cloud, count: 15, color: "from-amber-500 to-orange-600", href: "/courses?category=cloud" },
  { name: "Mobile Development", icon: Smartphone, count: 10, color: "from-purple-500 to-violet-600", href: "/courses?category=mobile" },
  { name: "Analytics", icon: BarChart3, count: 8, color: "from-cyan-500 to-sky-600", href: "/courses?category=analytics" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function CategoriesPage() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-4xl font-bold text-gray-900 mb-4"
        >
          Course Categories
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-gray-600 mb-12 max-w-2xl"
        >
          Explore our curated categories and find the perfect learning path for your career goals.
        </motion.p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, i) => (
            <motion.div key={cat.name} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <Link href={cat.href} className="group block">
                <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${cat.color} text-white mb-5`}>
                    <cat.icon size={28} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-teal-700 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-sm text-gray-500">{cat.count} courses available</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
