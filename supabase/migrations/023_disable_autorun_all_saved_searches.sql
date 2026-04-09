-- Turn off autorun for all saved searches (feature removed from UI; runs are manual only).
UPDATE public.saved_searches
SET autorun = false
WHERE autorun IS DISTINCT FROM false;
