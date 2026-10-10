const CLEANUP_STAGES = new Set([
  "owned_content_inventory",
  "owned_form_inventory",
  "public_projection_inventory",
  "public_withdrawal_outbox",
  "publication_cleanup",
  "projection_cleanup",
  "route_cleanup",
  "content_archive",
  "form_version_retirement",
  "form_retirement",
  "overrides",
  "scoped_roles",
  "legacy_roles",
  "rdo_access",
  "profile",
  "sessions",
  "credentials",
  "lease",
]);
const SQLSTATES = new Set(["57014", "42501", "23503", "23505", "23514", "40001", "40P01", "55000"]);
const PRIMARY_CODES = new Set([
  "G7_SCHEDULED_PUBLICATION_FIXTURE_REFUSED",
  "G7_SCHEDULED_PUBLICATION_READ_FAILED",
  "G7_SCHEDULED_PUBLICATION_DRIVER_REFUSED",
  "G7_SCHEDULED_PUBLICATION_CLOCK_REFUSED",
  "G7_SCHEDULED_PUBLICATION_DUE_DEADLINE",
  "G7_SCHEDULED_PUBLICATION_PENDING_REFUSED",
  "G7_SCHEDULED_PUBLICATION_RPC_REFUSED",
  "G7_SCHEDULED_PUBLICATION_STATE_REFUSED",
  "G7_CAMPAIGN_EXPIRY_FIXTURES_REFUSED",
  "G7_CAMPAIGN_EXPIRY_READ_FAILED",
  "G7_CAMPAIGN_EXPIRY_STATE_REFUSED",
]);
const INVOCATION_ACTIONS = new Map([
  [
    "cms-content",
    new Set([
      "approve",
      "archive",
      "archive_form",
      "bulk_create",
      "bulk_validate",
      "create",
      "publish",
      "publish_form",
      "reopen",
      "restore",
      "restore_form",
      "save",
      "save_form",
      "schedule",
      "submit",
    ]),
  ],
  ["cms-leads", new Set(["anonymize_lead", "export_leads", "update_lead"])],
  ["cms-session", new Set(["mfa"])],
]);

export function lifecycleCleanupDiagnostic(label, error) {
  const stage = String(label).split(":", 1)[0];
  return {
    stage: CLEANUP_STAGES.has(stage) ? stage : "unknown",
    ...(SQLSTATES.has(error?.code) ? { sqlstate: error.code } : {}),
  };
}

export class LifecycleCleanupError extends Error {
  constructor(diagnostics) {
    super("G7_LIFECYCLE_CLEANUP_INCOMPLETE");
    this.diagnostics = diagnostics.map((d) => lifecycleCleanupDiagnostic(d.stage, { code: d.sqlstate }));
  }
}

export function lifecycleFailure(error) {
  // Only a source-owned invocation prefix; never append API bodies, selectors or credentials.
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":", 1)[0];
  if (PRIMARY_CODES.has(code)) return code;
  const match =
    /^(cms-content|cms-leads|cms-session)\/([a-z_]{1,40}) retornou [1-5][0-9]{2}, esperado [1-5][0-9]{2}(?=$|[:\s])/.exec(
      message,
    );
  return match && INVOCATION_ACTIONS.get(match[1])?.has(match[2])
    ? match[0]
    : "G7_LIFECYCLE_OPERATION_FAILED";
}

export async function finalizeLifecycleEvidence(report, cleanup) {
  try {
    return { ...report, cleanup: await cleanup() };
  } catch (error) {
    return {
      ...report,
      status: "failed",
      error: report.error ?? "G7_LIFECYCLE_CLEANUP_INCOMPLETE",
      cleanup: {
        status: "failed",
        error: "G7_LIFECYCLE_CLEANUP_INCOMPLETE",
        diagnostics: error instanceof LifecycleCleanupError ? error.diagnostics : [{ stage: "unknown" }],
        zeroActiveResidueProved: false,
        watchdogFallbackOnCancellation: true,
      },
    };
  }
}
