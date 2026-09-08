export const PRODUCTION_SUPABASE_PROJECT_REF = "chfuhctnhqgyjowkvllv";
export const PRODUCTION_EMAIL_PROVIDER = "resend";
export const PRODUCTION_EMAIL_DOMAIN = "gaiatecsistemas.com";
export const PRODUCTION_EMAIL_FROM = "cms@gaiatecsistemas.com";
export const PRODUCTION_SITE_ORIGIN = "https://gaiatecsistemas.com.br";
export const PRODUCTION_EMAIL_WORKFLOW = ".github/workflows/verify-production-email.yml";
export const PRODUCTION_EMAIL_WORKFLOW_NAME = "Verify production email provider";
export const GITHUB_GOVERNANCE_MODE = "sole-maintainer";
export const GITHUB_SOLE_MAINTAINER = "vnd93";
export const PRODUCTION_BACKUP_REPOSITORY = "Vnd93/gaiatec-cms";
export const PRODUCTION_BACKUP_WORKFLOW = ".github/workflows/backup-supabase-production.yml";
export const PRODUCTION_BACKUP_WORKFLOW_NAME = "Backup Supabase production";
export const PRODUCTION_POSTGRES_MAJOR = 17;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PLACEHOLDER_PATTERN = /pending|todo|placeholder|change[-_ ]?me|example|cole|n\/a/i;

const isMeaningful = (value) =>
  typeof value === "string" && value.trim().length >= 3 && !PLACEHOLDER_PATTERN.test(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const isRunId = (value) => typeof value === "string" && /^[1-9]\d{5,19}$/.test(value);

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function classifySupabaseServiceKey(value, { now = new Date() } = {}) {
  const key = typeof value === "string" ? value.trim() : "";
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return "opaque";
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)) || parts[2].length < 32)
    return null;
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const nowSeconds = Math.floor((now instanceof Date ? now.getTime() : Date.parse(now)) / 1000);
  if (
    header?.alg !== "HS256" ||
    payload?.role !== "service_role" ||
    !/^supabase(?:-|$)/.test(String(payload?.iss ?? "")) ||
    !Number.isSafeInteger(payload?.iat) ||
    !Number.isSafeInteger(payload?.exp) ||
    payload.exp <= payload.iat ||
    !Number.isFinite(nowSeconds) ||
    payload.exp <= nowSeconds
  )
    return null;
  return "legacy-jwt";
}

export function supabaseServiceKeyHeaders(value, options) {
  const key = typeof value === "string" ? value.trim() : "";
  const kind = classifySupabaseServiceKey(key, options);
  if (!kind) throw new Error("SUPABASE_SERVICE_KEY_INVALID");
  return kind === "opaque" ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function postgresMajor(value) {
  const text = String(value ?? "").trim();
  const versionNumber = text.match(/^([1-9]\d{1,2})\d{4}$/);
  if (versionNumber) return Number(versionNumber[1]);
  const versionText = text.match(/(?:PostgreSQL\)?\s+)?([1-9]\d?)(?:\.\d+)?/i);
  return versionText ? Number(versionText[1]) : Number.NaN;
}

export function validatePostgresBackupRuntime({ clientVersion, serverVersion }) {
  const clientMajor = postgresMajor(clientVersion);
  const serverMajor = postgresMajor(serverVersion);
  const violations = [];
  if (!Number.isSafeInteger(serverMajor) || serverMajor !== PRODUCTION_POSTGRES_MAJOR)
    violations.push("backup_server_postgres_major_invalid");
  if (!Number.isSafeInteger(clientMajor) || clientMajor < serverMajor)
    violations.push("backup_pg_dump_major_too_old");
  return { valid: violations.length === 0, violations, clientMajor, serverMajor };
}

export function backupEvidenceRepositoryPath(control) {
  if (!isRunId(control?.backupRunId) || !isPositiveInteger(control?.backupRunAttempt)) return null;
  const expected = `.github/release-controls/evidence/BACKUP_RESTORE_${control.backupRunId}_${control.backupRunAttempt}.json`;
  return control?.evidenceReference === expected && SHA256_PATTERN.test(control?.evidenceSha256 ?? "")
    ? expected
    : null;
}

