// =====================================================
// Leadflow Vloom - Settings (API keys)
// =====================================================
import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import {
  getApifyApiKeyForBrowser,
  saveApifyApiKeyForCurrentUser,
} from '@/lib/apify';

export function SettingsView() {
  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-vloom-text mb-1">Settings</h1>
      <p className="text-sm text-vloom-muted mb-6">
        Store your Apify token so LinkedIn Post Feeds (and Jobs) run in your browser instead of
        hitting the 150s server time limit.
      </p>
      <div className="bg-vloom-surface rounded-xl border border-vloom-border p-6">
        <ApifyKeyForm onSaved={() => undefined} />
      </div>
    </div>
  );
}

export function ApifyKeyForm({ onSaved }: { onSaved?: () => void }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const refresh = async () => {
    const k = await getApifyApiKeyForBrowser();
    setHasKey(!!k);
  };

  useEffect(() => {
    let cancelled = false;
    getApifyApiKeyForBrowser().then((k) => {
      if (!cancelled) setHasKey(!!k);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      await saveApifyApiKeyForCurrentUser(draft);
      setDraft('');
      setSavedOk(true);
      await refresh();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-vloom-text">
        <KeyRound className="w-4 h-4 text-vloom-muted" />
        Apify API token
      </div>
      {hasKey === true && (
        <p className="text-sm text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          A key is saved for your account. Post Feeds will run in the browser (no 150s Edge cap).
        </p>
      )}
      {hasKey === false && (
        <p className="text-sm text-amber-200">
          No Apify key for this login. Without it, Post Feeds run on the server and often fail with
          “idle timeout 150s” (especially with author-location filters or Max posts over 100).
        </p>
      )}
      <input
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedOk(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            void handleSave();
          }
        }}
        placeholder={hasKey ? 'Paste a new token to replace…' : 'apify_api_…'}
        className="w-full px-3 py-2 rounded-lg border border-vloom-border bg-vloom-bg text-vloom-text text-sm placeholder-vloom-muted"
      />
      <p className="text-xs text-vloom-muted">
        From{' '}
        <a
          href="https://console.apify.com/account/integrations"
          target="_blank"
          rel="noopener noreferrer"
          className="text-vloom-accent hover:underline"
        >
          Apify Console → Integrations
        </a>
        . Saved to your user in this app (not shared).
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {savedOk && <p className="text-sm text-emerald-400">Key saved. You can start the search.</p>}
      <button
        type="button"
        disabled={saving || !draft.trim()}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? 'Saving…' : hasKey ? 'Replace key' : 'Save key'}
      </button>
    </div>
  );
}
