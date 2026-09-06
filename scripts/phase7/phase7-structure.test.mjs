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
  assert.match(publicApi, /cms_route_rules/);
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

test("critical permissions, unpublishing and governed forms are fail-closed", async () => {
  const [hardening, unpublishing, reopening, approvalPermissions, leadAudit, contact, footer] =
    await Promise.all([
      read("supabase/migrations/0030_cms_critical_permissions_require_aal2.sql"),
      read("supabase/migrations/0031_cms_archive_unpublishes_all_content.sql"),
      read("supabase/migrations/0032_cms_reopen_all_published_content.sql"),
      read("supabase/migrations/0036_cms_restore_specific_approval_permissions.sql"),
      read("supabase/migrations/0033_cms_lead_audit_actions.sql"),
      read("src/app/components/ContactSection.tsx"),
      read("src/app/components/Footer.tsx"),
    ]);
  assert.match(hardening, /p_aal = 'aal2'/);
  assert.match(hardening, /permission\.critical/);
  assert.match(unpublishing, /delete from public\.cms_published_projection/);
  assert.match(unpublishing, /new\.content_type = 'campaign'/);
  assert.match(reopening, /liveProjectionPreserved/);
  assert.match(
    reopening,
    /when p_action='archive' then public\.cms_content_permission\(p_content_type,'publish'\)/,
  );
  for (const [contentType, permission] of [
    ["product", "cms:products.approve"],
    ["service", "cms:services.approve"],
    ["industry", "cms:industries.approve"],
    ["application", "cms:applications.approve"],
    ["solution", "cms:solutions.approve"],
    ["page", "cms:pages.approve"],
    ["homepage", "cms:homepage.approve"],
    ["navigation", "cms:navigation.approve"],
    ["site_settings", "cms:settings.approve"],
    ["placement", "cms:placements.approve"],
  ]) {
    assert.match(
      approvalPermissions,
      new RegExp(`p_content_type='${contentType}'.+'${permission.replace(".", "\\.")}'`),
    );
  }
  for (const action of ["cms:leads.update", "cms:leads.export", "cms:leads.anonymize"])
    assert.match(leadAudit, new RegExp(action.replace(".", "\\.")));
  assert.doesNotMatch(contact, /submit-contact/);
  assert.doesNotMatch(footer, /submit-contact/);
  assert.match(contact, /getPublishedForm/);
  assert.match(footer, /getPublishedForm/);
});

test("staging form setup is governed, repeatable and isolated from production", async () => {
  const [setup, cleanup, email, worker, outboxCron] = await Promise.all([
    read("scripts/phase7/configure-staging-forms.mjs"),
    read("scripts/phase7/cleanup-staging-synthetic-lead.mjs"),
    read("supabase/functions/_shared/email.ts"),
    read("supabase/functions/cms-outbox-worker/index.ts"),
    read("supabase/migrations/0034_fase8_outbox_cron.sql"),
  ]);
  assert.match(setup, /glcqsosxwgmlhzgcsnzv/);
  assert.match(setup, /contato-principal/);
  assert.match(setup, /newsletter/);
  assert.match(setup, /challengeAndVerify/);
  assert.match(setup, /cms-leads/);
  assert.match(setup, /productionTouched: targetEnvironment === "production"/);
  assert.match(setup, /GAIATEC_PRODUCTION_AUTHORIZATION/);
  assert.match(setup, /AUTORIZO-G12-PRODUCAO/);
  assert.doesNotMatch(setup, /painel antigo|legacy/i);
  assert.match(cleanup, /@example\.com/);
  assert.match(cleanup, /fixture sintética/);
  assert.match(cleanup, /phase8-resend-validation/);
  assert.match(cleanup, /productionTouched: false/);
  assert.match(email, /Deno\.env\.get\("EMAIL_FROM"\)/);
  assert.match(email, /cms@gaiatecsistemas\.com/);
  assert.match(email, /providerFailureReason/);
  assert.match(worker, /lead_notification_\$\{caught\.reason\}/);
  assert.match(worker, /anonymized_at/);
  assert.match(worker, /leadSkipped/);
  assert.match(outboxCron, /cms-outbox-worker-every-5m/);
  assert.match(outboxCron, /vault\.decrypted_secrets/);
  assert.match(outboxCron, /private\.invoke_outbox_worker/);
  assert.match(outboxCron, /revoke all.+anon, authenticated/);
  assert.doesNotMatch(outboxCron, /OUTBOX_WORKER_SECRET\s*=/);
});
