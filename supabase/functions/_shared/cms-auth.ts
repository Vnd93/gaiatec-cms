import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";
import { boundedFetch } from "./cms-edge-fetch.ts";
import { cleanText } from "./security.ts";

export type CmsClaims = { aal: "aal1" | "aal2"; sessionId: string; issuedAt: string };

function readClaims(authHeader: string): CmsClaims | null {
  try {
    const payload = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized)) as Record<string, unknown>;
    const sessionId = cleanText(parsed.session_id, 200);
    const issuedAt = Number(parsed.iat);
    if (!sessionId || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;
    return { aal: parsed.aal === "aal2" ? "aal2" : "aal1", sessionId, issuedAt: new Date(issuedAt * 1000).toISOString() };
  } catch {
    return null;
  }
}

export async function authenticateCms(req: Request): Promise<{
  admin: SupabaseClient;
  user: User;
  claims: CmsClaims;
} | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const claims = readClaims(authHeader);
  if (!url || !anonKey || !serviceRole || !claims) return null;
  const caller = createClient(url, anonKey, {
    global: { fetch: boundedFetch(), headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) return null;
  return {
    admin: createClient(url, serviceRole, {
      global: { fetch: boundedFetch() },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
    user: data.user,
    claims,
  };
}
