"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import ProtectedOverlay from "./ProtectedOverlay";

interface SecureVideoPlayerProps {
  videoUrl: string;
  /** Periodic position-save callback — fires every 10s while playing. */
  onProgress?: (position: number, duration: number) => void;
  /** Fired when the video reaches the end. Used by /learn to mark
   *  the lesson complete + auto-advance. */
  onEnded?: () => void;
  /** Resume position when the player mounts. */
  initialPosition?: number;
  /** Auto-play when the source loads. /learn relies on this so a
   *  student lands on a lesson and starts watching immediately. */
  autoPlay?: boolean;
  userEmail?: string;
  userName?: string;
}

/**
 * Single source of truth for protected video playback.
 *
 * Layers:
 *   - Right-click suppressed on the container.
 *   - Native controls hidden; underlying <video> still tagged with
 *     controlsList="nodownload noplaybackrate" + disablePictureInPicture.
 *   - Keyboard blocker for Save / Print / View-source / DevTools shortcuts.
 *   - DevTools detection via outerWidth-innerWidth diff (≥160px).
 *     Triggering it blacks the video out and pauses playback.
 *   - Tab/window blur applies a CSS blur filter so OBS-style
 *     full-desktop recorders capture a smear instead of the video.
 *   - Watermark overlay (tiled + 3 moving instances) burns the
 *     student's email + name into the visible frame.
 */
