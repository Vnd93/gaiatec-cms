import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { createClient } from "@supabase/supabase-js";

const TARGETS = Object.freeze({
  staging: Object.freeze({
    ref: "glcqsosxwgmlhzgcsnzv",
    name: "GAIATEC CMS Staging",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  }),
  production: Object.freeze({
    ref: "chfuhctnhqgyjowkvllv",
    name: "GAIATEC CMS Production",
    origin: "https://gaiatecsistemas.com.br",
  }),
});

const FULL_SHA = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const MODES = new Set(["setup", "cleanup", "residue", "recover"]);
const mode = process.argv[2] ?? "";
const environment = process.env.QA_CMS_BRIDGE_ENVIRONMENT ?? "";
const candidateSha = process.env.QA_CMS_BRIDGE_CANDIDATE_SHA ?? "";
const instance = process.env.QA_CMS_BRIDGE_INSTANCE ?? "";
const workflowRunId = process.env.QA_CMS_BRIDGE_WORKFLOW_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "";
const workflowRunAttempt =
  process.env.QA_CMS_BRIDGE_WORKFLOW_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? "";
const authorization = process.env.QA_CMS_BRIDGE_PRODUCTION_AUTHORIZATION ?? "";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const statePath = resolve(
  process.env.QA_CMS_BRIDGE_STATE_PATH ?? "outputs/cms-public-bridge-fixture-state.json",
);
const reportPath = resolve(
  process.env.QA_CMS_BRIDGE_REPORT_PATH ?? "outputs/cms-public-bridge-fixture-report.json",
);
const root = resolve(process.cwd());
const target = TARGETS[environment];

function refuse(code) {
  throw new Error(`QA_CMS_PUBLIC_BRIDGE_${code}`);
}

function assertContained(pathname) {
  const fromRoot = relative(root, resolve(pathname));
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    refuse("PATH_REFUSED");
  }
}

function validateRuntime() {
  if (!MODES.has(mode)) refuse("MODE_INVALID");
  if (
    !target ||
    !FULL_SHA.test(candidateSha) ||
    !/^(?:preview|canonical|forward)$/.test(instance) ||
    !/^[1-9]\d*$/.test(workflowRunId) ||
    !/^[1-9]\d*$/.test(workflowRunAttempt)
  )
    refuse("TARGET_INVALID");
  if (environment === "production" && authorization !== `AUTORIZO-G12-PRODUCAO:${candidateSha}`) {
    refuse("PRODUCTION_AUTHORIZATION_REQUIRED");
  }
  if (!accessToken.startsWith("sbp_") || accessToken.length < 24) refuse("ACCESS_TOKEN_INVALID");
  assertContained(statePath);
  assertContained(reportPath);
}

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function supabaseJson(arguments_) {
  const binary = "npx";
  const parameters = ["--yes", "supabase@2.116.0", ...arguments_, "--output", "json"];
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArguments =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...parameters].map(quoteWindowsArgument).join(" ")]
      : parameters;
  const result = spawnSync(command, commandArguments, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    timeout: 2 * 60_000,
  });
  if (result.error || result.status !== 0) refuse("SUPABASE_CLI_FAILED");
  try {
    return JSON.parse(result.stdout);
  } catch {
    return refuse("SUPABASE_JSON_INVALID");
  }
}

async function loadContext() {
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === target.ref);
  if (!project || project.name !== target.name) refuse("PROJECT_REFUSED");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", target.ref, "--reveal"]);
  const anonKey = keys.find((entry) => entry.id === "anon")?.api_key;
  const serviceKey = keys.find((entry) => entry.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) refuse("KEYS_UNAVAILABLE");
  const url = `https://${target.ref}.supabase.co`;
  return {
    url,
    anonKey,
    admin: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  };
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${target.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) refuse("MANAGEMENT_QUERY_FAILED");
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) refuse("MANAGEMENT_RESPONSE_INVALID");
  return payload;
}

