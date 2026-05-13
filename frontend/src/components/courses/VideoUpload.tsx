"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Loader2, CheckCircle, Film } from "lucide-react";
import { uploadLessonVideo } from "@/lib/api";

interface VideoUploadProps {
  lessonId: number;
  currentVideoUrl?: string | null;
  onUploadComplete?: (videoUrl: string) => void;
}

export function VideoUpload({ lessonId, currentVideoUrl, onUploadComplete }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [videoUrl, setVideoUrl] = useState(currentVideoUrl || "");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Only video files are allowed");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError("File size must be under 500MB");
      return;
    }

    setUploading(true);
    setError("");
    setProgress("Uploading to cloud...");

    try {
      const result = await uploadLessonVideo(lessonId, file);
      setVideoUrl(result.videoUrl);
      setProgress("");
      onUploadComplete?.(result.videoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-3 p-4 rounded-xl border border-dashed border-gray-300 bg-gray-50">
      {videoUrl ? (
        <div>
          <video src={videoUrl} controls className="w-full rounded-lg mb-3 max-h-64" />
          <div className="flex items-center gap-2 text-xs text-teal-600">
            <CheckCircle size={14} /> Video uploaded
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Replace video
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center gap-2 py-6 text-gray-400 hover:text-gray-600 transition"
        >
          {uploading ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              <span className="text-xs">{progress || "Uploading..."}</span>
            </>
          ) : (
            <>
              <Film size={24} />
              <span className="text-xs font-medium">Click to upload video</span>
              <span className="text-[10px]">MP4, MOV, WebM — max 500MB</span>
            </>
          )}
        </button>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
