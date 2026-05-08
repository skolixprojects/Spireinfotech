"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Phone, MapPin, Calendar, Loader2, AlertCircle,
  BookOpen, GraduationCap, Award, Flame, CheckCircle2, Clock,
  ShieldCheck, ExternalLink, Briefcase, Activity, FileText,
  Trash2, X, Globe, Monitor, Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getUserProfileAsAdmin, updateUserRoleAsAdmin, softDeleteUserAsAdmin,
  downloadSignedAgreementPdf,
  type ProfileData,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { UserRecordsPanel } from "@/components/admin/UserRecordsPanel";
import { cn } from "@/lib/utils";
import { formatISTDate, formatISTWithZone } from "@/lib/datetime";

const ROLES = ["STUDENT", "INSTRUCTOR", "TRAINER", "ADMIN"] as const;

function initialsOf(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatJoined(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  });
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
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric" });
}

function formatLearningTime(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AdminUserDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const { user: me, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "records">("activity");
  // Soft-delete UI state — confirm modal + in-flight flag.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    // Defensive: middleware also gates /admin/* but double-check.
    if (me?.role?.toUpperCase() !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setLoading(true);
    getUserProfileAsAdmin(params.userId)
      .then((p) => setProfile(p))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load user")
      )
      .finally(() => setLoading(false));
  }, [authLoading, me, params.userId, router]);

  const handleRoleChange = async (newRole: string) => {
    if (!profile || newRole === profile.role) return;
    if (!confirm(`Change ${profile.fullName}'s role to ${newRole}?`)) return;
    setRoleSaving(true);
    try {
      await updateUserRoleAsAdmin(params.userId, newRole);
      const fresh = await getUserProfileAsAdmin(params.userId);
      setProfile(fresh);
      toast("success", `Role changed to ${newRole}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setRoleSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!profile || deleting) return;
    setDeleting(true);
    try {
      await softDeleteUserAsAdmin(profile.id);
      toast("success", "User deactivated and anonymized");
      // Drop the panel and bounce to the admin index — the row's
      // identity has changed, so staying here would render stale data.
      router.replace("/admin?tab=Users");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to deactivate user");
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
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
        <Link
          href="/admin?tab=Users"
          className="inline-flex items-center gap-1 text-sm text-[#0F766E] hover:underline mb-4"
        >
          <ArrowLeft size={14} /> Back to Users
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={16} /> {error || "User not found"}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-6 pt-28 pb-20">
      {/* Admin chrome */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin?tab=Users"
          className="inline-flex items-center gap-1 text-sm text-[#0F766E] hover:underline"
        >
          <ArrowLeft size={14} /> Back to Users
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          <ShieldCheck size={12} /> Admin View
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6"
      >
        {/* ─── LEFT: Profile card + admin actions ─── */}
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
              <li className="flex items-center gap-2.5 text-gray-700">
                <span className="text-gray-400 shrink-0 inline-block w-3.5 text-center">#</span>
                <span className="text-gray-500 w-24">User ID</span>
                <span className="font-mono text-xs">{profile.id}</span>
              </li>
            </ul>
          </div>

          <hr className="my-6 border-gray-100" />

          {/* Admin actions: change role */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-amber-500" /> Admin Actions
            </h2>
            <label className="block text-xs text-gray-500 mb-1.5">Change role</label>
            <select
              value={profile.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={roleSaving || (me?.id === profile.id)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {me?.id === profile.id && (
              <p className="mt-1.5 text-xs text-gray-400">
                You can&apos;t change your own role.
              </p>
            )}
            {roleSaving && (
              <p className="mt-1.5 text-xs text-gray-500 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Updating…
              </p>
            )}
          </div>
        </div>

        {/* ─── RIGHT: Activity / Records tabs ─── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6 border-b border-gray-100 -mt-2">
            {([
              { id: "activity", label: "Activity", Icon: Activity },
              { id: "records", label: "Records", Icon: FileText },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition cursor-pointer",
                  activeTab === t.id
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <t.Icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {activeTab === "records" ? (
            <UserRecordsPanel
              userId={params.userId}
              fileBaseName={(profile.email || `user-${profile.id}`).replace(/[^a-zA-Z0-9._-]/g, "_")}
            />
          ) : (
          <>
          {/* Learning Stats */}
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

          <hr className="my-6 border-gray-100" />

          {/* Enrolled courses (full list, with progress) */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <BookOpen size={14} className="text-[#0F766E]" />
              Enrolled Courses & Services
              {profile.enrolledCourses && profile.enrolledCourses.length > 0 && (
                <span className="text-xs font-normal text-gray-400">
                  ({profile.enrolledCourses.length})
                </span>
              )}
            </h2>
            {!profile.enrolledCourses || profile.enrolledCourses.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No enrollments yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {profile.enrolledCourses.map((c) => {
                  const isService = c.type === "SERVICE";
                  const href = isService ? `/services/${c.id}` : `/courses/${c.id}`;
                  return (
                    <li key={c.id}>
                      <Link
                        href={href}
                        className="block rounded-xl border border-gray-100 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0F766E]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {isService ? (
                              <Briefcase size={14} className="text-violet-600 shrink-0" />
                            ) : (
                              <BookOpen size={14} className="text-[#0F766E] shrink-0" />
                            )}
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {c.title}
                            </p>
                          </div>
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${
                            c.completed
                              ? "bg-emerald-100 text-emerald-700"
                              : isService
                                ? "bg-violet-100 text-violet-700"
                                : "bg-[#0F766E]/10 text-[#115E59]"
                          }`}>
                            {c.completed ? "Completed" : isService ? "Service" : "Course"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                          <span>{c.completedLessons}/{c.totalLessons} lessons</span>
                          <span className="font-semibold text-[#0F766E] tabular-nums">
                            {c.progressPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              c.completed
                                ? "bg-emerald-500"
                                : "bg-gradient-to-r from-[#0F766E] to-[#0D9488]"
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, c.progressPercent))}%` }}
                          />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <hr className="my-6 border-gray-100" />

          {/* Certificates (full list with verification links) */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Award size={14} className="text-amber-500" />
              Certificates
              {profile.certificates && profile.certificates.length > 0 && (
                <span className="text-xs font-normal text-gray-400">
                  ({profile.certificates.length})
                </span>
              )}
            </h2>
            {!profile.certificates || profile.certificates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No certificates earned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {profile.certificates.map((cert) => (
                  <li
                    key={cert.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Award size={16} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {cert.courseTitle ?? "Untitled course"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {cert.issuedAt
                          ? `Issued ${formatISTDate(cert.issuedAt)}`
                          : ""}
                        {cert.certificateId && (
                          <>
                            {cert.issuedAt && " · "}
                            <span className="font-mono">{cert.certificateId}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {cert.certificateUrl && (
                      <a
                        href={cert.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#0F766E] bg-[#0F766E]/10 hover:bg-[#0F766E]/15 transition shrink-0"
                      >
                        <ExternalLink size={12} /> View
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Agreement status — Terms of Service acceptance record.
              Always renders so admin can confirm whether a user
              has completed the gate. The "not yet accepted" state
              is rendered as an amber notice; an accepted record
              shows the audit fields (legal name, IP, browser, OS)
              captured at acceptance time. */}
          <div className="mt-8">
            <hr className="my-6 border-gray-100" />
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#0F766E]" />
              Agreement Status
            </h2>
            <AgreementStatusCard agreement={profile.agreement} />
          </div>

          {/* Danger zone — soft-delete. Hidden when viewing own
              profile or another admin's profile (the backend
              enforces the same guards, but suppressing the button
              avoids tempting the click). Inactive users still show
              the button so an admin can re-deactivate after a
              re-activation reverted the anonymization (rare). */}
          {me?.id !== profile.id && profile.role?.toUpperCase() !== "ADMIN" && (
            <div className="mt-8">
              <hr className="my-6 border-gray-100" />
              <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-1.5">
                <AlertCircle size={14} />
                Danger Zone
              </h2>
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                <p className="text-sm font-bold text-gray-900">
                  Deactivate this user&apos;s account
                </p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  The user will be logged out and unable to access the platform.
                  Their personal data (name, email, phone, location, bio) will be
                  anonymized. Activity records, certificates, and enrollments are
                  preserved for audit.
                </p>
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                  className="mt-3 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-60 cursor-pointer"
                >
                  <Trash2 size={14} /> Deactivate User
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </motion.div>

      {confirmDeleteOpen && (
        <DeactivateConfirmModal
          userName={profile.fullName ?? profile.email ?? "this user"}
          submitting={deleting}
          onConfirm={handleSoftDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </section>
  );
}

function AgreementStatusCard({
  agreement,
}: {
  agreement: ProfileData["agreement"];
}) {
  // Four states matching the backend row's lifecycle:
  //   - null            → user never started the flow
  //   - WAITING_REPLY   → request email sent, awaiting YES
  //   - CODE_SENT       → reply received, OTP emailed
  //   - VERIFIED        → fully accepted (immutable)
  if (!agreement) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-800">Not yet accepted</p>
          <p className="text-xs text-amber-700 mt-1">
            This user hasn&apos;t completed the Terms of Service flow.
          </p>
        </div>
      </div>
    );
  }
  if (!agreement.accepted) {
    const status = agreement.status ?? "WAITING_REPLY";
    const label =
      status === "CODE_SENT"
        ? "Awaiting OTP entry"
        : "Awaiting email reply (YES)";
    const detail =
      status === "CODE_SENT"
        ? "User replied YES from their inbox; verification code sent. Waiting for them to enter it on the site."
        : "Agreement email sent to the user; waiting for them to reply YES from their inbox.";
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">{label}</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">{detail}</p>
          </div>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <AgreementField label="Legal name" value={agreement.legalName} />
          <AgreementField label="Version" value={agreement.version} />
          <AgreementField label="Status" value={status} />
          <AgreementField
            label="Email sent"
            value={agreement.agreementEmailSentAt
              ? formatISTWithZone(agreement.agreementEmailSentAt) : "—"}
          />
          {agreement.userReplyReceivedAt && (
            <AgreementField
              label="Reply received"
              value={formatISTWithZone(agreement.userReplyReceivedAt)}
            />
          )}
          <AgreementField label="Record ID"
            value={<code className="font-mono text-[#0F766E]">{agreement.recordId}</code>} />
        </dl>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
        <CheckCircle2 size={14} /> Accepted (verified)
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <AgreementField label="Legal name" value={agreement.legalName} />
        <AgreementField label="Version" value={agreement.version} />
        <AgreementField
          label="Email sent"
          value={agreement.agreementEmailSentAt
            ? formatISTWithZone(agreement.agreementEmailSentAt) : "—"}
        />
        <AgreementField
          label="Reply received"
          value={agreement.userReplyReceivedAt
            ? formatISTWithZone(agreement.userReplyReceivedAt) : "—"}
        />
        {agreement.userReplyContent && (
          <AgreementField
            label="Reply content"
            value={
              <code className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {agreement.userReplyContent}
              </code>
            }
          />
        )}
        <AgreementField
          label="Code sent"
          value={agreement.verificationCodeSentAt
            ? formatISTWithZone(agreement.verificationCodeSentAt) : "—"}
        />
        <AgreementField
          label="Code verified"
          value={agreement.verificationCodeVerifiedAt
            ? formatISTWithZone(agreement.verificationCodeVerifiedAt) : "—"}
        />
        <AgreementField
          label="Accepted at"
          value={agreement.acceptedAt ? formatISTWithZone(agreement.acceptedAt) : "—"}
        />
        <AgreementField
          label="IP"
          value={agreement.ipAddress}
          icon={<Globe size={12} className="text-gray-400" />}
        />
        <AgreementField
          label="Browser / OS"
          value={(agreement.browser || "—") + " / " + (agreement.os || "—")}
          icon={<Monitor size={12} className="text-gray-400" />}
        />
        <AgreementField label="Record ID"
          value={<code className="font-mono text-[#0F766E]">{agreement.recordId}</code>} />
      </dl>

      {agreement.signedAgreementPdfUrl ? (
        <button
          type="button"
          onClick={() => {
            void downloadSignedAgreementPdf(
              agreement.signedAgreementPdfUrl!,
              `Spire-Agreement-${agreement.recordId}.pdf`,
            );
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Download size={14} /> Download Signed Agreement
        </button>
      ) : (
        <p className="mt-4 text-xs text-gray-500 italic">
          Signed PDF not available for this acceptance.
        </p>
      )}
    </div>
  );
}

function AgreementField({
  label, value, icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs uppercase tracking-wider text-gray-500 font-semibold w-28 shrink-0 flex items-center gap-1">
        {icon}{label}
      </dt>
      <dd className="text-sm text-gray-900 break-all">{value ?? "—"}</dd>
    </div>
  );
}

function DeactivateConfirmModal({
  userName, submitting, onConfirm, onCancel,
}: {
  userName: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
            <AlertCircle size={16} className="text-red-600" />
            Deactivate user?
          </h2>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            Are you sure you want to deactivate <strong>{userName}</strong>?
            This will anonymize their personal data. This action cannot be undone.
          </p>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {submitting ? "Deactivating…" : "Yes, Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat / analytics tiles (non-clickable on admin view) ──────────

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

// ─── Contribution heatmap (mirror of /profile) ─────────────────────

interface HeatCell {
  date: string;
  count: number;
  dayOfWeek: number;
  month: number;
  inWindow: boolean;
}

function buildCells(contributions: Record<string, number>): HeatCell[] {
  const cells: HeatCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - 364);
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

  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const totalContributions = cells
    .filter((c) => c.inWindow)
    .reduce((sum, c) => sum + c.count, 0);

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
