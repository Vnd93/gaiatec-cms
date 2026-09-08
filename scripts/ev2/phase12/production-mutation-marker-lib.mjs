import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function validText(value, maximum = 300) {
  return typeof value === "string" && value.length <= maximum && !/[\r\n\0]/.test(value);
}

function validIdentity(value) {
  return (
    exactKeys(value, ["deploymentId", "release", "createdOn", "commitMessage"]) &&
    UUID.test(value.deploymentId ?? "") &&
    FULL_SHA.test(value.release ?? "") &&
    Number.isFinite(Date.parse(value.createdOn ?? "")) &&
    isDeploymentCommitMessage(value.commitMessage)
  );
}

function validArtifact(value) {
  return (
    exactKeys(value, ["id", "digest"]) &&
    POSITIVE_INTEGER.test(String(value.id ?? "")) &&
    SHA256.test(value.digest ?? "")
  );
}

function sameIdentity(left, right) {
  return (
    validIdentity(left) &&
    validIdentity(right) &&
    left.deploymentId === right.deploymentId &&
    left.release === right.release &&
    new Date(left.createdOn).toISOString() === new Date(right.createdOn).toISOString() &&
    left.commitMessage === right.commitMessage
  );
}

export function buildProductionMutationMarker(input) {
  const marker = {
    schemaVersion: 2,
    event: "g12.production.mutation.armed",
    environment: "production",
    backendTarget: "candidate",
    candidateSha: input.candidateSha,
    baseline: {
      deploymentId: input.baselineDeploymentId,
      release: input.baselineRelease,
      createdOn: input.baselineCreatedOn,
      commitMessage: input.baselineCommitMessage,
    },
    bridge: {
      workflowRunId: String(input.bridgeRunId),
      workflowRunAttempt: Number(input.bridgeRunAttempt),
      controlSha: input.bridgeControlSha,
      evidenceArtifact: {
        id: String(input.bridgeEvidenceArtifactId),
        digest: input.bridgeEvidenceArtifactDigest,
      },
      distArtifact: {
        id: String(input.bridgeDistArtifactId),
        digest: input.bridgeDistArtifactDigest,
      },
      production: {
        deploymentId: input.bridgeDeploymentId,
        release: input.bridgeRelease,
        createdOn: input.bridgeCreatedOn,
        commitMessage: input.bridgeCommitMessage,
      },
      predecessor: {
        deploymentId: input.bridgePredecessorDeploymentId,
        release: input.bridgePredecessorRelease,
        createdOn: input.bridgePredecessorCreatedOn,
        commitMessage: input.bridgePredecessorCommitMessage,
      },
    },
    pages: { runMarker: `g12-production-run-${input.runId}-${Number(input.runAttempt)}` },
    approval: {
      record: input.approvalRecord,
      sha256: input.approvalSha256,
      authorizedPredecessorRelease: input.approvedRollbackRelease,
      changeReference: input.changeReference,
    },
    github: {
      repository: input.repository,
      workflow: ".github/workflows/deploy-production.yml",
      controlSha: input.controlSha,
      runId: String(input.runId),
      runAttempt: Number(input.runAttempt),
    },
    armedAt: input.armedAt ?? new Date().toISOString(),
  };
  const result = validateProductionMutationMarker(marker, {
    runId: input.runId,
    runAttempt: input.runAttempt,
    controlSha: input.controlSha,
  });
  if (!result.valid) throw new Error(`G12_PRODUCTION_MUTATION_MARKER_REFUSED:${result.violations.join(",")}`);
  return marker;
}

