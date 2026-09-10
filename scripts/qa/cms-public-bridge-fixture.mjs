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
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { createPublicBridgeContentBlocks } from "./cms-public-bridge-fixture-content.mjs";
import { revisionProvenanceSql, sqlJson } from "./cms-public-bridge-fixture-sql.mjs";
import {
  isPublicBridgeRunTagForCandidate,
  publicBridgeCampaignLocation,
  publicBridgeFixtureBinding,
  publicBridgeRunTag,
  publicBridgeWorkflowNonce,
} from "./cms-public-bridge-fixture-binding.mjs";

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
const AUTH_USERS_PAGE_SIZE = 100;
const AUTH_USERS_MAX_PAGES = 1_000;
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

// Uma recusa que nao diz o que a base respondeu obriga a repetir o run inteiro para descobrir. O
// codigo do PostgREST e um slug fechado, e a mensagem das excecoes deste projeto tambem, entao os
// dois podem viajar. Qualquer outra coisa vira "unknown": nada de texto livre, endereco ou payload.
const SAFE_DB_CODE = /^[0-9A-Z]{5}$/;
const SAFE_DB_MESSAGE = /^CMS_[A-Z0-9_]{3,60}$/;

function databaseFailureIdentity(error) {
  const code = SAFE_DB_CODE.test(String(error?.code ?? "")) ? String(error.code) : "unknown";
  const message = SAFE_DB_MESSAGE.test(String(error?.message ?? "").trim())
    ? String(error.message).trim()
    : "unknown";
  return `${code}:${message}`;
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

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function emptyState(recoveredRunTag) {
  const nonce = publicBridgeWorkflowNonce({
    environment,
    candidateSha,
    runId: workflowRunId,
    runAttempt: workflowRunAttempt,
    instance,
  });
  const runTag = recoveredRunTag ?? publicBridgeRunTag({ candidateSha });
  const campaignLocation = publicBridgeCampaignLocation({ candidateSha, runTag, nonce });
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
      ...campaignLocation,
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
    !isPublicBridgeRunTagForCandidate(value.runTag, candidateSha) ||
    value.nonce !==
      publicBridgeWorkflowNonce({
        environment,
        candidateSha,
        runId: workflowRunId,
        runAttempt: workflowRunAttempt,
        instance,
      }) ||
    !exactKeys(value.form, ["id", "versionId", "fieldId", "key"]) ||
    !exactKeys(value.page, ["id", "revisionId", "slug", "path", "title"]) ||
    !exactKeys(value.campaign, ["id", "revisionId", "slug", "path", "title"]) ||
    !/^qa-bridge-[a-f0-9]{8}-[a-f0-9]{8}$/.test(value.form?.key ?? "") ||
    !/^qa-bridge-page-[a-f0-9]{8}-[a-f0-9]{8}$/.test(value.page?.slug ?? "") ||
    value.page?.path !== `/${value.page?.slug}` ||
    value.campaign?.slug !== `qa-lead-${value.runTag?.toLowerCase()}-${value.nonce}` ||
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
  return publicBridgeFixtureBinding({
    candidateSha: state.candidateSha,
    runTag: state.runTag,
    nonce: state.nonce,
  });
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

function syntheticActorMatches(actor, expected) {
  return (
    actor.user_metadata?.synthetic === true &&
    actor.user_metadata?.purpose === "qa-cms-browser" &&
    actor.user_metadata?.candidateSha === expected.candidateSha &&
    actor.user_metadata?.environment === expected.environment &&
    actor.user_metadata?.actorKind === `public_bridge_${expected.instance}` &&
    String(actor.user_metadata?.workflowRunId ?? "") === expected.workflowRunId &&
    String(actor.user_metadata?.workflowRunAttempt ?? "") === expected.workflowRunAttempt
  );
}

export async function findSyntheticActor(
  admin,
  expected = { candidateSha, environment, instance, workflowRunId, workflowRunAttempt },
  { pageSize = AUTH_USERS_PAGE_SIZE, maxPages = AUTH_USERS_MAX_PAGES } = {},
) {
  if (
    !FULL_SHA.test(expected.candidateSha ?? "") ||
    !["staging", "production"].includes(expected.environment) ||
    !/^(?:preview|canonical|forward)$/.test(expected.instance ?? "") ||
    !/^[1-9]\d*$/.test(expected.workflowRunId ?? "") ||
    !/^[1-9]\d*$/.test(expected.workflowRunAttempt ?? "") ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1_000 ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > AUTH_USERS_MAX_PAGES
  ) {
    refuse("ACTOR_RECOVERY_PAGINATION_INVALID");
  }
  const matches = [];
  const seenUserIds = new Set();
  let authoritativeTotal = null;
  let observedUsers = 0;
  let exhausted = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (result.error || !Array.isArray(result.data?.users)) refuse("ACTOR_RECOVERY_READ_FAILED");
    const users = result.data.users;
    if (users.length > pageSize) refuse("ACTOR_RECOVERY_PAGE_INVALID");
    for (const actor of users) {
      if (!UUID.test(actor?.id ?? "") || seenUserIds.has(actor.id))
        refuse("ACTOR_RECOVERY_PAGINATION_CHANGED");
      seenUserIds.add(actor.id);
    }
    const reportedTotal =
      Number.isSafeInteger(result.data.total) && result.data.total >= 0 ? result.data.total : null;
    // auth-js <=2.101 truncates Link page numbers to one digit and reports
    // total=0 when the server omits Link on a one-page result. A stable,
    // positive x-total-count is authoritative; otherwise an empty page is the
    // only safe terminal signal.
    if (reportedTotal !== null && reportedTotal > 0) {
      if (authoritativeTotal !== null && reportedTotal !== authoritativeTotal)
        refuse("ACTOR_RECOVERY_PAGINATION_CHANGED");
      authoritativeTotal = reportedTotal;
    } else if (reportedTotal === 0 && users.length === 0 && observedUsers === 0) {
      authoritativeTotal = 0;
    }
    if (authoritativeTotal === 0 && users.length !== 0) {
      refuse("ACTOR_RECOVERY_PAGINATION_CHANGED");
    }
    observedUsers += users.length;
    if (authoritativeTotal !== null && observedUsers > authoritativeTotal)
      refuse("ACTOR_RECOVERY_PAGINATION_CHANGED");
    for (const actor of users) if (syntheticActorMatches(actor, expected)) matches.push(actor);

    const exhaustedByTotal = authoritativeTotal !== null && observedUsers === authoritativeTotal;
    const exhaustedByEmptyPage = authoritativeTotal === null && users.length === 0;
    if (users.length === 0 && authoritativeTotal !== null && observedUsers < authoritativeTotal) {
      refuse("ACTOR_RECOVERY_PAGINATION_CHANGED");
    }
    if (exhaustedByTotal || exhaustedByEmptyPage) {
      exhausted = true;
      break;
    }
  }
  if (!exhausted) refuse("ACTOR_RECOVERY_PAGINATION_INCOMPLETE");
  if (matches.length > 1) refuse("ACTOR_RECOVERY_AMBIGUOUS");
  return matches[0] ?? null;
}

export async function reconcileRecoveryActor(
  admin,
  localState = null,
  expected = { candidateSha, environment, instance, workflowRunId, workflowRunAttempt },
  pagination = {},
) {
  // Search to authoritative exhaustion before deciding that an interrupted
  // createUser call did not persist an actor. The broad workflow identity is
  // intentional: a same-run actor with a divergent nonce/runTag must fail
  // closed below instead of being ignored as "not-created".
  const actor = await findSyntheticActor(admin, expected, pagination);
  const expectedNonce = publicBridgeWorkflowNonce({
    environment: expected.environment,
    candidateSha: expected.candidateSha,
    runId: expected.workflowRunId,
    runAttempt: expected.workflowRunAttempt,
    instance: expected.instance,
  });

  if (localState !== null) {
    if (
      localState.candidateSha !== expected.candidateSha ||
      localState.environment !== expected.environment ||
      localState.instance !== expected.instance ||
      !isPublicBridgeRunTagForCandidate(localState.runTag, expected.candidateSha) ||
      localState.nonce !== expectedNonce ||
      (localState.actorId !== null && !UUID.test(localState.actorId ?? ""))
    ) {
      refuse("ACTOR_RECOVERY_LOCAL_BINDING_INVALID");
    }
  }

  if (!actor) {
    // A persisted actor id proves that setup advanced beyond createUser. Do
    // not misclassify that state as never created if Auth no longer returns
    // the exact metadata-bound identity.
    if (UUID.test(localState?.actorId ?? "")) refuse("ACTOR_RECOVERY_MISSING");
    return null;
  }

  const metadata = actor.user_metadata;
  if (
    !UUID.test(actor.id) ||
    metadata?.synthetic !== true ||
    metadata?.purpose !== "qa-cms-browser" ||
    metadata?.candidateSha !== expected.candidateSha ||
    metadata?.environment !== expected.environment ||
    metadata?.actorKind !== `public_bridge_${expected.instance}` ||
    String(metadata?.workflowRunId ?? "") !== expected.workflowRunId ||
    String(metadata?.workflowRunAttempt ?? "") !== expected.workflowRunAttempt ||
    !isPublicBridgeRunTagForCandidate(metadata?.runTag, expected.candidateSha) ||
    metadata?.nonce !== expectedNonce
  ) {
    refuse("ACTOR_RECOVERY_INVALID");
  }
  if (
    localState !== null &&
    (metadata.runTag !== localState.runTag ||
      metadata.nonce !== localState.nonce ||
      (UUID.test(localState.actorId ?? "") && actor.id !== localState.actorId))
  ) {
    refuse("ACTOR_RECOVERY_BINDING_MISMATCH");
  }
  return actor;
}

async function reconstructState(context, localState = null) {
  const actor = await reconcileRecoveryActor(context.admin, localState);
  if (!actor) return null;
  const metadata = actor.user_metadata;
  const expectedNonce = publicBridgeWorkflowNonce({
    environment,
    candidateSha,
    runId: workflowRunId,
    runAttempt: workflowRunAttempt,
    instance,
  });
  if (
    !UUID.test(actor.id) ||
    metadata?.synthetic !== true ||
    metadata?.purpose !== "qa-cms-browser" ||
    metadata?.candidateSha !== candidateSha ||
    metadata?.environment !== environment ||
    metadata?.actorKind !== `public_bridge_${instance}` ||
    String(metadata?.workflowRunId ?? "") !== workflowRunId ||
    String(metadata?.workflowRunAttempt ?? "") !== workflowRunAttempt ||
    !isPublicBridgeRunTagForCandidate(metadata?.runTag, candidateSha) ||
    metadata?.nonce !== expectedNonce
  ) {
    refuse("ACTOR_RECOVERY_INVALID");
  }
  const template = emptyState(metadata.runTag);
  template.actorId = actor.id;
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
    blocks: createPublicBridgeContentBlocks(state.page.title),
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
    blocks: createPublicBridgeContentBlocks(state.campaign.title),
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
    ${revisionProvenanceSql(page.provenance)},1,'QA synthetic public bridge fixture',${actor}),
  ('${state.campaign.revisionId}'::uuid,'${state.campaign.id}'::uuid,1,1,${sqlJson(campaign)},${sqlJson(campaign.seo)},
    ${revisionProvenanceSql(campaign.provenance)},1,'QA synthetic public bridge fixture',${actor});
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

export function buildPublicBridgeCleanupSql(
  state,
  runtime = { candidateSha, environment, instance, workflowRunId, workflowRunAttempt },
) {
  if (
    !UUID.test(state?.actorId ?? "") ||
    !FULL_SHA.test(runtime.candidateSha ?? "") ||
    !["staging", "production"].includes(runtime.environment) ||
    !/^(?:preview|canonical|forward)$/.test(runtime.instance ?? "") ||
    !/^[1-9]\d*$/.test(runtime.workflowRunId ?? "") ||
    !/^[1-9]\d*$/.test(runtime.workflowRunAttempt ?? "") ||
    state?.candidateSha !== runtime.candidateSha ||
    state?.environment !== runtime.environment ||
    state?.instance !== runtime.instance ||
    !isPublicBridgeRunTagForCandidate(state?.runTag, runtime.candidateSha) ||
    state?.nonce !==
      publicBridgeWorkflowNonce({
        environment: runtime.environment,
        candidateSha: runtime.candidateSha,
        runId: runtime.workflowRunId,
        runAttempt: runtime.workflowRunAttempt,
        instance: runtime.instance,
      }) ||
    !UUID.test(state?.form?.id ?? "") ||
    !UUID.test(state?.form?.versionId ?? "") ||
    !UUID.test(state?.form?.fieldId ?? "") ||
    state?.form?.key !== `qa-bridge-${runtime.candidateSha.slice(0, 8)}-${state?.nonce}` ||
    !UUID.test(state?.page?.id ?? "") ||
    !UUID.test(state?.page?.revisionId ?? "") ||
    state?.page?.path !== `/${state?.page?.slug}` ||
    !UUID.test(state?.campaign?.id ?? "") ||
    !UUID.test(state?.campaign?.revisionId ?? "") ||
    state?.campaign?.path !== `/campanhas/${state?.campaign?.slug}` ||
    state?.campaign?.slug !== `qa-lead-${state?.runTag?.toLowerCase()}-${state?.nonce}`
  ) {
    refuse("CLEANUP_BINDING_INVALID");
  }
  const actor = `${sqlText(state.actorId)}::uuid`;
  const formId = `${sqlText(state.form.id)}::uuid`;
  const formVersionId = `${sqlText(state.form.versionId)}::uuid`;
  const pageId = `${sqlText(state.page.id)}::uuid`;
  const pageRevisionId = `${sqlText(state.page.revisionId)}::uuid`;
  const campaignId = `${sqlText(state.campaign.id)}::uuid`;
  const campaignRevisionId = `${sqlText(state.campaign.revisionId)}::uuid`;
  const binding = publicBridgeFixtureBinding({
    candidateSha: runtime.candidateSha,
    runTag: state.runTag,
    nonce: state.nonce,
  });
  const syntheticEmail = `qa-public-${state.nonce}@example.invalid`;
  const actorEmail = `cms-public-bridge-${runtime.environment}-${runtime.instance}-${runtime.candidateSha.slice(0, 8)}-${state.nonce}@example.invalid`;
  const cleanupEvent = {
    syntheticOnly: true,
    candidateSha: runtime.candidateSha,
    environment: runtime.environment,
    fixtureBindingSha256: binding,
    resources: ["page", "campaign", "form", "lead"],
  };

  return `begin;
select set_config('cms.qa_mutation_actor_id', ${sqlText(state.actorId)}, true);
do $qa_public_bridge_cleanup$
declare
  v_actor_metadata jsonb;
  v_form_ids uuid[];
  v_version_ids uuid[];
  v_content_ids uuid[];
  v_revision_ids uuid[];
  v_publication_ids uuid[];
  v_projection_ids uuid[];
  v_lead_ids uuid[];
  v_outbox_ids uuid[];
  v_mutable_outbox_ids uuid[];
  v_changed_ids uuid[];
  v_expected_content_ids uuid[] := array[${pageId},${campaignId}]::uuid[];
  v_expected_revision_ids uuid[] := array[${pageRevisionId},${campaignRevisionId}]::uuid[];
  v_graph_absent boolean;
  v_graph_active boolean;
  v_graph_terminal boolean;
  v_lead public.cms_leads%rowtype;
  v_initial_history_count integer := 0;
  v_cleanup_history_count integer := 0;
  v_total_history_count integer := 0;
  v_consent_count integer := 0;
  v_setup_audit_count integer := 0;
  v_cleanup_audit_count integer := 0;
begin
  select actor.raw_user_meta_data into v_actor_metadata
  from auth.users actor where actor.id=${actor} for update;
  if not found or
    v_actor_metadata->>'synthetic' is distinct from 'true' or
    v_actor_metadata->>'purpose' is distinct from 'qa-cms-browser' or
    v_actor_metadata->>'candidateSha' is distinct from ${sqlText(runtime.candidateSha)} or
    v_actor_metadata->>'environment' is distinct from ${sqlText(runtime.environment)} or
    v_actor_metadata->>'actorKind' is distinct from ${sqlText(`public_bridge_${runtime.instance}`)} or
    v_actor_metadata->>'workflowRunId' is distinct from ${sqlText(runtime.workflowRunId)} or
    v_actor_metadata->>'workflowRunAttempt' is distinct from ${sqlText(runtime.workflowRunAttempt)} or
    v_actor_metadata->>'runTag' is distinct from ${sqlText(state.runTag)} or
    v_actor_metadata->>'nonce' is distinct from ${sqlText(state.nonce)}
  then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_ACTOR_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_profiles profile where profile.user_id=${actor} for update;
  perform 1 from public.cms_form_definitions form where form.created_by=${actor} for update;
  perform 1 from public.cms_form_versions version
    where version.created_by=${actor} or version.form_id=${formId} for update;
  perform 1 from public.cms_content_items item where item.created_by=${actor} for update;
  perform 1 from public.cms_content_revisions revision
    where revision.created_by=${actor} or revision.item_id=any(v_expected_content_ids) for update;
  perform 1 from public.cms_leads lead where lead.form_id=${formId} for update;
  perform 1 from public.cms_publications publication
    where publication.item_id=any(v_expected_content_ids) for update;
  perform 1 from public.cms_published_projection projection
    where projection.item_id=any(v_expected_content_ids) for update;

  select coalesce(array_agg(form.id order by form.id),'{}'::uuid[]) into v_form_ids
  from public.cms_form_definitions form where form.created_by=${actor};
  select coalesce(array_agg(version.id order by version.id),'{}'::uuid[]) into v_version_ids
  from public.cms_form_versions version
  where version.created_by=${actor} or version.form_id=${formId};
  select coalesce(array_agg(item.id order by item.id),'{}'::uuid[]) into v_content_ids
  from public.cms_content_items item where item.created_by=${actor};
  select coalesce(array_agg(revision.id order by revision.id),'{}'::uuid[]) into v_revision_ids
  from public.cms_content_revisions revision
  where revision.created_by=${actor} or revision.item_id=any(v_expected_content_ids);
  select coalesce(array_agg(publication.item_id order by publication.item_id),'{}'::uuid[])
    into v_publication_ids from public.cms_publications publication
    where publication.item_id=any(v_expected_content_ids);
  select coalesce(array_agg(projection.item_id order by projection.item_id),'{}'::uuid[])
    into v_projection_ids from public.cms_published_projection projection
    where projection.item_id=any(v_expected_content_ids);
  select coalesce(array_agg(lead.id order by lead.id),'{}'::uuid[]) into v_lead_ids
  from public.cms_leads lead where lead.form_id=${formId};

  v_graph_absent := cardinality(v_form_ids)=0 and cardinality(v_version_ids)=0 and
    cardinality(v_content_ids)=0 and cardinality(v_revision_ids)=0 and
    cardinality(v_publication_ids)=0 and cardinality(v_projection_ids)=0 and
    cardinality(v_lead_ids)=0;
  if not v_graph_absent and (
    cardinality(v_form_ids)<>1 or v_form_ids[1] is distinct from ${formId} or
    cardinality(v_version_ids)<>1 or v_version_ids[1] is distinct from ${formVersionId} or
    cardinality(v_content_ids)<>2 or not (v_content_ids @> v_expected_content_ids and v_expected_content_ids @> v_content_ids) or
    cardinality(v_revision_ids)<>2 or not (v_revision_ids @> v_expected_revision_ids and v_expected_revision_ids @> v_revision_ids) or
    not (cardinality(v_publication_ids)=0 or (
      cardinality(v_publication_ids)=2 and v_publication_ids @> v_expected_content_ids and v_expected_content_ids @> v_publication_ids
    )) or
    not (cardinality(v_projection_ids)=0 or (
      cardinality(v_projection_ids)=2 and v_projection_ids @> v_expected_content_ids and v_expected_content_ids @> v_projection_ids
    )) or
    cardinality(v_lead_ids)>1
  ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_GRAPH_CARDINALITY_MISMATCH'; end if;

  if not v_graph_absent then
    if exists (
      select 1 from public.cms_form_definitions form where form.id=${formId} and (
        form.form_key is distinct from ${sqlText(state.form.key)} or
        form.title is distinct from ${sqlText(state.formTitle)} or
        form.purpose is distinct from 'Captação sintética controlada para validar a ponte pública.' or
        form.created_by is distinct from ${actor} or form.updated_by is distinct from ${actor} or
        form.status not in ('published','retired') or
        (form.status='published' and form.active_version_id is distinct from ${formVersionId}) or
        (form.status='retired' and form.active_version_id is not null)
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_FORM_PROVENANCE_MISMATCH'; end if;
    if exists (
      select 1 from public.cms_form_versions version where version.id=${formVersionId} and (
        version.form_id is distinct from ${formId} or version.version<>1 or
        version.created_by is distinct from ${actor} or version.consent_version is distinct from ${sqlText(state.runTag)} or
        version.reason is distinct from 'QA synthetic public bridge fixture' or
        version.status not in ('published','retired') or
        jsonb_array_length(version.definition->'fields') is distinct from 1 or
        version.definition#>>'{fields,0,id}' is distinct from ${sqlText(state.form.fieldId)} or
        version.definition#>>'{fields,0,key}' is distinct from 'email' or
        version.definition#>>'{fields,0,label}' is distinct from ${sqlText(state.emailLabel)}
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_FORM_VERSION_PROVENANCE_MISMATCH'; end if;
    if exists (
      select 1 from public.cms_content_items item where item.id=any(v_expected_content_ids) and (
        item.created_by is distinct from ${actor} or item.updated_by is distinct from ${actor} or
        item.workflow_status not in ('published','archived') or
        (item.id=${pageId} and (item.content_type is distinct from 'page' or item.slug is distinct from ${sqlText(state.page.slug)})) or
        (item.id=${campaignId} and (item.content_type is distinct from 'campaign' or item.slug is distinct from ${sqlText(state.campaign.slug)}))
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_CONTENT_PROVENANCE_MISMATCH'; end if;
    if exists (
      select 1 from public.cms_content_revisions revision where revision.id=any(v_expected_revision_ids) and (
        revision.created_by is distinct from ${actor} or revision.revision_number<>1 or
        revision.reason is distinct from 'QA synthetic public bridge fixture' or
        not exists (
          select 1 from jsonb_array_elements(revision.provenance) entry
          where entry->>'authorizationReference'=${sqlText(state.runTag)}
        ) or
        (revision.id=${pageRevisionId} and (
          revision.item_id is distinct from ${pageId} or revision.payload->>'contentType' is distinct from 'page' or
          revision.payload#>>'{route,path}' is distinct from ${sqlText(state.page.path)}
        )) or
        (revision.id=${campaignRevisionId} and (
          revision.item_id is distinct from ${campaignId} or revision.payload->>'contentType' is distinct from 'campaign' or
          revision.payload#>>'{route,path}' is distinct from ${sqlText(state.campaign.path)} or
          revision.payload#>>'{form,formId}' is distinct from ${sqlText(state.form.id)} or
          revision.payload#>>'{form,versionId}' is distinct from ${sqlText(state.form.versionId)} or
          revision.payload#>>'{form,key}' is distinct from ${sqlText(state.form.key)}
        ))
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_REVISION_PROVENANCE_MISMATCH'; end if;
    if exists (
      select 1 from public.cms_publications publication where publication.item_id=any(v_expected_content_ids) and (
        publication.published_by is distinct from ${actor} or
        (publication.item_id=${pageId} and publication.revision_id is distinct from ${pageRevisionId}) or
        (publication.item_id=${campaignId} and publication.revision_id is distinct from ${campaignRevisionId})
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_PUBLICATION_PROVENANCE_MISMATCH'; end if;
    if exists (
      select 1 from public.cms_published_projection projection where projection.item_id=any(v_expected_content_ids) and (
        (projection.item_id=${pageId} and (
          projection.revision_id is distinct from ${pageRevisionId} or
          projection.content_type is distinct from 'page' or projection.slug is distinct from ${sqlText(state.page.slug)}
        )) or
        (projection.item_id=${campaignId} and (
          projection.revision_id is distinct from ${campaignRevisionId} or
          projection.content_type is distinct from 'campaign' or projection.slug is distinct from ${sqlText(state.campaign.slug)}
        ))
      )
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_PROJECTION_PROVENANCE_MISMATCH'; end if;

    v_graph_active :=
      (select form.status='published' and form.active_version_id=${formVersionId}
       from public.cms_form_definitions form where form.id=${formId}) and
      (select version.status='published' from public.cms_form_versions version where version.id=${formVersionId}) and
      not exists (select 1 from public.cms_content_items item where item.id=any(v_expected_content_ids) and item.workflow_status<>'published') and
      cardinality(v_publication_ids)=2 and cardinality(v_projection_ids)=2;
    v_graph_terminal :=
      (select form.status='retired' and form.active_version_id is null
       from public.cms_form_definitions form where form.id=${formId}) and
      (select version.status='retired' from public.cms_form_versions version where version.id=${formVersionId}) and
      not exists (select 1 from public.cms_content_items item where item.id=any(v_expected_content_ids) and item.workflow_status<>'archived') and
      cardinality(v_publication_ids)=0 and cardinality(v_projection_ids)=0;
    if not coalesce(v_graph_active,false) and not coalesce(v_graph_terminal,false)
    then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_GRAPH_STATE_MISMATCH'; end if;

    if cardinality(v_lead_ids)=1 then
      select lead.* into strict v_lead from public.cms_leads lead where lead.id=v_lead_ids[1];
      perform 1 from public.cms_lead_consents consent where consent.lead_id=v_lead.id for update;
      perform 1 from public.cms_lead_status_history history where history.lead_id=v_lead.id for update;
      perform 1 from public.cms_lead_outbox outbox where outbox.lead_id=v_lead.id for update;
      select count(*)::int into v_consent_count from public.cms_lead_consents consent
      where consent.lead_id=v_lead.id and consent.accepted=true and
        consent.consent_version=${sqlText(state.runTag)} and
        consent.consent_text='Autorizo exclusivamente o processamento desta submissão sintética.' and
        consent.policy_path='/politica-de-privacidade';
      select count(*)::int into v_initial_history_count from public.cms_lead_status_history history
      where history.lead_id=v_lead.id and history.from_status is null and history.to_status='new' and
        history.reason='Lead persistido antes da notificacao' and history.actor_id is null;
      select count(*)::int into v_cleanup_history_count from public.cms_lead_status_history history
      where history.lead_id=v_lead.id and history.to_status='anonymized' and
        history.reason='QA synthetic public bridge cleanup' and history.actor_id=${actor};
      select count(*)::int into v_total_history_count from public.cms_lead_status_history history
      where history.lead_id=v_lead.id;
      select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_outbox_ids
      from public.cms_lead_outbox outbox where outbox.lead_id=v_lead.id;
      if v_lead.form_id is distinct from ${formId} or
        v_lead.form_version_id is distinct from ${formVersionId} or
        v_lead.origin_path is distinct from ${sqlText(state.campaign.path)} or
        v_lead.origin_source is distinct from 'campaign' or
        v_lead.campaign_id is distinct from ${campaignId} or v_lead.product_id is not null or
        v_consent_count<>1 or v_initial_history_count<>1 or cardinality(v_outbox_ids)<>1 or
        exists (select 1 from public.cms_lead_consents consent where consent.lead_id=v_lead.id having count(*)<>1) or
        exists (select 1 from public.cms_lead_outbox outbox where outbox.lead_id=v_lead.id and outbox.event_type<>'lead_received')
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_LEAD_PROVENANCE_MISMATCH'; end if;
      if v_graph_active and (
        v_lead.status<>'new' or v_lead.anonymized_at is not null or v_lead.assigned_to is not null or
        v_lead.payload->>'email' is distinct from ${sqlText(syntheticEmail)} or
        v_cleanup_history_count<>0 or v_total_history_count<>1
      ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_ACTIVE_LEAD_MISMATCH'; end if;
      if v_graph_terminal and (
        v_lead.status<>'anonymized' or v_lead.anonymized_at is null or v_lead.assigned_to is not null or
        v_lead.payload<>'{}'::jsonb or v_lead.utm<>'{}'::jsonb or
        v_cleanup_history_count<>1 or v_total_history_count<>2 or
        exists (select 1 from public.cms_lead_outbox outbox where outbox.lead_id=v_lead.id and outbox.status<>'completed')
      ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_TERMINAL_LEAD_MISMATCH'; end if;
    end if;

    select count(*)::int into v_setup_audit_count from public.cms_audit_log audit
    where audit.action='cms:qa.public_bridge_setup' and audit.target_type='qa_public_bridge' and
      audit.target_id=${sqlText(state.runTag)} and audit.actor_id=${actor} and
      audit.event_data->>'candidateSha'=${sqlText(runtime.candidateSha)} and
      audit.event_data->>'environment'=${sqlText(runtime.environment)} and
      audit.event_data->>'fixtureBindingSha256'=${sqlText(binding)};
    select count(*)::int into v_cleanup_audit_count from public.cms_audit_log audit
    where audit.action='cms:qa.public_bridge_cleanup' and audit.target_type='qa_public_bridge' and
      audit.target_id=${sqlText(state.runTag)} and audit.actor_id=${actor} and
      audit.event_data->>'fixtureBindingSha256'=${sqlText(binding)};
    if v_setup_audit_count<>1 or v_cleanup_audit_count>1 or
      (v_graph_active and v_cleanup_audit_count<>0) or
      (v_graph_terminal and v_cleanup_audit_count<>1)
    then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_AUDIT_PROVENANCE_MISMATCH'; end if;

    if v_graph_active then
      if cardinality(v_lead_ids)=1 then
        insert into public.cms_lead_status_history(
          lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id
        ) values (
          v_lead.id,v_lead.status,'anonymized',v_lead.assigned_to,null,
          'QA synthetic public bridge cleanup',${actor}
        );
        with changed as (
          update public.cms_leads lead
          set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',
            anonymized_at=statement_timestamp(),last_activity_at=statement_timestamp()
          where lead.id=v_lead.id and lead.form_id=${formId} and
            lead.form_version_id=${formVersionId} and lead.campaign_id=${campaignId} and
            lead.origin_path=${sqlText(state.campaign.path)} and lead.origin_source='campaign' and
            lead.anonymized_at is null and lead.payload->>'email'=${sqlText(syntheticEmail)}
          returning lead.id
        ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
          into v_changed_ids from changed;
        if v_changed_ids is distinct from array[v_lead.id]::uuid[]
        then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_LEAD_AFFECTED_IDS_MISMATCH'; end if;
        select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_mutable_outbox_ids
        from public.cms_lead_outbox outbox where outbox.lead_id=v_lead.id and outbox.status<>'completed';
        with changed as (
          update public.cms_lead_outbox outbox
          set status='completed',locked_at=null,
            completed_at=coalesce(outbox.completed_at,statement_timestamp()),last_error_code=null
          where outbox.id=any(v_mutable_outbox_ids) and outbox.lead_id=v_lead.id
          returning outbox.id
        ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
          into v_changed_ids from changed;
        if v_changed_ids is distinct from v_mutable_outbox_ids
        then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_OUTBOX_AFFECTED_IDS_MISMATCH'; end if;
      end if;

      with changed as (
        delete from public.cms_published_projection projection
        where projection.item_id=any(v_expected_content_ids) returning projection.item_id
      ) select coalesce(array_agg(changed.item_id order by changed.item_id),'{}'::uuid[])
        into v_changed_ids from changed;
      if v_changed_ids is distinct from v_projection_ids
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_PROJECTION_AFFECTED_IDS_MISMATCH'; end if;
      with changed as (
        delete from public.cms_publications publication
        where publication.item_id=any(v_expected_content_ids) returning publication.item_id
      ) select coalesce(array_agg(changed.item_id order by changed.item_id),'{}'::uuid[])
        into v_changed_ids from changed;
      if v_changed_ids is distinct from v_publication_ids
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_PUBLICATION_AFFECTED_IDS_MISMATCH'; end if;
      with changed as (
        update public.cms_content_items item set workflow_status='archived',
          archived_at=coalesce(item.archived_at,statement_timestamp()),updated_by=${actor}
        where item.id=any(v_expected_content_ids) and item.created_by=${actor} and item.workflow_status='published'
        returning item.id
      ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
        into v_changed_ids from changed;
      if cardinality(v_changed_ids)<>2 or
        not (v_changed_ids @> v_expected_content_ids and v_expected_content_ids @> v_changed_ids)
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_CONTENT_AFFECTED_IDS_MISMATCH'; end if;
      with changed as (
        update public.cms_form_versions version set status='retired'
        where version.id=${formVersionId} and version.form_id=${formId} and
          version.created_by=${actor} and version.status='published' returning version.id
      ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
        into v_changed_ids from changed;
      if v_changed_ids is distinct from array[${formVersionId}]::uuid[]
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_VERSION_AFFECTED_IDS_MISMATCH'; end if;
      with changed as (
        update public.cms_form_definitions form
        set status='retired',active_version_id=null,updated_by=${actor}
        where form.id=${formId} and form.created_by=${actor} and form.updated_by=${actor} and
          form.form_key=${sqlText(state.form.key)} and form.status='published' and
          form.active_version_id=${formVersionId} returning form.id
      ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
        into v_changed_ids from changed;
      if v_changed_ids is distinct from array[${formId}]::uuid[]
      then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_FORM_AFFECTED_IDS_MISMATCH'; end if;
    end if;

    if exists (
      select 1 from public.cms_form_definitions form where form.id=${formId} and
        (form.status<>'retired' or form.active_version_id is not null)
    ) or exists (
      select 1 from public.cms_form_versions version where version.form_id=${formId} and version.status<>'retired'
    ) or exists (
      select 1 from public.cms_content_items item where item.id=any(v_expected_content_ids) and item.workflow_status<>'archived'
    ) or exists (
      select 1 from public.cms_publications publication where publication.item_id=any(v_expected_content_ids)
    ) or exists (
      select 1 from public.cms_published_projection projection where projection.item_id=any(v_expected_content_ids)
    ) or exists (
      select 1 from public.cms_leads lead where lead.form_id=${formId} and
        (lead.status<>'anonymized' or lead.anonymized_at is null)
    ) or exists (
      select 1 from public.cms_lead_outbox outbox join public.cms_leads lead on lead.id=outbox.lead_id
      where lead.form_id=${formId} and outbox.status<>'completed'
    ) then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_TERMINAL_STATE_INVALID'; end if;
  end if;

  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  select ${actor},'cms:qa.public_bridge_cleanup','qa_public_bridge',${sqlText(state.runTag)},
    ${sqlJson(cleanupEvent)},gen_random_uuid()
  where not exists (
    select 1 from public.cms_audit_log audit where
      audit.action='cms:qa.public_bridge_cleanup' and audit.target_type='qa_public_bridge' and
      audit.target_id=${sqlText(state.runTag)} and audit.actor_id=${actor} and
      audit.event_data->>'fixtureBindingSha256'=${sqlText(binding)}
  );
  delete from public.cms_user_roles role where role.user_id=${actor};
  update public.cms_profiles profile set status='suspended',
    suspended_at=coalesce(profile.suspended_at,statement_timestamp()),suspended_by=${actor},
    updated_at=statement_timestamp()
  where profile.user_id=${actor} and profile.display_email=${sqlText(actorEmail)} and profile.status<>'suspended';
  if exists (select 1 from public.cms_profiles profile where profile.user_id=${actor} and
      (profile.display_email is distinct from ${sqlText(actorEmail)} or profile.status<>'suspended'))
  then raise exception 'QA_CMS_PUBLIC_BRIDGE_CLEANUP_PROFILE_TERMINAL_MISMATCH'; end if;
  delete from auth.sessions session where session.user_id=${actor};
end
$qa_public_bridge_cleanup$;
commit;
select true as cleaned;`;
}

async function cleanupState(context, state) {
  if (!UUID.test(state.actorId ?? "")) refuse("CLEANUP_ACTOR_REQUIRED");
  const result = await managementQuery(buildPublicBridgeCleanupSql(state));
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
    if (completed.error || completed.data?.status !== "cleaned")
      refuse(
        `ACTOR_LEASE_COMPLETION_FAILED:${
          completed.error
            ? databaseFailureIdentity(completed.error)
            : `status:${SAFE_DB_MESSAGE.test(String(completed.data?.status ?? "")) ? "unexpected" : String(completed.data?.status ?? "absent").slice(0, 20)}`
        }`,
      );
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
  const localState = existsSync(statePath) ? loadState() : null;
  const state =
    localState === null || localState.status === "preparing"
      ? await reconstructState(context, localState)
      : localState;
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

export async function main() {
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
