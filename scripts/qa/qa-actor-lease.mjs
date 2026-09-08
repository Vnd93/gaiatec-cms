const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_TAG_PATTERN = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;
const ENVIRONMENTS = new Set(["staging", "production"]);
export const QA_ACTOR_LEASE_TTL_MINUTES = 119;
export const QA_ACTOR_LEASE_MAX_MINUTES = 120;

function assertIdentity({ actorId, runTag, candidateSha, environment }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId ?? ""))
    throw new Error("QA_ACTOR_LEASE_ACTOR_INVALID");
  if (!SHA_PATTERN.test(candidateSha ?? "")) throw new Error("QA_ACTOR_LEASE_SHA_INVALID");
  if (!RUN_TAG_PATTERN.test(runTag ?? "") || runTag.slice(-8) !== candidateSha.slice(0, 8))
    throw new Error("QA_ACTOR_LEASE_RUN_TAG_INVALID");
  if (!ENVIRONMENTS.has(environment)) throw new Error("QA_ACTOR_LEASE_ENVIRONMENT_INVALID");
}

export function createQaRunTag(candidateSha, now = new Date()) {
  if (!SHA_PATTERN.test(candidateSha ?? "")) throw new Error("QA_ACTOR_LEASE_SHA_INVALID");
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `QA-CMS-FINAL-${date}-${candidateSha.slice(0, 8)}`;
}

export function qaActorMetadata(runTag, candidateSha, environment) {
  assertIdentity({
    actorId: "00000000-0000-4000-8000-000000000000",
    runTag,
    candidateSha,
    environment,
  });
  return {
    synthetic: true,
    purpose: "qa-cms-browser",
    runTag,
    candidateSha,
    environment,
  };
}

function assertLeasePayload(payload, identity, expectedStatus) {
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.status !== expectedStatus ||
    payload.environment !== identity.environment ||
    payload.candidateSha !== identity.candidateSha ||
    payload.runTag !== identity.runTag ||
    !Number.isInteger(payload.ttlSeconds) ||
    payload.ttlSeconds !== QA_ACTOR_LEASE_TTL_MINUTES * 60 ||
    !Number.isInteger(payload.failureCount) ||
    typeof payload.swept !== "boolean"
  )
    throw new Error("QA_ACTOR_LEASE_STATUS_INVALID");
  return payload;
}

export async function assertQaActorLease(invokeRpc, identity, expectedStatus = "active") {
  if (typeof invokeRpc !== "function") throw new Error("QA_ACTOR_LEASE_RPC_INVALID");
  assertIdentity(identity);
  if (!new Set(["active", "cleaned", "expired"]).has(expectedStatus))
    throw new Error("QA_ACTOR_LEASE_EXPECTED_STATUS_INVALID");
  const payload = await invokeRpc("cms_qa_actor_lease_status", {
    p_actor_id: identity.actorId,
    p_run_tag: identity.runTag,
    p_candidate_sha: identity.candidateSha,
    p_environment: identity.environment,
  });
  return assertLeasePayload(payload, identity, expectedStatus);
}

export async function completeQaActorLease(invokeRpc, identity) {
  if (typeof invokeRpc !== "function") throw new Error("QA_ACTOR_LEASE_RPC_INVALID");
  assertIdentity(identity);
  const completed = await invokeRpc("cms_complete_qa_actor_lease", {
    p_actor_id: identity.actorId,
    p_run_tag: identity.runTag,
    p_candidate_sha: identity.candidateSha,
    p_environment: identity.environment,
  });
  if (
    !completed ||
    completed.schemaVersion !== 1 ||
    completed.status !== "cleaned" ||
    typeof completed.replayed !== "boolean"
  )
    throw new Error("QA_ACTOR_LEASE_COMPLETION_INVALID");
  return assertQaActorLease(invokeRpc, identity, "cleaned");
}
