/**
 * Resolve the caller from Authorization and return a user-scoped Supabase client (RLS).
 *
 * Order (for asymmetric JWT signing keys / ES256):
 * 1. `auth.getClaims(jwt)` — verifies signature via JWKS (same path Supabase recommends for new signing keys).
 * 2. `GET /auth/v1/user` — HTTP fallback.
 * 3. SDK `getUser(jwt)` fallbacks.
 *
 * @see https://supabase.com/docs/guides/auth/jwts
 */
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.102.1";

export type ResolveUserResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; message: string };

function normalizeProjectUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "").replace(/^http:\/\//i, "https://");
}

function readJwtIss(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(pad)) as { iss?: string };
    return typeof json.iss === "string" ? json.iss : null;
  } catch {
    return null;
  }
}

function issuerMatchesProject(iss: string | null, projectUrl: string): boolean {
  if (!iss || !projectUrl) return true;
  const base = normalizeProjectUrl(projectUrl);
  const expected = `${base}/auth/v1`;
  const i = iss.replace(/\/$/, "");
  return i === expected || iss.startsWith(`${base}/`);
}

async function fetchUserFromAuthHttp(
  projectUrl: string,
  accessToken: string,
  apiKey: string,
): Promise<{ user: User | null; error: string | null }> {
  const base = normalizeProjectUrl(projectUrl);
  const endpoint = `${base}/auth/v1/user`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as {
        msg?: string;
        message?: string;
        error_description?: string;
        error?: string;
      };
      msg = j.msg ?? j.message ?? j.error_description ?? j.error ?? text;
    } catch {
      /* ignore */
    }
    return { user: null, error: msg || `HTTP ${res.status}` };
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const raw = (parsed.user ?? parsed) as Record<string, unknown>;
    if (raw && typeof raw.id === "string") {
      return { user: raw as unknown as User, error: null };
    }
    return { user: null, error: "Auth response missing user id" };
  } catch {
    return { user: null, error: "Invalid JSON from /auth/v1/user" };
  }
}

export async function resolveUserAndClient(authHeader: string): Promise<ResolveUserResult> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return { ok: false, message: "Missing bearer token" };
  }

  if (!url || !anonKey) {
    return { ok: false, message: "SUPABASE_URL or SUPABASE_ANON_KEY is not set in Edge environment." };
  }

  const iss = readJwtIss(jwt);
  if (!issuerMatchesProject(iss, url)) {
    return {
      ok: false,
      message:
        `JWT issuer mismatch: token is for "${iss ?? "?"}" but this function's SUPABASE_URL is "${normalizeProjectUrl(url)}". ` +
        `Sign out, clear site data for your app origin, sign in again. ` +
        `Ensure VITE_SUPABASE_URL (and anon key) in your deployed frontend match Project Settings → API for this project, then redeploy the site.`,
    };
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // 1) getClaims — JWKS signature verification (recommended for asymmetric signing keys)
  const anonOnly = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authWithClaims = anonOnly.auth as {
    getClaims?: (j: string) => Promise<{
      data: { claims: { sub?: string } } | null;
      error: { message?: string } | null;
    }>;
  };
  if (typeof authWithClaims.getClaims === "function") {
    try {
      const result = await authWithClaims.getClaims(jwt);
      if (result.error) {
        console.warn("[resolveUserAndClient] getClaims:", result.error.message);
      } else if (result.data?.claims && typeof result.data.claims.sub === "string") {
        const user = { id: result.data.claims.sub } as User;
        return { ok: true, user, supabase };
      }
    } catch (e) {
      console.warn("[resolveUserAndClient] getClaims threw:", e instanceof Error ? e.message : String(e));
    }
  }

  // 2) Raw HTTP
  let http = await fetchUserFromAuthHttp(url, jwt, anonKey);
  if (!http.user && serviceRole.length > 0) {
    const second = await fetchUserFromAuthHttp(url, jwt, serviceRole);
    if (second.user) http = second;
    else if (second.error && !http.error) http = second;
  }
  if (http.user) {
    return { ok: true, user: http.user, supabase };
  }
  if (http.error) {
    console.warn("[resolveUserAndClient] GET /auth/v1/user:", http.error);
  }

  // 3) SDK fallbacks
  if (serviceRole.length > 0) {
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (!error && user) {
      return { ok: true, user, supabase };
    }
    console.warn("[resolveUserAndClient] admin auth.getUser(jwt):", error?.message ?? "no user");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    const msg = userError?.message ?? http.error ?? "You must be logged in.";
    return { ok: false, message: msg };
  }
  return { ok: true, user, supabase };
}
