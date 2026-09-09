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
  assert.match(leadApi, /cms_public_form_scoped/);
  assert.match(leadApi, /cms_capture_lead_scoped/);
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

test("lead CAPTCHA separates frontend build flags from Edge Function secrets", async () => {
  const [capture, contact, security, challenge, production, staging, productionBridge, stagingBridge] =
    await Promise.all([
      read("supabase/functions/lead-capture/index.ts"),
      read("supabase/functions/submit-contact/index.ts"),
      read("supabase/functions/_shared/security.ts"),
      read("src/app/components/TurnstileChallenge.tsx"),
      read(".github/workflows/deploy-production.yml"),
      read(".github/workflows/deploy-staging.yml"),
      read(".github/workflows/promote-production-frontend-bridge.yml"),
      read(".github/workflows/promote-staging-frontend-bridge.yml"),
    ]);
  assert.match(capture, /CONTACT_CAPTCHA_ALWAYS/);
  assert.match(capture, /TURNSTILE_EXPECTED_ACTION/);
  assert.match(
    capture,
    /isAllowedTurnstileVerification\(\s*result,\s*secret,\s*expectedAction,\s*commercialIdempotencyKey/,
  );
  assert.match(contact, /TURNSTILE_EXPECTED_ACTION/);
  assert.match(
    contact,
    /isAllowedTurnstileVerification\(\s*result,\s*secret,\s*expectedAction,\s*commercialIdempotencyKey/,
  );
  assert.match(
    security,
    /return isExactOriginAllowed\(req\.headers\.get\("Origin"\), Deno\.env\.get\("ALLOWED_ORIGINS"\)\)/,
  );
  assert.match(security, /TURNSTILE_ALLOWED_HOSTNAMES/);
  assert.doesNotMatch(security, /gaiatec-cms-staging\\\.pages\\\.dev\$\/i/);
  assert.match(challenge, /action: "lead_capture"/);
  assert.match(challenge, /cData,/);
  assert.match(production, /CONTACT_CAPTCHA_ALWAYS: "true"/);
  assert.match(production, /TURNSTILE_SECRET_KEY:/);
  assert.doesNotMatch(production, /VITE_(?:CONTACT_CAPTCHA_ALWAYS|TURNSTILE_SITE_KEY):/);
  assert.match(staging, /VITE_CONTACT_CAPTCHA_ALWAYS: "true"/);
  assert.match(staging, /CONTACT_CAPTCHA_ALWAYS=true/);
  for (const bridge of [productionBridge, stagingBridge]) {
    assert.match(bridge, /VITE_CONTACT_CAPTCHA_ALWAYS: "true"/);
    assert.match(bridge, /VITE_TURNSTILE_SITE_KEY:/);
    assert.doesNotMatch(bridge, /^\s+CONTACT_CAPTCHA_ALWAYS:/m);
    assert.doesNotMatch(bridge, /^\s+TURNSTILE_SECRET_KEY:/m);
  }
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
  assert.match(worker, /cms_claim_lead_outbox_scoped/);
  assert.match(worker, /delivery_allowed/);
  assert.match(worker, /leadSkipped/);
  assert.match(outboxCron, /cms-outbox-worker-every-5m/);
  assert.match(outboxCron, /vault\.decrypted_secrets/);
  assert.match(outboxCron, /private\.invoke_outbox_worker/);
  assert.match(outboxCron, /revoke all.+anon, authenticated/);
  assert.doesNotMatch(outboxCron, /OUTBOX_WORKER_SECRET\s*=/);
});

test("final staging roundtrip is SHA-bound, uses the canonical synthetic tag and cleans up", async () => {
  const canary = await read("scripts/phase7/staging-roundtrip.mjs");
  assert.match(canary, /QA-CMS-FINAL-/);
  assert.match(canary, /GAIATEC_EXPECTED_SHA/);
  assert.match(canary, /healthResponse\.headers\.get\("x-release"\) === expectedSha/);
  assert.match(canary, /productionTouched: false/);
  assert.match(canary, /workflow_status: "archived"/);
  assert.match(canary, /status: "suspended"/);
  assert.doesNotMatch(canary, /pending_owner|not_executed_missing_resend_api_key/);
});
