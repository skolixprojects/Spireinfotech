"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, LogOut, Mail, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useMailAuth } from "@/lib/mail-auth-context";
import { getMailMe } from "@/lib/mail-api";
import { useToast } from "@/components/ui/Toast";

// Placeholder landing — auth verification only. The real three-pane
// mail client is a later phase; this is a protected stub that proves a
// session exists.
export default function MailHomePage() {
  const { account, status, logout } = useMailAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (status === "anonymous") router.replace("/mail/login");
  }, [status, router]);

  if (status !== "authenticated" || !account) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  // Exercises mailApiFetch (refresh-on-401 + redirect) end to end.
  const verifySession = async () => {
    try {
      const me = await getMailMe();
      toast("success", `Session OK — ${me.email}`);
    } catch {
      toast("error", "Session check failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <GlassCard className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F766E] text-white">
              <Mail size={20} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-gray-900 leading-tight">
                {account.entityName} Mail
              </h1>
              <p className="text-xs text-gray-500">
                The full client arrives in a later phase.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-2 text-sm">
            <Row label="Signed in as" value={account.email} />
            <Row label="Role" value={account.role} />
            <Row label="Status" value={account.status} />
            <Row label="Domain" value={account.domain} />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={verifySession} variant="secondary" className="gap-2">
              <ShieldCheck size={16} /> Verify session
            </Button>
            <Button onClick={logout} variant="ghost" className="gap-2">
              <LogOut size={16} /> Logout
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 truncate">{value}</span>
    </div>
  );
}
