"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";

import { addToWishlist, getWishlist, removeFromWishlist } from "@/lib/api";

/**
 * Wishlist toggle button. Browse-allowed for every signed-in user
 * regardless of profile completion — the gate is only on enrollment.
 */
interface Props {
  courseId: number;
  /** Optional pre-seeded "is on wishlist" so the parent can avoid a fetch. */
  initialOn?: boolean;
  className?: string;
}

export default function WishlistButton({ courseId, initialOn, className }: Props) {
  const [on, setOn] = useState<boolean>(Boolean(initialOn));
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(typeof initialOn === "boolean");

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    getWishlist()
      .then((items) => {
        if (cancelled) return;
        setOn(items.some((i) => i.targetId === courseId && i.kind === "COURSE"));
      })
      .catch(() => { /* default to off */ })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, [courseId, hydrated]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next); // optimistic
    try {
      if (next) await addToWishlist(courseId);
      else await removeFromWishlist(courseId);
    } catch {
      setOn(!next); // rollback
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer " +
        (on
          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-700") +
        " disabled:opacity-60 disabled:cursor-not-allowed " +
        (className ?? "")
      }
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Heart size={12} fill={on ? "currentColor" : "none"} />
      )}
      {on ? "Wishlisted" : "Wishlist"}
    </button>
  );
}
