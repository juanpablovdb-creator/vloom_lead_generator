// =====================================================
// Leadflow Vloom - Auth state (Supabase)
// =====================================================
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = supabase;
    if (!db) {
      setLoading(false);
      return;
    }

    const getInitial = async () => {
      const { data: { session } } = await db.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    getInitial();

    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
