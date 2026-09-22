const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function validArtifact(value) {
  return exactKeys(value, ["id", "digest"]) && POSITIVE_INTEGER.test(value.id) && SHA256.test(value.digest);
}

function validValidationArtifacts(value) {
  return (
    exactKeys(value, ["preflight", "source", "liveBaseline"]) &&
    validArtifact(value.preflight) &&
    validArtifact(value.source) &&
    validArtifact(value.liveBaseline)
  );
}

export function verifyStagingRollbackDeployEvidence({ evidence, expected }) {
  const violations = [];
  const baseKeys = ["schemaVersion", "event", "candidateSha", "state", "recovery", "candidate"];
  const currentKeys = [...baseKeys, "validations"];
  if (!exactKeys(evidence, baseKeys) && !exactKeys(evidence, currentKeys))
    violations.push("evidence_shape_invalid");
  if (evidence?.schemaVersion !== 1 || evidence?.event !== "g12.staging.artifacts.bound")
    violations.push("evidence_identity_invalid");
  if (!FULL_SHA.test(expected?.candidateSha ?? "") || evidence?.candidateSha !== expected.candidateSha)
    violations.push("candidate_sha_mismatch");
  if (!POSITIVE_INTEGER.test(expected?.artifactId ?? "")) violations.push("artifact_id_invalid");
  if (!SHA256.test(expected?.artifactDigest ?? "")) violations.push("artifact_digest_invalid");
  if (!validArtifact(evidence?.state) || !validArtifact(evidence?.recovery))
    violations.push("durable_artifact_binding_invalid");
  if (Object.hasOwn(evidence ?? {}, "validations") && !validValidationArtifacts(evidence.validations))
    violations.push("validation_artifact_binding_invalid");
  if (
    !exactKeys(evidence?.candidate, ["id", "digest", "archiveSha256", "treeSha256"]) ||
    evidence?.candidate?.id !== expected?.artifactId ||
    evidence?.candidate?.digest !== expected?.artifactDigest ||
    !HEX_SHA256.test(evidence?.candidate?.archiveSha256 ?? "") ||
    !HEX_SHA256.test(evidence?.candidate?.treeSha256 ?? "")
  ) {
    violations.push("candidate_artifact_binding_invalid");
  }
  const unique = [...new Set(violations)];
  return {
    valid: unique.length === 0,
    violations: unique,
    archiveSha256: unique.length === 0 ? evidence.candidate.archiveSha256 : "",
    treeSha256: unique.length === 0 ? evidence.candidate.treeSha256 : "",
  };
}
