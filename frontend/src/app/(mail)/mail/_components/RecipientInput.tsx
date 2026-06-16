"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fetchContacts, type MailContact } from "@/lib/mail-compose-api";

const TOKEN_RE = /^[^\s@]+(@[^\s@]+\.?[^\s@]*)?$/; // bare local-part or local@domain

export function RecipientInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<MailContact[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = input.trim();
    // Bump seq so any in-flight fetch is treated as stale once the input
    // is cleared (e.g. right after committing a chip) — avoids a late
    // response re-opening a stale dropdown.
    if (!q) { seq.current++; setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      try {
        const res = await fetchContacts(q);
        if (mySeq !== seq.current) return; // stale
        const lower = new Set(value.map((v) => v.toLowerCase()));
        const filtered = res.filter((c) => !lower.has(c.email.toLowerCase()));
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
        setHighlight(0);
      } catch { /* ignore */ }
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [input, value]);

  const addChip = (email: string) => {
    const e = email.trim();
    // Dedup case-insensitively (a mailbox is one recipient regardless of
    // case) while preserving the entered casing in the chip.
    if (!e || !TOKEN_RE.test(e) || value.some((v) => v.toLowerCase() === e.toLowerCase())) {
      setInput(""); setOpen(false); return;
    }
    onChange([...value, e]);
    setInput(""); setSuggestions([]); setOpen(false);
  };
  const removeChip = (email: string) => onChange(value.filter((v) => v !== email));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter") { e.preventDefault(); addChip(suggestions[highlight].email); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    if ((e.key === "Enter" || e.key === "," || e.key === ";") && input.trim()) {
      e.preventDefault(); addChip(input);
    } else if (e.key === "Backspace" && !input && value.length) {
      removeChip(value[value.length - 1]);
    }
  };

  return (
    <div className="relative flex items-center gap-2 border-b border-gray-100 px-3 py-1.5">
      <span className="w-8 shrink-0 text-xs font-medium text-gray-400">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[#0F766E]/10 px-2 py-0.5 text-xs text-[#0F766E]">
            {v}
            <button type="button" onClick={() => removeChip(v)} className="hover:text-red-600" aria-label={`Remove ${v}`}><X size={11} /></button>
          </span>
        ))}
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { setTimeout(() => setOpen(false), 150); if (input.trim()) addChip(input); }}
          aria-label={label}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm focus:outline-none"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-10 top-full z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {suggestions.map((c, i) => (
            <li
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); addChip(c.email); }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? "bg-[#0F766E]/10" : "hover:bg-gray-50"}`}
            >
              <div className="font-medium text-gray-800">{c.displayName || c.email}</div>
              {c.displayName && <div className="text-xs text-gray-400">{c.email}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
