"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FolderUp, FileVideo, Loader2, CheckCircle2, AlertTriangle, Edit3,
  PauseCircle, RefreshCw, Trash2, Plus,
} from "lucide-react";
import {
  parseUploadStructure, uploadVideoToCloudinary, formatBytes,
  estimateUploadMinutes, formatDurationHours,
  type ParsedModule, type ParsedLesson, type UploadHandle,
} from "@/lib/bulk-upload";
import {
  getCloudinarySignature, createModule, createLesson,
  type CloudinarySignature,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

// Number of files uploading to Cloudinary at once. Higher than ~3
// tends to bottleneck on residential upstream and cap the per-file
// progress bars; lower wastes time on big batches.
const MAX_CONCURRENT_UPLOADS = 3;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  /** Called after the upload phase completes so the parent content
   *  manager can refetch its module/lesson list. */
  onUploaded: () => void;
}

type Phase = "select" | "preview" | "uploading" | "complete";

interface UploadState {
  /** PENDING | UPLOADING | DONE | FAILED — drives the row icon. */
  status: "PENDING" | "UPLOADING" | "DONE" | "FAILED";
  percent: number;
  videoUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
  handle: UploadHandle | null;
}

export function BulkUploadModal({ isOpen, onClose, courseId, onUploaded }: Props) {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("select");
  const [modules, setModules] = useState<ParsedModule[]>([]);
  const [skipped, setSkipped] = useState<{ filename: string; reason: string }[]>([]);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const [signature, setSignature] = useState<CloudinarySignature | null>(null);
  const [signatureError, setSignatureError] = useState("");

  // Reset all state when the modal closes — opening it again on a
  // different course should start clean.
  useEffect(() => {
    if (!isOpen) {
      setPhase("select");
      setModules([]);
      setSkipped([]);
      setUploadState({});
      setSignature(null);
      setSignatureError("");
    }
  }, [isOpen]);

  const allLessons = useMemo<ParsedLesson[]>(
    () => modules.flatMap((m) => m.lessons),
    [modules]
  );

  const totalBytes = useMemo(
    () => allLessons.reduce((s, l) => s + l.size, 0),
    [allLessons]
  );

  // Aggregate counters for the uploading-phase header.
  const uploadCounts = useMemo(() => {
    let done = 0, failed = 0, uploading = 0, pending = 0;
    for (const lesson of allLessons) {
      const st = uploadState[lesson.uid];
      if (!st) { pending += 1; continue; }
      if (st.status === "DONE") done += 1;
      else if (st.status === "FAILED") failed += 1;
      else if (st.status === "UPLOADING") uploading += 1;
      else pending += 1;
    }
    return { done, failed, uploading, pending, total: allLessons.length };
  }, [allLessons, uploadState]);

  // ── File picker handlers ─────────────────────────────────────

  const ingestFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const result = parseUploadStructure(files);
    if (result.modules.every((m) => m.lessons.length === 0)) {
      toast("error", "No video files found in that selection.");
      return;
    }
    setModules(result.modules);
    setSkipped(result.skipped);
    setPhase("preview");
  };

  // ── Preview-edit handlers ────────────────────────────────────

  const updateModuleTitle = (moduleUid: string, title: string) => {
    setModules((prev) => prev.map((m) =>
      m.uid === moduleUid ? { ...m, title } : m
    ));
  };

  const updateModuleOrder = (moduleUid: string, orderRaw: string) => {
    const next = parseInt(orderRaw, 10);
    if (!Number.isFinite(next)) return;
    setModules((prev) => prev.map((m) =>
      m.uid === moduleUid ? { ...m, orderIndex: next } : m
    ));
  };

  const updateLessonTitle = (moduleUid: string, lessonUid: string, title: string) => {
    setModules((prev) => prev.map((m) =>
      m.uid === moduleUid
        ? { ...m, lessons: m.lessons.map((l) => l.uid === lessonUid ? { ...l, title } : l) }
        : m
    ));
  };

  const updateLessonOrder = (moduleUid: string, lessonUid: string, orderRaw: string) => {
    const next = parseInt(orderRaw, 10);
    if (!Number.isFinite(next)) return;
    setModules((prev) => prev.map((m) =>
      m.uid === moduleUid
        ? { ...m, lessons: m.lessons.map((l) => l.uid === lessonUid ? { ...l, orderIndex: next } : l) }
        : m
    ));
  };

  const removeLesson = (moduleUid: string, lessonUid: string) => {
    setModules((prev) => prev
      .map((m) => m.uid === moduleUid
        ? { ...m, lessons: m.lessons.filter((l) => l.uid !== lessonUid) }
        : m)
      .filter((m) => m.lessons.length > 0));
  };

  // ── Upload orchestration ─────────────────────────────────────

  const cancelAllUploads = () => {
    for (const st of Object.values(uploadState)) {
      st.handle?.cancel();
    }
  };

  /**
   * Drives the upload pipeline: fetches a Cloudinary signature
   * once, then starts up to MAX_CONCURRENT_UPLOADS uploads at a
   * time. As each finishes, the next pending lesson is started.
   * After all lessons in a module are done (or failed), we create
   * the module on the backend then create lessons for the
   * successful uploads.
   */
  const startUpload = async () => {
    setPhase("uploading");
    setSignatureError("");

    let sig: CloudinarySignature;
    try {
      sig = await getCloudinarySignature();
      setSignature(sig);
    } catch (err) {
      setSignatureError(err instanceof Error ? err.message : "Couldn't get upload credentials");
      setPhase("preview");
      return;
    }

    // Seed pending state for every lesson so the rows render
    // immediately with "Waiting" indicators.
    const initial: Record<string, UploadState> = {};
    for (const lesson of allLessons) {
      initial[lesson.uid] = {
        status: "PENDING", percent: 0, videoUrl: null,
        durationSeconds: null, error: null, handle: null,
      };
    }
    setUploadState(initial);

    // Per-lesson upload coroutine. Resolves when the lesson is
    // either uploaded successfully or has failed (failures are
    // captured in state, not thrown — we keep the batch going).
    const uploadOne = async (lesson: ParsedLesson) => {
      const handle = uploadVideoToCloudinary(lesson.file, sig, (percent) => {
        setUploadState((prev) => ({
          ...prev,
          [lesson.uid]: { ...prev[lesson.uid], status: "UPLOADING", percent, handle },
        }));
      });
      setUploadState((prev) => ({
        ...prev,
        [lesson.uid]: { ...prev[lesson.uid], status: "UPLOADING", handle },
      }));
      try {
        const res = await handle.promise;
        setUploadState((prev) => ({
          ...prev,
          [lesson.uid]: {
            ...prev[lesson.uid],
            status: "DONE",
            percent: 100,
            videoUrl: res.secure_url,
            durationSeconds: res.duration ?? null,
            error: null,
            handle: null,
          },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadState((prev) => ({
          ...prev,
          [lesson.uid]: {
            ...prev[lesson.uid],
            status: "FAILED",
            error: message,
            handle: null,
          },
        }));
      }
    };

    // Worker pool: spin up MAX_CONCURRENT_UPLOADS workers, each
    // pulling the next pending lesson from a shared cursor.
    let cursor = 0;
    const lessons = allLessons;
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, lessons.length) },
      async () => {
        while (cursor < lessons.length) {
          const idx = cursor++;
          await uploadOne(lessons[idx]);
        }
      });
    await Promise.all(workers);

    // After uploads, create the modules + lessons via the existing
    // backend endpoints. We use the in-render uploadState — since
    // we just finished awaiting all workers, that state is current.
    // (We can't read React state directly here, so re-fetch by
    // closing over the latest values via setUploadState callback.)
    setUploadState((latestUploadState) => {
      void persistAll(latestUploadState);
      return latestUploadState;
    });
  };

  const persistAll = async (latest: Record<string, UploadState>) => {
    // Sort modules by their (possibly edited) orderIndex.
    const orderedModules = [...modules].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const module of orderedModules) {
      const successfulLessons = module.lessons.filter((l) => latest[l.uid]?.status === "DONE");
      if (successfulLessons.length === 0) continue;

      // Create the module first so we have its id for the lessons.
      let createdModuleId: number | null = null;
      try {
        const createdModule = await createModule(courseId, {
          title: module.title.trim() || module.folderName,
          description: undefined,
        }) as { id: number };
        createdModuleId = createdModule.id;
      } catch (err) {
        toast("error", `Couldn't create module "${module.title}": ${err instanceof Error ? err.message : "save failed"}`);
        continue;
      }

      for (const lesson of successfulLessons) {
        const st = latest[lesson.uid];
        if (!st?.videoUrl) continue;
        try {
          await createLesson(courseId, {
            title: lesson.title.trim() || lesson.filename,
            videoUrl: st.videoUrl,
            durationMinutes: st.durationSeconds != null
              ? Math.max(1, Math.ceil(st.durationSeconds / 60))
              : undefined,
            moduleId: createdModuleId,
          });
        } catch (err) {
          toast("error", `Couldn't create lesson "${lesson.title}": ${err instanceof Error ? err.message : "save failed"}`);
        }
      }
    }
    setPhase("complete");
    onUploaded();
  };

  const retryLesson = (lesson: ParsedLesson) => {
    if (!signature) return;
    const handle = uploadVideoToCloudinary(lesson.file, signature, (percent) => {
      setUploadState((prev) => ({
        ...prev,
        [lesson.uid]: { ...prev[lesson.uid], status: "UPLOADING", percent, handle },
      }));
    });
    setUploadState((prev) => ({
      ...prev,
      [lesson.uid]: { status: "UPLOADING", percent: 0, videoUrl: null, durationSeconds: null, error: null, handle },
    }));
    handle.promise
      .then((res) => {
        setUploadState((prev) => ({
          ...prev,
          [lesson.uid]: {
            ...prev[lesson.uid],
            status: "DONE",
            percent: 100,
            videoUrl: res.secure_url,
            durationSeconds: res.duration ?? null,
            error: null,
            handle: null,
          },
        }));
      })
      .catch((err: Error) => {
        setUploadState((prev) => ({
          ...prev,
          [lesson.uid]: {
            ...prev[lesson.uid],
            status: "FAILED",
            error: err.message,
            handle: null,
          },
        }));
      });
  };

  // ── Render guards ────────────────────────────────────────────

  if (!isOpen) return null;

  const totalDurationSeconds = allLessons.reduce(
    (s, l) => s + (uploadState[l.uid]?.durationSeconds ?? 0), 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/50 backdrop-blur-sm"
        onClick={phase === "uploading" ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-serif text-lg font-bold text-gray-900">
                {phase === "select" && "Bulk Upload Videos"}
                {phase === "preview" && "Bulk Upload — Preview"}
                {phase === "uploading" && `Uploading ${uploadCounts.total} videos…`}
                {phase === "complete" && "Upload Complete"}
              </h2>
              {phase === "preview" && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Edit titles + order before uploading. Only successful uploads create lessons.
                </p>
              )}
            </div>
            {phase !== "uploading" && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="p-6">
            {phase === "select" && (
              <SelectPhase
                onFiles={ingestFiles}
                signatureError={signatureError}
              />
            )}

            {phase === "preview" && (
              <PreviewPhase
                modules={modules}
                skipped={skipped}
                totalBytes={totalBytes}
                onUpdateModuleTitle={updateModuleTitle}
                onUpdateModuleOrder={updateModuleOrder}
                onUpdateLessonTitle={updateLessonTitle}
                onUpdateLessonOrder={updateLessonOrder}
                onRemoveLesson={removeLesson}
                onCancel={onClose}
                onStart={startUpload}
              />
            )}

            {phase === "uploading" && (
              <UploadingPhase
                modules={modules}
                uploadState={uploadState}
                counts={uploadCounts}
                onCancel={cancelAllUploads}
              />
            )}

            {phase === "complete" && (
              <CompletePhase
                modules={modules}
                uploadState={uploadState}
                totalDurationSeconds={totalDurationSeconds}
                onRetry={retryLesson}
                onClose={onClose}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Phase: Select ────────────────────────────────────────────────

interface SelectPhaseProps {
  onFiles: (files: FileList | null) => void;
  signatureError: string;
}

function SelectPhase({ onFiles, signatureError }: SelectPhaseProps) {
  // Refs live in this child so React 19's strict ref typing
  // (RefObject<T> vs RefObject<T|null>) doesn't have to cross a
  // component boundary. Both inputs are kept hidden — visible
  // buttons trigger them via .click().
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handle = (
    e: React.ChangeEvent<HTMLInputElement>,
    ref: React.RefObject<HTMLInputElement | null>,
  ) => {
    onFiles(e.target.files);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Upload an entire course at once. Organize your videos in folders and we&apos;ll
        create modules and lessons automatically.
      </p>

      <button
        type="button"
        onClick={() => folderInputRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#0F766E]/50 hover:bg-[#0F766E]/5 transition cursor-pointer"
      >
        <FolderUp size={32} className="text-gray-400" />
        <p className="text-sm font-semibold text-gray-700">Select a folder</p>
        <p className="text-[11px] text-gray-400">MP4, WebM, MOV — modules + lessons auto-created from your folder layout</p>
      </button>

      <div className="text-center my-3">
        <span className="text-xs text-gray-400">or</span>
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition text-sm font-medium text-gray-700 cursor-pointer"
      >
        <FileVideo size={16} /> Pick individual files
      </button>

      <div className="mt-5 bg-gray-50 rounded-lg p-4 text-xs text-gray-600">
        <p className="font-semibold mb-1">Tip — name your files like this:</p>
        <pre className="font-mono text-[11px] leading-relaxed text-gray-700">{`📁 Module 1 - Getting Started/
   📄 01 - Introduction.mp4
   📄 02 - Setup.mp4
📁 Module 2 - Advanced/
   📄 01 - State.mp4`}</pre>
      </div>

      {signatureError && (
        <p className="text-xs text-red-600 mt-3">{signatureError}</p>
      )}

      {/* Folder picker — webkitdirectory + directory are non-standard
          but supported by every browser we care about. React strips
          the attributes if the types complain, so we set them via
          ref-after-mount as a guard against future React typing
          changes (here we rely on the JSX extension + the ref). */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={(e) => handle(e, folderInputRef)}
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={(e) => handle(e, fileInputRef)}
        className="hidden"
      />
    </div>
  );
}

// ─── Phase: Preview ──────────────────────────────────────────────

interface PreviewPhaseProps {
  modules: ParsedModule[];
  skipped: { filename: string; reason: string }[];
  totalBytes: number;
  onUpdateModuleTitle: (moduleUid: string, title: string) => void;
  onUpdateModuleOrder: (moduleUid: string, order: string) => void;
  onUpdateLessonTitle: (moduleUid: string, lessonUid: string, title: string) => void;
  onUpdateLessonOrder: (moduleUid: string, lessonUid: string, order: string) => void;
  onRemoveLesson: (moduleUid: string, lessonUid: string) => void;
  onCancel: () => void;
  onStart: () => void;
}

function PreviewPhase({
  modules, skipped, totalBytes,
  onUpdateModuleTitle, onUpdateModuleOrder,
  onUpdateLessonTitle, onUpdateLessonOrder, onRemoveLesson,
  onCancel, onStart,
}: PreviewPhaseProps) {
  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);
  return (
    <div>
      <p className="text-sm text-gray-700 mb-4">
        We found <span className="font-semibold">{totalLessons}</span> video
        {totalLessons === 1 ? "" : "s"} in <span className="font-semibold">{modules.length}</span>{" "}
        folder{modules.length === 1 ? "" : "s"}.
      </p>

      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {modules.map((m) => (
          <div key={m.uid} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                value={m.orderIndex}
                onChange={(e) => onUpdateModuleOrder(m.uid, e.target.value)}
                className="w-12 px-2 py-1 rounded border border-gray-300 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
              />
              <input
                type="text"
                value={m.title}
                onChange={(e) => onUpdateModuleTitle(m.uid, e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-gray-300 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
              />
              <span className="text-[11px] text-gray-500 shrink-0">
                {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-1.5 pl-2">
              {m.lessons.map((l) => (
                <div key={l.uid} className="flex items-center gap-2">
                  <input
                    type="number"
                    value={l.orderIndex}
                    onChange={(e) => onUpdateLessonOrder(m.uid, l.uid, e.target.value)}
                    className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
                  />
                  <input
                    type="text"
                    value={l.title}
                    onChange={(e) => onUpdateLessonTitle(m.uid, l.uid, e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-gray-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
                  />
                  <span className="text-[10px] text-gray-400 shrink-0 w-16 text-right">{formatBytes(l.size)}</span>
                  <button
                    onClick={() => onRemoveLesson(m.uid, l.uid)}
                    className="p-1 text-gray-300 hover:text-red-500 transition cursor-pointer"
                    aria-label="Remove lesson"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {skipped.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold mb-1 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Skipped {skipped.length} non-video file{skipped.length === 1 ? "" : "s"}
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {skipped.slice(0, 5).map((s, i) => (
                <li key={i}>{s.filename}</li>
              ))}
              {skipped.length > 5 && <li>and {skipped.length - 5} more…</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
        Total: {totalLessons} video{totalLessons === 1 ? "" : "s"} · {formatBytes(totalBytes)} ·
        {" "}~{estimateUploadMinutes(totalBytes)} min upload
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={onStart}
          disabled={totalLessons === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-50 transition cursor-pointer"
        >
          <Plus size={14} /> Start Upload ({totalLessons} video{totalLessons === 1 ? "" : "s"})
        </button>
      </div>
    </div>
  );
}

// ─── Phase: Uploading ────────────────────────────────────────────

interface UploadingPhaseProps {
  modules: ParsedModule[];
  uploadState: Record<string, UploadState>;
  counts: { done: number; failed: number; uploading: number; pending: number; total: number };
  onCancel: () => void;
}

function UploadingPhase({ modules, uploadState, counts, onCancel }: UploadingPhaseProps) {
  const overallPercent = counts.total > 0 ? Math.round(((counts.done + counts.failed) / counts.total) * 100) : 0;
  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-gray-700 font-medium">
            Overall progress
          </span>
          <span className="font-semibold text-[#0F766E] tabular-nums">{counts.done}/{counts.total}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] transition-all"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {counts.uploading > 0 && `${counts.uploading} uploading · `}
          {counts.pending > 0 && `${counts.pending} waiting · `}
          {counts.failed > 0 && (
            <span className="text-red-600">{counts.failed} failed · </span>
          )}
          {counts.done > 0 && `${counts.done} done`}
        </p>
      </div>

      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {modules.map((m) => (
          <div key={m.uid}>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              {m.title}
            </p>
            <div className="space-y-1.5">
              {m.lessons.map((l) => {
                const st = uploadState[l.uid];
                return <LessonProgressRow key={l.uid} lesson={l} state={st} />;
              })}
            </div>
          </div>
        ))}
      </div>

      {counts.uploading > 0 || counts.pending > 0 ? (
        <div className="flex items-center justify-end mt-5">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition cursor-pointer"
          >
            <PauseCircle size={14} /> Cancel Remaining
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LessonProgressRow({ lesson, state }: { lesson: ParsedLesson; state: UploadState | undefined }) {
  const status = state?.status ?? "PENDING";
  const percent = state?.percent ?? 0;
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
      status === "DONE" && "bg-emerald-50 border-emerald-200",
      status === "FAILED" && "bg-red-50 border-red-200",
      status === "UPLOADING" && "bg-[#0F766E]/5 border-[#0F766E]/30",
      status === "PENDING" && "bg-gray-50 border-gray-200",
    )}>
      <div className="w-5 h-5 flex items-center justify-center shrink-0">
        {status === "DONE" && <CheckCircle2 size={14} className="text-emerald-600" />}
        {status === "FAILED" && <AlertTriangle size={14} className="text-red-600" />}
        {status === "UPLOADING" && <Loader2 size={14} className="animate-spin text-[#0F766E]" />}
        {status === "PENDING" && <Edit3 size={12} className="text-gray-400 opacity-40" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 truncate">{lesson.title}</p>
        <p className="text-[10px] text-gray-500 truncate">
          {formatBytes(lesson.size)}
          {state?.error && <span className="text-red-600"> · {state.error}</span>}
        </p>
      </div>
      <div className="w-16 text-right tabular-nums text-[11px] text-gray-700">
        {status === "DONE" && "Done"}
        {status === "FAILED" && "Failed"}
        {status === "UPLOADING" && `${percent}%`}
        {status === "PENDING" && "Waiting"}
      </div>
    </div>
  );
}

// ─── Phase: Complete ─────────────────────────────────────────────

interface CompletePhaseProps {
  modules: ParsedModule[];
  uploadState: Record<string, UploadState>;
  totalDurationSeconds: number;
  onRetry: (lesson: ParsedLesson) => void;
  onClose: () => void;
}

function CompletePhase({ modules, uploadState, totalDurationSeconds, onRetry, onClose }: CompletePhaseProps) {
  const allLessons = modules.flatMap((m) => m.lessons);
  const failed = allLessons.filter((l) => uploadState[l.uid]?.status === "FAILED");
  const successCount = allLessons.length - failed.length;

  return (
    <div>
      <div className="text-center mb-5">
        <CheckCircle2 size={42} className="mx-auto text-emerald-600 mb-2" />
        <p className="font-serif text-xl font-bold text-gray-900">
          {successCount} of {allLessons.length} video{allLessons.length === 1 ? "" : "s"} uploaded
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Created {modules.length} module{modules.length === 1 ? "" : "s"} · {formatDurationHours(totalDurationSeconds)} of content
        </p>
      </div>

      {failed.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} /> {failed.length} video{failed.length === 1 ? "" : "s"} failed to upload
          </p>
          <div className="space-y-2">
            {failed.map((l) => (
              <div key={l.uid} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-amber-900">{l.title}</span>
                <span className="text-amber-700 truncate">{uploadState[l.uid]?.error}</span>
                <button
                  onClick={() => onRetry(l)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 transition cursor-pointer"
                >
                  <RefreshCw size={11} /> Retry
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 mb-5">
        <p className="font-semibold text-gray-700 mb-2">What&apos;s next:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Review and edit lesson descriptions</li>
          <li>Add quizzes to your modules</li>
          <li>Publish your course when ready</li>
        </ul>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0F766E] text-white hover:bg-[#0D9488] transition cursor-pointer"
        >
          Go to Content Manager
        </button>
      </div>
    </div>
  );
}
