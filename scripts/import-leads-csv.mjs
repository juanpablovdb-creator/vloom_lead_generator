import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

function getArg(name) {
  const idx = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return null;
  const raw = process.argv[idx];
  if (raw.includes("=")) return raw.split("=").slice(1).join("=");
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function requiredEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}

function toIsoDateOnlyMaybe(dateStr) {
  const s = String(dateStr ?? "").trim();
  if (!s) return null;
  // Supports YYYY-MM-DD and ISO; store as ISO string (noon UTC-ish to avoid TZ shifts)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)).toISOString();
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseScore(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(csvStage) {
  const s = String(csvStage ?? "").trim().toLowerCase();
  if (!s) return "backlog";
  if (s === "backlog") return "backlog";
  if (s === "disqualified") return "disqualified";
  if (s === "first contact") return "invite_sent";
  // Fallbacks from possible exports
  if (s === "first_contact" || s === "first-contact") return "invite_sent";
  if (s === "invite sent") return "invite_sent";
  if (s === "connected") return "connected";
  if (s === "reply") return "reply";
  if (s === "positive reply") return "positive_reply";
  if (s === "negotiation") return "negotiation";
  if (s === "closed") return "closed";
  if (s === "lost") return "lost";
  return "backlog";
}

function extractLinkedInJobExternalId(jobUrl) {
  const url = String(jobUrl ?? "").trim();
  if (!url) return null;
  const m = url.match(/linkedin\.com\/jobs\/view\/(\d+)/i);
  return m?.[1] ?? null;
}

function normalizeText(v) {
  const s = v == null ? "" : String(v);
  const t = s.trim();
  return t.length ? t : null;
}

async function loadExistingUrls(supabase, userId) {
  const urls = new Set();
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("job_url")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      if (r?.job_url) urls.add(r.job_url);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return urls;
}

async function main() {
  const fileArg = getArg("--file") ?? getArg("-f");
  const filePath = fileArg ? path.resolve(fileArg) : null;
  const dryRun = hasFlag("--dry-run");
  const markAsLead = hasFlag("--mark-as-lead");

  if (!filePath) {
    throw new Error('Usage: node scripts/import-leads-csv.mjs --file "<csv>" [--dry-run] [--mark-as-lead]');
  }
  if (!fs.existsSync(filePath)) throw new Error(`CSV not found at ${filePath}`);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const importUserId = requiredEnv("IMPORT_USER_ID");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const csv = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h ?? "").trim(),
  });
  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error: ${first.message ?? "unknown error"}`);
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  if (!rows.length) {
    console.log("No rows found in CSV.");
    return;
  }

  const existingUrls = await loadExistingUrls(supabase, importUserId);

  const toInsert = [];
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const r of rows) {
    const job_url = normalizeText(r["Job URL"]);
    const job_title = normalizeText(r["Title"]);
    const company_name = normalizeText(r["Company"]);
    if (!job_url && !job_title && !company_name) {
      skippedInvalid++;
      continue;
    }
    if (job_url && existingUrls.has(job_url)) {
      skippedExisting++;
      continue;
    }

    const company_linkedin_url = normalizeText(r["Company LinkedIn"]);
    const job_location = normalizeText(r["Location"]);
    const job_salary_range = normalizeText(r["Salary"]);
    const job_posted_at = toIsoDateOnlyMaybe(r["Posted Date"]);
    const status = normalizeStatus(r["Stage"]);
    const score = parseScore(r["Score"]);
    const notes = normalizeText(r["Notes"]);

    const employmentType = normalizeText(r["Employment Type"]);
    const workplaceType = normalizeText(r["Workplace Type"]);
    const experienceLevel = normalizeText(r["Experience Level"]);
    const assignee = normalizeText(r["Assignee"]);

    const job_external_id = extractLinkedInJobExternalId(job_url);
    const channel = "LinkedIn Job Post";
    const job_source = "linkedin";

    const enrichment_data = {
      import: {
        source: "csv",
        file: path.basename(filePath),
        imported_at: new Date().toISOString(),
      },
      csv: {
        employment_type: employmentType,
        workplace_type: workplaceType,
        experience_level: experienceLevel,
        assignee,
      },
    };

    toInsert.push({
      user_id: importUserId,
      is_shared: false,
      assignee: assignee ?? null,
      job_title: job_title ?? null,
      job_description: null,
      job_url: job_url ?? null,
      job_source,
      job_location: job_location ?? null,
      job_salary_range: job_salary_range ?? null,
      job_posted_at: job_posted_at ?? null,
      company_name: company_name ?? null,
      company_url: null,
      company_linkedin_url: company_linkedin_url ?? null,
      company_size: null,
      company_industry: null,
      company_description: null,
      company_funding: null,
      company_location: null,
      contact_name: null,
      contact_title: null,
      contact_email: null,
      contact_linkedin_url: null,
      contact_phone: null,
      status,
      score: score ?? 0,
      enrichment_data,
      last_enriched_at: null,
      notes: notes ?? null,
      tags: [],
      scraping_job_id: null,
      job_external_id,
      is_marked_as_lead: markAsLead,
      channel,
      first_contacted_at: null,
    });
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        total_rows: rows.length,
        prepared: toInsert.length,
        skipped_existing_url: skippedExisting,
        skipped_invalid: skippedInvalid,
        dry_run: dryRun,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;
  if (toInsert.length === 0) return;

  // Prefer conflict on (user_id, job_external_id) where available (unique index exists).
  // For rows with null job_external_id, this behaves as pure insert (we already filtered by job_url).
  const { error } = await supabase
    .from("leads")
    .upsert(toInsert, { onConflict: "user_id,job_external_id" });
  if (error) throw new Error(error.message);

  console.log(`Imported ${toInsert.length} lead(s) into CRM (leads table).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
