// =====================================================
// Leadflow Vloom - useTasks Hook
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/types/database';
import type { LeadStatus } from '@/types/database';

/** Task with lead data for board cards */
export interface TaskWithLead extends Task {
  leads: {
    job_url: string | null;
    company_name: string | null;
    company_linkedin_url: string | null;
    company_funding: string | null;
    job_posted_at: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_linkedin_url: string | null;
    status: LeadStatus | null;
    budget: number | null;
    assignee: string | null;
  } | null;
}

export interface CreateTaskInput {
  leadId: string;
  title: string;
  taskType?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
}

interface UseTasksReturn {
  tasks: TaskWithLead[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  updateTaskTitle: (id: string, title: string) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

interface UseTasksOptions {
  /** When false, skip the initial all-tasks fetch (CRM opens faster). */
  enabled?: boolean;
}

/**
 * Tasks board + lead-card task lists.
 * Presets are created from Tasks tab; nurturing creates monthly follow-ups.
 */
export function useTasks(options: UseTasksOptions = {}): UseTasksReturn {
  const { enabled = true } = options;
  const [tasks, setTasks] = useState<TaskWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!supabase) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    const { data, error: fetchErr } = await supabase
      .from('tasks')
      .select(
        '*, leads(job_url, company_name, company_linkedin_url, company_funding, job_posted_at, contact_name, contact_email, contact_linkedin_url, status, budget, assignee)',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (fetchErr) {
      setError(fetchErr.message);
      setTasks([]);
    } else {
      setTasks((data as TaskWithLead[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    fetchTasks();
  }, [enabled, fetchTasks]);

  const updateTaskStatus = useCallback(async (id: string, status: TaskStatus) => {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq('id', id);

    if (updateError) throw updateError;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? ({ ...t, status, updated_at: new Date().toISOString() } as TaskWithLead) : t,
      ),
    );
  }, []);

  const updateTaskTitle = useCallback(async (id: string, title: string) => {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ title, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (updateError) throw updateError;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? ({ ...t, title, updated_at: new Date().toISOString() } as TaskWithLead) : t,
      ),
    );
  }, []);

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error: insertErr } = await supabase.from('tasks').insert({
        user_id: user.id,
        lead_id: input.leadId,
        title: input.title,
        status: input.status ?? 'backlog',
        task_type: input.taskType ?? null,
        due_at: input.dueAt ?? null,
      } as never);
      if (insertErr) throw insertErr;
      await fetchTasks();
    },
    [fetchTasks],
  );

  const deleteTask = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id);
    if (deleteError) throw deleteError;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    tasks,
    isLoading,
    error,
    refreshTasks: fetchTasks,
    updateTaskStatus,
    updateTaskTitle,
    createTask,
    deleteTask,
  };
}
