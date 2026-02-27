-- =====================================================
-- Leadflow Vloom - Fix infinite recursion in profiles RLS
-- =====================================================
-- Idempotent: works with or without team_id (e.g. after 008_remove_teams).
-- Drops team-based policy and get_my_team_id; ensures single SELECT policy for own profile.

DROP FUNCTION IF EXISTS public.get_my_team_id();

DROP POLICY IF EXISTS "Users can view team members" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile and team members" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
