import { assertQaActorLease } from "../../qa/qa-actor-lease.mjs";

const STAGING_AUTH_URL = "https://glcqsosxwgmlhzgcsnzv.supabase.co/auth/v1/logout?scope=global";

// Use Auth's session-removal API, not the platform SQL gateway, for signed-in actors.
// Keep SQL only for partially-created fixtures that never returned a usable JWT.
// Neither transport retries or accepts errors; completion and residue still prove zero sessions.
export async function revokeStagingQaSessions({
  identity,
  token,
  anonKey,
  invokeLeaseRpc,
  managementQuery,
  fetchImpl = fetch,
}) {
  if (identity?.environment !== "staging") throw new Error("G11_QA_SESSION_ENVIRONMENT_REFUSED");
  if (token) {
    let claims;
    try {
      claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    } catch {
      throw new Error("G11_QA_SESSION_TOKEN_INVALID");
    }
    // This is an extra binding check, not JWT authentication; Auth verifies the actual signature.
    if (claims?.sub !== identity.actorId || typeof claims?.session_id !== "string")
      throw new Error("G11_QA_SESSION_TOKEN_BINDING_REFUSED");
  }
  await assertQaActorLease(invokeLeaseRpc, identity, "active");
  if (!token) {
    await managementQuery(`delete from auth.sessions where user_id = '${identity.actorId}'::uuid`);
    return;
  }
  let response;
  try {
    response = await fetchImpl(STAGING_AUTH_URL, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Never propagate a transport exception containing a JWT, URL, headers or response body.
    throw new Error("G11_QA_SESSION_REVOCATION_TRANSPORT_FAILED");
  }
  if (response.status !== 204) throw new Error(`G11_QA_SESSION_REVOCATION_FAILED:${response.status}`);
}
