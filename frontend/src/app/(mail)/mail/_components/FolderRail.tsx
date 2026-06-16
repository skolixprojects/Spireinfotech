"use client";

import { Inbox, Star, Send, FileText, Archive, Trash2, PenSquare } from "lucide-react";
import type { UnreadCounts } from "@/lib/mail-client-api";

const FOLDERS = [
  { key: "INBOX", label: "Inbox", icon: Inbox, badge: true },
  { key: "STARRED", label: "Starred", icon: Star, badge: false },
  { key: "SENT", label: "Sent", icon: Send, badge: false },
  { key: "DRAFTS", label: "Drafts", icon: FileText, badge: true },
  { key: "ARCHIVE", label: "Archive", icon: Archive, badge: true },
  { key: "TRASH", label: "Trash", icon: Trash2, badge: false },
] as const;

export function FolderRail({
  active,
  unread,
  onSelect,
  onCompose,
}: {
  active: string;
  unread: UnreadCounts;
  onSelect: (folder: string) => void;
  onCompose: () => void;
}) {
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <button
        onClick={onCompose}
        className="mb-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0D9488]"
      >
        <PenSquare size={16} /> Compose
      </button>

      {FOLDERS.map((f) => {
        const isActive = active === f.key;
        const count = f.badge ? unread[f.key] ?? 0 : 0;
        const Icon = f.icon;
        return (
          <button
            key={f.key}
            onClick={() => onSelect(f.key)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive ? "bg-[#0F766E]/10 font-semibold text-[#0F766E]" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon size={17} className={isActive ? "text-[#0F766E]" : "text-gray-400"} />
              {f.label}
            </span>
            {count > 0 && (
              <span className="min-w-[20px] rounded-full bg-[#0F766E] px-1.5 py-0.5 text-center text-xs font-semibold text-white">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
