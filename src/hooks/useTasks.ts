// =====================================================
// Leadflow Vloom - useTasks Hook
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/types/database';
import type { LeadStatus } from '@/types/database';

/** Task with lead data for table columns (company, contact, CRM status) */
export interface TaskWithLead extends Task {
  leads: {
    job_url: string | null;
    company_name: string | null;
    company_linkedin_url: string | null;
    company_funding: string | null;
    job_posted_at: string | null;
    contact_name: string | null;
    status: LeadStatus | null;
  } | null;
}

interface UseTasksReturn {
  tasks: TaskWithLead[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  updateTaskTitle: (id: string, title: string) => Promise<void>;
  createTask: (leadId: string, title: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

/**
 * Returns tasks for the current user (e.g. "Contact X" linked to leads).
 * Tasks are created automatically when a user marks a job post as lead.
 */
export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<TaskWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!supabase) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    const { data, error: fetchErr } = await supabase
      .from('tasks')
      .select('*, leads(job_url, company_name, company_linkedin_url, company_funding, job_posted_at, contact_name, status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setTasks([]);
    } else {
      setTasks((data as TaskWithLead[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskStatus = useCallback(async (id: string, status: TaskStatus) => {
    if (!supabase) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() } as any).eq('id', id);

    if (updateError) throw updateError;
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status, updated_at: new Date().toISOString() } as TaskWithLead : t)));
  }, []);

  const updateTaskTitle = useCallback(async (id: string, title: string) => {
    if (!supabase) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await supabase.from('tasks').update({ title, updated_at: new Date().toISOString() } as any).eq('id', id);
    if (updateError) throw updateError;
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, title, updated_at: new Date().toISOString() } as TaskWithLead : t)));
  }, []);

  const createTask = useCallback(async (leadId: string, title: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await supabase.from('tasks').insert({ user_id: user.id, lead_id: leadId, title, status: 'pending' } as any);
    if (insertErr) throw insertErr;
    await fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id);
    if (deleteError) throw deleteError;
    setTasks(prev => prev.filter(t => t.id !== id));
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