export default function SecureVideoPlayer({
  videoUrl,
  onProgress,
  onEnded,
  initialPosition = 0,
  autoPlay = false,
  userEmail,
  userName,
}: SecureVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const sessionStart = useRef(Date.now());

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBlacked, setIsBlacked] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Helpers ─────────────────────────────────────────────────────

  const flashWarning = useCallback((message: string) => {
    setWarning(message);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(null), 3000);
  }, []);

  // ── Session token expiry (2 hours) ─────────────────────────────
  const SESSION_MAX_MS = 2 * 60 * 60 * 1000;
  useEffect(() => {
    const check = setInterval(() => {
      if (Date.now() - sessionStart.current > SESSION_MAX_MS) {
        videoRef.current?.pause();
        flashWarning("Session expired — please reload to continue.");
        clearInterval(check);
      }
    }, 60_000);
    return () => clearInterval(check);
  }, [flashWarning]);

  // ── Resume from last position ──────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !initialPosition) return;
    const onReady = () => {
      video.currentTime = initialPosition;
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    return () => video.removeEventListener("loadedmetadata", onReady);
  }, [initialPosition]);

  // ── Auto-play when source loads ────────────────────────────────
  useEffect(() => {
    if (!autoPlay) return;
    const video = videoRef.current;
    if (!video) return;
    const onReady = () => {
      // Browsers reject .play() if the user hasn't interacted yet.
      // We swallow that — the play button still works.
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    return () => video.removeEventListener("loadedmetadata", onReady);
  }, [autoPlay, videoUrl]);

  // ── Progress tracking (every 10s) ─────────────────────────────
  useEffect(() => {
    progressTimer.current = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && onProgress) {
        onProgress(v.currentTime, v.duration);
      }
    }, 10_000);
    return () => clearInterval(progressTimer.current);
  }, [onProgress]);

  // ── Keyboard shortcut blocker ──────────────────────────────────
  // Listed only — we can't actually prevent PrintScreen at the OS
  // level (the screen is captured before our handler runs), but
  // surfacing the warning still has a deterrent effect.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        flashWarning("Screen capture is not allowed for this content.");
        return;
      }
      if (e.key === "F12") {
        e.preventDefault();
        flashWarning("Developer tools are blocked during playback.");
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      // Save, Print, View-source — silently swallow.
      if (e.key === "s" || e.key === "S" || e.key === "p" || e.key === "P" || e.key === "u" || e.key === "U") {
        e.preventDefault();
        flashWarning("That shortcut is disabled during playback.");
        return;
      }
      // DevTools combos.
      if (e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) {
        e.preventDefault();
        flashWarning("Developer tools are blocked during playback.");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flashWarning]);

  // ── DevTools detection (window-dimension trick) ────────────────
  // Generates false positives on small viewports / docked DevTools.
  // Threshold tuned to 160px which is roughly the smallest DevTools
  // panel — anything below that and the dimensions still match.
  useEffect(() => {
    const detectDevTools = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if (widthDiff || heightDiff) {
        setIsBlacked(true);
        videoRef.current?.pause();
      }
    };
    window.addEventListener("resize", detectDevTools);
    detectDevTools();
    return () => window.removeEventListener("resize", detectDevTools);
  }, []);

  // ── Tab-switch blur + pause ────────────────────────────────────
  // OBS-style desktop recorders capture every visible window. By
  // blurring the video when the user switches away, the recording
  // gets smeared frames during alt-tabs. We also pause playback so
  // they can't keep listening to audio either.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setIsBlurred(true);
        videoRef.current?.pause();
      } else {
        setIsBlurred(false);
      }
    };
    const onBlur = () => setIsBlurred(true);
    const onFocus = () => setIsBlurred(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ── Controls auto-hide ─────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  // ── Player actions ─────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setVolume(val);
      setIsMuted(val === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleResumeFromBlackout = () => {
    // Re-run the same threshold check — if DevTools is still open,
    // flip the flag right back on. If it's been closed, the video
    // resumes playback.
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      flashWarning("Developer tools still detected. Close them to continue.");
      return;
    }
    setIsBlacked(false);
    videoRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const formatTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden select-none group"
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={resetHideTimer}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* DevTools / recording detection blackout. Sits above the
          video but below the warning toast so the resume button is
          still tappable. */}
      {isBlacked && (
        <div className="absolute inset-0 z-40 bg-black flex items-center justify-center px-6">
          <div className="text-center text-white max-w-sm">
            <ShieldAlert size={42} className="mx-auto mb-3 text-amber-400" />
            <h3 className="font-semibold text-lg mb-2">Screen recording detected</h3>
            <p className="text-sm text-white/80 mb-4">
              Playback has been paused. Close any developer tools or screen
              recording software to continue. This content is protected;
              unauthorized recording is prohibited.
            </p>
            <button
              onClick={handleResumeFromBlackout}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold transition cursor-pointer"
            >
              Resume Playback
            </button>
          </div>
        </div>
      )}

      {/* Video element. The CSS filter blurs frames when the tab
          loses focus — the audio keeps going so users notice. */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain transition-[filter] duration-200"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        playsInline
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onClick={togglePlay}
        style={{
          filter: isBlurred ? "blur(20px)" : "none",
          // userSelect prevents long-press save on mobile.
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />

      {/* Watermark + screenshot block layer */}
      <ProtectedOverlay userEmail={userEmail} userName={userName} />

      {/* Brief warning toast for keyboard-blocked actions. */}
      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/95 text-white text-xs font-semibold shadow-lg"
            role="status"
            aria-live="polite"
          >
            <AlertTriangle size={12} />
            {warning}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Controls */}
      <AnimatePresence>
        {showControls && !isBlacked && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10"
          >
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 mb-2 cursor-pointer accent-[#00C896] appearance-none
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00C896]
                         [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full
                         [&::-webkit-slider-runnable-track]:bg-white/30"
              style={{ pointerEvents: "auto" }}
            />

            <div className="flex items-center justify-between text-white text-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="hover:text-[#00C896] transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                  onClick={toggleMute}
                  className="hover:text-[#00C896] transition-colors"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 accent-[#00C896] cursor-pointer"
                  style={{ pointerEvents: "auto" }}
                  aria-label="Volume"
                />

                <span className="font-mono text-xs">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <button
                onClick={toggleFullscreen}
                className="hover:text-[#00C896] transition-colors"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
