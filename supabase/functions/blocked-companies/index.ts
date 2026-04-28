// Edge Function: manage blocked companies for current user.
// Routes:
// - GET: list blocked companies
// - POST: { companies: string[] | string, reason?: string }  -> upsert
// - DELETE: { id?: string, company?: string } -> delete

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const resolved = await resolveUserAndClient(authHeader);
  if (!resolved.ok) return json(401, { error: resolved.message });
  const { user, supabase } = resolved;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("blocked_companies")
      .select("id, company_name, company_name_normalized, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return json(500, { error: error.message });
    return json(200, { blockedCompanies: data ?? [] });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // allow empty body for methods that don't need it
  }

  if (req.method === "POST") {
    const companies = toCompanyList(body.companies ?? body.company);
    if (companies.length === 0) return json(400, { error: "Provide companies (string or string[])" });

    const reason = typeof body.reason === "string" ? body.reason : null;
    const rows = companies.map((name) => ({
      user_id: user.id,
      company_name: name,
      company_name_normalized: normalizeCompanyName(name),
      reason,
    }));

    const { error } = await supabase
      .from("blocked_companies")
      .upsert(rows, {
        onConflict: "user_id,company_name_normalized",
        ignoreDuplicates: true,
      });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, blocked: companies.length });
  }

  if (req.method === "DELETE") {
    const id = typeof body.id === "string" ? body.id : null;
    const company = typeof body.company === "string" ? body.company : null;
    if (!id && !company) return json(400, { error: "Provide id or company" });

    let q = supabase.from("blocked_companies").delete();
    if (id) q = q.eq("id", id).eq("user_id", user.id);
    else q = q.eq("user_id", user.id).eq("company_name_normalized", normalizeCompanyName(company ?? ""));

    const { error } = await q;
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
});

