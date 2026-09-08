import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  corsResponseOrigin,
  isExactHostnameAllowed,
  isExactOriginAllowed,
  isTurnstileVerificationAccepted,
} from "./exact-origin-allowlist.ts";

export function isAllowedOrigin(req: Request): boolean {
  return isExactOriginAllowed(req.headers.get("Origin"), Deno.env.get("ALLOWED_ORIGINS"));
}

export function isAllowedHostname(hostname: string | undefined): boolean {
  return isExactHostnameAllowed(
    hostname,
    Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES"),
    Deno.env.get("ALLOWED_ORIGINS"),
  );
}

export function isAllowedTurnstileVerification(
  result: { success?: boolean; hostname?: string; action?: string },
  secret: string,
  expectedAction: string,
): boolean {
  return isTurnstileVerificationAccepted(result, {
    secret,
    environment: Deno.env.get("CMS_ENVIRONMENT"),
    expectedAction,
    configuredHostnames: Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES"),
    configuredOrigins: Deno.env.get("ALLOWED_ORIGINS"),
  });
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowedOrigin = corsResponseOrigin(origin, Deno.env.get("ALLOWED_ORIGINS"));
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
