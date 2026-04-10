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

**If New Search fails with “Invalid JWT”:**

> Scope: **LinkedIn Jobs** calls Edge **`run-job-search`**; **LinkedIn Post Feeds** calls **`run-linkedin-post-feed`**. The app can run Post Feeds (and Jobs) in the **browser** if an Apify token exists (`api_keys` or `VITE_APIFY_API_TOKEN`), avoiding the Edge gateway JWT. Otherwise fix JWT with deploy **`--no-verify-jwt`** (see §“Invalid JWT” below).

1. Ensure Edge secret **`SUPABASE_SERVICE_ROLE_KEY`** exists (Project Settings → API → `service_role`). Same as for §3b / `apify-job-webhook`.
2. **`SUPABASE_URL` and `SUPABASE_ANON_KEY` in Edge → Secrets are reserved** (managed by Supabase for your project). You **cannot delete** them; they always match this project. If you still see “Invalid JWT”, the usual causes are: **stale session** (sign out, clear site data for your app domain, sign in again), or the **frontend** using another project’s URL/anon key.
3. **Frontend:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel / `.env` must match **Project Settings → API** for this same project. After changing env vars, **redeploy** the frontend (Vite bakes them in at build time).
4. **Logs — where to see the root cause**

   - **Supabase Dashboard:** **Edge Functions** → **`run-job-search`** or **`run-linkedin-post-feed`** → **Logs**. Expect `[run-job-search] request` / `[run-linkedin-post-feed] request` at the start of each invocation. On auth failure inside the function, **`[resolveUserAndClient] …`** warnings are more specific than “Invalid JWT” in the UI.
   - **Interpretation:** If POST **never** produces that request log line, the gateway may be rejecting the JWT before Deno runs. Redeploy with **`--no-verify-jwt`** (see the code block in “Invalid JWT” below), e.g. `npx supabase functions deploy run-linkedin-post-feed --no-verify-jwt`.
   - **Browser:** DevTools → **Network** → the `run-job-search` request → **Response** (and **Headers** for status). The JSON body is the same error the frontend surfaces.
   - **CLI (optional):** `npx supabase functions logs run-job-search --project-ref <your-project-ref>` (CLI must be logged in to the project).

   **Note:** “Invalid JWT” almost always refers to the **user session token** sent to Supabase Auth / Edge, not the Apify API token. Auth **event** logs in the dashboard (where available) can also show token validation issues.

5. **Gateway JWT vs in-function checks (Supabase “Securing Edge Functions”)**

   - **Built-in verification (recommended by Supabase):** the platform validates the JWT **before** your Edge code runs. Invalid/expired/missing token → **401**, and Invocations may show **`execution_id: null`** because the handler never started. That matches what “enforce JWT” means: reject early at the edge.
   - **Skipping gateway checks:** historically via `verify_jwt` in `config.toml`; follow Supabase’s current docs for **JWT Signing Keys** if you toggle this. This repo sets **`verify_jwt = false`** on some functions so **`resolveUserAndClient`** can validate with `getClaims` / Auth HTTP fallbacks inside the function — a **trade-off** for debugging migrations, not a replacement for sending a **valid** session JWT from the app.
   - **Custom verification:** verify signature against **JWKS** at `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` (e.g. with `jose`). Our shared code uses the Supabase JS **`auth.getClaims`** path and fallbacks instead of embedding `jose` in every function.

**Local dev console:** `net::ERR_CONNECTION_REFUSED` on **`http://localhost:5173`** means the **Vite** dev server is not running (or a tab is still pointing at localhost). Run `npm run dev` from the repo root, or close that tab if you are only using the deployed app — those errors are unrelated to Supabase JWT.

---

## 3b. Background import (LinkedIn Jobs — recommended for long runs)

Long Apify runs can exceed the Edge Function wall-clock limit (~150s on free tier). When configured, **LinkedIn Jobs** starts the actor with **ad-hoc webhooks**: Apify calls your project when the run **succeeds or fails**, and **`apify-job-webhook`** imports the dataset using the **service role** (no user session needed).

1. **Edge Function Secrets** (same place as `APIFY_API_TOKEN`):
   - **`APIFY_WEBHOOK_SECRET`** — long random string (e.g. 32+ chars). Apify’s webhook URL will include `?secret=...`; the handler rejects requests without a match.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — from Supabase **Project Settings → API** (service_role key). Used only inside `apify-job-webhook` to insert leads and update `scraping_jobs` for the correct user.

2. **Deploy** the webhook function (and redeploy `run-job-search` after pulling the latest code):

   ```bash
   npx supabase functions deploy run-job-search apify-job-webhook
   ```

3. **Behaviour:** If both secrets are set, `run-job-search` returns immediately with `async: true` and saves `run_id` on the scraping job. The UI shows a short message; refresh **Results** when the run finishes. If the secrets are **not** set, the app keeps the previous **synchronous** behaviour (wait + poll inside one invocation).

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
| 4 | Deploy: `supabase functions deploy run-job-search` (and set `APIFY_API_TOKEN` in Secrets) |
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

1. From the project root: `supabase functions deploy run-job-search` (ensure the correct project is linked: `supabase link` if needed). This repo includes `verify_jwt = false` in the function config so the gateway won’t reject tokens during JWT signing key migrations; the function still validates the user with `getUser(token)`.
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

For **LinkedIn Post Feeds** (function `run-linkedin-post-feed`), use the same pattern when the UI shows Invalid JWT for that flow:

```bash
npx supabase functions deploy run-linkedin-post-feed --no-verify-jwt
```

If you prefer, you can still try a normal deploy first, but **when you see POST 401 with `execution_id: null` in Invocations**, this `--no-verify-jwt` deploy is the first fix to try.

Then run the search again (sign in again if needed).

### "Invalid JWT" on **Send to leads** / enrich (`enrich-lead-companies` / `enrich-lead-personas`)

The app retries with a **shared secret** so enrichment can run even when the **user JWT is rejected at the gateway** (as long as the function still executes).

1. **Supabase Dashboard** → **Edge Functions** → **Secrets**:
   - `VLOOM_ENRICH_SECRET` = a long random string (same value you put in the frontend).
   - `SUPABASE_SERVICE_ROLE_KEY` = your project’s service role key (Settings → API).
   - Keep `APIFY_API_TOKEN` set as usual.
2. **Frontend** (`.env` / Vercel env): `VITE_VLOOM_ENRICH_SECRET` = the **same** string as `VLOOM_ENRICH_SECRET`, then redeploy the site.
3. Redeploy the functions so the new auth logic is live:

```bash
npx supabase functions deploy enrich-lead-companies enrich-lead-personas
```

Calls use `Authorization: Bearer <anon key>` plus `x-vloom-enrich-secret` and `userId` in the JSON body; the function then uses the service role only when the session JWT fails, scoped to that user’s leads.

**Without** `VITE_VLOOM_ENRICH_SECRET` / `VLOOM_ENRICH_SECRET`, enrichment still relies on a valid JWT at the gateway or on the **browser Apify** fallback (user Apify key in Settings / `VITE_APIFY_API_TOKEN`).

**Invocations: OPTIONS 200, then POST 401:** el **gateway** está rechazando el POST (JWT) antes de que corra tu función. Arreglo típico: `npx supabase functions deploy enrich-lead-companies enrich-lead-personas --no-verify-jwt`. Con clave Apify en Settings (o `VITE_APIFY_API_TOKEN`), **Send to leads** intenta primero el enrich de compañía **en el navegador** para evitar ese POST a Edge.
