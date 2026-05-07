// Helpers for the instructor bulk-video-upload flow.
//
// Two responsibilities live here:
//   1. parseUploadStructure() — reads webkitRelativePath off each
//      File and groups them into modules + lessons, parsing
//      number prefixes from filenames and folder names.
//   2. uploadVideoToCloudinary() — direct browser-to-Cloudinary
//      signed POST so files don't have to relay through our
//      Spring backend (which would cap out on 4MB-default
//      multipart memory and waste bandwidth).

import type { CloudinarySignature } from "@/lib/api";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogv"];

export interface ParsedLesson {
  /** Stable id for React keys + tracking through the upload pipeline. */
  uid: string;
  file: File;
  filename: string;
  /** Parsed lesson title (number prefix + extension stripped). */
  title: string;
  /** Order extracted from the filename prefix (e.g. "01") if present,
   *  otherwise the file's index inside its folder. */
  orderIndex: number;
  /** File size in bytes — surfaced in the preview. */
  size: number;
}

export interface ParsedModule {
  uid: string;
  /** Folder name as extracted from the relative path (or "Lessons"
   *  when the user picked individual files without a folder). */
  folderName: string;
  /** Cleaned-up display title (number prefix stripped). */
  title: string;
  /** Order from folder prefix or the order folders first appeared. */
  orderIndex: number;
  lessons: ParsedLesson[];
}

export interface ParseResult {
  modules: ParsedModule[];
  /** Files we ignored — non-video extensions. The UI surfaces these
   *  as "Skipped: {filename}" so the user knows what wasn't included. */
  skipped: { filename: string; reason: string }[];
}

const PREFIX_REGEX = /^(?:lesson\s+|module\s+|section\s+)?(\d+)[\s\-_.)]+(.+)$/i;

/**
 * Strips a numeric prefix off a name and returns { order, title }.
 * Falls back to { order: null, title } when no prefix is found —
 * the caller decides what to use as the order in that case.
 */
function splitPrefix(raw: string): { order: number | null; title: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(PREFIX_REGEX);
  if (match) {
    const order = parseInt(match[1], 10);
    const title = match[2].trim();
    return { order: Number.isFinite(order) ? order : null, title };
  }
  return { order: null, title: trimmed };
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function isVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  // Some browsers don't surface a useful extension for files dropped
  // from network shares — fall back to the MIME type.
  return (file.type ?? "").startsWith("video/");
}

interface FileWithPath {
  file: File;
  /** "Module 1 - Foo/01 - Bar.mp4" — relative to the dropped folder. */
  path: string;
}

function getRelativePath(file: File): string {
  // webkitRelativePath is set when the input has the
  // `webkitdirectory` attribute. For loose files (drag-and-drop
  // of individual videos) this is empty, so we fall back to the
  // bare filename — they end up in a single "Lessons" module.
  const wkit = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return (wkit && wkit.length > 0) ? wkit : file.name;
}

export function parseUploadStructure(files: FileList | File[]): ParseResult {
  const list: FileWithPath[] = [];
  const skipped: { filename: string; reason: string }[] = [];

  const fileArray = Array.from(files);
  for (const file of fileArray) {
    if (!isVideoFile(file)) {
      skipped.push({ filename: file.name, reason: "not a video file" });
      continue;
    }
    list.push({ file, path: getRelativePath(file) });
  }

  // Bucket files by their immediate parent folder. Anything with no
  // folder (path equals filename) goes into the "Lessons" bucket so
  // we always create at least one module per upload.
  const buckets = new Map<string, FileWithPath[]>();
  const folderOrder: string[] = [];

  for (const item of list) {
    const segments = item.path.split("/");
    let folder: string;
    if (segments.length <= 1) {
      folder = "Lessons";
    } else {
      // Use the top-level folder. Nested deeper folders get flattened
      // into the same module — keeps the data model simple.
      folder = segments[0];
    }
    if (!buckets.has(folder)) {
      buckets.set(folder, []);
      folderOrder.push(folder);
    }
    buckets.get(folder)!.push(item);
  }

  const modules: ParsedModule[] = folderOrder.map((folder, folderIdx) => {
    const split = splitPrefix(folder);
    const moduleOrder = split.order ?? (folderIdx + 1);
    const items = buckets.get(folder)!;

    const parsedLessons: ParsedLesson[] = items.map((item, lessonIdx) => {
      const baseName = stripExtension(item.file.name);
      const lessonSplit = splitPrefix(baseName);
      const lessonOrder = lessonSplit.order ?? (lessonIdx + 1);
      return {
        uid: `${folder}/${item.file.name}/${lessonIdx}`,
        file: item.file,
        filename: item.file.name,
        title: lessonSplit.title || baseName,
        orderIndex: lessonOrder,
        size: item.file.size,
      };
    });

    // Sort lessons by parsed orderIndex so a folder of "03 - X / 01 - Y"
    // shows up in the right order in the preview.
    parsedLessons.sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      uid: folder,
      folderName: folder,
      title: split.title || folder,
      orderIndex: moduleOrder,
      lessons: parsedLessons,
    };
  });

  modules.sort((a, b) => a.orderIndex - b.orderIndex);
  return { modules, skipped };
}

// ─── Cloudinary direct upload ────────────────────────────────────

export interface CloudinaryUploadResult {
  secure_url: string;
  duration?: number; // seconds
  bytes?: number;
  format?: string;
  public_id?: string;
}

export interface UploadHandle {
  promise: Promise<CloudinaryUploadResult>;
  cancel: () => void;
}

/**
 * Direct browser → Cloudinary signed video upload. Returns an
 * {@link UploadHandle} so the caller can wire onProgress and
 * abort support without juggling raw XHR.
 */
export function uploadVideoToCloudinary(
  file: File,
  signature: CloudinarySignature,
  onProgress?: (percent: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signature.apiKey);
    form.append("timestamp", String(signature.timestamp));
    form.append("folder", signature.folder);
    form.append("signature", signature.signature);

    const url = `https://api.cloudinary.com/v1_1/${signature.cloudName}/video/upload`;
    xhr.open("POST", url);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Cloudinary returned an unparseable response"));
        }
      } else {
        let message = `Cloudinary upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) message = body.error.message;
        } catch { /* keep default */ }
        reject(new Error(message));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.send(form);
  });

  return { promise, cancel: () => xhr.abort() };
}

// ─── Misc presentation helpers ───────────────────────────────────

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Estimates upload time given total bytes, assuming a conservative
 * 5 Mbps upload rate. Used only for a rough "~X minutes" hint.
 */
export function estimateUploadMinutes(totalBytes: number): number {
  const bitsPerSecond = 5 * 1024 * 1024; // 5 Mbps
  const seconds = (totalBytes * 8) / bitsPerSecond;
  return Math.max(1, Math.round(seconds / 60));
}

export function formatDurationHours(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
