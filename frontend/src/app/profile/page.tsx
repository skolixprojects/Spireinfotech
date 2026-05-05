"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon, Mail, Phone, MapPin, Calendar, Lock,
  Edit2, Save, X, Loader2, AlertCircle, BookOpen, GraduationCap, Award,
  Flame, CheckCircle2, Clock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile, updateProfile, type ProfileData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const BIO_LIMIT = 500;

function initialsOf(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatJoined(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatRelativeDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLearningTime(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ProfilePage() {
  const { isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    location: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    getProfile()
      .then((p) => setProfile(p))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [authLoading]);

  const handleEdit = () => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      bio: profile.bio ?? "",
    });
    setSaveError("");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.fullName.trim().length < 2) {
      setSaveError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone,
        location: form.location,
        bio: form.bio,
      });
      setProfile(updated);
      setEditing(false);
      toast("success", "Profile updated");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <section className="mx-auto max-w-6xl px-6 pt-32 pb-20 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-[#0F766E]" />
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={16} /> {error || "Profile not found"}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-6 pt-28 pb-20">
      <AnimatePresence mode="wait">
        {!editing ? (
          <motion.div
            key="view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6"
          >
            {/* ─── LEFT: Profile card ─── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col items-center text-center">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName}
                    className="w-24 h-24 rounded-full object-cover mb-4"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-3xl font-medium mb-4">
                    {initialsOf(profile.fullName)}
                  </div>
                )}
                <h1 className="font-serif text-2xl font-bold text-gray-900 break-words">
                  {profile.fullName}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5 break-all">{profile.email}</p>
                <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#0F766E]/10 text-[#115E59]">
                  {profile.role}
                </span>
                <button
                  onClick={handleEdit}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#0F766E] text-sm font-medium text-[#0F766E] hover:bg-[#0F766E]/5 transition-colors"
                >
                  <Edit2 size={14} /> Edit Profile
                </button>
              </div>

              <hr className="my-6 border-gray-100" />

              {/* About */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">About</h2>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {profile.bio?.trim() ? profile.bio : (
                    <span className="text-gray-400 italic">No bio added yet.</span>
                  )}
                </p>
              </div>

              <hr className="my-6 border-gray-100" />

              {/* Details */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Details</h2>
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-center gap-2.5 text-gray-700">
                    <Phone size={14} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500 w-24">Phone</span>
                    <span className="truncate">{profile.phone || <span className="text-gray-400">Not provided</span>}</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-gray-700">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500 w-24">Location</span>
                    <span className="truncate">{profile.location || <span className="text-gray-400">Not provided</span>}</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-gray-700">
                    <Calendar size={14} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500 w-24">Member since</span>
                    <span>{formatJoined(profile.createdAt)}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ─── RIGHT: Activity panel ─── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
              {/* Learning Stats */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Learning Stats</h2>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    icon={BookOpen}
                    value={profile.enrolledCoursesCount}
                    label="Enrolled"
                    href="/dashboard"
                  />
                  <StatCard
                    icon={GraduationCap}
                    value={profile.completedCoursesCount}
                    label="Completed"
                    href="/dashboard"
                  />
                  <StatCard
                    icon={Award}
                    value={profile.certificatesCount}
                    label={profile.certificatesCount === 1 ? "Certificate" : "Certificates"}
                  />
                </div>
              </div>

              <hr className="my-6 border-gray-100" />

              {/* Activity analytics */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <AnalyticsCard
                    icon={Flame}
                    iconClass="text-amber-500 bg-amber-50"
                    value={String(profile.streakDays ?? 0)}
                    label="Day streak"
                  />
                  <AnalyticsCard
                    icon={CheckCircle2}
                    iconClass="text-[#0F766E] bg-[#0F766E]/10"
                    value={String(profile.totalLessonsCompleted ?? 0)}
                    label="Lessons done"
                  />
                  <AnalyticsCard
                    icon={Clock}
                    iconClass="text-[#0D9488] bg-[#0D9488]/10"
                    value={formatLearningTime(profile.totalLearningMinutes ?? 0)}
                    label="Time studied"
                  />
                  <AnalyticsCard
                    icon={Calendar}
                    iconClass="text-violet-600 bg-violet-50"
                    value={formatRelativeDay(profile.lastActiveAt)}
                    label="Last active"
                  />
                </div>
              </div>

              <hr className="my-6 border-gray-100" />

              {/* Contribution heatmap */}
              <ContributionGraph contributions={profile.contributions ?? {}} />
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="edit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            onSubmit={handleSave}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 max-w-3xl mx-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h1 className="font-serif text-2xl font-bold text-gray-900">Edit Profile</h1>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <X size={14} /> Cancel
              </button>
            </div>

            {saveError && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
                <AlertCircle size={14} /> {saveError}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    disabled={saving}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 focus:border-transparent disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email <span className="text-xs text-gray-400 font-normal">(cannot be changed)</span>
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    title="Email cannot be changed"
                    className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-300 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    maxLength={20}
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    disabled={saving}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 focus:border-transparent disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    maxLength={255}
                    placeholder="City, Country"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    disabled={saving}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 focus:border-transparent disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
                <textarea
                  rows={4}
                  maxLength={BIO_LIMIT}
                  placeholder="A short bio about yourself…"
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, BIO_LIMIT) }))}
                  disabled={saving}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 focus:border-transparent disabled:opacity-60 resize-none"
                />
                <p className="mt-1 text-xs text-gray-400 text-right tabular-nums">
                  {form.bio.length}/{BIO_LIMIT} characters
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-7 pt-5 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || form.fullName.trim().length < 2}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#0F766E] text-white text-sm font-semibold hover:bg-[#134E4A] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Stat / analytics tiles ────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  href,
}: {
  icon: typeof BookOpen;
  value: number;
  label: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="w-9 h-9 rounded-lg bg-[#0F766E]/10 mx-auto flex items-center justify-center mb-2">
        <Icon size={16} className="text-[#0F766E]" />
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-gray-100 bg-white p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0F766E]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
      {inner}
    </div>
  );
}

