const fullSha = /^[a-f0-9]{40}$/;

export function requireCanonicalFrontendCandidate(
  candidateSha: string,
  canonicalFrontendSha: string,
): string {
  if (
    !fullSha.test(candidateSha) ||
    !fullSha.test(canonicalFrontendSha) ||
    canonicalFrontendSha !== candidateSha
  ) {
    throw new Error("QA_CMS_PRODUCTION_READONLY_PREFLIGHT_CANONICAL_BRIDGE_MISMATCH");
  }
  return canonicalFrontendSha;
}
