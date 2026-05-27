"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Lock } from "lucide-react";

import { getProfileCompletion, ProfileCompletion } from "@/lib/api";

/**
 * Reused "locked" empty state for dashboard tabs that need a complete
 * profile (or a future lifecycle milestone) before they show real
 * data. Shows a friendly lock card with the live completion %,
 * remaining steps + CTAs — no backend error codes ever leak to the
 * UI through this surface.
 *
 * Two CTAs by default:
 *   - "Continue Setup" → switches to the Complete Profile tab via
 *     {@code onContinueSetup} when supplied, falling back to the
 *     {@code /dashboard?tab=complete-profile} deep link.
 *   - "Browse Catalog" → /courses (unauthenticated browse is fine).
 *
 * Pass {@code hideBrowseCatalog} for tabs that don't have a catalog
 * to surface (e.g. Weekly Report).
 */
interface Props {
  title: string;
  subtitle: string;
  headline: string;
  body: ReactNode;
  /** Tab-switch callback. Provided by ParticipantDashboard so the
   *  click stays inside the SPA instead of a full navigation. */
  onContinueSetup?: () => void;
  /** Drop the secondary "Browse Catalog" button for tabs where it
   *  doesn't make sense (Weekly, Employment, Payments). */
  hideBrowseCatalog?: boolean;
}

export default function LockedTabView({
  title,
  subtitle,
  headline,
  body,
  onContinueSetup,
  hideBrowseCatalog,
}: Props) {
  const [data, setData] = useState<ProfileCompletion | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfileCompletion()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { /* leave null — card stays usable without the % */ });
    return () => { cancelled = true; };
  }, []);

  const remaining = data?.steps.filter((s) => !s.completed) ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-serif text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </header>

      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-[#f0fdf9] via-white to-amber-50/40 p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm text-gray-400 mb-4">
          <Lock size={22} />
        </div>
        <h3 className="font-serif text-xl font-bold text-gray-900">{headline}</h3>
        <div className="text-sm text-gray-600 mt-1.5 max-w-md mx-auto">{body}</div>

        {data ? (
          <div className="mt-5 max-w-md mx-auto">
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
              <span>Profile completion</span>
              <span className="font-bold text-[#0F766E]">
                {data.completionPercentage}% · {data.completedSteps} of {data.totalSteps}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-[#0F766E] transition-all"
                style={{ width: `${data.completionPercentage}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-5 inline-flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" /> Loading progress…
          </div>
        )}

        {remaining.length > 0 && (
          <div className="mt-5 max-w-sm mx-auto text-left bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
              Remaining
            </p>
            <ul className="space-y-1.5">
              {remaining.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center justify-between text-xs text-gray-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {s.title}
                  </span>
                  <span className="text-[11px] text-gray-400">{s.estimatedTime}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {onContinueSetup ? (
            <button
              type="button"
              onClick={onContinueSetup}
              className="inline-flex items-center gap-1 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition cursor-pointer"
            >
              Continue Setup <ChevronRight size={14} />
            </button>
          ) : (
            <Link
              href="/dashboard?tab=complete-profile"
              className="inline-flex items-center gap-1 bg-[#0F766E] hover:bg-[#0D9488] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition cursor-pointer"
            >
              Continue Setup <ChevronRight size={14} />
            </Link>
          )}
          {!hideBrowseCatalog && (
            <Link
              href="/courses"
              className="inline-flex items-center gap-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-lg transition cursor-pointer"
            >
              Browse Catalog
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