function AnalyticsCard({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: typeof BookOpen;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconClass}`}>
          <Icon size={14} />
        </div>
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums truncate">{value}</p>
    </div>
  );
}

// ─── Contribution heatmap ──────────────────────────────────────────

interface HeatCell {
  date: string;
  count: number;
  dayOfWeek: number; // 0=Sun..6=Sat
  month: number;     // 0..11
  inWindow: boolean; // within the last 365 days
}

function buildCells(contributions: Record<string, number>): HeatCell[] {
  const cells: HeatCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // Snap start back to Sunday so each column is a full week
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const cur = new Date(start);
  const yearAgo = new Date(today);
  yearAgo.setDate(yearAgo.getDate() - 364);

  while (cur <= today) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    cells.push({
      date: dateStr,
      count: contributions[dateStr] ?? 0,
      dayOfWeek: cur.getDay(),
      month: cur.getMonth(),
      inWindow: cur >= yearAgo,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

function colorClassFor(count: number, inWindow: boolean): string {
  if (!inWindow) return "bg-transparent";
  if (count === 0) return "bg-gray-100";
  if (count <= 2) return "bg-[#14B8A6]/40";
  if (count <= 4) return "bg-[#14B8A6]/70";
  if (count <= 6) return "bg-[#0D9488]";
  return "bg-[#0F766E]";
}

function ContributionGraph({ contributions }: { contributions: Record<string, number> }) {
  const cells = useMemo(() => buildCells(contributions), [contributions]);

  // Group into week-columns of 7 cells each (column-major).
  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  // Total contributions in the visible window.
  const totalContributions = cells
    .filter((c) => c.inWindow)
    .reduce((sum, c) => sum + c.count, 0);

  // Month labels: show on first week of each month.
  const monthAbbr = (m: number) =>
    new Date(2000, m, 1).toLocaleDateString(undefined, { month: "short" });
  const labels: Array<string | null> = weeks.map((w, i) => {
    const firstMonth = w[0]?.month;
    const prevMonth = i > 0 ? weeks[i - 1][0]?.month : -1;
    return firstMonth !== undefined && firstMonth !== prevMonth ? monthAbbr(firstMonth) : null;
  });

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {totalContributions} contribution{totalContributions === 1 ? "" : "s"} in the last year
        </h2>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div className="inline-block">
          {/* Month labels row (offset by day-of-week label column) */}
          <div className="flex pl-7 mb-1">
            {labels.map((label, i) => (
              <div
                key={i}
                className="text-[10px] text-gray-400"
                style={{ width: 12, minWidth: 12 }}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex">
            {/* Day-of-week labels (Mon, Wed, Fri visible) */}
            <div className="flex flex-col gap-[2px] mr-1.5 pt-[1px]">
              {dayLabels.map((d, i) => (
                <div
                  key={i}
                  className="h-[10px] text-[9px] leading-[10px] text-gray-400"
                  style={{ width: 20 }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex gap-[2px]">
              {weeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-[2px]">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const cell = week[dayIdx];
                    if (!cell) {
                      return (
                        <div
                          key={dayIdx}
                          className="w-[10px] h-[10px] rounded-sm bg-transparent"
                        />
                      );
                    }
                    return (
                      <div
                        key={cell.date}
                        title={`${cell.count} ${cell.count === 1 ? "lesson" : "lessons"} · ${cell.date}`}
                        className={`w-[10px] h-[10px] rounded-sm ${colorClassFor(cell.count, cell.inWindow)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-gray-400">
            <span>Less</span>
            <div className="w-[10px] h-[10px] rounded-sm bg-gray-100" />
            <div className="w-[10px] h-[10px] rounded-sm bg-[#14B8A6]/40" />
            <div className="w-[10px] h-[10px] rounded-sm bg-[#14B8A6]/70" />
            <div className="w-[10px] h-[10px] rounded-sm bg-[#0D9488]" />
            <div className="w-[10px] h-[10px] rounded-sm bg-[#0F766E]" />
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
