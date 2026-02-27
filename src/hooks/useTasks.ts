// =====================================================
// Leadflow Vloom - useTasks Hook
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/types/database';

interface UseTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

/**
 * Returns tasks for the current user (e.g. "Contactar a X" linked to leads).
 * Tasks are created automatically when a user marks a job post as lead.
 */
export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
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
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setTasks([]);
    } else {
      setTasks((data as Task[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskStatus = useCallback(async (id: string, status: TaskStatus) => {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status, updated_at: new Date().toISOString() } : t)));
  }, []);

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
    deleteTask,
  };
}
