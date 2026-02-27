// =====================================================
// Leadflow Vloom - Main App Entry
// Layout: wearevloom.com | Discovery via Apify
// =====================================================
import { AppContent } from '@/pages/AppContent';
import { AuthPage } from '@/pages/AuthPage';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured, SUPABASE_CONFIG_HINT } from '@/lib/supabase';

/** En producción NUNCA permitir entrar sin auth: si faltan env vars, mostrar esto. */
function ConfigRequiredScreen() {
  return (
    <div className="min-h-screen bg-vloom-bg flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <p className="text-vloom-text font-medium">Configuración requerida</p>
        <p className="text-sm text-vloom-muted">{SUPABASE_CONFIG_HINT}</p>
      </div>
    </div>
  );
}

function App() {
  const { user, loading, signOut } = useAuth();
  const isProd = import.meta.env.PROD;

  // En producción: sin Supabase no se puede usar la app (obligatorio iniciar sesión).
  // Así evitamos que en deploy sin env vars se entre sin login.
  if (isProd && !isSupabaseConfigured) {
    return <ConfigRequiredScreen />;
  }

  // En desarrollo sin Supabase: permitir uso sin auth (preview local).
  if (!isSupabaseConfigured) {
    return <AppContent />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-vloom-bg flex items-center justify-center">
        <p className="text-sm text-vloom-muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <AppContent userEmail={user.email ?? null} onSignOut={signOut} />;
}

export default App;
