-- Force PostgREST to reload schema cache (e.g. after 008_remove_teams).
-- Run in Supabase Dashboard → SQL Editor. If the app still shows "team_id" / "schema cache"
-- errors, the only reliable fix is: Project Settings → General → Pause project, then Restore project.

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
