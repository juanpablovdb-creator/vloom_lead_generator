// =====================================================
// Leadflow Vloom - Supabase Client
// =====================================================
// No lanzamos error si faltan variables: la app debe poder renderizar
// (p. ej. en Lovable preview o sin .env). Los componentes que usen
// Supabase deben comprobar isSupabaseConfigured.
// =====================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Always use HTTPS for Supabase (Edge Functions and API); normalize if someone sets http://
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseUrl =
  typeof rawUrl === 'string' && rawUrl.startsWith('http://')
    ? 'https://' + rawUrl.slice(7)
    : rawUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const isSupabaseConfigured = hasEnv;
/** Base URL for Supabase (used e.g. to call Edge Functions with fetch and read error body). */
export { supabaseUrl };

export const supabase: SupabaseClient<Database> | null = hasEnv
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Helper para obtener el usuario actual
export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Helper para obtener el perfil del usuario actual
export const getCurrentProfile = async () => {
  const user = await getCurrentUser();
  if (!user || !supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
};
