// =====================================================
// Leadflow Vloom - Auth state (Supabase)
// =====================================================
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hasOAuthParams = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.has('code') || sp.has('state');
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    const db = supabase;
    if (!db) {
      setLoading(false);
      return;
    }

    let didSetLoadingFromEvent = false;
    if (import.meta.env.DEV) {
      // Helps debug OAuth flows that "return to login" without visible errors.
      // Avoid logging tokens; only log event/user existence.
      // eslint-disable-next-line no-console
      console.log("[useAuth] mount", { hasOAuthParams, initialUrl: window.location.href });
    }

    const getInitial = async () => {
      const { data: { session } } = await db.auth.getSession();
      setUser(session?.user ?? null);
      // If OAuth callback params are present, keep loading until auth state event confirms.
      if (!hasOAuthParams) setLoading(false);
    };
    getInitial();

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[useAuth] auth event", { event, hasUser: Boolean(session?.user), userEmail: session?.user?.email ?? null });
      }

      // Avoid flipping back to AuthPage during OAuth callback exchange.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!didSetLoadingFromEvent) setLoading(false);
        didSetLoadingFromEvent = true;
        return;
      }

      if (event === 'INITIAL_SESSION') {
        // If OAuth params exist and INITIAL_SESSION is empty, wait for next event.
        if (hasOAuthParams && !session?.user) return;
      }

      if (!didSetLoadingFromEvent) {
        setLoading(false);
        didSetLoadingFromEvent = true;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
