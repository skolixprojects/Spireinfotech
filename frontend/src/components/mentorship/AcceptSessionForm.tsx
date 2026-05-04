"use client";

import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { acceptSessionRequest } from "@/lib/api";
import type { SessionRequest } from "@/lib/types";

interface AcceptSessionFormProps {
  sessionId: number;
  onAccepted: (updated: SessionRequest) => void;
  onCancel: () => void;
}

export function AcceptSessionForm({ sessionId, onAccepted, onCancel }: AcceptSessionFormProps) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt || !meetingUrl.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      // datetime-local gives "YYYY-MM-DDTHH:mm" — backend's LocalDateTime parses this directly
      const updated = await acceptSessionRequest(sessionId, scheduledAt, meetingUrl.trim());
      onAccepted(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleConfirm}
      className="mt-3 pt-3 border-t border-gray-100 space-y-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            When?
          </label>
          <input
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Meeting link
          </label>
          <input
            type="url"
            required
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="Paste your Zoom or Google Meet link"
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <X size={12} /> Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !scheduledAt || !meetingUrl.trim()}
          className="px-3 py-1.5 rounded-lg bg-[#0E6B6B] text-white text-xs font-semibold hover:bg-[#5FA3A3] disabled:opacity-50 inline-flex items-center gap-1"
        >
          {submitting ? (
            <><Loader2 size={12} className="animate-spin" /> Confirming…</>
          ) : (
            <><Check size={12} /> Confirm</>
          )}
        </button>
      </div>
    </form>
  );
}
