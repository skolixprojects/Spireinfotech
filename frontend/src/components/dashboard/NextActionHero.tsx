"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  CalendarClock, ClipboardList, Play, GraduationCap, Compass, Trophy,
  ExternalLink, ArrowRight, Award,
  type LucideIcon,
} from "lucide-react";
import type { NextAction } from "@/lib/api";

interface NextActionHeroProps {
  action: NextAction | null;
  loading: boolean;
}

function formatScheduledShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const dayLabel =
    d.toDateString() === now.toDateString()
      ? "Today"
      : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffH <= 0) return `${dayLabel} at ${time}`;
  if (diffH < 24) return `In ${diffH} hour${diffH === 1 ? "" : "s"} — ${dayLabel} at ${time}`;
  return `${dayLabel} at ${time}`;
}

function formatDueShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
}

export function NextActionHero({ action, loading }: NextActionHeroProps) {
  if (loading || !action) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[#0F766E] to-[#0D9488] p-8 sm:p-10 animate-pulse">
        <div className="h-6 w-48 bg-white/20 rounded mb-4" />
        <div className="h-10 w-3/4 bg-white/30 rounded mb-3" />
        <div className="h-5 w-1/2 bg-white/20 rounded mb-8" />
        <div className="h-12 w-44 bg-white/40 rounded-full" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl bg-gradient-to-br from-[#0F766E] to-[#0D9488] text-white p-8 sm:p-10 shadow-lg shadow-[#0F766E]/15"
    >
      {renderBody(action)}
    </motion.div>
  );
}

function HeroChrome({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  meta,
  primary,
  secondary,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  primary: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string };
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80 bg-white/10 rounded-full px-3 py-1 mb-5">
        <Icon size={14} /> {eyebrow}
      </div>
      <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-base sm:text-lg text-white/85">{subtitle}</p>
      )}
      {meta && <div className="mt-3 text-sm text-white/80">{meta}</div>}

      <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
        {primary.external ? (
          <a
            href={primary.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0F766E] px-7 py-3.5 text-base font-bold shadow-md hover:bg-[#F0EDE8] transition-colors w-fit"
          >
            <ExternalLink size={16} /> {primary.label}
          </a>
        ) : (
          <Link
            href={primary.href}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0F766E] px-7 py-3.5 text-base font-bold shadow-md hover:bg-[#F0EDE8] transition-colors w-fit"
          >
            {primary.label} <ArrowRight size={16} />
          </Link>
        )}
        {secondary && (
          <Link
            href={secondary.href}
            className="text-sm font-medium text-white/85 hover:text-white underline-offset-4 hover:underline"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function renderBody(action: NextAction): React.ReactNode {
  switch (action.type) {
    case "SESSION_SOON": {
      const when = formatScheduledShort(action.scheduledAt);
      const subtitle = `${action.courseTitle ?? "Your course"}${action.mentorName ? ` — with ${action.mentorName}` : ""}`;
      const primary = action.meetingUrl
        ? { label: "Join Meeting", href: action.meetingUrl, external: true as const }
        : { label: "View Details", href: "/dashboard" };
      return (
        <HeroChrome
          icon={CalendarClock}
          eyebrow="Upcoming session"
          title={when || "You have a session coming up"}
          subtitle={subtitle}
          primary={primary}
        />
      );
    }
    case "ASSIGNMENT_DUE": {
      const due = formatDueShort(action.dueDate);
      // Assignments live on the course detail page; player isn't useful here.
      return (
        <HeroChrome
          icon={ClipboardList}
          eyebrow={due || "Assignment due soon"}
          title={action.assignmentTitle ?? "Your assignment"}
          subtitle={action.courseTitle ?? undefined}
          primary={{
            label: "Submit Assignment",
            href: action.courseId ? `/courses/${action.courseId}` : "/dashboard",
          }}
        />
      );
    }
    case "CONTINUE_COURSE": {
      const pct = action.progressPercent ?? 0;
      return (
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80 bg-white/10 rounded-full px-3 py-1 mb-5">
            <Play size={14} /> Continue where you left off
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            {action.nextLessonTitle ?? "Resume your course"}
          </h2>
          <p className="mt-2 text-base sm:text-lg text-white/85">
            {action.moduleTitle ? `${action.moduleTitle} — ` : ""}
            {action.courseTitle ?? ""}
          </p>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-white/80 mb-2">
              <span>Progress</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="h-2 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link
              href={
                action.courseId && action.nextLessonId
                  ? `/learn/${action.courseId}/${action.nextLessonId}`
                  : action.courseId
                    ? `/courses/${action.courseId}`
                    : "/dashboard"
              }
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0F766E] px-7 py-3.5 text-base font-bold shadow-md hover:bg-[#F0EDE8] transition-colors w-fit"
            >
              Resume Lesson <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      );
    }
    case "START_COURSE": {
      const subtitle = action.firstLessonTitle
        ? `Start with ${action.firstLessonTitle}`
        : action.courseTitle ?? null;
      const meta = action.mentorName ? (
        <span>Your mentor: <span className="font-semibold text-white">{action.mentorName}</span></span>
      ) : null;
      const href =
        action.courseId && action.firstLessonId
          ? `/learn/${action.courseId}/${action.firstLessonId}`
          : action.courseId
            ? `/courses/${action.courseId}`
            : "/dashboard";
      return (
        <HeroChrome
          icon={GraduationCap}
          eyebrow="Ready to begin?"
          title={action.courseTitle ?? "Start your course"}
          subtitle={subtitle}
          meta={meta}
          primary={{ label: "Start Course", href }}
        />
      );
    }
    case "BROWSE_COURSES": {
      return (
        <HeroChrome
          icon={Compass}
          eyebrow="Welcome to Spire Info Tech"
          title="Pick a course and we'll match you with a mentor."
          subtitle="Self-paced video courses in tech, design, and data science. Every course includes a personal mentor."
          primary={{ label: "Browse Courses", href: "/courses" }}
          secondary={{ label: "Or explore Services →", href: "/services" }}
        />
      );
    }
    case "ALL_COMPLETE": {
      const completed = action.completedCount ?? 0;
      const certs = action.certificateCount ?? 0;
      const subtitle =
        completed === 0
          ? "You're all caught up."
          : `You've completed ${completed} course${completed === 1 ? "" : "s"} and earned ${certs} certificate${certs === 1 ? "" : "s"}. Amazing work!`;
      return (
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80 bg-white/10 rounded-full px-3 py-1 mb-5">
            <Trophy size={14} /> All courses completed
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            You're done — for now.
          </h2>
          <p className="mt-2 text-base sm:text-lg text-white/85">{subtitle}</p>
          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0F766E] px-7 py-3.5 text-base font-bold shadow-md hover:bg-[#F0EDE8] transition-colors w-fit"
            >
              Browse More Courses <ArrowRight size={16} />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white underline-offset-4 hover:underline"
            >
              <Award size={14} /> View Certificates
            </Link>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
