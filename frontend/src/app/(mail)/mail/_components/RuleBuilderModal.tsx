"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, FolderInput } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "./Modal";
import { FolderPickerModal } from "./FolderPickerModal";
import {
  createRule, updateRule,
  type MailFolderDto, type MailRuleDto, type MailRuleCondition, type MailRuleAction,
  type RuleField, type RuleActionType,
} from "@/lib/mail-client-api";

const FIELD_LABELS: Record<RuleField, string> = {
  FROM: "From", TO: "To", CC: "Cc", SUBJECT: "Subject", HAS_ATTACHMENT: "Has attachment",
};
const ACTION_LABELS: Record<RuleActionType, string> = {
  MOVE_TO_FOLDER: "Move to folder", MARK_READ: "Mark as read", STAR: "Star",
  MARK_IMPORTANT: "Mark important", DELETE: "Delete (to Trash)",
};
const INPUT = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#14B8A6]";

type CondRow = { _k: number; field: RuleField; operator: "CONTAINS" | "EQUALS" | "IS_TRUE"; value: string };
type ActRow = { _k: number; type: RuleActionType; targetFolderId: number | null };

/**
 * Create/edit a single inbox rule. Rendered as a SIBLING of the rules-list modal
 * (not nested) so its own animated card never becomes a transformed ancestor of
 * the folder picker — the picker is likewise a sibling here, keeping every
 * position:fixed overlay anchored to the viewport.
 */
