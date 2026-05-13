"use client";

import { useEffect, useState } from "react";

interface ProtectedOverlayProps {
  /** Shown on the watermarks; identifies who the playback session
   *  belongs to so leaked recordings can be traced. */
  userEmail?: string;
  userName?: string;
}

interface Position {
  x: number; // percent — top-left of the watermark within the player
  y: number;
  rotate: number;
}

const NUM_MOVING_WATERMARKS = 3;

function randomPos(): Position {
  return {
    x: Math.random() * 60 + 10, // 10–70%
    y: Math.random() * 60 + 10,
    rotate: Math.random() * 30 - 15, // -15 to +15 deg
  };
}

/**
 * Watermark + screenshot-deterrent overlay rendered on top of the
 * video element.
 *
 * Two layers of watermark, both pointer-events:none so they don't
 * interfere with click-to-play:
 *   1. A faint diagonal tiled pattern of {email} repeating across
 *      the whole video — almost invisible during normal playback,
 *      but persists if a recording is brightness-adjusted later.
 *   2. Three larger moving watermarks at random positions that
 *      change every 30 seconds. Multiple instances make it
 *      impossible to crop them all out without losing the video.
 */
export default function ProtectedOverlay({ userEmail, userName }: ProtectedOverlayProps) {
  const [positions, setPositions] = useState<Position[]>(() =>
    Array.from({ length: NUM_MOVING_WATERMARKS }, randomPos)
  );

  // Reposition every 30s — random enough that someone can't drop a
  // static black box over the watermark and call it a day.
  useEffect(() => {
    const id = setInterval(() => {
      setPositions((prev) => prev.map(() => randomPos()));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Compose the visible identifier. Falls back to email-only or
  // name-only if one is missing; renders nothing if neither is set
  // (e.g., admin preview mode where there's no real student).
  const ident = [userName, userEmail].filter(Boolean).join(" · ");

  return (
    <div
      className="absolute inset-0 z-20"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        pointerEvents: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-hidden="true"
    >
      {/* Tiled faint background pattern — survives crop/zoom because
          it's everywhere. Opacity is intentionally low (0.05) so it
          doesn't ruin the viewing experience. */}
      {ident && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div
            className="opacity-[0.05] text-white text-base font-semibold whitespace-nowrap"
            style={{ transform: "rotate(-25deg) scale(1.4)" }}
          >
            <div className="flex flex-col gap-12">
              {Array.from({ length: 8 }).map((_, row) => (
                <div key={row} className="flex gap-20">
                  {Array.from({ length: 5 }).map((_, col) => (
                    <span key={col}>{ident}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Three larger moving watermarks — these are the visible
          deterrent. Repositioning every 30s prevents cover-up tactics. */}
      {ident && positions.map((p, idx) => (
        <div
          key={idx}
          className="absolute font-mono whitespace-nowrap"
          style={{
            top: `${p.y}%`,
            left: `${p.x}%`,
            color: "rgba(255,255,255,0.12)",
            fontSize: "13px",
            transform: `rotate(${p.rotate}deg)`,
            transition: "all 1s ease",
          }}
        >
          {ident}
        </div>
      ))}
    </div>
  );
}
