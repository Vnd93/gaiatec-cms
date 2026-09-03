import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");
const componentKeys = [
  "hero",
  "rich_text",
  "image",
  "gallery",
  "benefit_grid",
  "content_grid",
  "steps",
  "metrics",
  "testimonial",
  "faq",
  "form",
  "cta",
  "related_content",
  "split_content",
  "logo_cloud",
  "tabs",
  "comparison_table",
  "alert",
  "timeline",
  "link_list",
];

test("EV2.9 migration is additive, private and disabled by default", async () => {
  const sql = await read("supabase/migrations/0048_ev2_visual_studio_multisite.sql");
  for (const table of [
    "cms_sites",
    "cms_site_environments",
    "cms_site_domains",
    "cms_themes",
    "cms_design_tokens",
    "cms_component_definitions",
    "cms_component_versions",
    "cms_page_branches",
    "cms_visual_documents",
    "cms_visual_symbols",
    "cms_visual_snapshots",
    "cms_visual_events",
    "cms_visual_command_receipts",
    "cms_site_events",
    "cms_site_command_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /ev2\.visual_studio/);
  assert.match(sql, /ev2\.multisite/);
  assert.match(
    sql,
    /production_enabled boolean not null default false check \(production_enabled is false\)/,
  );
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant all on table[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /drop table|truncate|default_enabled\s*=\s*true/i);
});

test("component registry contains exactly the governed MVP keys", async () => {
  const [contract, migration, edge] = await Promise.all([
    read("src/shared/contracts/ev2-visual.ts"),
    read("supabase/migrations/0048_ev2_visual_studio_multisite.sql"),
    read("supabase/functions/cms-visual/index.ts"),
  ]);
  for (const key of componentKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(contract, new RegExp(`"${escaped}"`));
    assert.match(migration, new RegExp(`'${escaped}'`));
    assert.match(edge, new RegExp(`"${escaped}"`));
  }
  assert.match(contract, /components: z\.array\(Ev2VisualComponentDefinitionSchema\)\.length\(20\)/);
  assert.match(migration, /'componentCount', 20/);
  assert.match(edge, /const ComponentKey = z\.enum\(\[/);
});

test("visual document validation blocks arbitrary code and enforces responsive bounds", async () => {
  const [migration, edge, contract] = await Promise.all([
    read("supabase/migrations/0048_ev2_visual_studio_multisite.sql"),
    read("supabase/functions/cms-visual/index.ts"),
    read("src/shared/contracts/ev2-visual.ts"),
  ]);
  for (const evidence of [
    "CMS_VISUAL_NODE_ID_DUPLICATE",
    "CMS_VISUAL_HERO_LIMIT",
    "CMS_VISUAL_LAYOUT_INVALID",
    "CMS_VISUAL_BINDING_INVALID",
    "CMS_VISUAL_MEDIA_REFERENCE_INVALID",
    "CMS_VISUAL_CONTENT_REFERENCE_INVALID",
    "private.cms_json_contains_unsafe_visual_value",
  ])
    assert.match(migration, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(edge, /unsafeVisualValue/);
  assert.match(edge, /script\|style\|iframe/);
  assert.match(contract, /HTML, CSS e JavaScript arbitrários não são aceitos/);
  assert.match(contract, /desktop: z\.literal\(12\)/);
  assert.match(contract, /tablet: z\.literal\(8\)/);
  assert.match(contract, /mobile: z\.literal\(4\)/);
});

test("visual commands enforce authentication, MFA, idempotency and draft-only application", async () => {
  const [migration, edge] = await Promise.all([
    read("supabase/migrations/0048_ev2_visual_studio_multisite.sql"),
    read("supabase/functions/cms-visual/index.ts"),
  ]);
  assert.match(edge, /authenticateCms\(req\)/);
  assert.match(edge, /CMS_VISUAL_PRODUCTION_GATED/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.match(edge, /const mfa =/);
  assert.match(edge, /const status = mfa \? 412/);
  assert.match(edge, /error\.code === "PT409"/);
  assert.match(edge, /consumeRateLimit/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.match(migration, /CMS_VISUAL_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /CMS_VISUAL_DRAFT_CONFLICT/);
  assert.match(migration, /CMS_VISUAL_MFA_REQUIRED/);
  assert.match(migration, /CMS_VISUAL_CONFLICT_RESOLUTION_INVALID/);
  assert.match(migration, /'document_conflict_replaced'/);
  assert.match(migration, /p_actor_id, 'cms:visual\.design'/);
  assert.match(edge, /conflictResolution: z/);
  assert.match(edge, /strategy: z\.literal\("replace_remote"\)/);
  assert.match(migration, /base_draft_version <> p_expected_draft_version/);
  assert.match(migration, /cms_ev2_actor_authorized_for_scope/);
  assert.match(migration, /'snapshotCount', 3/);
  assert.match(migration, /'published', false/);
});

test("multisite preparation remains synthetic, locked and non-production", async () => {
  const [migration, edge, contract] = await Promise.all([
    read("supabase/migrations/0048_ev2_visual_studio_multisite.sql"),
    read("supabase/functions/cms-sites/index.ts"),
    read("src/shared/contracts/ev2-visual.ts"),
  ]);
  assert.match(edge, /\^g9x-/);
  assert.match(edge, /\\\.invalid\$/);
  assert.match(edge, /CMS_SITES_PRODUCTION_GATED/);
  assert.match(edge, /authenticateCms\(req\)/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.match(migration, /site_key like 'g9x-%'/);
  assert.match(migration, /site\.created_by = p_actor_id/);
  assert.match(migration, /and created_by = p_actor_id/);
  assert.match(migration, /site_pilot_manager/);
  assert.match(migration, /hostname like '%\.invalid'/);
  assert.match(migration, /status text not null default 'locked' check \(status in \('active', 'locked'\)\)/);
  assert.match(contract, /multisiteOperational: z\.literal\(false\)/);
  assert.match(contract, /productionEnabled: z\.literal\(false\)/);
});

test("candidate UI exposes governed editor and site registry only behind build switches", async () => {
  const [studio, sites, builder, shell, routes, renderer] = await Promise.all([
    read("src/admin/pages/AdminVisualStudioPage.tsx"),
    read("src/admin/pages/AdminSitesPage.tsx"),
    read("src/admin/pages/AdminPageBuilderPage.tsx"),
    read("src/admin/components/AdminShell.tsx"),
    read("src/app/routes.tsx"),
    read("src/public/components/CmsPageRenderer.tsx"),
  ]);
  assert.match(studio, /VITE_EV2_VISUAL_STUDIO_CANDIDATE/);
  assert.match(studio, /Desfazer/);
  assert.match(studio, /Camadas/);
  assert.match(studio, /Gerar snapshots 12\/8\/4/);
  assert.match(studio, /apply_to_draft/);
  assert.match(studio, /Preparar substituição privilegiada/);
  assert.match(studio, /mediaUrls=\{previewMediaUrls\}/);
  assert.match(studio, /pageBlockReferenceRequirement/);
  assert.match(sites, /VITE_EV2_MULTISITE_CANDIDATE/);
  assert.match(sites, /create_candidate/);
  assert.match(sites, /\.invalid/);
  assert.match(builder, /Os blocos e o hash visual desta página são versionados/);
  assert.match(builder, /JSON\.stringify\(source\.blocks\) !== JSON\.stringify\(payload\.blocks\)/);
  assert.match(shell, /item\.candidate !== "visual-studio"/);
  assert.match(shell, /item\.candidate !== "multisite"/);
  assert.match(routes, /path: "estudio-visual\/:itemId"/);
  assert.match(routes, /path: "sites"/);
  assert.match(renderer, /data-hidden-desktop/);
  assert.match(renderer, /data-cms-breakpoint/);
  assert.match(renderer, /cms-page-visual-group/);
  assert.match(renderer, /comparison_table/);
});

test("rehearsal, canary, preview workflow and Gate G9 are reproducible", async () => {
  const [rehearsal, canary, workflow, gate, plan, report] = await Promise.all([
    read("scripts/ev2/phase9/validate-migration.mjs"),
    read("scripts/ev2/phase9/staging-canary.mjs"),
    read(".github/workflows/preview-ev2-phase9.yml"),
    read("docs/ev2/fase-9/GATE_G9.md"),
    read("docs/ev2/fase-9/PLANO_CANARY_STAGING.md"),
    read("docs/ev2/fase-9/RELATORIO_CANARY_STAGING_2026-09-03.md"),
  ]);
  assert.match(rehearsal, /G9_MIGRATION_REHEARSAL_PASS/);
  assert.match(rehearsal, /ALVO RECUSADO/);
  assert.match(rehearsal, /rollback;/i);
  assert.match(canary, /exact_candidate_sha/);
  assert.match(canary, /individual_overrides_only/);
  assert.match(canary, /three_responsive_snapshots/);
  assert.match(canary, /tenant_identity_isolation/);
  assert.match(canary, /crossMutation\.status === 404/);
  assert.match(canary, /exactMutationEvidence/);
  assert.match(canary, /cms_site_events/);
  assert.match(canary, /cms_content_revisions/);
  assert.match(canary, /cms_publication_outbox/);
  assert.match(canary, /broad_override_fails_closed/);
  assert.match(canary, /production_and_real_state_unchanged/);
  assert.match(canary, /site_idempotency_and_conflict/);
  assert.match(canary, /tokens_are_versioned_per_site/);
  assert.match(canary, /syntheticResidue: residueZero \? 0 : 1/);
  assert.match(canary, /cms_session_revocations[\s\S]{0,160}select=session_id_hash/);
  assert.doesNotMatch(canary, /cms_session_revocations[\s\S]{0,160}select=id/);
  assert.match(workflow, /expected_sha/);
  assert.match(workflow, /VITE_EV2_VISUAL_STUDIO_CANDIDATE/);
  assert.match(workflow, /VITE_EV2_MULTISITE_CANDIDATE/);
  assert.match(workflow, /ev2-g9-canary/);
  assert.match(gate, /G9 APROVADO PARA INICIAR EV2\.10/);
  assert.match(gate, /tenant escape/i);
  assert.match(plan, /nenhuma alteração em produção/i);
  assert.match(report, /G9_CANARY_PASS/);
  assert.match(report, /32\/32 verificações/);
  assert.match(report, /synthetic_residue_zero|resíduo sintético zero/);
});
