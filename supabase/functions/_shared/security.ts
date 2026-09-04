import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = new Set([
  "https://gaiatecsistemas.com.br",
  "https://www.gaiatecsistemas.com.br",
  "https://gaiatec-cms-staging.pages.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function configuredOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? new Set(configured) : DEFAULT_ORIGINS;
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  if (configuredOrigins().has(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.gaiatec-cms-staging\.pages\.dev$/i.test(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && isAllowedOrigin(req) ? origin : "https://gaiatecsistemas.com.br";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-idempotency-key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function readJsonLimited<T = Record<string, unknown>>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export async function sha256(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const input = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clientAddress(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}

export async function rateLimitKeyHash(action: string, identity: string): Promise<string> {
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if (!salt) throw new Error("RATE_LIMIT_SALT_NOT_CONFIGURED");
  return sha256(`${salt}:${action}:${identity}`);
}

export async function consumeRateLimit(
  admin: SupabaseClient,
  _req: Request,
  action: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const keyHash = await rateLimitKeyHash(action, identity);
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

export function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
