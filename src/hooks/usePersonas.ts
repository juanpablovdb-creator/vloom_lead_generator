// =====================================================
// Leadflow Vloom - usePersonas Hook
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Persona } from '@/types/database';

export interface CreatePersonaInput {
  name: string;
  persona_function?: string | null;
  seniority?: string | null;
  job_title_keywords?: string[];
  locations?: string[];
  max_items?: number | null;
  profile_scraper_mode?: string | null;
  is_active?: boolean;
}

export type UpdatePersonaInput = Partial<CreatePersonaInput>;

interface UsePersonasReturn {
  personas: Persona[];
  isLoading: boolean;
  error: string | null;
  refreshPersonas: () => Promise<void>;
  createPersona: (input: CreatePersonaInput) => Promise<Persona>;
  updatePersona: (id: string, input: UpdatePersonaInput) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
}

/**
 * Returns personas for the current user (target profiles for people enrichment).
 * Used in Personas tab and later by enrich-lead-personas Edge Function.
 */
export function usePersonas(): UsePersonasReturn {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonas = useCallback(async () => {
    if (!supabase) {
      setPersonas([]);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setPersonas([]);
      setIsLoading(false);
      return;
    }
    const { data, error: fetchErr } = await supabase
      .from('personas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setPersonas([]);
    } else {
      setPersonas((data as Persona[]) ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const createPersona = useCallback(async (input: CreatePersonaInput): Promise<Persona> => {
    if (!supabase) throw new Error('Supabase not configured.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in.');
    const row = {
      user_id: user.id,
      name: input.name,
      persona_function: input.persona_function ?? null,
      seniority: input.seniority ?? null,
      job_title_keywords: input.job_title_keywords ?? [],
      locations: input.locations ?? [],
      max_items: input.max_items ?? null,
      profile_scraper_mode: input.profile_scraper_mode ?? null,
      is_active: input.is_active ?? true,
    };
    const { data, error: insertErr } = await supabase.from('personas').insert(row as never).select('*').single();
    if (insertErr) throw insertErr;
    const created = data as Persona;
    setPersonas(prev => [created, ...prev]);
    return created;
  }, []);

  const updatePersona = useCallback(async (id: string, input: UpdatePersonaInput) => {
    if (!supabase) return;
    const payload: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
    const { error: updateErr } = await supabase.from('personas').update(payload as never).eq('id', id);
    if (updateErr) throw updateErr;
    setPersonas(prev => prev.map(p => (p.id === id ? { ...p, ...input, updated_at: new Date().toISOString() } : p)));
  }, []);

  const deletePersona = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error: deleteErr } = await supabase.from('personas').delete().eq('id', id);
    if (deleteErr) throw deleteErr;
    setPersonas(prev => prev.filter(p => p.id !== id));
  }, []);

  return {
    personas,
    isLoading,
    error,
    refreshPersonas: fetchPersonas,
    createPersona,
    updatePersona,
    deletePersona,
  };
}
