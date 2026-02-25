// =====================================================
// Leadflow Vloom - Main App Entry
// Layout: wearevloom.com | Discovery via Apify
// =====================================================
import { AppContent } from '@/pages/AppContent';
import { AuthPage } from '@/pages/AuthPage';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

function App() {
  const { user, loading, signOut } = useAuth();

  // No Supabase env: run without auth (e.g. local preview)
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
