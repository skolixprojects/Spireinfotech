"use client";

import { useMemo, useState } from "react";
import {
  Inbox, Star, Send, FileText, Archive, Trash2, PenSquare,
  Folder as FolderIcon, FolderPlus, ChevronRight, ChevronDown, MoreVertical, Pencil, FolderInput, Wand2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import {
  createFolder, renameFolder, moveFolder, deleteFolder,
  type MailFolderDto,
} from "@/lib/mail-client-api";
import { Modal } from "./Modal";
import { FolderPickerModal, descendantIds } from "./FolderPickerModal";

const SYS_ICON: Record<string, typeof Inbox> = {
  INBOX: Inbox, SENT: Send, DRAFTS: FileText, ARCHIVE: Archive, TRASH: Trash2,
};
// Display Starred (virtual) right after Inbox, like the old rail.
const SYS_ORDER = ["INBOX", "STARRED", "SENT", "DRAFTS", "ARCHIVE", "TRASH"];

type ModalState =
  | { type: "create"; parentId: number | null; parentName?: string }
  | { type: "rename"; folder: MailFolderDto }
  | { type: "move"; folder: MailFolderDto }
  | { type: "delete"; folder: MailFolderDto }
  | null;

export function FolderRail({
  folders,
  active,
  onSelect,
  onCompose,
  onChanged,
  onOpenRules,
}: {
  folders: MailFolderDto[];
  active: string;                       // systemKey | String(customId) | "STARRED"
  onSelect: (ref: string) => void;
  onCompose: () => void;
  onChanged: () => void;                // reload the tree + counts after a change
  onOpenRules: () => void;              // open the inbox-rules manager
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);

  const sysByKey = useMemo(() => {
    const m = new Map<string, MailFolderDto>();
    for (const f of folders) if (f.systemKey) m.set(f.systemKey, f);
    return m;
  }, [folders]);

  const childrenOf = useMemo(() => {
    const m = new Map<number | null, MailFolderDto[]>();
    for (const f of folders) {
      if (f.kind !== "CUSTOM") continue;
      const k = f.parentId ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return m;
  }, [folders]);

  const toggle = (id: number) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try { await fn(); toast("success", okMsg); setModal(null); onChanged(); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  };

  // ── Rows ──
  const SystemRow = ({ f, refKey }: { f?: MailFolderDto; refKey: string }) => {
    const Icon = SYS_ICON[refKey] ?? FolderIcon;
    const isStarred = refKey === "STARRED";
    const isActive = active === refKey;
    const unread = isStarred ? 0 : (f?.unread ?? 0);
    const label = isStarred ? "Starred" : (f ? cap(f.systemKey ?? f.name) : cap(refKey));
    return (
      <button
        onClick={() => onSelect(refKey)}
        title={f ? `${f.total} total` : undefined}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-[#0F766E]/10 font-semibold text-[#0F766E]" : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon size={17} className={isActive ? "text-[#0F766E]" : "text-gray-400"} />
          {label}
        </span>
        {unread > 0 && <Badge n={unread} />}
      </button>
    );
  };

  const CustomNode = ({ f, depth }: { f: MailFolderDto; depth: number }) => {
    const kids = childrenOf.get(f.id) ?? [];
    const isOpen = expanded.has(f.id);
    const isActive = active === String(f.id);
    const isMenu = menuFor === f.id;
    return (
      <div>
        <div
          className={`group flex items-center rounded-lg pr-1 text-sm transition-colors ${
            isActive ? "bg-[#0F766E]/10 font-semibold text-[#0F766E]" : "text-gray-700 hover:bg-gray-100"
          }`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            onClick={() => (kids.length ? toggle(f.id) : undefined)}
            className="shrink-0 p-1 text-gray-400"
            aria-label={kids.length ? (isOpen ? "Collapse" : "Expand") : undefined}
          >
            {kids.length ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="inline-block w-[14px]" />}
          </button>
          <button onClick={() => onSelect(String(f.id))} title={`${f.total} total`} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
            <FolderIcon size={15} className={isActive ? "text-[#0F766E]" : "text-gray-400"} />
            <span className="truncate">{f.name}</span>
          </button>
          {f.unread > 0 && <Badge n={f.unread} />}
          <button
            onClick={() => setMenuFor(isMenu ? null : f.id)}
            className="ml-0.5 shrink-0 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
            title="Folder options"
            aria-label="Folder options"
          >
            <MoreVertical size={14} />
          </button>
        </div>

        {isMenu && (
          <div className="ml-6 mb-1 rounded-lg border border-gray-200 bg-white py-1 shadow-sm" style={{ marginLeft: 8 + depth * 14 }}>
            <MenuItem icon={FolderPlus} label="New subfolder" onClick={() => { setMenuFor(null); setModal({ type: "create", parentId: f.id, parentName: f.name }); }} />
            <MenuItem icon={Pencil} label="Rename" onClick={() => { setMenuFor(null); setModal({ type: "rename", folder: f }); }} />
            <MenuItem icon={FolderInput} label="Move to…" onClick={() => { setMenuFor(null); setModal({ type: "move", folder: f }); }} />
            <MenuItem icon={Trash2} label="Delete" danger onClick={() => { setMenuFor(null); setModal({ type: "delete", folder: f }); }} />
          </div>
        )}

        {isOpen && kids.map((c) => <CustomNode key={c.id} f={c} depth={depth + 1} />)}
      </div>
    );
  };

  const roots = childrenOf.get(null) ?? [];

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <button
        onClick={onCompose}
        className="mb-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0D9488]"
      >
        <PenSquare size={16} /> Compose
      </button>

      {SYS_ORDER.map((key) =>
        key === "STARRED"
          ? <SystemRow key="STARRED" refKey="STARRED" />
          : <SystemRow key={key} refKey={key} f={sysByKey.get(key)} />
      )}

      <div className="mt-3 flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Folders</span>
        <button
          onClick={() => setModal({ type: "create", parentId: null })}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-[#0F766E]"
          title="New folder"
          aria-label="New folder"
        >
          <FolderPlus size={15} />
        </button>
      </div>
      {roots.length === 0 ? (
        <p className="px-3 py-1 text-xs text-gray-400">No custom folders yet.</p>
      ) : (
        roots.map((f) => <CustomNode key={f.id} f={f} depth={0} />)
      )}

      {/* Footer: inbox-rules manager */}
      <button
        onClick={onOpenRules}
        className="mt-auto flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
      >
        <Wand2 size={17} className="text-gray-400" /> Rules
      </button>

      {/* Create / Rename */}
      {modal?.type === "create" && (
        <FolderNameModal
          title={modal.parentName ? `New folder in “${modal.parentName}”` : "New folder"}
          busy={busy}
          onSubmit={(name) => {
            const pid = modal.parentId;
            if (pid != null) setExpanded((p) => new Set(p).add(pid));   // reveal the new child
            run(() => createFolder(name, pid), "Folder created");
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "rename" && (
        <FolderNameModal
          title="Rename folder"
          initial={modal.folder.name}
          busy={busy}
          onSubmit={(name) => run(() => renameFolder(modal.folder.id, name), "Folder renamed")}
          onClose={() => setModal(null)}
        />
      )}

      {/* Move / re-parent (exclude self + descendants; allow Top level) */}
      {modal?.type === "move" && (
        <FolderPickerModal
          open
          title={`Move “${modal.folder.name}” to…`}
          folders={folders}
          allowRoot
          busy={busy}
          disabledIds={new Set([modal.folder.id, ...descendantIds(folders, modal.folder.id)])}
          onPick={(target) => run(() => moveFolder(modal.folder.id, target ? target.id : null), "Folder moved")}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete (custom only; messages move to Trash) */}
      {modal?.type === "delete" && (
        <Modal open onClose={() => setModal(null)} title={`Delete “${modal.folder.name}”?`}>
          <p className="text-sm text-gray-600">
            This folder and its subfolders will be removed. Any messages in them
            {modal.folder.total > 0 ? <> (<strong>{modal.folder.total}</strong> here, plus any in subfolders)</> : null} will be
            moved to <strong>Trash</strong> — not permanently deleted.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => run(() => deleteFolder(modal.folder.id), "Folder deleted")} disabled={busy} className="bg-red-600 hover:bg-red-700">
              {busy ? "Deleting…" : "Delete folder"}
            </Button>
          </div>
        </Modal>
      )}
    </nav>
  );
}

function Badge({ n }: { n: number }) {
  return <span className="min-w-[20px] rounded-full bg-[#0F766E] px-1.5 py-0.5 text-center text-xs font-semibold text-white">{n}</span>;
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Inbox; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function FolderNameModal({ title, initial = "", busy, onSubmit, onClose }: {
  title: string; initial?: string; busy: boolean; onSubmit: (name: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = () => { if (name.trim()) onSubmit(name.trim()); };
  return (
    <Modal open onClose={onClose} title={title}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Folder name"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#14B8A6]"
      />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}

function cap(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
