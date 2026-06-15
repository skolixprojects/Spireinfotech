"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";
import type { MailLinkResponse } from "@/lib/mail-admin-api";

/**
 * Out-of-band relay UX for a one-time SETUP/RESET link. The raw url is
 * shown ONCE — the admin copies it and sends it to the user through
 * their own channel. No auto-dismiss; the admin must acknowledge.
 */
export function OneTimeLinkModal({
  link,
  onClose,
}: {
  link: MailLinkResponse | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      // Only confirm on a real success — a non-secure context / denied
      // permission falls through to the readonly input for manual copy.
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // leave it for manual copy
    }
  };

  const isReset = link?.purpose === "RESET";

  return (
    <Modal
      open={!!link}
      onClose={onClose}
      title={isReset ? "Password reset link" : "Setup link"}
    >
      {link && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              Send this link to <strong>{link.account.email}</strong> through your own
              channel. It won&apos;t be shown again.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">One-time link</label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-xs text-gray-700 font-mono"
              />
              <Button onClick={copy} variant="secondary" size="sm" className="gap-1.5 shrink-0">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {link.expiresAt && (
              <p className="text-xs text-gray-400 mt-1.5">
                Expires {new Date(link.expiresAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
