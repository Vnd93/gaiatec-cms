export const DEFAULT_ALLOWED_ORIGINS = [
  "https://gaiatecsistemas.com.br",
  "https://www.gaiatecsistemas.com.br",
  "https://gaiatec-cms-staging.pages.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

export const DEFAULT_CORS_ORIGIN = "https://gaiatecsistemas.com.br";
export const TURNSTILE_STAGING_ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA";

type TurnstileVerification = {
  success?: boolean;
  hostname?: string;
  action?: string;
  cdata?: string;
};

type TurnstileVerificationPolicy = {
  secret: string;
  environment: string | undefined;
  expectedAction: string;
  expectedCdata: string;
  configuredHostnames: string | undefined;
  configuredOrigins: string | undefined;
};

export function exactAllowlist(raw: string | undefined, fallback: readonly string[] = []): Set<string> {
  const explicitlyConfigured = Boolean(raw?.trim());
  const configured = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => Boolean(value) && value !== "*");
  return new Set(explicitlyConfigured ? configured : fallback);
}

export function isExactOriginAllowed(
  origin: string | null,
  configuredOrigins: string | undefined,
  fallback: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): boolean {
  if (!origin) return true;
  return exactAllowlist(configuredOrigins, fallback).has(origin);
}

export function isExactHostnameAllowed(
  hostname: string | undefined,
  configuredHostnames: string | undefined,
  configuredOrigins: string | undefined,
  fallbackOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): boolean {
  if (!hostname) return false;
  const normalized = hostname.trim().toLowerCase();
  const explicit = exactAllowlist(configuredHostnames);
  if (configuredHostnames?.trim()) return [...explicit].some((value) => value.toLowerCase() === normalized);
  return [...exactAllowlist(configuredOrigins, fallbackOrigins)].some((origin) => {
    try {
      return new URL(origin).hostname.toLowerCase() === normalized;
    } catch {
      return false;
    }
  });
}

export function isTurnstileVerificationAccepted(
  result: TurnstileVerification,
  policy: TurnstileVerificationPolicy,
): boolean {
  if (result.success !== true) return false;
  if (result.cdata !== policy.expectedCdata) return false;
  if (policy.secret === TURNSTILE_STAGING_ALWAYS_PASS_SECRET)
    return policy.environment === "staging";
  return (
    result.action === policy.expectedAction &&
    isExactHostnameAllowed(
      result.hostname,
      policy.configuredHostnames,
      policy.configuredOrigins,
    )
  );
}

export function corsResponseOrigin(origin: string | null, configuredOrigins: string | undefined): string {
  return isExactOriginAllowed(origin, configuredOrigins) && origin ? origin : DEFAULT_CORS_ORIGIN;
}
