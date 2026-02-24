-- =====================================================
-- LEADFLOW - Fix infinite recursion in profiles RLS
-- =====================================================
-- The policy "Users can view team members" queried profiles inside a policy on profiles,
-- causing infinite recursion. Use a SECURITY DEFINER function to get current user's team_id
-- without triggering RLS.

CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Drop SELECT policies that cause recursion or are redundant
DROP POLICY IF EXISTS "Users can view team members" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Single SELECT policy: own row or same team (get_my_team_id bypasses RLS, no recursion)
CREATE POLICY "Users can view own profile and team members" ON profiles
    FOR SELECT USING (
        id = auth.uid()
        OR team_id = public.get_my_team_id()
    );
