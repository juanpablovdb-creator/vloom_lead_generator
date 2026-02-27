-- Leadflow Vloom - Fix "Database error saving new user" (e.g. Google OAuth)
-- Run the ENTIRE file in one go (Ctrl+A then Run). Statement 1 = policies, Statement 2 = trigger.
-- 1) RLS: allow insert so the trigger (or session) can create the profile row.
-- 2) Trigger: SECURITY DEFINER + SET search_path = '' and insert into public.profiles
--    (per Supabase docs), and get email/name from OAuth metadata when needed.

-- Single block: drop then create both policies (idempotent; safe to run multiple times)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Allow first profile insert for new user" ON public.profiles;
  EXECUTE 'CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id)';
  EXECUTE 'CREATE POLICY "Allow first profile insert for new user" ON public.profiles FOR INSERT WITH CHECK (current_user IN (''postgres'', ''supabase_admin'') AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profiles.id))';
END $$;

-- Trigger function: empty search_path and explicit public.profiles (Supabase recommendation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_email text;
    user_name text;
BEGIN
    user_email := COALESCE(
        NEW.email,
        NEW.raw_user_meta_data->>'email'
    );
    IF user_email IS NULL OR user_email = '' THEN
        user_email := NEW.id::text || '@placeholder.local';
    END IF;
    user_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(user_email, '@', 1)
    );
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, user_email, user_name);
    RETURN NEW;
END;
$$;
