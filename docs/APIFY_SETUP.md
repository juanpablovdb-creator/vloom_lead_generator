# What you need to do for the Apify actor API to work

The app runs LinkedIn Jobs (and later other actors) by calling Apify’s API with **your** API token. You need to get the token and store it in your database.

---

## 1. Supabase and auth

- **.env** must have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from your Supabase project).
- You must be **logged in** (Supabase Auth) and have a **profile** with a **team_id** (the app reads the Apify key per team).

If you haven’t already: create a team, assign your user to that team in `profiles.team_id`, and run the migrations so the DB is ready.

---

## 2. Get your Apify API token

1. Go to [apify.com](https://apify.com) and sign in (or create an account).
2. Open **Settings** (avatar menu) → **Integrations** or **API**.
3. Copy your **Personal API token** (or create one).  
   It usually looks like: `apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

You will use this token in the next step. The app sends it in requests to `api.apify.com` to run actors (e.g. LinkedIn Jobs).

---

## 3. Save the token in Edge Function Secrets

The app uses the **Edge Function** `run-job-search`, which reads the Apify key from **Edge Function Secrets**. Do **not** put the key in the Table Editor for this flow.

1. In Supabase: **Edge Functions** → **Secrets** (under Manage).
2. **Add new secret:**
   - **Name:** `APIFY_API_TOKEN`
   - **Value:** your Apify API token (e.g. `apify_api_xxxx...`).
3. Save.

The Edge Function reads it with `Deno.env.get('APIFY_API_TOKEN')` and never exposes it to the frontend.

---

## 4. Permissions (RLS)

Only users with role **owner** or **admin** in `profiles` can manage `api_keys` for their team. Your user must have `team_id` set and, if you use RLS, the right role so the app can read the row (the app loads the key with the logged-in user’s `team_id`).

---

## 5. Test

1. Log in to the app.
2. Go to **Discovery** → **New Search** → choose **LinkedIn Jobs**.
3. Fill the form and click **Start Search**.

If the Apify key is missing or wrong, you’ll see: an error about APIFY_API_TOKEN or from Apify. If the token is set correctly in Edge Function Secrets and you've deployed `run-job-search`, the run will execute on the server and results will appear in the table.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Supabase in .env; user logged in with profile and team_id |
| 2 | Get Apify API token from apify.com (Settings → API) |
| 3 | Add secret `APIFY_API_TOKEN` in Supabase → Edge Functions → Secrets |
| 4 | Deploy: `supabase functions deploy run-job-search --no-verify-jwt` (and set `APIFY_API_TOKEN` in Secrets) |
| 5 | Run a LinkedIn Jobs search in the app to verify |

The Apify key stays in Edge Function Secrets and is never sent to the browser.

---

## Is the secret exposed?

**Current setup:** The app uses the Edge Function `run-job-search`, which reads the key from **Edge Function Secrets** and calls Apify on the server. The key is never sent to the frontend.

---

## Troubleshooting

### "Failed to send a request to the Edge Function" or "Edge Function is not deployed"

The app first calls the Edge Function; if that fails (e.g. not deployed or wrong project), it falls back to running the search from the browser using the Apify key from the `api_keys` table.

**Option A – Use the Edge Function (recommended, key stays on server):**

1. From the project root: `supabase functions deploy run-job-search --no-verify-jwt` (ensure the correct project is linked: `supabase link` if needed). The `--no-verify-jwt` flag avoids gateway "Invalid JWT" when the project uses newer auth; the function still validates the user with `getUser(token)`.
2. In Supabase Dashboard: **Edge Functions** → **Secrets** → add `APIFY_API_TOKEN` with your Apify API token.
3. Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` point to the **same** Supabase project where the function is deployed.

**Option B – Use the fallback (key in database):**

1. In Supabase: **Table Editor** → `api_keys`.
2. Insert a row for your team: `team_id` = your profile’s team ID, `service` = `apify`, `api_key_encrypted` = your Apify token, `is_active` = true.
3. The app will use this key when the Edge Function is not reachable. Prefer Option A for production so the key is not stored in the DB.

### "Session expired or invalid" or "Invalid JWT" (401)

The Supabase gateway may reject your JWT (e.g. with newer JWT signing). Deploy the function **without** gateway JWT verification; the function still checks the user with `getUser(token)`:

```bash
supabase functions deploy run-job-search --no-verify-jwt
```

Then run the search again (sign in again if needed).
