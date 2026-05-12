"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CheckCircle2, ClipboardList, Loader2, MessageSquare,
  PenLine, Plus, Settings, Users,
} from "lucide-react";

import { RoleDashboardShell, type RoleDashboardTab }
  from "@/components/dashboard/RoleDashboardShell";
import { useAuth } from "@/lib/auth-context";
import {
  createCoachFeedback, createCoachSession, createCoachTask,
  getCoachParticipants, listCoachFeedback, listCoachSessions, listCoachTasks,
  updateCoachTaskStatus,
  type CoachParticipantRow, type CoachingFeedbackDTO,
  type CoachingSessionDTO, type CoachingTaskDTO,
} from "@/lib/api";

/**
 * Phase 5B — Coach / Technical Advisor dashboard. Five tabs:
 *
 *   home      — assigned participants table + per-participant drawer
 *   sessions  — list + add session notes
 *   tasks     — assign / track practice tasks
 *   feedback  — submit qualitative feedback
 *   profile   — link to /profile
 *
 * Per PRD §13, this dashboard never surfaces identity documents,
 * SSN, check images, or finance data. The backend service refuses
 * cross-participant lookups so a coach can't read data for someone
 * not on their assignment list.
 */

type TabId = "home" | "sessions" | "tasks" | "feedback" | "profile";

const TABS: ReadonlyArray<RoleDashboardTab> = [
  { id: "home",     label: "My Participants", Icon: Users },
  { id: "sessions", label: "Session Notes",   Icon: PenLine },
  { id: "tasks",    label: "Tasks",           Icon: ClipboardList },
  { id: "feedback", label: "Feedback",        Icon: MessageSquare },
  { id: "profile",  label: "Profile",         Icon: Settings },
];