export function validateBackupEvidenceBinding(control, evidence, { evidenceSha256 } = {}) {
  const violations = [];
  const repositoryPath = backupEvidenceRepositoryPath(control);
  if (!repositoryPath) violations.push("backup_evidence_reference_or_digest_invalid");
  else if (evidenceSha256 !== control?.evidenceSha256) violations.push("backup_evidence_digest_mismatch");
  if (evidence?.schemaVersion !== 1) violations.push("backup_evidence_schema_invalid");
  if (evidence?.event !== "supabase.production-backup.restore-evidence")
    violations.push("backup_evidence_event_invalid");
  if (evidence?.repository !== PRODUCTION_BACKUP_REPOSITORY)
    violations.push("backup_evidence_repository_invalid");
  if (
    evidence?.workflow?.name !== PRODUCTION_BACKUP_WORKFLOW_NAME ||
    evidence?.workflow?.path !== PRODUCTION_BACKUP_WORKFLOW
  )
    violations.push("backup_evidence_workflow_invalid");
  if (
    evidence?.run?.id !== control?.backupRunId ||
    evidence?.run?.attempt !== control?.backupRunAttempt ||
    evidence?.run?.event !== control?.backupEvent ||
    evidence?.run?.ref !== control?.backupRef ||
    evidence?.run?.headSha !== control?.backupSourceSha
  )
    violations.push("backup_evidence_run_binding_invalid");
  if (
    evidence?.artifact?.name !== control?.artifactName ||
    evidence?.artifact?.manifestSha256 !== control?.manifestSha256 ||
    evidence?.artifact?.encryptedArchiveSha256 !== control?.encryptedArchiveSha256 ||
    !SHA256_PATTERN.test(evidence?.artifact?.manifestSha256 ?? "") ||
    !SHA256_PATTERN.test(evidence?.artifact?.encryptedArchiveSha256 ?? "") ||
    !SHA256_PATTERN.test(evidence?.artifact?.encryptedArchiveSealSha256 ?? "")
  )
    violations.push("backup_evidence_artifact_binding_invalid");
  const expectedArchiveFile = `supabase-production-backup-${control?.backupRunId}-${control?.backupRunAttempt}.tar.gz.gpg`;
  if (
    !Number.isSafeInteger(evidence?.artifact?.encryptedArchiveBytes) ||
    evidence.artifact.encryptedArchiveBytes <= 0 ||
    evidence?.artifact?.encryptedArchiveFile !== expectedArchiveFile
  )
    violations.push("backup_evidence_archive_invalid");
  if (
    evidence?.backup?.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
    evidence?.backup?.externalTarget !== "github-actions-encrypted-artifact" ||
    !isIsoDate(evidence?.backup?.createdAt) ||
    !isIsoDate(evidence?.backup?.snapshotAt) ||
    !isIsoDate(evidence?.backup?.snapshotVerifiedAt) ||
    !isIsoDate(evidence?.backup?.sealedAt) ||
    evidence?.backup?.createdAt !== evidence?.backup?.sealedAt ||
    Date.parse(evidence?.backup?.snapshotAt ?? "") > Date.parse(evidence?.backup?.sealedAt ?? "") ||
    Date.parse(evidence?.backup?.snapshotVerifiedAt ?? "") < Date.parse(evidence?.backup?.snapshotAt ?? "") ||
    Date.parse(evidence?.backup?.snapshotVerifiedAt ?? "") > Date.parse(evidence?.backup?.sealedAt ?? "") ||
    !/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/.test(evidence?.backup?.snapshotWalLsn ?? "") ||
    evidence?.backup?.createdAt !== control?.completedAt
  )
    violations.push("backup_evidence_backup_binding_invalid");
  const drill = evidence?.restoreDrill;
  if (
    drill?.performed !== true ||
    drill?.outcome !== "passed" ||
    drill?.target !== "ephemeral-local-supabase" ||
    drill?.completeDataRestoreDrill !== true ||
    !isIsoDate(drill?.startedAt) ||
    !isIsoDate(drill?.completedAt) ||
    !isPositiveInteger(drill?.durationSeconds) ||
    Date.parse(drill.completedAt) < Date.parse(drill.startedAt) ||
    Math.abs(
      drill.durationSeconds -
        Math.round((Date.parse(drill.completedAt) - Date.parse(drill.startedAt)) / 1000),
    ) > 2 ||
    Date.parse(drill.completedAt) > Date.parse(evidence?.backup?.createdAt ?? "") ||
    drill.durationSeconds > control?.rtoMinutes * 60
  )
    violations.push("backup_evidence_restore_drill_invalid");
  const checks = drill?.verifications;
  if (
    !checks ||
    [
      "portableRoleCatalogMatched",
      "schemaRestored",
      "publicTableInventoryMatched",
      "publicRowCountsMatched",
      "authMetadataMatched",
      "authFullRowFingerprintsMatched",
      "storageMetadataMatched",
      "storageFullRowFingerprintsMatched",
      "storageMetadataReappliedAfterUpload",
      "storagePayloadsByteIdentical",
      "archiveDigestStable",
    ].some((key) => checks[key] !== true)
  )
    violations.push("backup_evidence_restore_checks_incomplete");
  if (checks?.rolesRestored !== false) violations.push("backup_evidence_role_restore_claim_invalid");
  if (
    evidence?.roleRestore?.portableRoleCatalogMatched !== true ||
    evidence?.roleRestore?.rolesRestoredExactly !== false ||
    evidence?.roleRestore?.credentialsRestored !== false ||
    evidence?.roleRestore?.limitation !== "role-passwords-and-role-settings-are-not-restored"
  )
    violations.push("backup_evidence_role_scope_invalid");
  const reportBindings = [
    evidence?.reportDigests?.source?.scope,
    evidence?.reportDigests?.source?.storagePayloads,
    evidence?.reportDigests?.source?.storageSnapshotStability,
    evidence?.reportDigests?.source?.roles,
    evidence?.reportDigests?.restore?.scope,
    evidence?.reportDigests?.restore?.storagePayloads,
    evidence?.reportDigests?.restore?.roles,
  ];
  if (
    reportBindings.some(
      (binding) =>
        typeof binding?.file !== "string" ||
        !Number.isSafeInteger(binding?.bytes) ||
        binding.bytes <= 0 ||
        !SHA256_PATTERN.test(binding?.sha256 ?? ""),
    )
  )
    violations.push("backup_evidence_report_binding_invalid");
  if (evidence?.sensitiveValuesLogged !== false) violations.push("backup_evidence_sensitive_logging_invalid");
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations, repositoryPath };
}

