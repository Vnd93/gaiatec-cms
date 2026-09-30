// This is an additional HTTP assertion, never an authorization or CAPTCHA bypass.
// Only the canonical staging Chrome handoff's exact synthetic form/path/email may
// exercise the duplicate request. Ordinary forms and production send once.
export const STAGING_LEAD_PROOF_MESSAGE = "Idempotência HTTP 201 confirmada.";

export function requiresStagingLeadProof(input: {
  environment: unknown;
  origin: string;
  path: string;
  campaignPath?: string;
  source: string;
  formKey: string;
  fields: Record<string, unknown>;
}) {
  if (
    input.environment !== "staging" ||
    input.origin !== "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev" ||
    input.source !== "campaign" ||
    input.campaignPath !== input.path
  )
    return false;
  const match = /^\/campanhas\/qa-lead-(qa-cms-final-\d{8}-[a-f0-9]{8})-[a-f0-9]{8}$/.exec(input.path);
  if (!match || !new RegExp(`^${match[1]}-formulario-operacional-[a-f0-9]{8}$`).test(input.formKey))
    return false;
  const emails = Object.values(input.fields).filter(
    (value): value is string => typeof value === "string" && value.includes("@"),
  );
  return (
    emails.length === 1 &&
    new RegExp(`^qa-iab-${match[1]}-[1-9]\\d*-[a-f0-9]{16}@example\\.invalid$`).test(emails[0]!)
  );
}
