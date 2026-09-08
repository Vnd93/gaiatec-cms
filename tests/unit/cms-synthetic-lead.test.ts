import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  controlledQaLeadRunTag,
  isControlledQaLeadOrigin,
} from "../../supabase/functions/_shared/cms-synthetic-lead";

const tag = "qa-cms-final-20260907-deadbeef";

describe("controlled synthetic lead notification boundary", () => {
  it("recognizes only the two canonical fixture origins", () => {
    expect(
      isControlledQaLeadOrigin({
        origin_source: "qa_fixture",
        origin_path: `/qa-cms-final/${tag}`,
      }),
    ).toBe(true);
    expect(
      controlledQaLeadRunTag({
        origin_source: "campaign",
        origin_path: `/campanhas/qa-lead-${tag}-0123abcd`,
      }),
    ).toBe("QA-CMS-FINAL-20260907-deadbeef");
    expect(
      isControlledQaLeadOrigin({
        origin_source: "campaign",
        origin_path: `/campanhas/qa-lead-${tag}-0123abcd`,
      }),
    ).toBe(true);
  });

  it.each([
    { origin_source: "campaign", origin_path: `/qa-cms-final/${tag}` },
    { origin_source: "qa_fixture", origin_path: `/campanhas/qa-lead-${tag}-0123abcd` },
    { origin_source: "campaign", origin_path: `/campanhas/qa-lead-${tag}` },
    { origin_source: "campaign", origin_path: `/campanhas/qa-lead-${tag}-0123abcg` },
    { origin_source: "campaign", origin_path: `/campanhas/qa-lead-${tag}-0123abcd/extra` },
    { origin_source: "campaign", origin_path: "/campanhas/contato-comercial" },
    { origin_source: "qa_fixture", origin_path: "/qa-cms-final/qa-cms-final-20260907-deadbee" },
    { origin_source: "qa_fixture", origin_path: "/qa-cms-final/QA-CMS-FINAL-20260907-deadbeef" },
    { origin_source: null, origin_path: `/qa-cms-final/${tag}` },
  ])("does not suppress real or malformed lead notifications: %j", (candidate) => {
    expect(isControlledQaLeadOrigin(candidate)).toBe(false);
    expect(controlledQaLeadRunTag(candidate)).toBeNull();
  });

  it("uses the authoritative database claim instead of client metadata or lexical suppression", () => {
    const worker = readFileSync("supabase/functions/cms-outbox-worker/index.ts", "utf8");
    expect(worker).toContain('rpc("cms_claim_lead_outbox_scoped"');
    expect(worker).toContain("event.delivery_allowed !== true");
    expect(worker).not.toContain("isAuthoritativeControlledQaLead");
    expect(worker).not.toContain('from("cms_form_definitions")');
    expect(worker).not.toContain("cms_qa_actor_lease_status");
    expect(worker).not.toContain("user_metadata");
  });
});
