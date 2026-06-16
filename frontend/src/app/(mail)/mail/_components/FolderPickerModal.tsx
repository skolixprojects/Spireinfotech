"use client";

import { useMemo } from "react";
import { Inbox, Send, FileText, Archive, Trash2, Folder as FolderIcon, FolderTree } from "lucide-react";
import { Modal } from "./Modal";
import type { MailFolderDto } from "@/lib/mail-client-api";

const SYS_ICON: Record<string, typeof Inbox> = {
  INBOX: Inbox, SENT: Send, DRAFTS: FileText, ARCHIVE: Archive, TRASH: Trash2,
};

/** Build a parentId -> children[] index from the flat folder list. */
function childrenOf(folders: MailFolderDto[]): Map<number | null, MailFolderDto[]> {
  const m = new Map<number | null, MailFolderDto[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(f);
  }
  return m;
}

/** All descendant ids of a folder (excludes itself). */
export function descendantIds(folders: MailFolderDto[], rootId: number): Set<number> {
  const kids = childrenOf(folders);
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) ?? []) {
      if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); }
    }
  }
  return out;
}

/**
 * Tree picker. Calls onPick(folder|null) — null only when allowRoot (used for
 * folder re-parent to choose "Top level"). `disabledIds` greys out folders that
 * aren't valid targets (self+descendants for re-parent; DRAFTS/SENT for message
 * moves). Reused for both message-move and folder-reparent.
 */
export function FolderPickerModal({
  open,
  title,
  folders,
  allowRoot = false,
  disabledIds,
  busy = false,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  folders: MailFolderDto[];
  allowRoot?: boolean;
  disabledIds?: Set<number>;
  busy?: boolean;
  onPick: (folder: MailFolderDto | null) => void;
  onClose: () => void;
}) {
  const kids = useMemo(() => childrenOf(folders), [folders]);

  const renderNodes = (parentId: number | null, depth: number): React.ReactNode =>
    (kids.get(parentId) ?? []).map((f) => {
      const disabled = busy || (disabledIds?.has(f.id) ?? false);
      const Icon = f.systemKey ? (SYS_ICON[f.systemKey] ?? FolderIcon) : FolderIcon;
      return (
        <div key={f.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(f)}
            style={{ paddingLeft: 8 + depth * 18 }}
            className={`flex w-full items-center gap-2 rounded-md py-2 pr-3 text-left text-sm ${
              disabled ? "cursor-not-allowed text-gray-300" : "text-gray-700 hover:bg-[#0F766E]/10 hover:text-[#0F766E]"
            }`}
          >
            <Icon size={15} className="shrink-0 text-gray-400" />
            <span className="truncate">{f.name}</span>
          </button>
          {renderNodes(f.id, depth + 1)}
        </div>
      );
    });

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
        {allowRoot && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-[#0F766E]/10 hover:text-[#0F766E] disabled:cursor-not-allowed disabled:text-gray-300"
          >
            <FolderTree size={15} className="shrink-0 text-gray-400" /> Top level (no parent)
          </button>
        )}
        {renderNodes(null, 0)}
      </div>
    </Modal>
  );
}