function sqlText(value) {
  if (typeof value !== "string" || /\0/.test(value)) refuse("SQL_TEXT_INVALID");
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}','base64'),'UTF8')::jsonb`;
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function emptyState() {
  const now = new Date();
  const nonce = createHash("sha256")
    .update(`${environment}:${candidateSha}:${workflowRunId}:${workflowRunAttempt}:${instance}`)
    .digest("hex")
    .slice(0, 8);
  const runTag = `QA-CMS-FINAL-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${candidateSha.slice(0, 8)}`;
  return {
    schemaVersion: 1,
    status: "preparing",
    environment,
    candidateSha,
    runTag,
    instance,
    nonce,
    actorId: null,
    form: {
      id: randomUUID(),
      versionId: randomUUID(),
      fieldId: randomUUID(),
      key: `qa-bridge-${candidateSha.slice(0, 8)}-${nonce}`,
    },
    page: {
      id: randomUUID(),
      revisionId: randomUUID(),
      slug: `qa-bridge-page-${candidateSha.slice(0, 8)}-${nonce}`,
      path: `/qa-bridge-page-${candidateSha.slice(0, 8)}-${nonce}`,
      title: `Ponte pública QA ${candidateSha.slice(0, 8)}`,
    },
    campaign: {
      id: randomUUID(),
      revisionId: randomUUID(),
      slug: `qa-bridge-${candidateSha.slice(0, 8)}-${nonce}`,
      path: `/campanhas/qa-bridge-${candidateSha.slice(0, 8)}-${nonce}`,
      title: `Campanha ponte QA ${candidateSha.slice(0, 8)}`,
    },
    formTitle: `Formulário ponte QA ${candidateSha.slice(0, 8)}`,
    emailLabel: `E-mail ponte QA ${candidateSha.slice(0, 8)}`,
  };
}

function validateState(value, complete = false) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "status",
      "environment",
      "candidateSha",
      "runTag",
      "instance",
      "nonce",
      "actorId",
      "form",
      "page",
      "campaign",
      "formTitle",
      "emailLabel",
    ]) ||
    value.schemaVersion !== 1 ||
    !["preparing", "active", "cleaned"].includes(value.status) ||
    value.environment !== environment ||
    value.candidateSha !== candidateSha ||
    value.instance !== instance ||
    !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(value.runTag ?? "") ||
    !/^[a-f0-9]{8}$/.test(value.nonce ?? "") ||
    !exactKeys(value.form, ["id", "versionId", "fieldId", "key"]) ||
    !exactKeys(value.page, ["id", "revisionId", "slug", "path", "title"]) ||
    !exactKeys(value.campaign, ["id", "revisionId", "slug", "path", "title"]) ||
    !/^qa-bridge-[a-f0-9]{8}-[a-f0-9]{8}$/.test(value.form?.key ?? "") ||
    !/^qa-bridge-page-[a-f0-9]{8}-[a-f0-9]{8}$/.test(value.page?.slug ?? "") ||
    value.page?.path !== `/${value.page?.slug}` ||
    !/^qa-bridge-[a-f0-9]{8}-[a-f0-9]{8}$/.test(value.campaign?.slug ?? "") ||
    value.campaign?.path !== `/campanhas/${value.campaign?.slug}` ||
    typeof value.formTitle !== "string" ||
    typeof value.emailLabel !== "string"
  ) {
    refuse("STATE_INVALID");
  }
  const identifiers = [
    value.actorId,
    value.form.id,
    value.form.versionId,
    value.form.fieldId,
    value.page.id,
    value.page.revisionId,
    value.campaign.id,
    value.campaign.revisionId,
  ];
  if (identifiers.some((entry) => entry !== null && !UUID.test(entry))) refuse("STATE_ID_INVALID");
  if (complete && (value.status !== "active" || identifiers.some((entry) => !UUID.test(entry)))) {
    refuse("STATE_INCOMPLETE");
  }
  return value;
}