export function validateProductionMutationMarker(marker, expected = {}) {
  const violations = [];
  if (
    !exactKeys(marker, [
      "schemaVersion",
      "event",
      "environment",
      "backendTarget",
      "candidateSha",
      "baseline",
      "bridge",
      "pages",
      "approval",
      "github",
      "armedAt",
    ]) ||
    marker?.schemaVersion !== 2
  )
    violations.push("schema_invalid");
  if (marker?.event !== "g12.production.mutation.armed") violations.push("event_invalid");
  if (marker?.environment !== "production" || marker?.backendTarget !== "candidate")
    violations.push("target_invalid");
  if (!FULL_SHA.test(marker?.candidateSha ?? "")) violations.push("candidate_invalid");
  if (!validIdentity(marker?.baseline) || marker?.baseline?.release !== marker?.candidateSha)
    violations.push("baseline_invalid");
  if (
    !exactKeys(marker?.bridge, [
      "workflowRunId",
      "workflowRunAttempt",
      "controlSha",
      "evidenceArtifact",
      "distArtifact",
      "production",
      "predecessor",
    ]) ||
    !POSITIVE_INTEGER.test(String(marker?.bridge?.workflowRunId ?? "")) ||
    !Number.isSafeInteger(marker?.bridge?.workflowRunAttempt) ||
    marker.bridge.workflowRunAttempt < 1 ||
    !FULL_SHA.test(marker?.bridge?.controlSha ?? "") ||
    !validArtifact(marker?.bridge?.evidenceArtifact) ||
    !validArtifact(marker?.bridge?.distArtifact) ||
    !validIdentity(marker?.bridge?.production) ||
    !validIdentity(marker?.bridge?.predecessor)
  )
    violations.push("bridge_invalid");
  if (!sameIdentity(marker?.baseline, marker?.bridge?.production))
    violations.push("bridge_baseline_mismatch");
  const bridgeMarker = `g12-production-bridge-run-${marker?.bridge?.workflowRunId}-${Number(marker?.bridge?.workflowRunAttempt)}`;
  if (
    marker?.bridge?.production?.release !== marker?.candidateSha ||
    marker?.bridge?.production?.commitMessage !== bridgeMarker ||
    marker?.bridge?.predecessor?.release === marker?.candidateSha
  )
    violations.push("bridge_release_chain_invalid");
  if (
    !exactKeys(marker?.pages, ["runMarker"]) ||
    !/^g12-production-run-[1-9]\d*-[1-9]\d*$/.test(marker?.pages?.runMarker ?? "") ||
    marker?.pages?.runMarker !==
      `g12-production-run-${marker?.github?.runId}-${Number(marker?.github?.runAttempt)}`
  )
    violations.push("pages_run_marker_invalid");
  if (
    !exactKeys(marker?.approval, ["record", "sha256", "authorizedPredecessorRelease", "changeReference"]) ||
    marker?.approval?.authorizedPredecessorRelease !== marker?.bridge?.predecessor?.release ||
    marker?.approval?.authorizedPredecessorRelease === marker?.candidateSha
  )
    violations.push("approval_predecessor_mismatch");
  if (!SHA256.test(marker?.approval?.sha256 ?? "")) violations.push("approval_digest_invalid");
  if (
    !validText(marker?.approval?.changeReference, 180) ||
    marker?.approval?.changeReference?.trim().length < 3
  )
    violations.push("change_reference_invalid");
  if (!/^\.github\/release-controls\/approvals\/G12_[a-f0-9]{40}\.json$/.test(marker?.approval?.record ?? ""))
    violations.push("approval_path_invalid");
  if (marker?.approval?.record !== `.github/release-controls/approvals/G12_${marker?.candidateSha}.json`)
    violations.push("approval_candidate_mismatch");
  if (
    !exactKeys(marker?.github, ["repository", "workflow", "controlSha", "runId", "runAttempt"]) ||
    marker?.github?.repository !== "Vnd93/gaiatec-cms" ||
    marker?.github?.workflow !== ".github/workflows/deploy-production.yml" ||
    !FULL_SHA.test(marker?.github?.controlSha ?? "") ||
    !POSITIVE_INTEGER.test(String(marker?.github?.runId ?? "")) ||
    !Number.isSafeInteger(marker?.github?.runAttempt) ||
    marker.github.runAttempt < 1
  )
    violations.push("github_invalid");
  if (!Number.isFinite(Date.parse(marker?.armedAt ?? ""))) violations.push("armed_at_invalid");
  if (expected.runId && String(marker?.github?.runId) !== String(expected.runId))
    violations.push("run_id_mismatch");
  if (expected.runAttempt && Number(marker?.github?.runAttempt) !== Number(expected.runAttempt))
    violations.push("run_attempt_mismatch");
  if (expected.controlSha && marker?.github?.controlSha !== expected.controlSha)
    violations.push("control_sha_mismatch");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique };
}
