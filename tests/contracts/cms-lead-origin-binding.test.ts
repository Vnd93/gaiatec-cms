import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  publishedProjectionAuthorizesLeadContext,
  publishedProjectionBindsExactForm,
} from "../../supabase/functions/_shared/cms-lead-origin-binding";

const migration = readFileSync("supabase/migrations/0084_cms_lead_origin_form_binding.sql", "utf8");
const captureEdge = readFileSync("supabase/functions/lead-capture/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_lead_origin_form_binding.test.sql", "utf8");

const formA = {
  formId: "84000000-0000-4000-8000-000000000101",
  formVersionId: "84000000-0000-4000-8000-000000000112",
};

describe("authoritative public lead origin binding", () => {
  it("accepts direct and block bindings only for the exact immutable UUID pair", () => {
    expect(
      publishedProjectionBindsExactForm(
        { form: { formId: formA.formId, versionId: formA.formVersionId, key: "renamed-key" } },
        formA,
      ),
    ).toBe(true);
    expect(
      publishedProjectionBindsExactForm(
        {
          blocks: [
            {
              type: "form",
              data: { formId: formA.formId, formVersionId: formA.formVersionId, formKey: "old-key" },
            },
          ],
        },
        formA,
      ),
    ).toBe(true);
    expect(
      publishedProjectionBindsExactForm(
        { form: { formId: "84000000-0000-4000-8000-000000000102", versionId: formA.formVersionId } },
        formA,
      ),
    ).toBe(false);
    expect(
      publishedProjectionBindsExactForm(
        { form: { formId: formA.formId, versionId: "84000000-0000-4000-8000-000000000111" } },
        formA,
      ),
    ).toBe(false);
  });

  it("binds campaign provenance to its route and product provenance to its canonical public path", () => {
    const campaign = {
      contentType: "campaign" as const,
      slug: "campaign-a",
      payload: {
        route: { path: "/campanhas/campaign-a" },
        form: { formId: formA.formId, versionId: formA.formVersionId },
      },
    };
    expect(
      publishedProjectionAuthorizesLeadContext(campaign, formA, {
        path: "/campanhas/campaign-a",
        source: "campaign",
      }),
    ).toBe(true);
    expect(
      publishedProjectionAuthorizesLeadContext(campaign, formA, {
        path: "/campanhas/adulterada",
        source: "campaign",
      }),
    ).toBe(false);
    expect(
      publishedProjectionAuthorizesLeadContext(campaign, formA, {
        path: "/campanhas/campaign-a",
        source: "site",
      }),
    ).toBe(false);

    const product = {
      contentType: "product" as const,
      slug: "product-a",
      payload: {
        route: { path: "/adulterated-product-route" },
        form: { formId: formA.formId, versionId: formA.formVersionId },
      },
    };
    expect(
      publishedProjectionAuthorizesLeadContext(product, formA, {
        path: "/produtos/product-a",
        source: "product",
      }),
    ).toBe(true);
    expect(
      publishedProjectionAuthorizesLeadContext(product, formA, {
        path: "/adulterated-product-route",
        source: "product",
      }),
    ).toBe(false);
    expect(
      publishedProjectionAuthorizesLeadContext(product, formA, {
        path: "/produtos/outro",
        source: "product",
      }),
    ).toBe(false);
  });

  it("locks the current publication and enforces context cardinality, provenance and generic sources in SQL", () => {
    for (const marker of [
      "join public.cms_publications published",
      "item.workflow_status = 'published'",
      "for share of projection, item, published",
      "num_nonnulls(v_campaign_id, v_product_id) > 1",
      "p_origin_source = 'campaign'",
      "p_origin_path = v_route_path",
      "'/produtos/' || v_slug",
      "p_origin_source = 'product'",
      "v_source in ('site', 'contact', 'newsletter', 'website')",
      "v_source = 'qa_fixture'",
      "v_path = '/qa-cms-final/' || lower(v_form.qa_run_tag)",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("{form,formId}");
    expect(migration).toContain("{form,versionId}");
    expect(migration).toContain("{data,formId}");
    expect(migration).toContain("{data,formVersionId}");
    expect(migration).not.toContain("p_form_key");
    expect(migration).toContain("from public,anon,authenticated,service_role");
  });

  it("requires the Edge preflight to load payload provenance and apply the same exact binding", () => {
    expect(captureEdge).toContain("GENERIC_ORIGIN_SOURCES");
    expect(captureEdge).toContain("isControlledQaLeadOrigin");
    expect(captureEdge).toContain('input.origin.source==="qa_fixture"');
    expect(captureEdge).toContain('"newsletter"');
    expect(captureEdge).toContain("campaignContext&&productContext");
    expect(captureEdge).toContain('campaignContext&&input.origin.source!=="campaign"');
    expect(captureEdge).toContain('productContext&&input.origin.source!=="product"');
    expect(captureEdge).toContain('select("item_id,slug,payload")');
    expect(captureEdge).toContain("publishedProjectionAuthorizesLeadContext(");
    expect(captureEdge).toContain("CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN");
  });

  it("covers two forms, version/key changes, provenance tampering and residue in pgTAP", () => {
    for (const marker of [
      "published product without a form binding is rejected",
      "complete origin policy accepts a campaign bound to the exact form pair and route",
      "complete origin policy accepts a product bound to the exact form pair and canonical slug route",
      "campaign bound to a second form cannot authorize form A",
      "superseded version cannot authorize the active version",
      "renamed display key remains valid",
      "canonical slug route and ignores an adulterated payload route",
      "provenance has exactly one context",
      "adulterated source is rejected",
      "adulterated path is rejected",
      "public newsletter source remains allowed",
      "origin policy rejects a retired version",
      "manipulated legacy form UUIDs cannot capture",
      "cross-form origin leaves no lead residue",
      "select * from finish()",
      "rollback;",
    ]) {
      expect(pgTap).toContain(marker);
    }
  });
});
