"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Loader2, LogOut, ShieldCheck,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { OperationsPanel } from "@/components/admin/OperationsPanel";

/**
 * /operations — Operations Admin dashboard.
 *
 * Distinct route from /admin (which retains the LMS admin surface:
 * courses, sessions, revenue, mentor pools, instructor approvals).
 *
 * Gated to OPERATIONS_ADMIN / SYSTEM_ADMIN. Legacy ADMIN users land
 * on /admin instead per dashboardRouteForRole.
 *
 * Renders the participant-lifecycle operations queues:
 *   • Enrollment queue
 *   • Document review pointer
 *   • Agreement queue
 *   • Assignments (ERM + coaches)
 *   • Audit trail
 *   • Exceptions
 *
 * Implemented by reusing OperationsPanel (the same component the
 * LMS admin page mounts under its "Operations" sidebar tab).
 */
export default function OperationsPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const role = (user.role ?? "").toUpperCase();
    if (role !== "OPERATIONS_ADMIN" && role !== "SYSTEM_ADMIN") {
      // Anyone else routed away — legacy ADMIN to /admin, others to
      // their natural dashboard. dashboardRouteForRole picks correctly.
      import("@/lib/api").then(({ dashboardRouteForRole }) => {
        router.replace(dashboardRouteForRole(role));
      });
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  const role = (user?.role ?? "").toUpperCase();
  if (role !== "OPERATIONS_ADMIN" && role !== "SYSTEM_ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="font-serif text-sm font-bold text-[#0F766E]">
              Spire Info Tech
            </span>
          </Link>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mt-0.5">
            Operations
          </p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-3 py-2 inline-flex items-center gap-2 text-sm font-medium rounded-lg bg-[#0F766E] text-white shadow-sm w-full">
            <ShieldCheck size={14} />
            <span>Operations</span>
          </div>
          <Link
            href="/admin"
            className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
          >
            <LayoutDashboard size={14} />
            <span className="truncate">LMS Admin</span>
          </Link>
        </nav>
        <div className="p-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-700 truncate">
              {user?.fullName ?? ""}
            </p>
            <p className="text-[10px] text-gray-400 truncate">
              {user?.role ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 text-xs text-gray-500 hover:text-red-600 cursor-pointer inline-flex items-center gap-1"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5">
            <h1 className="font-serif text-2xl font-bold text-gray-900">
              Operations
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Participant-lifecycle queues — enrollment, document review,
              agreement signing, ERM &amp; coach assignments, audit trail,
              and exceptions.
            </p>
          </div>
          <OperationsPanel />
        </div>
      </main>
    </div>
  );
}
