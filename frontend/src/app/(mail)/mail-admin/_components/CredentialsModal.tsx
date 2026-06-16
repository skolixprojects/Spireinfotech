"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";
import type { MailCredentialResponse } from "@/lib/mail-admin-api";

/**
 * Show-once credentials relay. The plaintext password is displayed ONCE so
 * the admin can hand it to the user through their own channel — it is never
 * stored in plaintext and can't be retrieved again. No auto-dismiss.
 */
export function CredentialsModal({
  cred,
  title = "Mailbox credentials",
  onClose,
}: {
  cred: MailCredentialResponse | null;
  title?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(null);

  const copy = async (text: string, which: "email" | "password" | "both") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* leave for manual copy */
    }
  };

  return (
    <Modal open={!!cred} onClose={onClose} title={title}>
      {cred && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              This password is shown <strong>once</strong>. Send it to{" "}
              <strong>{cred.account.email}</strong> through your own channel — you
              won&apos;t be able to see it again.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={cred.account.email}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-700 font-mono"
              />
              <Button onClick={() => copy(cred.account.email, "email")} variant="secondary" size="sm" className="gap-1.5 shrink-0">
                {copied === "email" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "email" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Temporary password</label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={cred.password}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900 font-mono"
              />
              <Button onClick={() => copy(cred.password, "password")} variant="secondary" size="sm" className="gap-1.5 shrink-0">
                {copied === "password" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "password" ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              The user will be prompted to change it on first sign-in.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(`${cred.account.email}\n${cred.password}`, "both")}
              className="gap-1.5"
            >
              {copied === "both" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "both" ? "Copied" : "Copy both"}
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
