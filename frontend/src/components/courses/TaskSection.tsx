"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Lock, CheckCircle, Loader2, Code, Search, PenLine, Zap } from "lucide-react";
import { getLessonTasks, completeTask } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TaskData {
  id: number; title: string; description: string; instruction: string;
  type: string; orderIndex: number; unlocked: boolean; completed: boolean;
}

const TYPE_CONFIG: Record<string, { icon: typeof Code; color: string; label: string }> = {
  PRACTICE:   { icon: Code,     color: "bg-cyan-100 text-cyan-700",   label: "Practice" },
  RESEARCH:   { icon: Search,   color: "bg-blue-100 text-blue-700",   label: "Research" },
  REFLECTION: { icon: PenLine,  color: "bg-violet-100 text-violet-700", label: "Reflection" },
  CHALLENGE:  { icon: Zap,      color: "bg-amber-100 text-amber-700", label: "Challenge" },
};

interface TaskSectionProps {
  lessonId: number;
  isAuthenticated: boolean;
}

export function TaskSection({ lessonId, isAuthenticated }: TaskSectionProps) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    getLessonTasks(lessonId)
      .then((data) => setTasks(data ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [lessonId, isAuthenticated]);

  const handleComplete = async (taskId: number) => {
    setCompletingId(taskId);
    try {
      await completeTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, completed: true } : t));
    } catch {
      // silently fail
    } finally {
      setCompletingId(null);
    }
  };

  if (loading || tasks.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="bg-gradient-to-r from-cyan-50 to-teal-50 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-teal-600" />
          <h3 className="font-semibold text-gray-900">Learning Tasks</h3>
          <span className="text-xs text-gray-500 ml-auto">
            {tasks.filter((t) => t.completed).length}/{tasks.length} done
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {tasks.map((task, idx) => {
          const cfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.PRACTICE;
          const Icon = cfg.icon;

          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn("p-5", task.completed && "bg-teal-50/30")}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", cfg.color)}>
                  <Icon size={18} />
                </div>

                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm text-gray-900">{task.title}</h4>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", cfg.color)}>
                      {cfg.label}
                    </span>
                    {task.completed && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-600">DONE</span>
                    )}
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-xs text-gray-500 mb-2">{task.description}</p>
                  )}

                  {/* Instruction */}
                  {task.unlocked && task.instruction && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-700 leading-relaxed">
                      {task.instruction}
                    </div>
                  )}

                  {/* Locked message */}
                  {!task.unlocked && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Lock size={12} /> Complete the lesson to unlock this task
                    </p>
                  )}

                  {/* Complete button */}
                  {task.unlocked && !task.completed && (
                    <button
                      onClick={() => handleComplete(task.id)}
                      disabled={completingId === task.id}
                      className="mt-2 px-4 py-2 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D9488] transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {completingId === task.id ? (
                        <><Loader2 size={12} className="animate-spin" /> Completing...</>
                      ) : (
                        <><CheckCircle size={12} /> I Completed This Task</>
                      )}
                    </button>
                  )}

                  {/* Completed state */}
                  {task.completed && (
                    <p className="text-xs text-teal-600 font-medium mt-1 flex items-center gap-1">
                      <CheckCircle size={12} /> Task completed
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
