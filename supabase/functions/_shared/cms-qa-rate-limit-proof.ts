const shaPattern = /^[0-9a-f]{40}$/;
const runTagPattern = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CMS_QA_RATE_LIMIT_ACTION = "cms_public_search_qa_proof";

export type CmsQaRateLimitProofBinding = {
  environment: string | undefined;
  configuredReleaseSha: string | undefined;
  configuredAdminOrigin: string | undefined;
  requestOrigin: string | null;
  originAllowed: boolean;
  actorId: string;
  aal: string;
  userMetadata: Record<string, unknown>;
  requestedCandidateSha: string | null;
  requestedRunTag: string | null;
  proofId: string | null;
  operation: string | null;
};

export function cmsQaRateLimitProofPreflightIsExact(
  input: Pick<
    CmsQaRateLimitProofBinding,
    | "environment"
    | "configuredReleaseSha"
    | "configuredAdminOrigin"
    | "requestOrigin"
    | "originAllowed"
  >,
): boolean {
  return (
    input.environment === "staging" &&
    shaPattern.test(input.configuredReleaseSha ?? "") &&
    Boolean(input.requestOrigin) &&
    input.requestOrigin === input.configuredAdminOrigin &&
    input.originAllowed
  );
}

export function cmsQaRateLimitProofBindingIsExact(input: CmsQaRateLimitProofBinding): boolean {
  const metadata = input.userMetadata;
  const candidateSha = input.requestedCandidateSha ?? "";
  const runTag = input.requestedRunTag ?? "";
  return (
    cmsQaRateLimitProofPreflightIsExact(input) &&
    input.configuredReleaseSha === candidateSha &&
    uuidPattern.test(input.actorId) &&
    input.aal === "aal2" &&
    metadata.synthetic === true &&
    metadata.purpose === "qa-cms-browser" &&
    metadata.environment === "staging" &&
    metadata.candidateSha === candidateSha &&
    metadata.runTag === runTag &&
    shaPattern.test(candidateSha) &&
    runTagPattern.test(runTag) &&
    runTag.endsWith(`-${candidateSha.slice(0, 8)}`) &&
    uuidPattern.test(input.proofId ?? "") &&
    (input.operation === "consume" || input.operation === "cleanup")
  );
}
