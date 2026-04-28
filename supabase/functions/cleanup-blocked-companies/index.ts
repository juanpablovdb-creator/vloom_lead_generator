// Edge Function: clean backlog cards for blocked companies.
// POST { companies: string[] | string, mode?: "disqualify" | "delete" }
//
// Default: mode="disqualify" (keeps rows, removes from backlog views).

import { resolveUserAndClient } from "../_shared/resolveUserAndClient.ts";
import { normalizeCompanyName } from "../_shared/linkedinJobImport.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toCompanyList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  return [];
}

async function chunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const resolved = await resolveUserAndClient(authHeader);
  if (!resolved.ok) return json(401, { error: resolved.message });
  const { user, supabase } = resolved;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const companiesRaw = toCompanyList(body.companies ?? body.company);
  const companies = companiesRaw.map(normalizeCompanyName).filter(Boolean);
  if (companies.length === 0) return json(400, { error: "Provide companies (string or string[])" });

  const mode = body.mode === "delete" ? "delete" : "disqualify";
  const companySet = new Set(companies);

  // Fetch backlog leads for this user, filter in code (case-insensitive + normalized).
  const { data, error } = await supabase
    .from("leads")
    .select("id, company_name, status")
    .eq("user_id", user.id)
    .eq("status", "backlog");

  if (error) return json(500, { error: error.message });

  const rows = (data ?? []) as Array<{ id: string; company_name: string | null; status: string | null }>;
  const leadIds = rows
    .filter((r) => companySet.has(normalizeCompanyName(r.company_name ?? "")))
    .map((r) => r.id);

  if (leadIds.length === 0) {
    return json(200, { ok: true, matched: 0, mode });
  }

  if (mode === "delete") {
    await chunked(leadIds, 200, async (ids) => {
      const { error: delErr } = await supabase
        .from("leads")
        .delete()
        .eq("user_id", user.id)
        .in("id", ids);
      if (delErr) throw new Error(delErr.message);
    });
    return json(200, { ok: true, matched: leadIds.length, mode });
  }

  // disqualify
  await chunked(leadIds, 200, async (ids) => {
    const { error: updErr } = await supabase
      .from("leads")
      .update({ status: "disqualified" })
      .eq("user_id", user.id)
      .in("id", ids);
    if (updErr) throw new Error(updErr.message);
  });

  return json(200, { ok: true, matched: leadIds.length, mode });
});

