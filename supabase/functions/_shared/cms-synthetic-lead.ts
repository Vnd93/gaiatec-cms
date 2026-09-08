const QA_TAG_CAPTURE = "(qa-cms-final-[0-9]{8}-[0-9a-f]{8})";
const DIRECT_FIXTURE_PATH = new RegExp(`^/qa-cms-final/${QA_TAG_CAPTURE}$`);
const PUBLIC_FIXTURE_PATH = new RegExp(`^/campanhas/qa-lead-${QA_TAG_CAPTURE}-[0-9a-f]{8}$`);

export type LeadOrigin = {
  origin_source?: unknown;
  origin_path?: unknown;
};

/**
 * Identifies the two exact, temporary lead origins created by the governed
 * CMS browser fixture. Near matches deliberately remain normal notifications.
 */
export function isControlledQaLeadOrigin(lead: LeadOrigin): boolean {
  return controlledQaLeadRunTag(lead) !== null;
}

/**
 * Parses only the exact QA marker from a candidate origin. This is a lexical
 * prefilter, never an authorization decision: callers must bind the result to
 * the form/campaign owner, immutable Auth metadata and active server lease.
 */
export function controlledQaLeadRunTag(lead: LeadOrigin): string | null {
  if (typeof lead.origin_source !== "string" || typeof lead.origin_path !== "string") return null;
  const match =
    lead.origin_source === "qa_fixture"
      ? DIRECT_FIXTURE_PATH.exec(lead.origin_path)
      : lead.origin_source === "campaign"
        ? PUBLIC_FIXTURE_PATH.exec(lead.origin_path)
        : null;
  return match?.[1]?.replace(/^qa-cms-final-/, "QA-CMS-FINAL-") ?? null;
}
