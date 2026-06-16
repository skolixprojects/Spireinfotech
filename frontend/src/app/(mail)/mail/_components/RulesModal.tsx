"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "./Modal";
import { RuleBuilderModal } from "./RuleBuilderModal";
import {
  listRules, toggleRule, deleteRule, reorderRules,
  type MailFolderDto, type MailRuleDto, type RuleField,
} from "@/lib/mail-client-api";

const FIELD_LABELS: Record<RuleField, string> = {
  FROM: "From", TO: "To", CC: "Cc", SUBJECT: "Subject", HAS_ATTACHMENT: "Has attachment",
};

/** A short, human-readable one-liner for a rule (used in the list). */
function summarize(r: MailRuleDto, folders: MailFolderDto[]): string {
  const join = r.matchMode === "ALL" ? " and " : " or ";
  const cond = r.conditions.map((c) =>
    c.field === "HAS_ATTACHMENT"
      ? "has attachment"
      : `${FIELD_LABELS[c.field]} ${c.operator === "EQUALS" ? "is" : "contains"} “${c.value ?? ""}”`,
  ).join(join) || "any message";
  const act = r.actions.map((a) => {
    switch (a.type) {
      case "MOVE_TO_FOLDER": return `move to ${folders.find((f) => f.id === a.targetFolderId)?.name ?? "?"}`;
      case "MARK_READ": return "mark read";
      case "STAR": return "star";
      case "MARK_IMPORTANT": return "mark important";
      case "DELETE": return "delete";
    }
  }).join(", ") || "do nothing";
  return `If ${cond} → ${act}`;
}

/**
 * Inbox-rules management screen (Phase 18). Owns the list + CRUD; the rule
 * builder is rendered as a SIBLING (not nested) so its animated card and the
 * folder picker it opens stay anchored to the viewport.
 */
export function RulesModal({ open, onClose, folders }: {
  open: boolean;
  onClose: () => void;
  folders: MailFolderDto[];
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState<MailRuleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  // undefined = builder closed; null = new rule; a dto = edit that rule.
  const [editing, setEditing] = useState<MailRuleDto | null | undefined>(undefined);

  const load = useCallback(() => {
    setLoading(true);
    listRules().then(setRules).catch((e) => toast("error", e instanceof Error ? e.message : "Could not load rules"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const onToggle = async (r: MailRuleDto) => {
    setBusyId(r.id);
    try { await toggleRule(r.id, !r.enabled); setRules((p) => p.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x)); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not update rule"); }
    finally { setBusyId(null); }
  };

  const onDelete = async (r: MailRuleDto) => {
    setBusyId(r.id);
    try { await deleteRule(r.id); setRules((p) => p.filter((x) => x.id !== r.id)); toast("success", "Rule deleted"); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not delete rule"); }
    finally { setBusyId(null); }
  };

  // Move a rule up/down and persist the new evaluation order. Guarded against
  // overlapping requests so rapid clicks can't race conflicting orders.
  const reorder = async (index: number, dir: -1 | 1) => {
    if (reordering) return;
    const j = index + dir;
    if (j < 0 || j >= rules.length) return;
    const next = rules.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setRules(next);   // optimistic
    setReordering(true);
    try { setRules(await reorderRules(next.map((r) => r.id))); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not reorder"); load(); }
    finally { setReordering(false); }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Inbox rules" maxWidth="max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">Rules run in order on incoming mail.</p>
          <Button size="sm" onClick={() => setEditing(null)} className="gap-1.5"><Plus size={15} /> New rule</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-[#0F766E]" /></div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-400">
            <Wand2 size={28} />
            <p className="text-sm">No rules yet. Create one to auto-file, star, or flag incoming mail.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((r, i) => (
              <li key={r.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
                <div className="flex flex-col">
                  <button onClick={() => reorder(i, -1)} disabled={i === 0 || reordering} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move up"><ChevronUp size={15} /></button>
                  <button onClick={() => reorder(i, 1)} disabled={i === rules.length - 1 || reordering} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move down"><ChevronDown size={15} /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate font-medium ${r.enabled ? "text-gray-900" : "text-gray-400"}`}>{r.name}</span>
                    {r.stopProcessing && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">stops</span>}
                    {!r.enabled && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">off</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{summarize(r, folders)}</p>
                </div>
                {/* enabled toggle */}
                <button onClick={() => onToggle(r)} disabled={busyId === r.id} role="switch" aria-checked={r.enabled}
                  className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${r.enabled ? "bg-[#0F766E]" : "bg-gray-300"}`} title={r.enabled ? "Disable" : "Enable"}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${r.enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <button onClick={() => setEditing(r)} className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#0F766E]" title="Edit"><Pencil size={15} /></button>
                <button onClick={() => onDelete(r)} disabled={busyId === r.id} className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {open && editing !== undefined && (
        <RuleBuilderModal
          key={editing?.id ?? "new"}   // remount per target so state re-inits from `initial`
          open
          folders={folders}
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
    </>
  );
}
