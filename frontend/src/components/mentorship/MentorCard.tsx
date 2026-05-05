"use client";

import { motion } from "framer-motion";
import { GraduationCap, MessageCircle, Mail, Clock } from "lucide-react";
import type { MentorInfo } from "@/lib/types";


interface MentorCardProps {
  mentorInfo: MentorInfo;
  onRequestSession: () => void;
}

export function MentorCard({ mentorInfo, onRequestSession }: MentorCardProps) {
  const isPending = mentorInfo.status === "PENDING_ASSIGNMENT" || !mentorInfo.mentorName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
          <GraduationCap size={20} className="text-teal-600" />
        </div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          {isPending ? "Mentor Assignment" : "Your Mentor"}
        </p>
      </div>

      {isPending ? (
        <>
          <div className="flex items-center gap-2 text-amber-600 mb-3">
            <Clock size={16} />
            <p className="text-sm font-semibold">Assignment in progress</p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            You can start learning — your mentor will be introduced shortly.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-bold text-[#00A3A8] mb-1">{mentorInfo.mentorName}</h3>
          <a
            href={`mailto:${mentorInfo.mentorEmail}`}
            className="text-xs text-gray-500 hover:text-teal-600 inline-flex items-center gap-1 mb-4 break-all"
          >
            <Mail size={12} className="flex-shrink-0" />
            {mentorInfo.mentorEmail}
          </a>
          <button
            onClick={onRequestSession}
            className="w-full py-2.5 rounded-xl bg-[#00A3A8] text-white text-sm font-semibold hover:bg-[#00B4B8] transition flex items-center justify-center gap-2"
          >
            <MessageCircle size={16} />
            Request a Session
          </button>
        </>
      )}
    </motion.div>
  );
}
