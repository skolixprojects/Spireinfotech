"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  enrollAllFromWishlist,
  getWishlist,
  removeFromWishlist,
  WishlistItem,
} from "@/lib/api";

/**
 * Sidebar "My Wishlist" tab. Lists every course the user has
 * favourited; "Enroll all" is enabled only when the profile is 100%
 * complete (the backend enforces the same — this is just the UX hint).
 */
interface Props {
  /** Switches to the Complete Profile tab if the user clicks "Finish profile". */
  onContinueSetup?: () => void;
}

export default function WishlistTab({ onContinueSetup }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    try {
      const res = await getWishlist();
      setItems(res);
    } catch (err) {
      // Never surface raw backend codes — apiFetch already
      // translates most of them, but the gating literals
      // ("PROFILE_INCOMPLETE", "AGREEMENT_REQUIRED") slip through
      // intentionally. Render the wishlist as empty in those cases
      // rather than a red error banner.
      const raw = err instanceof Error ? err.message : "";
      if (raw === "PROFILE_INCOMPLETE" || raw === "AGREEMENT_REQUIRED") {
        setItems([]);
        return;
      }
      setError("We couldn't load your wishlist. Please try again.");
    }
  };

  useEffect(() => { void reload(); }, []);

  const handleRemove = async (courseId: number) => {
    try {
      await removeFromWishlist(courseId);
      setItems((prev) => prev?.filter((i) => i.targetId !== courseId) ?? null);
    } catch {
      /* ignore */
    }
  };

  const handleEnrollAll = async () => {
    if (!user?.profileComplete) {
      onContinueSetup?.();
      return;
    }
    setBusy(true);
    try {
      const res = await enrollAllFromWishlist();
      if (res.success) {
        await reload();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      if (raw === "PROFILE_INCOMPLETE") {
        onContinueSetup?.();
        return;
      }
      setError("We couldn't enroll right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (items === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 size={24} className="animate-spin text-[#0F766E]" />
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Heart size={20} className="text-rose-500" /> My Wishlist
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {items.length === 0
              ? "Nothing saved yet — browse courses and tap the heart icon."
              : `${items.length} course${items.length === 1 ? "" : "s"} saved for later.`}
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleEnrollAll}
            disabled={busy}
            className={
              "inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed " +
              (user?.profileComplete
                ? "bg-[#0F766E] hover:bg-[#0D9488] text-white"
                : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200")
            }
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {user?.profileComplete ? "Enroll all" : "Finish profile to enroll"}
          </button>
        )}
      </header>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <Link
          href="/courses"
          className="block py-12 text-center border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
        >
          Browse courses →
        </Link>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="border border-gray-200 rounded-xl p-3 bg-white flex gap-3 items-start"
            >
              {item.thumbnailUrl ? (
                <Image
                  src={item.thumbnailUrl}
                  alt={item.title}
                  width={64}
                  height={64}
                  className="rounded-lg object-cover w-16 h-16 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 line-clamp-2">{item.title}</p>
                {item.price != null && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    ₹{Number(item.price).toFixed(0)}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={`/courses/${item.targetId}`}
                    className="text-xs text-[#0F766E] hover:text-[#0D9488] font-semibold"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.targetId)}
                    className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
