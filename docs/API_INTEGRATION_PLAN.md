# API integration plan – Everything in-app

Goal: All search configuration and execution happens inside the app. No sending users to Apify’s site. **Keep the current UX:** all job-post sources (LinkedIn Jobs, Indeed, Glassdoor, etc.) visible as separate cards; each source has its own form and its own UI. We only unify the backend (one runner that dispatches by actor).

---

## Current state

- **LinkedIn Jobs (HarvestAPI)** is wired: form in SearchConfigPage → `runLinkedInJobSearch()` in `src/lib/apify.ts` → Apify API → `normalizeHarvestApiJobs()` → `saveJobsAsLeads()` → Supabase.
- SearchConfigPage has a footer with “Inputs map to the Apify Actor schema. View Actor →” linking to Apify. We will remove that and keep everything in-app.
- Other actors (Indeed, Glassdoor) have input schemas in SearchConfigPage but are not runnable yet; only HarvestAPI is connected.

---

## Step 1 – Job post actor (LinkedIn Jobs): fully in-app

**Goal:** No external link. User sees only in-app copy and optional field mapping.

1. **Remove “View Actor →” link** in SearchConfigPage footer.
2. **Replace with in-app text**, e.g.  
   “These fields are sent to the LinkedIn Jobs source. Results are saved to your leads list.”
3. **Optional:** Add a short, collapsible “How these fields are used” section for this actor (e.g. “Job titles → jobTitles”, “Date posted → postedLimit”) so the mapping is visible in-app.

**Files:** `src/pages/SearchConfigPage.tsx`

---

## Step 2 – Single entry point for “run job search”

**Goal:** One function that runs a job search for any supported actor, so we can add Indeed/Glassdoor later without changing the UI flow.

1. **Keep** `runLinkedInJobSearch()` for the current LinkedIn flow (or refactor it to be called by a dispatcher).
2. **Introduce** `runJobSearch(actorId, input)` (or keep the name and generalize it) that:
   - If `actorId === 'harvestapi/linkedin-job-search'`: build params from input, call existing LinkedIn runner, normalize with `normalizeHarvestApiJobs`, save with `saveJobsAsLeads`.
   - Later: if `actorId === 'misceres/indeed-scraper'`, run Indeed actor, normalize with `normalizeIndeedJobs`, save with same `saveJobsAsLeads`.
   - Later: same for Glassdoor.

**Files:** `src/lib/apify.ts` (and possibly a small `src/lib/apify-actors.ts` for per-actor input builders and normalizers).

---

## Step 3 – Input mapping per actor (already in place)

- **SearchConfigPage** already has `ACTOR_INPUT_SCHEMAS[source.apifyActorId]`: each actor has its own form fields (jobTitles, locations, postedLimit for HarvestAPI; position, location for Indeed; etc.).
- Form submit already sends `formData` as the “input” for the chosen source. For LinkedIn we already have `buildSearchParams(formData)` in apify.ts.
- **Action:** Ensure that when we add Step 2, we have one “input builder” per actor (HarvestAPI already: `buildSearchParams`; Indeed/Glassdoor: new functions that map form keys to each actor’s API input schema). No change needed for Step 1.

---

## Step 4 – Output normalization per actor

- **HarvestAPI:** Already have `normalizeHarvestApiJobs()` → common shape used by `saveJobsAsLeads()` (e.g. title, company, job_url, location, etc.).
- **Indeed (later):** Implement `normalizeIndeedJobs(rawItems)` that returns the same shape (or a shared `JobForLead` type) so `saveJobsAsLeads()` stays generic.
- **Glassdoor (later):** Same idea: `normalizeGlassdoorJobs(rawItems)` → same shape → same `saveJobsAsLeads()`.

**Files:** `src/lib/apify.ts` (or `src/lib/apify-normalizers.ts`).

---

## Step 5 – Wire each source’s form to the runner (UI unchanged)

- **Keep the current UI:** One card per source (LinkedIn Jobs, Indeed, Glassdoor, etc.), each with its own form and fields. No generic/single form. Users see all places where we can get job posts and the specific form for each.
- **Backend only:** When the user submits the form for any source, we call `runJobSearch({ actorId: source.apifyActorId, input: formData })`. Same result type for all (e.g. `{ scrapingJobId, imported, skipped, totalFromApify }`), so the same “results + table + save search” block works for every source—but each source still has its own form and its own UI, as it is now.
- **No change to:** HomePage cards, ACTOR_INPUT_SCHEMAS per source, or the fact that each source has a dedicated form.

**Files:** `src/pages/AppContent.tsx`, `src/pages/SearchConfigPage.tsx`, `src/lib/apify.ts`.

---

## Step 6 – Add Indeed and Glassdoor (after Steps 2–4)

1. **Indeed:** In Apify, check `misceres/indeed-scraper` output shape. Implement `normalizeIndeedJobs()`. In `runJobSearch()`, when `actorId === APIFY_ACTORS.INDEED_JOBS`, build input from form, run actor, normalize, save. Enable “Indeed Jobs” in New Search (no longer “coming soon” for run).
2. **Glassdoor:** Same for `epctex/glassdoor-jobs-scraper`: normalizer + branch in `runJobSearch()`.

---

## Order of work

| Step | What | Status |
|------|------|--------|
| 1 | Job post (LinkedIn) in-app only: remove “View Actor” link, add in-app copy (and optional mapping) | Done |
| 2 | Single `runJobSearch(actorId, input)` entry point; LinkedIn path inside it | Done (LinkedIn Jobs) |
| 3 | Confirm input mapping per actor (schemas already in SearchConfigPage) | Already done |
| 4 | Normalizers for Indeed and Glassdoor | When adding those actors |
| 5 | Each source’s form calls `runJobSearch(actorId, input)`; UI stays one card + one form per source | Done (LinkedIn Jobs) |
| 6 | Enable Indeed and Glassdoor in New Search | After 4 and 5 |

---

## Starting point: Step 1 (job post actor in-app)

- Remove the Apify link from the SearchConfigPage footer.
- Replace with short in-app explanation and, if you want, a collapsible “Field mapping” for the LinkedIn Jobs actor so everything stays inside the app.
