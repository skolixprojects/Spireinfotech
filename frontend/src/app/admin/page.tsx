"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, ClipboardList, LayoutDashboard, Loader2, LogOut,
  ShieldCheck, Users,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { getAnalytics, getUserCountsAsAdmin, getUsers, type UserDTO } from "@/lib/api";
import { OperationsPanel } from "@/components/admin/OperationsPanel";

/**
 * Operations Admin dashboard.
 *
 * Three tabs only — Overview, Users, Operations. The Operations
 * panel mounts the per-tab participant-lifecycle queues (enrollment,
 * doc review, agreement, assignments, audit, exceptions).
 *
 * Gated to ADMIN / OPERATIONS_ADMIN / SYSTEM_ADMIN; the login-flow
 * redirect already routes those roles here, so a deep-link hit just
 * re-checks and bounces non-admins away.
 */

type TabId = "overview" | "users" | "operations";

const SIDEBAR: { id: TabId; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview",   label: "Overview",   Icon: LayoutDashboard },
  { id: "users",      label: "Users",      Icon: Users },
  { id: "operations", label: "Operations", Icon: ShieldCheck },
];

interface Analytics {
  totalUsers?: number;
  totalStudents?: number;
  totalParticipants?: number;
  activeUsersLast7Days?: number;
  activeUsersLast30Days?: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [active, setActive] = useState<TabId>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    const role = (user.role ?? "").toUpperCase();
    if (role !== "ADMIN" && role !== "OPERATIONS_ADMIN" && role !== "SYSTEM_ADMIN") {
      router.replace("/dashboard");
      return;
    }
    getAnalytics()
      .then((a) => setAnalytics(a as Analytics))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load analytics"));
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="font-serif text-sm font-bold text-[#0F766E]">Spire Info Tech</span>
          </Link>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mt-0.5">Operations</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {SIDEBAR.map((s) => {
            const isActive = active === s.id;
            return (
              <button key={s.id} onClick={() => setActive(s.id)}
                className={
                  "w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer "
                  + (isActive
                      ? "bg-[#0F766E] text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
                }>
                <s.Icon size={14} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-700 truncate">{user?.fullName ?? ""}</p>
            <p className="text-[10px] text-gray-400 truncate">{user?.role ?? ""}</p>
          </div>
          <button type="button" onClick={logout}
            className="shrink-0 text-xs text-gray-500 hover:text-red-600 cursor-pointer inline-flex items-center gap-1">
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {error && (
            <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          {active === "overview" && <OverviewTab analytics={analytics} />}
          {active === "users" && <UsersTab />}
          {active === "operations" && <OperationsPanel />}
        </div>
      </main>
    </div>
  );
}

/* ── Overview tab ─────────────────────────────────────────────── */

function OverviewTab({ analytics }: { analytics: Analytics | null }) {
  const [counts, setCounts] = useState<{ active: number; inactive: number; total: number } | null>(null);
  useEffect(() => {
    getUserCountsAsAdmin().then(setCounts).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">Operations overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          High-level snapshot. Lifecycle-specific queues live on the Operations tab.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total users" value={analytics?.totalUsers ?? counts?.total ?? "—"} />
        <Stat label="Active users" value={counts?.active ?? "—"} />
        <Stat label="Active in 7 days" value={analytics?.activeUsersLast7Days ?? "—"} />
        <Stat label="Active in 30 days" value={analytics?.activeUsersLast30Days ?? "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

/* ── Users tab ────────────────────────────────────────────────── */

function UsersTab() {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const status = filter === "all" ? undefined : filter;
    getUsers(status)
      .then((rows) => { if (!cancelled) setUsers((rows ?? []) as UserDTO[]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  if (loading) {
    return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Users</h1>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={
                "px-2.5 py-1 rounded-md font-semibold cursor-pointer "
                + (filter === f ? "bg-[#0F766E] text-white" : "text-gray-600 hover:text-[#0F766E]")
              }>
              {f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Participant ID</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No users match this filter.
              </td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 font-medium text-gray-900">{u.fullName}</td>
                <td className="px-4 py-2 text-gray-700">{u.email}</td>
                <td className="px-4 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{u.participantId ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={
                    "px-2 py-0.5 rounded-full text-[10px] font-bold "
                    + (u.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700")
                  }>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/users/${u.id}`}
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#0D9488] cursor-pointer inline-flex items-center gap-1">
                    <ClipboardList size={12} /> Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