function parseMailbox(value) {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+)>?$/);
  return match?.[1]?.toLowerCase() ?? "";
}

export function validateBackupConfig(config) {
  const violations = [];
  const projectRef = config?.projectRef ?? "";
  if (projectRef !== PRODUCTION_SUPABASE_PROJECT_REF) violations.push("production_project_ref_mismatch");
  if (config?.gitRef && config.gitRef !== "refs/heads/main") violations.push("backup_must_run_from_main");
  if (config?.target !== "github-actions-encrypted-artifact")
    violations.push("external_backup_target_invalid");

  let databaseUrl;
  try {
    databaseUrl = new URL(config?.databaseUrl);
  } catch {
    violations.push("database_url_invalid");
  }
  if (databaseUrl) {
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol))
      violations.push("database_url_protocol_invalid");
    if (databaseUrl.hostname !== `db.${projectRef}.supabase.co`)
      violations.push("database_url_must_be_direct_session_endpoint");
    if (databaseUrl.port !== "5432") violations.push("database_url_session_port_invalid");
    if (decodeURIComponent(databaseUrl.username) !== "postgres") violations.push("database_user_invalid");
    if (databaseUrl.pathname !== "/postgres") violations.push("database_name_invalid");
    if (decodeURIComponent(databaseUrl.password).length < 16)
      violations.push("database_password_missing_or_short");
    if (databaseUrl.searchParams.get("sslmode") !== "require") violations.push("database_tls_required");
  }

  const passphrase = config?.encryptionPassphrase ?? "";
  if (typeof passphrase !== "string" || passphrase.length < 32 || PLACEHOLDER_PATTERN.test(passphrase))
    violations.push("backup_encryption_passphrase_invalid");

  if (!classifySupabaseServiceKey(config?.serviceRoleKey)) violations.push("backup_service_role_key_invalid");
  return { valid: violations.length === 0, violations };
}

