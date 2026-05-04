"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Briefcase, ArrowRight } from "lucide-react";

export interface ServiceCardData {
  id: number;
  title: string;
  shortDescription: string | null;
  description?: string | null;
  price: number;
  isFree: boolean;
  category: string | null;
  thumbnailUrl: string | null;
  trainer?: { fullName: string } | null;
}

interface ServiceCardProps {
  service: ServiceCardData;
  index?: number;
}

export function ServiceCard({ service, index = 0 }: ServiceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all overflow-hidden flex flex-col"
    >
      <div className="relative h-32 bg-gradient-to-br from-violet-100 to-purple-50 flex items-center justify-center">
        {service.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.thumbnailUrl} alt={service.title} className="w-full h-full object-cover" />
        ) : (
          <Briefcase size={28} className="text-violet-300" />
        )}
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-600 text-white">
          Service
        </span>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 line-clamp-1">{service.title}</h3>
        {service.shortDescription && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2 flex-1">{service.shortDescription}</p>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {service.category && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
              {service.category}
            </span>
          )}
          {service.trainer?.fullName && (
            <span className="text-[10px] text-gray-500">by {service.trainer.fullName}</span>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-900">
            {service.isFree || service.price <= 0 ? "Free" : `₹${service.price.toLocaleString("en-IN")}`}
          </p>
          <Link
            href={`/services/${service.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900 transition"
          >
            View Details <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
