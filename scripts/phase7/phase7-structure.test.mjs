import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("F7 migration is structural, clean-room and fail-closed", async () => {
  const sql = await read("supabase/migrations/0027_fase7_marketing_blog_leads.sql");
  assert.match(sql, /Clean-room/i);
  assert.doesNotMatch(sql, /insert into public\.cms_content_items/i);
  assert.doesNotMatch(sql, /insert into public\.cms_media_assets/i);
  assert.doesNotMatch(sql, /^insert into public\.cms_form_definitions/im);
  assert.doesNotMatch(sql, /^insert into public\.cms_leads/im);
  for (const evidence of [
    "cms_blog_authors",
    "cms_blog_categories",
    "cms_blog_tags",
    "cms_form_versions",
    "cms_lead_consents",
    "cms_lead_status_history",
    "cms_lead_outbox",
    "cms_export_leads",
    "cms_anonymize_lead",
    "cms_apply_lead_retention",
    "cms_enqueue_lead_sla_breaches",
    "cms_expire_campaigns",
    "cms_validate_phase7_projection",
    "enable row level security",
    "cms:leads.privacy",
  ])
    assert.match(sql, new RegExp(evidence));
});

test("admin fields are connected to versioned public consumers", async () => {
  const [routes, editor, forms, leads, publicApi, leadApi, renderer] = await Promise.all([
    read("src/app/routes.tsx"),
    read("src/admin/pages/AdminCampaignEditorPage.tsx"),
    read("src/admin/pages/AdminFormsPage.tsx"),
    read("src/admin/pages/AdminLeadsPage.tsx"),
    read("supabase/functions/cms-public/index.ts"),
    read("supabase/functions/lead-capture/index.ts"),
    read("src/public/components/CmsPageRenderer.tsx"),
  ]);
  for (const route of [
    "AdminMarketingPage",
    "AdminCampaignEditorPage",
    "AdminFormsPage",
    "AdminLeadsPage",
    "CmsBlogPostPage",
    "CmsCampaignPage",
  ])
    assert.match(routes, new RegExp(route));
  for (const field of ["templateKey", "window", "placements", "form", "tracking", "expiry", "approval"])
    assert.match(editor, new RegExp(field));
  assert.match(forms, /consentVersion/);
  assert.match(forms, /retentionDays/);
  assert.match(forms, /slaMinutes/);
  assert.match(leads, /cms_lead_consents/);
  assert.match(leads, /anonymize_lead/);
  assert.match(leads, /export_leads/);
  assert.match(publicApi, /campaign-placements/);
  assert.match(publicApi, /post-detail/);
  assert.match(publicApi, /loadPublishedForm/);
  assert.match(publicApi, /kind: "fallback"/);
  assert.match(leadApi, /active_version_id/);
  assert.match(leadApi, /captchaToken/);
  assert.match(leadApi, /idempotencyKey/);
  assert.match(renderer, /CmsLeadForm/);
});

test("edge returns Article schema, campaign expiry statuses and complete sitemap", async () => {
  const worker = await read("cloudflare/_worker.js");
  assert.match(worker, /"@type": "Article"/);
  assert.match(worker, /post-detail/);
  assert.match(worker, /campaign-by-path/);
  assert.match(worker, /sitemap-blog\.xml/);
  assert.match(worker, /status === 410/);
  assert.match(worker, /marketing/);
  assert.match(worker, /leads/);
});

test("G6 is formally approved and the earlier F7 exception remains auditable", async () => {
  const [g6, exception] = await Promise.all([
    read("docs/fase-6/EVIDENCIAS_GATE_G6.md"),
    read("docs/fase-7/EXCECAO_AVANCO_COM_G6_PENDENTE.md"),
  ]);
  assert.match(g6, /Decisão:\*\* APROVADO EM STAGING/);
  assert.match(exception, /aab55f7/);
  assert.match(exception, /não aprova o Gate G6/i);
});