export function validateEmailProviderConfig(config, { requireApiKey = true } = {}) {
  const violations = [];
  if (String(config?.provider ?? "").toLowerCase() !== PRODUCTION_EMAIL_PROVIDER)
    violations.push("email_provider_invalid");
  if (parseMailbox(config?.from) !== PRODUCTION_EMAIL_FROM) violations.push("email_from_invalid");
  if (config?.sendingDomain !== PRODUCTION_EMAIL_DOMAIN) violations.push("email_domain_invalid");
  if (config?.siteOrigin !== PRODUCTION_SITE_ORIGIN) violations.push("email_site_origin_invalid");

  const recipients = String(config?.notificationTo ?? "")
    .split(",")
    .map((value) => parseMailbox(value))
    .filter(Boolean);
  if (recipients.length === 0 || recipients.some((email) => !email.endsWith("@gaiatecsistemas.com.br")))
    violations.push("notification_recipient_invalid");

  if (
    requireApiKey &&
    (typeof config?.apiKey !== "string" ||
      !config.apiKey.startsWith("re_") ||
      config.apiKey.length < 24 ||
      PLACEHOLDER_PATTERN.test(config.apiKey))
  )
    violations.push("resend_api_key_invalid");
  return { valid: violations.length === 0, violations };
}

export function validateResendDomainResponse(payload, expectedDomain = PRODUCTION_EMAIL_DOMAIN) {
  const domains = Array.isArray(payload?.data) ? payload.data : [];
  const domain = domains.find((item) => item?.name === expectedDomain);
  const violations = [];
  if (!domain) violations.push("resend_domain_not_found");
  else if (String(domain.status).toLowerCase() !== "verified") violations.push("resend_domain_not_verified");
  return { valid: violations.length === 0, violations, domainId: domain?.id ?? null };
}

export function classifyResendDeliveryStatus({ httpStatus, lastEvent }) {
  if (httpStatus === 401)
    return {
      outcome: "unreadable",
      terminal: true,
      event: "unreadable-by-sending-only-token",
    };
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300)
    return { outcome: "unreadable", terminal: true, event: "unknown" };

  const event = String(lastEvent ?? "unknown").toLowerCase();
  if (["delivered", "opened", "clicked"].includes(event))
    return { outcome: "delivered", terminal: true, event };
  if (["bounced", "complained", "canceled", "failed"].includes(event))
    return { outcome: "failed", terminal: true, event };
  return { outcome: "pending", terminal: false, event };
}

