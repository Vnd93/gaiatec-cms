import { createHash } from "node:crypto";

const FULL_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function isPublicBridgeRunTagForCandidate(runTag, candidateSha) {
  return (
    typeof runTag === "string" &&
    FULL_SHA.test(candidateSha ?? "") &&
    new RegExp(`^QA-CMS-FINAL-[0-9]{8}-${candidateSha.slice(0, 8)}$`).test(runTag)
  );
}

export function publicBridgeRunTag({ candidateSha, at = new Date() }) {
  if (!FULL_SHA.test(candidateSha ?? "") || !(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_FIXTURE_RUN_TAG_REFUSED");
  }
  return `QA-CMS-FINAL-${at.toISOString().slice(0, 10).replaceAll("-", "")}-${candidateSha.slice(0, 8)}`;
}

export function publicBridgeWorkflowNonce({ environment, candidateSha, runId, runAttempt, instance }) {
  if (
    !["staging", "production"].includes(environment) ||
    !FULL_SHA.test(candidateSha ?? "") ||
    !POSITIVE_INTEGER.test(String(runId ?? "")) ||
    !POSITIVE_INTEGER.test(String(runAttempt ?? "")) ||
    !["preview", "canonical", "forward"].includes(instance)
  ) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_FIXTURE_IDENTITY_REFUSED");
  }
  return createHash("sha256")
    .update(`${environment}:${candidateSha}:${runId}:${runAttempt}:${instance}`)
    .digest("hex")
    .slice(0, 8);
}

export function publicBridgeCampaignLocation({ candidateSha, runTag, nonce }) {
  if (!isPublicBridgeRunTagForCandidate(runTag, candidateSha) || !/^[a-f0-9]{8}$/.test(nonce ?? "")) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_FIXTURE_CAMPAIGN_LOCATION_REFUSED");
  }
  const slug = `qa-lead-${runTag.toLowerCase()}-${nonce}`;
  return { slug, path: `/campanhas/${slug}` };
}

export function publicBridgeFixtureBinding({ candidateSha, runTag, nonce }) {
  publicBridgeCampaignLocation({ candidateSha, runTag, nonce });
  return createHash("sha256").update(`${runTag}:${nonce}`).digest("hex");
}