export default function CoachDashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [active, setActive] = useState<TabId>("home");
  const [participants, setParticipants] = useState<CoachParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    const role = (user.role ?? "").toUpperCase();
    if (role !== "COACH" && role !== "TECHNICAL_ADVISOR") {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    getCoachParticipants()
      .then((p) => { if (!cancelled) setParticipants(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load participants"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoading, user, router]);

  if (isLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 size={28} className="animate-spin text-[#0F766E]" />
    </div>;
  }

  return (
    <RoleDashboardShell title="Coach Panel" tabs={TABS}
      active={active} onSelect={(id) => setActive(id as TabId)}
    >
      {error && (
        <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {active === "home" && <ParticipantsTab participants={participants} />}
      {active === "sessions" && <SessionsTab participants={participants} />}
      {active === "tasks" && <TasksTab participants={participants} />}
      {active === "feedback" && <FeedbackTab participants={participants} />}
      {active === "profile" && (
        <div className="space-y-3">
          <h1 className="font-serif text-2xl font-bold text-gray-900">Profile</h1>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-6">
            <p className="text-sm text-gray-700">Edit your coach profile from the standard profile page.</p>
            <a href="/profile" className="mt-3 inline-block text-sm font-semibold text-[#0F766E] hover:underline">
              Open profile →
            </a>
          </div>
        </div>
      )}
    </RoleDashboardShell>
  );
}

/* ── Participants tab ────────────────────────────────────────── */

function ParticipantsTab({ participants }: { participants: CoachParticipantRow[] }) {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">My participants</h1>
      <p className="text-sm text-gray-500">
        Participants currently on your coaching list. Use the other
        tabs to log session notes, assign tasks, and record feedback.
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Technology</th>
              <th className="text-left px-4 py-2">Target role</th>
              <th className="text-left px-4 py-2">Program</th>
              <th className="text-left px-4 py-2">Phase</th>
              <th className="text-left px-4 py-2">Coach role</th>
              <th className="text-left px-4 py-2">Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {participants.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 italic">
                No participants assigned yet.
              </td></tr>
            ) : participants.map((p) => (
              <tr key={p.userId}>
                <td className="px-4 py-2 font-medium text-gray-900">{p.fullName ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.technology ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.targetJobTitle ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.program ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.phase ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.coachRole ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Sessions tab ────────────────────────────────────────────── */

function SessionsTab({ participants }: { participants: CoachParticipantRow[] }) {
  const [sessions, setSessions] = useState<CoachingSessionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantId, setParticipantId] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCoachSessions()
      .then((s) => { if (!cancelled) setSessions(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (!participantId) return;
    setSaving(true);
    try {
      await createCoachSession({
        participantUserId: Number(participantId),
        sessionDate: date || null,
        topic: topic || null,
        notes: notes || null,
        nextSteps: nextSteps || null,
        durationMinutes: duration ? Number(duration) : null,
      });
      setSessions(await listCoachSessions());
      setTopic(""); setNotes(""); setNextSteps(""); setDuration("");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Session notes</h1>
      <CoachForm
        participantId={participantId}
        onParticipant={setParticipantId}
        participants={participants}
        submitLabel={saving ? "Saving…" : "Log session"}
        saving={saving}
        onSubmit={handleSubmit}
      >
        <FormRow>
          <Field label="Date" type="date" value={date} onChange={setDate} />
          <Field label="Duration (min)" type="number" value={duration} onChange={setDuration} />
          <Field label="Topic" value={topic} onChange={setTopic} />
        </FormRow>
        <Field label="Notes" type="textarea" value={notes} onChange={setNotes} rows={3} />
        <Field label="Next steps" type="textarea" value={nextSteps} onChange={setNextSteps} rows={2} />
      </CoachForm>

      <RecordsList items={sessions} empty="No sessions yet."
        renderRow={(s) => (
          <>
            <span className="font-mono text-xs text-gray-700 w-32 shrink-0">
              {s.sessionDate ?? (s.createdAt ? s.createdAt.slice(0, 10) : "—")}
            </span>
            <span className="font-medium text-gray-900 truncate">{s.topic || "(no topic)"}</span>
            <span className="text-xs text-gray-500 ml-auto truncate">
              {s.notes?.slice(0, 80) ?? ""}
            </span>
          </>
        )} />
    </div>
  );
}

/* ── Tasks tab ───────────────────────────────────────────────── */

function TasksTab({ participants }: { participants: CoachParticipantRow[] }) {
  const [tasks, setTasks] = useState<CoachingTaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantId, setParticipantId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCoachTasks()
      .then((t) => { if (!cancelled) setTasks(t); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (!participantId || !title.trim()) return;
    setSaving(true);
    try {
      await createCoachTask({
        participantUserId: Number(participantId),
        title: title.trim(),
        description: desc || null,
        dueDate: due || null,
      });
      setTasks(await listCoachTasks());
      setTitle(""); setDesc(""); setDue("");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (t: CoachingTaskDTO) => {
    if (!t.id) return;
    const next = t.status === "DONE" ? "OPEN" : "DONE";
    await updateCoachTaskStatus(t.id, next);
    setTasks(await listCoachTasks());
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Practice tasks</h1>
      <CoachForm
        participantId={participantId}
        onParticipant={setParticipantId}
        participants={participants}
        submitLabel={saving ? "Saving…" : "Assign task"}
        saving={saving}
        onSubmit={handleSubmit}
      >
        <FormRow>
          <Field label="Title" value={title} onChange={setTitle} />
          <Field label="Due date" type="date" value={due} onChange={setDue} />
        </FormRow>
        <Field label="Description" type="textarea" value={desc} onChange={setDesc} rows={2} />
      </CoachForm>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-100">
        {tasks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400 italic">No tasks yet.</p>
        ) : tasks.map((t) => (
          <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
            <button type="button" onClick={() => toggleStatus(t)}
              className={
                "shrink-0 w-4 h-4 rounded border flex items-center justify-center cursor-pointer "
                + (t.status === "DONE"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-gray-300 bg-white")
              }>
              {t.status === "DONE" && <CheckCircle2 size={11} />}
            </button>
            <span className={t.status === "DONE" ? "line-through text-gray-400" : "font-medium text-gray-900"}>
              {t.title}
            </span>
            {t.dueDate && <span className="font-mono text-xs text-gray-500">due {t.dueDate}</span>}
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
              {t.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Feedback tab ────────────────────────────────────────────── */

const FEEDBACK_TYPES = ["GENERAL", "SESSION", "RESUME", "TECHNICAL", "INTERVIEW"] as const;

function FeedbackTab({ participants }: { participants: CoachParticipantRow[] }) {
  const [items, setItems] = useState<CoachingFeedbackDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantId, setParticipantId] = useState<number | "">("");
  const [type, setType] = useState<string>("GENERAL");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCoachFeedback()
      .then((f) => { if (!cancelled) setItems(f); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (!participantId || !content.trim()) return;
    setSaving(true);
    try {
      await createCoachFeedback({
        participantUserId: Number(participantId),
        feedbackType: type,
        content: content.trim(),
        rating: rating ? Number(rating) : null,
      });
      setItems(await listCoachFeedback());
      setContent(""); setRating("");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-bold text-gray-900">Feedback</h1>
      <CoachForm
        participantId={participantId}
        onParticipant={setParticipantId}
        participants={participants}
        submitLabel={saving ? "Saving…" : "Add feedback"}
        saving={saving}
        onSubmit={handleSubmit}
      >
        <FormRow>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200">
              {FEEDBACK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Field label="Rating (1-5)" type="number" value={rating} onChange={setRating} />
        </FormRow>
        <Field label="Feedback" type="textarea" value={content} onChange={setContent} rows={3} />
      </CoachForm>

      <RecordsList items={items} empty="No feedback recorded yet."
        renderRow={(f) => (
          <>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 w-24 shrink-0 text-center">
              {f.feedbackType}
            </span>
            <span className="font-medium text-gray-900 truncate">{f.content}</span>
            {f.rating && <span className="text-xs text-amber-600 font-bold ml-auto">★ {f.rating}/5</span>}
          </>
        )} />
    </div>
  );
}

/* ── Shared form / list bits ────────────────────────────────── */

function CoachForm({ participantId, onParticipant, participants, submitLabel, saving, onSubmit, children }: {
  participantId: number | "";
  onParticipant: (v: number | "") => void;
  participants: CoachParticipantRow[];
  submitLabel: string;
  saving: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Participant</label>
        <select value={participantId}
          onChange={(e) => onParticipant(e.target.value ? Number(e.target.value) : "")}
          className="w-full px-3 py-2 text-sm rounded-md border border-gray-200">
          <option value="">— Pick one —</option>
          {participants.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.fullName ?? "—"} ({p.technology ?? "—"})
            </option>
          ))}
        </select>
      </div>
      {children}
      <div className="flex justify-end">
        <button type="button" onClick={onSubmit} disabled={saving || !participantId}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D9488] disabled:opacity-60 cursor-pointer">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{children}</div>;
}

function Field({ label, type = "text", value, onChange, rows }: {
  label: string;
  type?: "text" | "date" | "number" | "textarea";
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{label}</label>
      {type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows ?? 3}
          className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]" />
      )}
    </div>
  );
}

function RecordsList<T>({ items, empty, renderRow }: {
  items: T[];
  empty: string;
  renderRow: (t: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-100">
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400 italic">{empty}</p>
      ) : items.map((it, idx) => (
        <div key={idx} className="px-4 py-2.5 flex items-center gap-3 text-sm">{renderRow(it)}</div>
      ))}
    </div>
  );
}

function Loading() {
  return <div className="text-center py-10"><Loader2 size={20} className="animate-spin text-[#0F766E] inline" /></div>;
}
