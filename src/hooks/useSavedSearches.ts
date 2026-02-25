// =====================================================
// Leadflow Vloom - useSavedSearches
// =====================================================
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { SavedSearch } from '@/types/database';

export function useSavedSearches() {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSearches = useCallback(async () => {
    if (!supabase) {
      setSavedSearches([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavedSearches([]);
      setIsLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from('saved_searches')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      setSavedSearches([]);
    } else {
      setSavedSearches((data ?? []) as SavedSearch[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSearches();
  }, [fetchSearches]);

  const createSavedSearch = useCallback(
    async (params: { name: string; actor_id: string; input: Record<string, unknown> }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in.');
      const { data, error: err } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name: params.name,
          actor_id: params.actor_id,
          input: params.input,
          autorun: false,
        })
        .select('id')
        .single();
      if (err) throw err;
      await fetchSearches();
      return data?.id as string;
    },
    [fetchSearches]
  );

  const deleteSavedSearch = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase.from('saved_searches').delete().eq('id', id);
      await fetchSearches();
    },
    [fetchSearches]
  );

  const updateSavedSearch = useCallback(
    async (id: string, updates: { autorun?: boolean }) => {
      if (!supabase) return;
      await supabase.from('saved_searches').update(updates).eq('id', id);
      await fetchSearches();
    },
    [fetchSearches]
  );

  return {
    savedSearches,
    isLoading,
    error,
    refetch: fetchSearches,
    createSavedSearch,
    deleteSavedSearch,
    updateSavedSearch,
  };
}
