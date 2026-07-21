"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Briefcase, Loader2, PlusCircle } from "lucide-react";
import { getServices } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ServiceCard, type ServiceCardData } from "@/components/services/ServiceCard";

export default function ServicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<ServiceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Phase 1C strict gate — same as /courses. Logged-in participants
  // with an incomplete profile bounce to the Complete Profile tab;
  // staff + anonymous visitors fall through.
  const role = user?.role?.toUpperCase() ?? "";
  const isStaff = role === "ADMIN" || role === "INSTRUCTOR"
    || role === "TRAINER" || role === "SYSTEM_ADMIN"
    || role === "OPERATIONS_ADMIN" || role === "ERM"
    || role === "FINANCE";
  useEffect(() => {
    if (user && !isStaff && user.profileComplete === false) {
      router.replace("/dashboard?tab=complete-profile");
    }
  }, [user, isStaff, router]);

  useEffect(() => {
    setLoading(true);
    getServices()
      .then((data) => setServices((data ?? []) as ServiceCardData[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load services"))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = role === "ADMIN" || role === "TRAINER";

  return (
    <section className="mx-auto max-w-7xl px-6 pt-32 pb-20 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="font-serif text-4xl font-bold text-[#0F766E]">Services</h1>
            <p className="text-gray-500 mt-2">
              Professional development services to boost your career.
            </p>
          </div>
          {canCreate && (
            <Link
              href="/services/create"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm w-fit"
            >
              <PlusCircle size={16} /> Create Service
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-violet-500" size={32} />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        ) : services.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <Briefcase size={40} className="mx-auto text-violet-200 mb-3" />
            <p className="text-sm text-gray-500">Services coming soon. Check back later.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <ServiceCard key={s.id} service={s} index={i} />
            ))}
          </div>
        )}
      </motion.div>
    </section>
  );
}
