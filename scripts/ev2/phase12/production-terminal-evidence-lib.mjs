const SHA = /^[a-f0-9]{40}$/;
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const RUN_TAG = /^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/;
const TERMINAL_TOMBSTONE = Object.freeze({
  classification: "terminalArchivedTombstone",
  count: 1,
  statusCode: 410,
  destinationAbsent: true,
  itemArchived: true,
  publicationCount: 0,
  projectionCount: 0,
  actionableOutboxCount: 0,
  piiExposed: false,
});
const TERMINAL_NO_ROUTE = Object.freeze({
  classification: "terminalNoSyntheticRoute",
  count: 0,
  activeRouteRules: 0,
  identifiersOrPathsPersisted: false,
});

function exactObject(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(Object.keys(expected).sort())) {
    return false;
  }
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function artifactReference(id, digest, required) {
  const reference = { id: String(id ?? ""), digest: String(digest ?? "") };
  if (!required && !reference.id && !reference.digest) return null;
  if (!/^\d+$/.test(reference.id) || !ARTIFACT_DIGEST.test(reference.digest))
    throw new Error("G12_PRODUCTION_TERMINAL_EVIDENCE_ARTIFACT_REFUSED");
  return reference;
}

export function productionOutboxTerminalPassed(outbox, candidateSha, outcome) {
  const strongCanary =
    outbox?.event === "g12.production.outbox_cache_canary.verified" &&
    outbox?.candidateSha === candidateSha &&
    outbox?.syntheticOnly === true &&
    Number.isSafeInteger(outbox?.eventCount) &&
    outbox.eventCount > 0 &&
    outbox?.completedCount === outbox.eventCount &&
    outbox?.failedCount === 0 &&
    outbox?.cacheInvalidationProvenByWorkerCompletion === true;
  const readiness =
    outbox?.event === "g12.production.outbox_cache_readiness.verified" &&
    outbox?.candidateSha === candidateSha &&
    outbox?.cacheInvalidationCredentialReady === true &&
    outbox?.realCanaryNotApplicable === true;
  const recoveredNoRoute = exactObject(outbox?.terminalNoSyntheticRoute, TERMINAL_NO_ROUTE);
  return outcome === "active"
    ? strongCanary && !Object.hasOwn(outbox, "terminalNoSyntheticRoute")
    : outcome === "recovered" && recoveredNoRoute && (strongCanary || readiness);
}

export function productionResidueTerminalPassed(residue, candidateSha, outcome) {
  const common =
    residue?.event === "g12.production.synthetic_residue.verified" &&
    residue?.status === "passed" &&
    residue?.environment === "production" &&
    residue?.candidateSha === candidateSha &&
    RUN_TAG.test(residue?.runTag ?? "") &&
    residue.runTag.endsWith(`-${candidateSha.slice(0, 8)}`) &&
    residue?.activeResidue === 0 &&
    residue?.activeLeases === 0 &&
    residue?.activeSessions === 0 &&
    residue?.actionableRouteRules === 0 &&
    residue?.actionablePublicationOutbox === 0 &&
    residue?.auditRetained === true &&
    residue?.identifiersOrPathsPersisted === false;
  if (!common) return false;
  if (outcome === "active") {
    return (
      exactObject(residue.terminalArchivedTombstone, TERMINAL_TOMBSTONE) &&
      !Object.hasOwn(residue, "terminalNoSyntheticRoute")
    );
  }
  if (outcome === "recovered") {
    return (
      residue.terminalArchivedTombstone === null &&
      exactObject(residue.terminalNoSyntheticRoute, TERMINAL_NO_ROUTE)
    );
  }
  return false;
}

export function buildProductionTerminalEvidence(input) {
  if (
    !["active", "recovered"].includes(input.outcome) ||
    !SHA.test(input.candidateSha ?? "") ||
    !SHA.test(input.controlSha ?? "") ||
    !SHA.test(input.pagesRelease ?? "") ||
    !/^\d+$/.test(String(input.runId ?? "")) ||
    !/^\d+$/.test(String(input.runAttempt ?? ""))
  )
    throw new Error("G12_PRODUCTION_TERMINAL_EVIDENCE_CONTEXT_REFUSED");
  const success = input.outcome === "active";
  const expectedPagesRelease = success ? input.candidateSha : input.baselineRelease;
  if (input.pagesRelease !== expectedPagesRelease)
    throw new Error("G12_PRODUCTION_TERMINAL_EVIDENCE_PAGES_MISMATCH");
  for (const check of input.checks ?? []) {
    if (check?.passed !== true || typeof check?.name !== "string")
      throw new Error("G12_PRODUCTION_TERMINAL_EVIDENCE_CHECK_REFUSED");
  }
  if ((input.checks ?? []).length < 8) throw new Error("G12_PRODUCTION_TERMINAL_EVIDENCE_CHECKS_INCOMPLETE");
  return {
    schemaVersion: 1,
    event: "g12.production.terminal_state.verified",
    outcome: input.outcome,
    environment: "production",
    candidateSha: input.candidateSha,
    backendTarget: "candidate",
    pagesRelease: input.pagesRelease,
    baselineRelease: input.baselineRelease,
    github: {
      repository: "Vnd93/gaiatec-cms",
      workflow: ".github/workflows/deploy-production.yml",
      controlSha: input.controlSha,
      runId: String(input.runId),
      runAttempt: Number(input.runAttempt),
    },
    artifacts: {
      mutationMarker: artifactReference(input.markerArtifactId, input.markerArtifactDigest, true),
      releaseEvidence: artifactReference(input.releaseArtifactId, input.releaseArtifactDigest, success),
      backendEvidence: artifactReference(input.backendArtifactId, input.backendArtifactDigest, success),
    },
    checks: input.checks,
    secretsDisclosed: false,
    verifiedAt: new Date().toISOString(),
  };
}
