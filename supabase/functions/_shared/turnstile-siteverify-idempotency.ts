const TURNSTILE_SITEVERIFY_IDEMPOTENCY_DOMAIN = "turnstile-siteverify:v1";
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SITEVERIFY_TIMEOUT_MS = 5_000;
export const TURNSTILE_SITEVERIFY_OPERATIONS = ["cms-lead-capture", "submit-contact"] as const;
export type TurnstileSiteverifyOperation = (typeof TURNSTILE_SITEVERIFY_OPERATIONS)[number];
export type TurnstileSiteverifyDecision = "accepted" | "rejected" | "unavailable";
export type TurnstileSiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  cdata?: string;
};
type TurnstileFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const COMPACT_CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{12}[1-8][0-9a-f]{3}[89ab][0-9a-f]{15}$/;

function assertTurnstileSiteverifyOperation(
  operation: string,
): asserts operation is TurnstileSiteverifyOperation {
  if (!TURNSTILE_SITEVERIFY_OPERATIONS.some((allowed) => allowed === operation)) {
    throw new TypeError("Unsupported Turnstile Siteverify operation.");
  }
}

export function expandCompactCanonicalUuid(value: string): string | null {
  if (!COMPACT_CANONICAL_UUID_PATTERN.test(value)) return null;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives a canonical UUID with version-4 and RFC variant bits for one exact
 * Turnstile verification attempt. The raw token is hashed before it is
 * combined with the commercial key.
 */
export async function deriveTurnstileSiteverifyIdempotencyKey(
  operation: TurnstileSiteverifyOperation,
  commercialKey: string,
  token: string,
): Promise<string> {
  assertTurnstileSiteverifyOperation(operation);
  const tokenDigest = await sha256Hex(token);
  const digest = await sha256Hex(
    `${TURNSTILE_SITEVERIFY_IDEMPOTENCY_DOMAIN}:${operation}:${commercialKey}:${tokenDigest}`,
  );
  const variantNibble = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);

  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variantNibble}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/**
 * Calls Siteverify through a bounded, fail-closed transport. A syntactically
 * valid negative verification is distinct from an unavailable upstream so the
 * public endpoint can preserve the commercial retry key on uncertain failures.
 */
export async function verifyTurnstileSiteverify(
  input: {
    operation: TurnstileSiteverifyOperation;
    commercialKey: string;
    token: string;
    secret: string;
    remoteIp: string;
    isAccepted: (result: TurnstileSiteverifyResponse) => boolean;
  },
  fetchImplementation: TurnstileFetch = fetch,
): Promise<TurnstileSiteverifyDecision> {
  try {
    const idempotencyKey = await deriveTurnstileSiteverifyIdempotencyKey(
      input.operation,
      input.commercialKey,
      input.token,
    );
    const body = new URLSearchParams({
      secret: input.secret,
      response: input.token,
      idempotency_key: idempotencyKey,
    });
    if (input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);
    const response = await fetchImplementation(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TURNSTILE_SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return "unavailable";
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) return "unavailable";
    return input.isAccepted(result as TurnstileSiteverifyResponse) ? "accepted" : "rejected";
  } catch {
    return "unavailable";
  }
}