export function validateProductionReadinessControls(
  readiness,
  { candidateSha, approvalSchemaVersion = 3 } = {},
) {
  const violations = [];
  const evidence = (control, prefix) => {
    if (!isMeaningful(control?.evidenceReference)) violations.push(`${prefix}_evidence_invalid`);
    if (!isIsoDate(control?.verifiedAt ?? control?.approvedAt ?? control?.completedAt))
      violations.push(`${prefix}_timestamp_invalid`);
  };

  const github = readiness?.githubProtection;
  if (github?.status !== "verified") violations.push("github_protection_not_verified");
  if (github?.candidateSha !== candidateSha) violations.push("github_protection_sha_mismatch");
  if (github?.governanceMode !== GITHUB_GOVERNANCE_MODE) violations.push("github_governance_mode_invalid");
  if (String(github?.maintainerLogin ?? "").toLowerCase() !== GITHUB_SOLE_MAINTAINER)
    violations.push("github_sole_maintainer_invalid");
  if (github?.requiredPullRequestApprovals !== 0) violations.push("github_solo_review_count_must_be_zero");
  if (github?.codeOwnersCount !== 1) violations.push("github_single_codeowner_required");
  if (github?.branchProtected !== true) violations.push("main_branch_not_protected");
  if (github?.requiredChecksPassed !== true) violations.push("github_required_checks_not_verified");
  if (github?.soleMaintainerRiskAccepted !== true)
    violations.push("github_sole_maintainer_risk_not_accepted");
  evidence(github, "github_protection");

  const backup = readiness?.backupRestore;
  if (backup?.status !== "passed") violations.push("backup_restore_not_passed");
  if (backup?.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF) violations.push("backup_project_ref_mismatch");
  if (!SHA256_PATTERN.test(backup?.encryptedArchiveSha256 ?? ""))
    violations.push("backup_archive_digest_invalid");
  if (!isMeaningful(backup?.backupRunId) || !isMeaningful(backup?.restoreDrillRunId))
    violations.push("backup_restore_run_invalid");
  if (backup?.externalTarget !== "github-actions-encrypted-artifact")
    violations.push("backup_external_target_invalid");
  if (!Number.isFinite(backup?.rpoMinutes) || backup.rpoMinutes <= 0 || backup.rpoMinutes > 1440)
    violations.push("backup_rpo_invalid");
  if (!Number.isFinite(backup?.rtoMinutes) || backup.rtoMinutes <= 0 || backup.rtoMinutes > 60)
    violations.push("restore_rto_invalid");
  evidence(backup, "backup_restore");
  if (approvalSchemaVersion >= 3) {
    if (!isRunId(backup?.backupRunId) || backup?.restoreDrillRunId !== backup?.backupRunId)
      violations.push("backup_restore_run_binding_invalid");
    if (!isPositiveInteger(backup?.backupRunAttempt)) violations.push("backup_run_attempt_invalid");
    if (
      backup?.backupWorkflow !== PRODUCTION_BACKUP_WORKFLOW ||
      backup?.backupWorkflowName !== PRODUCTION_BACKUP_WORKFLOW_NAME
    )
      violations.push("backup_workflow_invalid");
    if (backup?.backupRef !== "refs/heads/main") violations.push("backup_ref_invalid");
    if (!["workflow_dispatch", "schedule"].includes(backup?.backupEvent))
      violations.push("backup_event_invalid");
    if (!FULL_SHA_PATTERN.test(backup?.backupSourceSha ?? "")) violations.push("backup_source_sha_invalid");
    else if (backup.backupSourceSha !== candidateSha) violations.push("backup_source_sha_candidate_mismatch");
    const expectedArtifact = `supabase-production-backup-${backup?.backupRunId}-${backup?.backupRunAttempt}`;
    if (backup?.artifactName !== expectedArtifact) violations.push("backup_artifact_name_invalid");
    if (!isRunId(backup?.artifactId)) violations.push("backup_artifact_id_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(backup?.artifactDigest ?? ""))
      violations.push("backup_artifact_digest_invalid");
    if (!isIsoDate(backup?.runCompletedAt)) violations.push("backup_run_completed_at_invalid");
    else if (
      isIsoDate(backup?.completedAt) &&
      Date.parse(backup.runCompletedAt) < Date.parse(backup.completedAt)
    )
      violations.push("backup_run_completed_before_evidence");
    if (!SHA256_PATTERN.test(backup?.manifestSha256 ?? "")) violations.push("backup_manifest_digest_invalid");
    if (!backupEvidenceRepositoryPath(backup)) violations.push("backup_evidence_binding_invalid");
  }

  const dpoLegal = readiness?.dpoLegal;
  if (dpoLegal?.status !== "approved") violations.push("dpo_legal_not_approved");
  if (!isMeaningful(dpoLegal?.approverId)) violations.push("dpo_legal_approver_invalid");
  else if (dpoLegal.approverId.trim().toLowerCase() !== GITHUB_SOLE_MAINTAINER)
    violations.push("dpo_legal_approver_must_match_sole_maintainer");
  if (!SHA256_PATTERN.test(dpoLegal?.scopeSha256 ?? "")) violations.push("dpo_legal_scope_invalid");
  evidence(dpoLegal, "dpo_legal");

  const email = readiness?.emailProvider;
  const emailConfig = validateEmailProviderConfig(
    {
      provider: email?.provider,
      from: email?.from,
      sendingDomain: email?.sendingDomain,
      siteOrigin: PRODUCTION_SITE_ORIGIN,
      notificationTo: email?.notificationTo,
    },
    { requireApiKey: false },
  );
  violations.push(...emailConfig.violations);
  if (email?.status !== "verified") violations.push("email_provider_not_verified");
  if (
    email?.syntheticDeliveryStatus !== "passed" ||
    (approvalSchemaVersion >= 3
      ? !SHA256_PATTERN.test(email?.syntheticDeliveryIdSha256 ?? "")
      : !isMeaningful(email?.syntheticDeliveryId))
  )
    violations.push("email_synthetic_delivery_not_verified");
  if (email?.realDataUsed !== false) violations.push("email_validation_real_data_forbidden");
  evidence(email, "email_provider");
  if (approvalSchemaVersion >= 3) {
    if (email?.candidateSha !== candidateSha) violations.push("email_candidate_sha_mismatch");
    if (!isRunId(email?.emailRunId) || !isPositiveInteger(email?.emailRunAttempt))
      violations.push("email_run_invalid");
    if (
      email?.emailWorkflow !== PRODUCTION_EMAIL_WORKFLOW ||
      email?.emailWorkflowName !== PRODUCTION_EMAIL_WORKFLOW_NAME
    )
      violations.push("email_workflow_invalid");
    if (
      email?.emailEvent !== "workflow_dispatch" ||
      email?.emailRef !== "refs/heads/main" ||
      email?.emailSourceSha !== candidateSha
    )
      violations.push("email_run_candidate_binding_invalid");
    if (!isIsoDate(email?.runCompletedAt)) violations.push("email_run_completed_at_invalid");
    else if (isIsoDate(email?.verifiedAt) && Date.parse(email.runCompletedAt) < Date.parse(email.verifiedAt))
      violations.push("email_run_completed_before_delivery_proof");
    if (email?.artifactName !== `production-email-evidence-${candidateSha}`)
      violations.push("email_artifact_name_invalid");
    if (!isRunId(email?.artifactId)) violations.push("email_artifact_id_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(email?.artifactDigest ?? ""))
      violations.push("email_artifact_digest_invalid");
    if (!SHA256_PATTERN.test(email?.evidenceSha256 ?? "")) violations.push("email_evidence_digest_invalid");
    if (
      email?.evidenceReference !==
      `https://github.com/${PRODUCTION_BACKUP_REPOSITORY}/actions/runs/${email?.emailRunId}`
    )
      violations.push("email_evidence_reference_invalid");
  }

  const csp = readiness?.csp;
  if (csp?.status !== "passed" || csp?.mode !== "enforce") violations.push("csp_not_enforced");
  if (csp?.candidateSha !== candidateSha) violations.push("csp_sha_mismatch");
  if (!SHA256_PATTERN.test(csp?.policySha256 ?? "")) violations.push("csp_policy_digest_invalid");
  if (approvalSchemaVersion >= 3 && !SHA256_PATTERN.test(csp?.adminPolicySha256 ?? ""))
    violations.push("csp_admin_policy_digest_invalid");
  if (csp?.criticalViolations !== 0) violations.push("csp_critical_violation_present");
  evidence(csp, "csp");

  if (candidateSha && !FULL_SHA_PATTERN.test(candidateSha))
    violations.push("readiness_candidate_sha_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
