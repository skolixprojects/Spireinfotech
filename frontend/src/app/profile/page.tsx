"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon, Mail, Phone, MapPin, Calendar, Lock,
  Edit2, Save, X, Loader2, AlertCircle, BookOpen, GraduationCap, Award,
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

export default function ProfilePage() {
  const { isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  // Edit-form state — copied from profile when entering edit mode.
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
      // Send the actual form values (including empty strings) so the
      // backend can distinguish "user cleared this field" from "user
      // didn't touch this field". Stripping with `|| undefined` was
      // previously dropping cleared values and, more importantly,
      // could omit fresh entries depending on JSON.stringify behavior.
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
      <section className="mx-auto max-w-3xl px-6 pt-32 pb-20 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-[#0F766E]" />
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="mx-auto max-w-3xl px-6 pt-32 pb-20">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={16} /> {error || "Profile not found"}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pt-28 pb-20">
      <AnimatePresence mode="wait">
        {!editing ? (
          <motion.div
            key="view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8"
          >
            {/* Header — avatar + identity + edit button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.fullName}
                  className="w-20 h-20 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-2xl font-medium shrink-0">
                  {initialsOf(profile.fullName)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                  {profile.fullName}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5 break-all">{profile.email}</p>
                <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#0F766E]/10 text-[#115E59]">
                  {profile.role}
                </span>
              </div>
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#0F766E] text-sm font-medium text-[#0F766E] hover:bg-[#0F766E]/5 transition-colors"
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
                  <span className="text-gray-500 w-20">Phone</span>
                  <span>{profile.phone || <span className="text-gray-400">Not provided</span>}</span>
                </li>
                <li className="flex items-center gap-2.5 text-gray-700">
                  <MapPin size={14} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 w-20">Location</span>
                  <span>{profile.location || <span className="text-gray-400">Not provided</span>}</span>
                </li>
                <li className="flex items-center gap-2.5 text-gray-700">
                  <Calendar size={14} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 w-20">Member since</span>
                  <span>{formatJoined(profile.createdAt)}</span>
                </li>
              </ul>
            </div>

            <hr className="my-6 border-gray-100" />

            {/* Stats */}
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Learning Stats</h2>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  icon={BookOpen}
                  value={profile.enrolledCoursesCount}
                  label="Enrolled"
                />
                <StatCard
                  icon={GraduationCap}
                  value={profile.completedCoursesCount}
                  label="Completed"
                />
                <StatCard
                  icon={Award}
                  value={profile.certificatesCount}
                  label={profile.certificatesCount === 1 ? "Certificate" : "Certificates"}
                />
              </div>
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
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8"
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
              {/* Full Name */}
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

              {/* Email — locked */}
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

              {/* Phone */}
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

              {/* Location */}
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

              {/* Bio */}
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

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpen;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
      <div className="w-9 h-9 rounded-lg bg-[#0F766E]/10 mx-auto flex items-center justify-center mb-2">
        <Icon size={16} className="text-[#0F766E]" />
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