function atomicWrite(file, value) {
  assertContained(file);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function writeState(state) {
  validateState(state, state.status === "active");
  atomicWrite(statePath, state);
}

function loadState() {
  if (!existsSync(statePath)) refuse("STATE_MISSING");
  const metadata = lstatSync(statePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024)
    refuse("STATE_FILE_REFUSED");
  const fromRoot = relative(realpathSync(root), realpathSync(statePath));
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
    refuse("STATE_PATH_REFUSED");
  try {
    return validateState(JSON.parse(readFileSync(statePath, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("QA_CMS_PUBLIC_BRIDGE_")) throw error;
    return refuse("STATE_JSON_INVALID");
  }
}

function writeReport(value) {
  const serialized = JSON.stringify(value);
  if (UUID_ANYWHERE.test(serialized) || /\b(?:sbp_|sb_secret_|eyJ)[A-Za-z0-9._-]{12,}/.test(serialized)) {
    refuse("REPORT_SENSITIVE");
  }
  atomicWrite(reportPath, value);
}

function fixtureBindingSha256(state) {
  return createHash("sha256").update(`${state.runTag}:${state.nonce}`).digest("hex");
}

function deterministicUuid(label) {
  const hex = createHash("sha256")
    .update(`${environment}:${candidateSha}:${workflowRunId}:${workflowRunAttempt}:${instance}:${label}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function findSyntheticActor(admin) {
  const matches = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error || !Array.isArray(result.data?.users)) refuse("ACTOR_RECOVERY_READ_FAILED");
    for (const actor of result.data.users) {
      if (
        actor.user_metadata?.synthetic === true &&
        actor.user_metadata?.purpose === "qa-cms-browser" &&
        actor.user_metadata?.candidateSha === candidateSha &&
        actor.user_metadata?.environment === environment &&
        actor.user_metadata?.actorKind === `public_bridge_${instance}` &&
        String(actor.user_metadata?.workflowRunId ?? "") === workflowRunId &&
        String(actor.user_metadata?.workflowRunAttempt ?? "") === workflowRunAttempt
      )
        matches.push(actor);
    }
    if (result.data.users.length < 100) break;
  }
  if (matches.length > 1) refuse("ACTOR_RECOVERY_AMBIGUOUS");
  return matches[0] ?? null;
}

async function reconstructState(context) {
  const template = emptyState();
  const actor = await findSyntheticActor(context.admin);
  if (!actor) return null;
  if (
    !UUID.test(actor.id) ||
    !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(actor.user_metadata?.runTag ?? "")
  ) {
    refuse("ACTOR_RECOVERY_INVALID");
  }
  template.actorId = actor.id;
  template.runTag = actor.user_metadata.runTag;
  const [form, page, campaign] = await Promise.all([
    checked(
      context.admin
        .from("cms_form_definitions")
        .select("id")
        .eq("created_by", actor.id)
        .eq("form_key", template.form.key)
        .maybeSingle(),
      "FORM_RECOVERY_READ_FAILED",
    ),
    checked(
      context.admin
        .from("cms_content_items")
        .select("id")
        .eq("created_by", actor.id)
        .eq("content_type", "page")
        .eq("slug", template.page.slug)
        .maybeSingle(),
      "PAGE_RECOVERY_READ_FAILED",
    ),
    checked(
      context.admin
        .from("cms_content_items")
        .select("id")
        .eq("created_by", actor.id)
        .eq("content_type", "campaign")
        .eq("slug", template.campaign.slug)
        .maybeSingle(),
      "CAMPAIGN_RECOVERY_READ_FAILED",
    ),
  ]);
  template.form.id = form?.id ?? deterministicUuid("missing-form");
  template.page.id = page?.id ?? deterministicUuid("missing-page");
  template.campaign.id = campaign?.id ?? deterministicUuid("missing-campaign");
  const [versions, pageRevision, campaignRevision] = await Promise.all([
    form?.id
      ? checked(
          context.admin
            .from("cms_form_versions")
            .select("id,definition")
            .eq("form_id", form.id)
            .order("version", { ascending: false })
            .limit(1),
          "FORM_VERSION_RECOVERY_READ_FAILED",
        )
      : [],
    page?.id
      ? checked(
          context.admin
            .from("cms_content_revisions")
            .select("id")
            .eq("item_id", page.id)
            .order("revision_number", { ascending: false })
            .limit(1),
          "PAGE_REVISION_RECOVERY_READ_FAILED",
        )
      : [],
    campaign?.id
      ? checked(
          context.admin
            .from("cms_content_revisions")
            .select("id")
            .eq("item_id", campaign.id)
            .order("revision_number", { ascending: false })
            .limit(1),
          "CAMPAIGN_REVISION_RECOVERY_READ_FAILED",
        )
      : [],
  ]);
  template.form.versionId = versions[0]?.id ?? deterministicUuid("missing-form-version");
  template.form.fieldId = versions[0]?.definition?.fields?.[0]?.id ?? deterministicUuid("missing-form-field");
  template.page.revisionId = pageRevision[0]?.id ?? deterministicUuid("missing-page-revision");
  template.campaign.revisionId = campaignRevision[0]?.id ?? deterministicUuid("missing-campaign-revision");
  template.status = "preparing";
  writeState(template);
  return template;
}

async function checked(result, code) {
  const value = await result;
  if (value.error) refuse(code);
  return value.data;
}

function provenance(runTag) {
  return [
    {
      sourceKind: "owner_authored",
      authorizationReference: runTag,
      authorizationDate: new Date().toISOString().slice(0, 10),
      rightsScope: "Homologação sintética descartável",
      rightsConfirmed: true,
      commercialOwner: "Owner QA sintético",
      technicalOwner: "Revisor QA sintético",
      verifiedAt: new Date().toISOString(),
    },
  ];
}

function richTextBlock() {
  return {
    id: randomUUID(),
    type: "rich_text",
    hidden: false,
    width: "content",
    tone: "light",
    data: { text: "Conteúdo sintético temporário para prova da ponte pública." },
  };
}

function pagePayload(state) {
  return {
    schemaVersion: 1,
    consumerId: "cms.managed-page.v1",
    contentType: "page",
    title: state.page.title,
    summary: `Conteúdo sintético controlado ${state.runTag}.`,
    pageKind: "institutional",
    templateKey: "standard",
    route: { path: state.page.path, navigationLabel: "QA", breadcrumbLabel: "QA" },
    blocks: [richTextBlock()],
    seo: {
      title: `Ponte QA ${candidateSha.slice(0, 8)} | GAIATEC`,
      description: "Página temporária não indexável para validar a ponte pública do CMS.",
      canonicalPath: state.page.path,
      indexable: false,
    },
    provenance: provenance(state.runTag),
    governanceState: "synthetic_test",
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    retirement: { mode: "not_found" },
    approval: { businessOwner: "Owner QA", editorialReviewer: "Revisor QA" },
  };
}

function campaignPayload(state) {
  return {
    schemaVersion: 1,
    consumerId: "cms.campaign-landing.v1",
    contentType: "campaign",
    title: state.campaign.title,
    summary: `Campanha sintética controlada ${state.runTag}.`,
    campaignKind: "lead_generation",
    templateKey: "landing_conversion",
    route: { path: state.campaign.path },
    window: {
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      timezone: "America/Sao_Paulo",
    },
    blocks: [richTextBlock()],
    placements: [],
    form: { formId: state.form.id, versionId: state.form.versionId, key: state.form.key },
    tracking: { enabled: false, requiresConsent: true, provider: "internal", eventName: "qa-bridge" },
    expiry: { mode: "not_found" },
    relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
    seo: {
      title: `Campanha QA ${candidateSha.slice(0, 8)} | GAIATEC`,
      description: "Campanha temporária não indexável para validar captação pública sintética.",
      canonicalPath: state.campaign.path,
      indexable: false,
    },
    provenance: provenance(state.runTag),
    governanceState: "synthetic_test",
    approval: {
      businessOwner: "Owner QA",
      marketingReviewer: "Revisor QA",
      privacyReviewer: "Revisor QA",
    },
  };
}

function etag(payload, seo) {
  return `"${createHash("sha256").update(JSON.stringify({ payload, seo })).digest("hex")}"`;
}

async function createSyntheticActor(context, state) {
  const email = `cms-public-bridge-${environment}-${instance}-${candidateSha.slice(0, 8)}-${state.nonce}@example.invalid`;
  const password = `Qa!${randomBytes(32).toString("base64url")}9B`;
  const created = await context.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      synthetic: true,
      purpose: "qa-cms-browser",
      runTag: state.runTag,
      environment,
      candidateSha,
      actorKind: `public_bridge_${instance}`,
      workflowRunId,
      workflowRunAttempt,
      nonce: state.nonce,
    },
  });
  const actor = created.data?.user;
  if (
    created.error ||
    !UUID.test(actor?.id ?? "") ||
    actor?.email !== email ||
    actor?.user_metadata?.synthetic !== true ||
    actor?.user_metadata?.purpose !== "qa-cms-browser" ||
    actor?.user_metadata?.runTag !== state.runTag ||
    actor?.user_metadata?.candidateSha !== candidateSha ||
    actor?.user_metadata?.environment !== environment ||
    actor?.user_metadata?.actorKind !== `public_bridge_${instance}` ||
    String(actor?.user_metadata?.workflowRunId ?? "") !== workflowRunId ||
    String(actor?.user_metadata?.workflowRunAttempt ?? "") !== workflowRunAttempt ||
    actor?.user_metadata?.nonce !== state.nonce
  ) {
    refuse("SYNTHETIC_ACTOR_CREATE_FAILED");
  }
  state.actorId = actor.id;
  writeState(state);
  return email;
}

async function insertFixtureGraph(state, email) {
  const page = pagePayload(state);
  const campaign = campaignPayload(state);
  const formDefinition = {
    fields: [
      {
        id: state.form.fieldId,
        key: "email",
        label: state.emailLabel,
        type: "email",
        required: true,
        maxLength: 254,
        options: [],
        personalData: true,
        order: 0,
      },
    ],
    successMessage: "Solicitação sintética recebida.",
    submitLabel: "Enviar homologação sintética",
  };
  const actor = `'${state.actorId}'::uuid`;
  const statement = `begin;
select set_config('cms.qa_mutation_actor_id', ${sqlText(state.actorId)}, true);
insert into public.cms_profiles(user_id,display_name,display_email,status)
values (${actor},${sqlText(`Operador ponte QA ${state.runTag}`)},${sqlText(email)},'active');
insert into public.cms_user_roles(user_id,role_key,granted_by)
values (${actor},'super_admin',${actor});
insert into public.cms_form_definitions(
  id,form_key,title,purpose,status,created_by,updated_by
) values (
  '${state.form.id}'::uuid,${sqlText(state.form.key)},${sqlText(state.formTitle)},
  'Captação sintética controlada para validar a ponte pública.','draft',${actor},${actor}
);
insert into public.cms_form_versions(
  id,form_id,version,definition,consent_text,consent_version,privacy_path,
  sla_minutes,retention_days,status,reason,created_by,published_at
) values (
  '${state.form.versionId}'::uuid,'${state.form.id}'::uuid,1,${sqlJson(formDefinition)},
  'Autorizo exclusivamente o processamento desta submissão sintética.',${sqlText(state.runTag)},
  '/politica-de-privacidade',60,1,'published','QA synthetic public bridge fixture',${actor},statement_timestamp()
);
update public.cms_form_definitions
set status='published',active_version_id='${state.form.versionId}'::uuid,updated_by=${actor}
where id='${state.form.id}'::uuid;
insert into public.cms_content_items(id,content_type,slug,workflow_status,created_by,updated_by)
values
  ('${state.page.id}'::uuid,'page',${sqlText(state.page.slug)},'published',${actor},${actor}),
  ('${state.campaign.id}'::uuid,'campaign',${sqlText(state.campaign.slug)},'published',${actor},${actor});
insert into public.cms_content_revisions(
  id,item_id,revision_number,schema_version,payload,seo,provenance,
  source_draft_version,reason,created_by
) values
  ('${state.page.revisionId}'::uuid,'${state.page.id}'::uuid,1,1,${sqlJson(page)},${sqlJson(page.seo)},
    ${sqlJson({ syntheticOnly: true, runTag: state.runTag })},1,'QA synthetic public bridge fixture',${actor}),
  ('${state.campaign.revisionId}'::uuid,'${state.campaign.id}'::uuid,1,1,${sqlJson(campaign)},${sqlJson(campaign.seo)},
    ${sqlJson({ syntheticOnly: true, runTag: state.runTag })},1,'QA synthetic public bridge fixture',${actor});
insert into public.cms_publications(item_id,revision_id,cache_tag,published_by,published_at)
values
  ('${state.page.id}'::uuid,'${state.page.revisionId}'::uuid,${sqlText(`cms:page:${state.page.id}`)},${actor},statement_timestamp()),
  ('${state.campaign.id}'::uuid,'${state.campaign.revisionId}'::uuid,${sqlText(`cms:campaign:${state.campaign.id}`)},${actor},statement_timestamp());
insert into public.cms_published_projection(
  item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,
  payload,seo,content_version,cache_tag,etag,published_at
) values
  ('${state.page.id}'::uuid,'${state.page.revisionId}'::uuid,'page',${sqlText(state.page.slug)},1,
    'cms.managed-page.v1','managed-page',${sqlJson(page)},${sqlJson(page.seo)},1,
    ${sqlText(`cms:page:${state.page.id}`)},${sqlText(etag(page, page.seo))},statement_timestamp()),
  ('${state.campaign.id}'::uuid,'${state.campaign.revisionId}'::uuid,'campaign',${sqlText(state.campaign.slug)},1,
    'cms.campaign-landing.v1','campaign-landing',${sqlJson(campaign)},${sqlJson(campaign.seo)},1,
    ${sqlText(`cms:campaign:${state.campaign.id}`)},${sqlText(etag(campaign, campaign.seo))},statement_timestamp());
insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
values (${actor},'cms:qa.public_bridge_setup','qa_public_bridge',${sqlText(state.runTag)},
  ${sqlJson({
    syntheticOnly: true,
    candidateSha,
    environment,
    fixtureBindingSha256: fixtureBindingSha256(state),
    resources: ["page", "campaign", "form", "lead"],
  })},gen_random_uuid());
commit;
select true as configured;`;
  const rows = await managementQuery(statement);
  if (rows.length !== 1 || rows[0]?.configured !== true) refuse("FIXTURE_TRANSACTION_FAILED");
}

async function assertLegacyFormEndpoint(context, state) {
  const response = await fetch(
    `${context.url}/functions/v1/cms-public?type=form&key=${encodeURIComponent(state.form.key)}`,
    {
      headers: { apikey: context.anonKey },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const value = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    !exactKeys(value, [
      "schemaVersion",
      "formId",
      "versionId",
      "version",
      "key",
      "title",
      "purpose",
      "fields",
      "consent",
      "slaMinutes",
      "retentionDays",
      "successMessage",
      "submitLabel",
      "status",
    ]) ||
    value.formId !== state.form.id ||
    value.versionId !== state.form.versionId ||
    value.version !== 1 ||
    value.key !== state.form.key ||
    value.status !== "published"
  ) {
    refuse("LEGACY_FORM_CONTRACT_NOT_LIVE");
  }
}

async function inspectResidue(admin, state) {
  const itemIds = [state.page.id, state.campaign.id].filter(Boolean);
  const leads = state.form.id
    ? await checked(
        admin.from("cms_leads").select("id,status,anonymized_at").eq("form_id", state.form.id),
        "LEAD_RESIDUE_READ_FAILED",
      )
    : [];
  const leadIds = (leads ?? []).map((entry) => entry.id);
  const [projections, publications, form, versions, outbox, audits] = await Promise.all([
    itemIds.length
      ? checked(
          admin.from("cms_published_projection").select("item_id").in("item_id", itemIds),
          "PROJECTION_RESIDUE_READ_FAILED",
        )
      : [],
    itemIds.length
      ? checked(
          admin.from("cms_publications").select("item_id").in("item_id", itemIds),
          "PUBLICATION_RESIDUE_READ_FAILED",
        )
      : [],
    state.form.id
      ? checked(
          admin
            .from("cms_form_definitions")
            .select("status,active_version_id")
            .eq("id", state.form.id)
            .maybeSingle(),
          "FORM_RESIDUE_READ_FAILED",
        )
      : null,
    state.form.id
      ? checked(
          admin.from("cms_form_versions").select("status").eq("form_id", state.form.id),
          "FORM_VERSION_RESIDUE_READ_FAILED",
        )
      : [],
    leadIds.length
      ? checked(
          admin.from("cms_lead_outbox").select("status").in("lead_id", leadIds),
          "OUTBOX_RESIDUE_READ_FAILED",
        )
      : [],
    checked(
      admin
        .from("cms_audit_log")
        .select("action,event_data")
        .eq("target_type", "qa_public_bridge")
        .eq("target_id", state.runTag),
      "AUDIT_RESIDUE_READ_FAILED",
    ),
  ]);
  return {
    activeProjections: projections.length,
    activePublications: publications.length,
    activeForms: form && (form.status !== "retired" || form.active_version_id !== null) ? 1 : 0,
    activeFormVersions: versions.filter((entry) => entry.status !== "retired").length,
    activeLeads: leads.filter((entry) => entry.status !== "anonymized" || !entry.anonymized_at).length,
    actionableLeadOutbox: outbox.filter((entry) => !["completed", "dead_letter"].includes(entry.status))
      .length,
    auditEvents: audits.filter(
      (entry) => entry.event_data?.fixtureBindingSha256 === fixtureBindingSha256(state),
    ).length,
    setupAudit: audits.some(
      (entry) =>
        entry.action === "cms:qa.public_bridge_setup" &&
        entry.event_data?.fixtureBindingSha256 === fixtureBindingSha256(state),
    ),
    cleanupAudit: audits.some(
      (entry) =>
        entry.action === "cms:qa.public_bridge_cleanup" &&
        entry.event_data?.fixtureBindingSha256 === fixtureBindingSha256(state),
    ),
  };
}

async function cleanupState(context, state) {
  if (!UUID.test(state.actorId ?? "")) refuse("CLEANUP_ACTOR_REQUIRED");
  const actor = `'${state.actorId}'::uuid`;
  const binding = fixtureBindingSha256(state);
  const result = await managementQuery(`begin;
select set_config('cms.qa_mutation_actor_id', ${sqlText(state.actorId)}, true);
insert into public.cms_lead_status_history(
  lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id
)
select lead.id,lead.status,'anonymized',lead.assigned_to,null,
  'QA synthetic public bridge cleanup',${actor}
from public.cms_leads lead
where lead.form_id='${state.form.id}'::uuid and lead.anonymized_at is null;
update public.cms_leads
set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',
  anonymized_at=statement_timestamp(),last_activity_at=statement_timestamp()
where form_id='${state.form.id}'::uuid and anonymized_at is null;
update public.cms_lead_outbox outbox
set status='completed',locked_at=null,completed_at=coalesce(completed_at,statement_timestamp()),last_error_code=null
where outbox.lead_id in (select id from public.cms_leads where form_id='${state.form.id}'::uuid)
  and outbox.status<>'completed';
delete from public.cms_published_projection
where item_id in ('${state.page.id}'::uuid,'${state.campaign.id}'::uuid);
delete from public.cms_publications
where item_id in ('${state.page.id}'::uuid,'${state.campaign.id}'::uuid);
update public.cms_content_items
set workflow_status='archived',archived_at=coalesce(archived_at,statement_timestamp()),updated_by=${actor}
where id in ('${state.page.id}'::uuid,'${state.campaign.id}'::uuid)
  and workflow_status<>'archived';
update public.cms_form_versions set status='retired'
where form_id='${state.form.id}'::uuid and status<>'retired';
update public.cms_form_definitions
set status='retired',active_version_id=null,updated_by=${actor}
where id='${state.form.id}'::uuid and (status<>'retired' or active_version_id is not null);
insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
select ${actor},'cms:qa.public_bridge_cleanup','qa_public_bridge',${sqlText(state.runTag)},
  ${sqlJson({
    syntheticOnly: true,
    candidateSha,
    environment,
    fixtureBindingSha256: binding,
    resources: ["page", "campaign", "form", "lead"],
  })},gen_random_uuid()
where not exists (
  select 1 from public.cms_audit_log audit
  where audit.action='cms:qa.public_bridge_cleanup'
    and audit.target_type='qa_public_bridge'
    and audit.target_id=${sqlText(state.runTag)}
    and audit.event_data->>'fixtureBindingSha256'=${sqlText(binding)}
);
delete from public.cms_user_roles where user_id=${actor};
update public.cms_profiles
set status='suspended',suspended_at=coalesce(suspended_at,statement_timestamp()),
  suspended_by=${actor},updated_at=statement_timestamp()
where user_id=${actor} and status<>'suspended';
delete from auth.sessions where user_id=${actor};
commit;
select true as cleaned;`);
  if (result.length !== 1 || result[0]?.cleaned !== true) refuse("CLEANUP_TRANSACTION_FAILED");
  const banned = await context.admin.auth.admin.updateUserById(state.actorId, {
    password: `Revoked!${randomBytes(32).toString("base64url")}9B`,
    ban_duration: "876000h",
  });
  if (banned.error) refuse("ACTOR_REVOCATION_FAILED");
  const [leaseSupport] = await managementQuery(
    "select to_regprocedure('public.cms_complete_qa_actor_lease(uuid,text,text,text)') is not null as available;",
  );
  if (leaseSupport?.available === true) {
    const completed = await context.admin.rpc("cms_complete_qa_actor_lease", {
      p_actor_id: state.actorId,
      p_run_tag: state.runTag,
      p_candidate_sha: candidateSha,
      p_environment: environment,
    });
    if (completed.error || completed.data?.status !== "cleaned") refuse("ACTOR_LEASE_COMPLETION_FAILED");
  }
  state.status = "cleaned";
  writeState(state);
  return inspectResidue(context.admin, state);
}

async function setup(context) {
  if (existsSync(statePath)) refuse("STATE_ALREADY_EXISTS");
  const state = emptyState();
  writeState(state);
  try {
    const email = await createSyntheticActor(context, state);
    await insertFixtureGraph(state, email);
    state.status = "active";
    writeState(state);
    await assertLegacyFormEndpoint(context, state);
    writeReport({
      schemaVersion: 1,
      event: "g12.public_bridge.fixture",
      phase: "setup",
      status: "ready",
      environment,
      candidateSha,
      runTag: state.runTag,
      fixtureBindingSha256: fixtureBindingSha256(state),
      backendContract: "legacy-f48",
      resources: { page: 1, campaign: 1, form: 1 },
      auditRetained: true,
      identifiersPersisted: false,
      secretsPersisted: false,
    });
  } catch (error) {
    await cleanupState(context, state).catch(() => undefined);
    throw error;
  }
}

function terminalReport(phase, state, residue) {
  const passed =
    residue.activeProjections === 0 &&
    residue.activePublications === 0 &&
    residue.activeForms === 0 &&
    residue.activeFormVersions === 0 &&
    residue.activeLeads === 0 &&
    residue.actionableLeadOutbox === 0 &&
    residue.setupAudit === true &&
    residue.cleanupAudit === true &&
    residue.auditEvents >= 2;
  return {
    schemaVersion: 1,
    event: "g12.public_bridge.fixture",
    phase,
    status: passed ? (phase === "cleanup" ? "cleaned" : "passed") : "failed",
    environment,
    candidateSha,
    runTag: state.runTag,
    fixtureBindingSha256: fixtureBindingSha256(state),
    activeProjections: residue.activeProjections,
    activePublications: residue.activePublications,
    activeForms: residue.activeForms,
    activeFormVersions: residue.activeFormVersions,
    activeLeads: residue.activeLeads,
    actionableLeadOutbox: residue.actionableLeadOutbox,
    auditRetained: residue.setupAudit && residue.cleanupAudit && residue.auditEvents >= 2,
    identifiersPersisted: false,
    secretsPersisted: false,
  };
}

async function cleanup(context) {
  const state = loadState();
  const residue = await cleanupState(context, state);
  const report = terminalReport("cleanup", state, residue);
  writeReport(report);
  if (report.status !== "cleaned") refuse("CLEANUP_INCOMPLETE");
}

async function residue(context) {
  const state = loadState();
  const report = terminalReport("residue", state, await inspectResidue(context.admin, state));
  writeReport(report);
  if (report.status !== "passed") refuse("RESIDUE_PRESENT");
}

async function recover(context) {
  const state = existsSync(statePath) ? loadState() : await reconstructState(context);
  if (!state) {
    writeReport({
      schemaVersion: 1,
      event: "g12.public_bridge.fixture_recovery",
      status: "not-created",
      environment,
      candidateSha,
      instance,
      activeResidue: 0,
      secretsPersisted: false,
    });
    return;
  }
  const residue = await cleanupState(context, state);
  const [actorResidue] = await managementQuery(`select
    (select count(*)::int from public.cms_user_roles where user_id='${state.actorId}'::uuid) as active_roles,
    (select count(*)::int from public.cms_profiles where user_id='${state.actorId}'::uuid and status<>'suspended') as active_profiles,
    (select count(*)::int from auth.sessions where user_id='${state.actorId}'::uuid) as active_sessions;`);
  const activeResidue =
    residue.activeProjections +
    residue.activePublications +
    residue.activeForms +
    residue.activeFormVersions +
    residue.activeLeads +
    residue.actionableLeadOutbox +
    Number(actorResidue?.active_roles ?? -1) +
    Number(actorResidue?.active_profiles ?? -1) +
    Number(actorResidue?.active_sessions ?? -1);
  writeReport({
    schemaVersion: 1,
    event: "g12.public_bridge.fixture_recovery",
    status: activeResidue === 0 ? "recovered" : "failed",
    environment,
    candidateSha,
    instance,
    fixtureBindingSha256: fixtureBindingSha256(state),
    activeResidue,
    auditRetained: residue.cleanupAudit,
    secretsPersisted: false,
  });
  if (activeResidue !== 0 || !residue.cleanupAudit) refuse("RECOVERY_INCOMPLETE");
}

validateRuntime();
const context = await loadContext();
if (mode === "setup") await setup(context);
else if (mode === "cleanup") await cleanup(context);
else if (mode === "residue") await residue(context);
else await recover(context);
console.log(
  JSON.stringify({
    event: "g12.public_bridge.fixture.completed",
    mode,
    environment,
    candidateSha,
    secretsExposed: false,
  }),
);
