export const PRODUCTION_SUPABASE_PROJECT_REF = "chfuhctnhqgyjowkvllv";
export const PRODUCTION_EMAIL_PROVIDER = "resend";
export const PRODUCTION_EMAIL_DOMAIN = "gaiatecsistemas.com";
export const PRODUCTION_EMAIL_FROM = "cms@gaiatecsistemas.com";
export const PRODUCTION_SITE_ORIGIN = "https://gaiatecsistemas.com.br";
export const GITHUB_GOVERNANCE_MODE = "sole-maintainer";
export const GITHUB_SOLE_MAINTAINER = "vnd93";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PLACEHOLDER_PATTERN = /pending|todo|placeholder|change[-_ ]?me|example|cole|n\/a/i;

const isMeaningful = (value) =>
  typeof value === "string" && value.trim().length >= 3 && !PLACEHOLDER_PATTERN.test(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

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
    const directHost = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
    const poolerHost = databaseUrl.hostname.endsWith(".pooler.supabase.com");
    const poolerUser = decodeURIComponent(databaseUrl.username).endsWith(`.${projectRef}`);
    if (!directHost && !(poolerHost && poolerUser)) violations.push("database_url_project_mismatch");
    if (decodeURIComponent(databaseUrl.password).length < 16)
      violations.push("database_password_missing_or_short");
    if (databaseUrl.searchParams.get("sslmode") !== "require") violations.push("database_tls_required");
  }

  const passphrase = config?.encryptionPassphrase ?? "";
  if (typeof passphrase !== "string" || passphrase.length < 32 || PLACEHOLDER_PATTERN.test(passphrase))
    violations.push("backup_encryption_passphrase_invalid");
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
      outcome: "manual-verification-required",
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

export function validateProductionReadinessControls(readiness, { candidateSha } = {}) {
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
  if (!Number.isFinite(backup?.rpoMinutes) || backup.rpoMinutes > 1440) violations.push("backup_rpo_invalid");
  if (!Number.isFinite(backup?.rtoMinutes) || backup.rtoMinutes > 60) violations.push("restore_rto_invalid");
  evidence(backup, "backup_restore");

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
  if (email?.syntheticDeliveryStatus !== "passed" || !isMeaningful(email?.syntheticDeliveryId))
    violations.push("email_synthetic_delivery_not_verified");
  if (email?.realDataUsed !== false) violations.push("email_validation_real_data_forbidden");
  evidence(email, "email_provider");

  const csp = readiness?.csp;
  if (csp?.status !== "passed" || csp?.mode !== "enforce") violations.push("csp_not_enforced");
  if (csp?.candidateSha !== candidateSha) violations.push("csp_sha_mismatch");
  if (!SHA256_PATTERN.test(csp?.policySha256 ?? "")) violations.push("csp_policy_digest_invalid");
  if (csp?.criticalViolations !== 0) violations.push("csp_critical_violation_present");
  evidence(csp, "csp");

  if (candidateSha && !FULL_SHA_PATTERN.test(candidateSha))
    violations.push("readiness_candidate_sha_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