export function RuleBuilderModal({ open, onClose, folders, initial, onSaved }: {
  open: boolean;
  onClose: () => void;
  folders: MailFolderDto[];
  initial?: MailRuleDto | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Stable per-row keys so removing a middle row doesn't shift React's identity
  // (which would jump focus/cursor between the controlled inputs).
  const keyRef = useRef(0);
  const nk = () => keyRef.current++;
  const [name, setName] = useState(initial?.name ?? "");
  const [matchMode, setMatchMode] = useState<"ALL" | "ANY">(initial?.matchMode ?? "ALL");
  const [stopProcessing, setStop] = useState(initial?.stopProcessing ?? false);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [conds, setConds] = useState<CondRow[]>(
    initial?.conditions?.length
      ? initial.conditions.map((c) => ({ _k: nk(), field: c.field, operator: c.operator, value: c.value ?? "" }))
      : [{ _k: nk(), field: "FROM", operator: "CONTAINS", value: "" }],
  );
  const [acts, setActs] = useState<ActRow[]>(
    initial?.actions?.length
      ? initial.actions.map((a) => ({ _k: nk(), type: a.type, targetFolderId: a.targetFolderId ?? null }))
      : [{ _k: nk(), type: "MOVE_TO_FOLDER", targetFolderId: null }],
  );
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const folderName = (id: number | null) =>
    id == null ? "Choose folder…" : (folders.find((f) => f.id === id)?.name ?? "Unknown folder");
  // Backend rejects MOVE into SENT/DRAFTS — disable them in the picker.
  const moveDisabled = useMemo(
    () => new Set(folders.filter((f) => f.systemKey === "DRAFTS" || f.systemKey === "SENT").map((f) => f.id)),
    [folders],
  );

  const setCond = (i: number, patch: Partial<CondRow>) =>
    setConds((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const setAct = (i: number, patch: Partial<ActRow>) =>
    setActs((p) => p.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const changeField = (i: number, field: RuleField) => {
    if (field === "HAS_ATTACHMENT") setCond(i, { field, operator: "IS_TRUE", value: "" });
    else setCond(i, { field, operator: conds[i].operator === "IS_TRUE" ? "CONTAINS" : conds[i].operator });
  };
  const changeActType = (i: number, type: RuleActionType) =>
    setAct(i, { type, targetFolderId: type === "MOVE_TO_FOLDER" ? acts[i].targetFolderId : null });

  const save = async () => {
    if (!name.trim()) return toast("error", "Give the rule a name.");
    if (conds.length === 0) return toast("error", "Add at least one condition.");
    if (acts.length === 0) return toast("error", "Add at least one action.");
    for (const c of conds) {
      if (c.field !== "HAS_ATTACHMENT" && !c.value.trim()) return toast("error", "Each condition needs a value.");
    }
    for (const a of acts) {
      if (a.type === "MOVE_TO_FOLDER" && a.targetFolderId == null) return toast("error", "Pick a target folder for the move action.");
    }
    const body = {
      name: name.trim(), matchMode, stopProcessing, enabled,
      conditions: conds.map<MailRuleCondition>((c) =>
        c.field === "HAS_ATTACHMENT"
          ? { field: c.field, operator: "IS_TRUE" }
          : { field: c.field, operator: c.operator as "CONTAINS" | "EQUALS", value: c.value.trim() }),
      actions: acts.map<MailRuleAction>((a) =>
        a.type === "MOVE_TO_FOLDER" ? { type: a.type, targetFolderId: a.targetFolderId } : { type: a.type }),
    };
    setBusy(true);
    try {
      if (initial) await updateRule(initial.id, body);
      else await createRule(body);
      toast("success", initial ? "Rule updated" : "Rule created");
      onSaved();
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not save rule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={initial ? "Edit rule" : "New rule"} maxWidth="max-w-2xl">
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Rule name</label>
            <input className={`${INPUT} w-full`} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. File invoices in Finance" autoFocus />
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">When a message matches</span>
              <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as "ALL" | "ANY")}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                <option value="ALL">ALL conditions</option>
                <option value="ANY">ANY condition</option>
              </select>
            </div>
            <div className="space-y-2">
              {conds.map((c, i) => (
                <div key={c._k} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <select className={`${INPUT} min-w-0`} value={c.field} onChange={(e) => changeField(i, e.target.value as RuleField)}>
                    {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                  {c.field === "HAS_ATTACHMENT" ? (
                    <span className="flex-1 px-2 text-sm text-gray-400">is true</span>
                  ) : (
                    <>
                      <select className={`${INPUT} min-w-0`} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value as "CONTAINS" | "EQUALS" })}>
                        <option value="CONTAINS">contains</option>
                        <option value="EQUALS">equals</option>
                      </select>
                      <input className={`${INPUT} min-w-0 flex-1 basis-full sm:basis-auto`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder="value" />
                    </>
                  )}
                  <button onClick={() => setConds((p) => p.filter((_, idx) => idx !== i))} disabled={conds.length === 1}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Remove condition">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setConds((p) => [...p, { _k: nk(), field: "SUBJECT", operator: "CONTAINS", value: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline">
              <Plus size={13} /> Add condition
            </button>
          </div>

          {/* Actions */}
          <div>
            <span className="mb-2 block text-sm font-semibold text-gray-700">Then</span>
            <div className="space-y-2">
              {acts.map((a, i) => (
                <div key={a._k} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <select className={`${INPUT} min-w-0`} value={a.type} onChange={(e) => changeActType(i, e.target.value as RuleActionType)}>
                    {(Object.keys(ACTION_LABELS) as RuleActionType[]).map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                  </select>
                  {a.type === "MOVE_TO_FOLDER" && (
                    <button onClick={() => setPickFor(i)}
                      className="inline-flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-left text-sm hover:border-[#0F766E]/40 sm:basis-auto">
                      <FolderInput size={14} className="shrink-0 text-gray-400" />
                      <span className={`truncate ${a.targetFolderId == null ? "text-gray-400" : "text-gray-700"}`}>{folderName(a.targetFolderId)}</span>
                    </button>
                  )}
                  <button onClick={() => setActs((p) => p.filter((_, idx) => idx !== i))} disabled={acts.length === 1}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Remove action">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setActs((p) => [...p, { _k: nk(), type: "STAR", targetFolderId: null }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline">
              <Plus size={13} /> Add action
            </button>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-3 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stopProcessing} onChange={(e) => setStop(e.target.checked)} /> Stop processing further rules</label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Create rule"}</Button>
          </div>
        </div>
      </Modal>

      {pickFor !== null && (
        <FolderPickerModal
          open
          title="Choose target folder"
          folders={folders}
          disabledIds={moveDisabled}
          onPick={(f) => { if (f) setAct(pickFor, { targetFolderId: f.id }); setPickFor(null); }}
          onClose={() => setPickFor(null)}
        />
      )}
    </>
  );
}
