import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  budgetsMissed,
  percentile,
  runHttpLoadProbe,
  serverTimingDuration,
} from "./system-assurance-lib.mjs";
import { resolveStableBaseline } from "./stable-baseline-lib.mjs";
import { validateHealthContract, validateReleaseManifest } from "../phase12/release-guard-lib.mjs";
import {
  assertQaActorLease,
  completeQaActorLease,
  createQaRunTag,
  qaActorMetadata,
  QA_ACTOR_LEASE_TTL_MINUTES,
} from "../../qa/qa-actor-lease.mjs";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  candidateOrigin:
    process.env.EV2_G11_CANDIDATE_ORIGIN ?? "https://ev2-g11-canary.gaiatec-cms-staging.pages.dev",
  stableOrigin: "https://gaiatec-cms-staging.pages.dev",
};
if (!/^https:\/\/ev2-g(?:11|12)-canary\.gaiatec-cms-staging\.pages\.dev$/.test(TARGET.candidateOrigin))
  throw new Error("ALVO RECUSADO: o canary G11 só pode operar nos aliases isolados G11/G12 de staging.");
const expectedSha = process.env.EV2_G11_EXPECTED_SHA;
if (!/^[0-9a-f]{40}$/.test(expectedSha ?? ""))
  throw new Error("Defina EV2_G11_EXPECTED_SHA com o SHA completo explicitamente autorizado.");
const qaRunTag = createQaRunTag(expectedSha);
// Falso por padrao seria perigoso ao contrario: um run canonico que esquecesse de declarar deixaria
// de verificar acessibilidade em silencio. O padrao e verificar; so o passe de diagnostico desliga.
const frontendUnderTest = (process.env.EV2_G11_FRONTEND_UNDER_TEST ?? "true") !== "false";
// A 0084 aceita a origem `qa_fixture` somente na rota exata do run que possui o formulario.
const qaFixtureOriginPath = "/qa-cms-final/" + qaRunTag.toLowerCase();
const supabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";

const canaryStartedAt = new Date().toISOString();
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const fixturePrefix = "g11-" + suffix;
const checks = [];
const actorIds = [];
let context;
let operator;
let reviewer;
let leadId;
let outboxId;
let qaFormId;
let qaFormVersionId;
let broadOverrideId;

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return '"' + value.replaceAll("%", "%%").replaceAll('"', '""') + '"';
}

function runCommand(binary, args, options = {}) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...args].map(quoteWindowsArgument).join(" ")]
      : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

function runSupabase(args) {
  return runCommand("npx", ["supabase", ...args]);
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

// Um check que nao foi exercitado nao e um check aprovado. Registrar `SKIPPED` mantem a diferenca
// visivel no relatorio, em vez de deixar a ausencia parecer cobertura.
function skip(name, reason) {
  checks.push({ name, result: "SKIPPED", detail: reason });
  console.log(JSON.stringify({ event: "g11.check", name, result: "SKIPPED", detail: reason }));
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ name, result, detail });
  console.log(JSON.stringify({ event: "g11.check", name, result, detail }));
  if (!condition) throw new Error(name + ": " + detail);
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!allowed.includes(response.status))
    throw new Error(
      method + " " + new URL(url).pathname + ": HTTP " + response.status + " " + JSON.stringify(payload),
    );
  return {
    status: response.status,
    json: payload,
    headers: response.headers,
    durationMs: performance.now() - startedAt,
  };
}

async function loadContext() {
  if (supabaseAccessToken.length < 24)
    throw new Error("Token de gestão do staging indisponível para revogação de sessão.");
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region || project.linked !== true)
    throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado.");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", TARGET.ref, "--reveal"]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("Chaves exclusivas do staging indisponíveis.");
  return {
    anonKey,
    serviceKey,
    url: "https://" + TARGET.ref + ".supabase.co",
    serviceHeaders: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
  };
}

async function rest(ctx, table, { method = "GET", query = "", body, prefer } = {}) {
  return request(ctx.url + "/rest/v1/" + table + (query ? "?" + query : ""), {
    method,
    headers: { ...ctx.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed:
      method === "POST" ? [200, 201] : method === "DELETE" || method === "PATCH" ? [200, 204] : [200, 206],
  });
}

async function rpc(ctx, name, body) {
  return request(ctx.url + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: ctx.serviceHeaders,
    body,
    allowed: [200, 204],
  });
}

async function leaseRpc(ctx, name, body) {
  const response = await rpc(ctx, name, body);
  return response.json;
}

async function managementQuery(query, timeoutMs = 30_000) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${TARGET.ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // A causa do banco nao pode se perder aqui: sem ela, uma falha de encerramento vira codigo nu e
    // exige leitura de log bruto. So o identificador fechado viaja, nunca o corpo da resposta.
    const detail = await response.text().catch(() => "");
    const code = /"code"\s*:\s*"([0-9A-Z]{5})"/.exec(detail)?.[1] ?? "unknown";
    throw new Error(`G11_STAGING_MANAGEMENT_QUERY_FAILED:${response.status}:${code}`);
  }
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("Resposta de gestão do staging inválida.");
  return payload;
}

// O encerramento de lease dispara doze limpezas terminais num unico statement, e juntas elas varrem
// mais de trinta tabelas do run. Pelo PostgREST isso corre sob o `statement_timeout` de oito segundos
// herdado do `authenticator`, que nao e orcamento para essa varredura: no run 34542229170 o
// encerramento do ator pesado respondeu SQLSTATE 57014 enquanto o do ator leve, segundos antes,
// passou.
//
// Nao adianta corrigir dentro da funcao: mudar `statement_timeout` ali nao reprograma o timer do
// statement que ja esta correndo. O limite precisa ser armado ANTES do statement, e e isso que este
// transporte faz, com teto explicito. A autorizacao continua dentro da funcao, que e SECURITY
// DEFINER e confere a exatidao do marcador antes de qualquer coisa.
const LEASE_COMPLETION_STATEMENT_TIMEOUT_MS = 60_000;
const LEASE_COMPLETION_REQUEST_TIMEOUT_MS = 90_000;

function statementTimedOut(error) {
  return /"code"\s*:\s*"57014"|:57014$|:57014:/.test(String(error?.message ?? ""));
}

async function durableLeaseRpc(ctx, name, body) {
  try {
    return await leaseRpc(ctx, name, body);
  } catch (error) {
    if (name !== "cms_complete_qa_actor_lease" || !statementTimedOut(error)) throw error;
    if (
      !/^[0-9a-f-]{36}$/.test(body.p_actor_id ?? "") ||
      !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(body.p_run_tag ?? "") ||
      !/^[0-9a-f]{40}$/.test(body.p_candidate_sha ?? "") ||
      !/^(staging|production)$/.test(body.p_environment ?? "")
    )
      throw new Error("G11_STAGING_LEASE_IDENTITY_UNSAFE", { cause: error });
    const rows = await managementQuery(
      [
        `set statement_timeout = '${LEASE_COMPLETION_STATEMENT_TIMEOUT_MS}ms';`,
        `select public.cms_complete_qa_actor_lease(`,
        `'${body.p_actor_id}'::uuid, '${body.p_run_tag}',`,
        `'${body.p_candidate_sha}', '${body.p_environment}') as result;`,
      ].join("\n"),
      LEASE_COMPLETION_REQUEST_TIMEOUT_MS,
    );
    const result = rows.at(-1)?.result;
    if (!result) throw new Error("G11_STAGING_LEASE_DURABLE_COMPLETION_EMPTY", { cause: error });
    return result;
  }
}

function envelope(environment = "staging") {
  return {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
  };
}

async function system(ctx, actor, action, values = {}, options = {}) {
  const body = options.body ?? {
    envelope: options.envelope ?? envelope(options.environment),
    action,
    ...values,
  };
  return request(ctx.url + "/functions/v1/cms-system", {
    method: "POST",
    headers: {
      apikey: ctx.anonKey,
      Authorization: "Bearer " + (options.aal1 ? actor.aal1Token : actor.token),
      Origin: TARGET.candidateOrigin,
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    },
    body,
    allowed: options.allowed ?? [200],
  });
}

async function leads(ctx, actor, body, options = {}) {
  return request(ctx.url + "/functions/v1/cms-leads", {
    method: "POST",
    headers: {
      apikey: ctx.anonKey,
      Authorization: "Bearer " + (options.aal1 ? actor.aal1Token : actor.token),
      Origin: TARGET.candidateOrigin,
      "X-Idempotency-Key": options.idempotencyKey ?? randomUUID(),
    },
    body,
    allowed: options.allowed ?? [200],
  });
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Segredo TOTP inválido.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

async function authenticationClock(ctx) {
  const response = await fetch(ctx.url + "/auth/v1/health", {
    headers: { apikey: ctx.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const date = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(date) ? date : Date.now();
}

async function createActor(ctx, roleKey, label) {
  const email = `ev2-g11-${label}-${randomUUID()}@example.invalid`;
  const password = "Ev2!" + randomBytes(24).toString("base64url");
  const created = await request(ctx.url + "/auth/v1/admin/users", {
    method: "POST",
    headers: ctx.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: qaActorMetadata(qaRunTag, expectedSha, "staging"),
    },
  });
  actorIds.push(created.json.id);
  const identity = {
    actorId: created.json.id,
    runTag: qaRunTag,
    candidateSha: expectedSha,
    environment: "staging",
  };
  const lease = await assertQaActorLease((name, body) => leaseRpc(ctx, name, body), identity, "active");
  await rest(ctx, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: created.json.id,
      display_name: label.toUpperCase() + "-G11 sintético",
      display_email: email,
      status: "active",
    },
  });
  await rest(ctx, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: created.json.id, role_key: roleKey },
  });
  const client = createClient(ctx.url, ctx.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("AAL1 ausente.");
  const aal1Token = signedIn.data.session.access_token;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "EV2 G11 " + label });
  if (enrolled.error) throw enrolled.error;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock(ctx)),
    });
    const token = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && token) {
      await rest(ctx, "cms_profiles", {
        method: "PATCH",
        query: "user_id=eq." + created.json.id,
        prefer: "return=minimal",
        body: { mfa_enrolled_at: new Date().toISOString() },
      });
      return { id: created.json.id, email, token, aal1Token, identity, lease };
    }
    lastError = verified.error ?? new Error("AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

async function installOverride(ctx, actorId, createdBy) {
  const now = await authenticationClock(ctx);
  await rest(ctx, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.system_assurance",
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: `Canary sintético EV2.11 autorizado por ${QA_ACTOR_LEASE_TTL_MINUTES} minutos.`,
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: createdBy,
    },
  });
}

async function baseline(ctx) {
  const [stableRoot, stableHealth, stableManifest, candidateHealth, candidateManifest, flags] =
    await Promise.all([
      request(TARGET.stableOrigin + "/"),
      request(TARGET.stableOrigin + "/healthz", { allowed: [200, 404] }),
      request(TARGET.stableOrigin + "/release-manifest.json", { allowed: [200, 404] }),
      request(TARGET.candidateOrigin + "/healthz"),
      request(TARGET.candidateOrigin + "/release-manifest.json"),
      rest(ctx, "cms_feature_flags", {
        query: "flag_key=like.ev2.*&select=flag_key,default_enabled,kill_switch&order=flag_key",
      }),
    ]);
  const stable = resolveStableBaseline({
    root: stableRoot,
    health: stableHealth,
    manifest: stableManifest,
  });
  const contracts = [
    [
      "candidate_health",
      candidateHealth,
      validateHealthContract(candidateHealth.json, {
        expectedRelease: expectedSha,
        expectedEnvironment: "staging",
      }),
    ],
    [
      "candidate_manifest",
      candidateManifest,
      validateReleaseManifest(candidateManifest.json, { expectedRelease: expectedSha }),
    ],
  ];
  for (const [name, response, validation] of contracts) {
    if (!response.headers.get("content-type")?.includes("application/json") || !validation.valid)
      throw new Error(`${name}_contract_invalid:${validation.violations.join(",")}`);
  }
  if (candidateHealth.json.release !== candidateManifest.json.release)
    throw new Error("candidate_release_contract_mismatch");
  return {
    ...stable,
    candidateRelease: candidateManifest.json.release,
    flags: flags.json,
  };
}

function runRestoreDrill() {
  const workspaceRoot = path.resolve(process.cwd());
  const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g11-restore-drill-"));
  const resolved = path.resolve(directory);
  if (
    path.dirname(resolved) !== workspaceRoot ||
    !path.basename(resolved).startsWith(".ev2-g11-restore-drill-")
  )
    throw new Error("Diretório de restore fora do workspace autorizado.");
  const file = path.join(directory, "restore.sql");
  const sql = [
    "begin;",
    "create temporary table g11_restore_source(id integer primary key, payload jsonb not null);",
    "insert into g11_restore_source select value, jsonb_build_object('synthetic',true,'value',value) from generate_series(1,1000) value;",
    "create temporary table g11_restore_snapshot as table g11_restore_source;",
    "truncate g11_restore_source;",
    "insert into g11_restore_source select * from g11_restore_snapshot;",
    "select json_build_object(",
    "  'rows', count(*),",
    "  'checksum', md5(string_agg(id::text || payload::text, ',' order by id)),",
    "  'rpoMinutes', 0",
    ") as evidence from g11_restore_source;",
    "rollback;",
  ].join("\n");
  writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
  const startedAt = performance.now();
  try {
    const output = JSON.parse(
      runSupabase([
        "db",
        "query",
        "--linked",
        "--file",
        path.relative(process.cwd(), file).replaceAll("\\", "/"),
        "--output-format",
        "json",
      ]),
    );
    const rows = output.rows ?? output.result ?? output;
    return { ...rows[0].evidence, durationMs: performance.now() - startedAt };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runAccessibility() {
  runCommand("npm", ["run", "test:a11y"], {
    env: {
      ...process.env,
      CI: "1",
      PLAYWRIGHT_BASE_URL: TARGET.candidateOrigin,
      PLAYWRIGHT_EDGE: "1",
    },
  });
  return { critical: 0, serious: 0 };
}

async function createQaFixtureForm(ctx) {
  // O escopo de formularios de 0072 so aceita um chamador de QA quando o formulario pertence a um
  // ator com lease do mesmo run. Um formulario corporativo publicado nunca satisfaz esse predicado,
  // entao o canario precisa possuir o formulario que usa: e o operador do run que o cria, versiona e
  // publica, pelos mesmos comandos que o painel expoe.
  const saved = await leads(ctx, operator, {
    action: "save_form",
    formId: null,
    expectedLockVersion: null,
    formKey: "qa-g11-" + suffix,
    title: "Formulário sintético G11 " + qaRunTag,
    purpose: "Captura sintética exclusiva do canário EV2.11, retirada no encerramento do lease.",
    definition: {
      fields: [
        {
          id: randomUUID(),
          key: "contato",
          label: "Contato sintético",
          type: "email",
          required: true,
          maxLength: 180,
          options: [],
          personalData: true,
          order: 0,
        },
      ],
      successMessage: "Captura sintética registrada.",
      submitLabel: "Enviar",
    },
    consentText: "Consentimento exclusivamente sintético do canário G11.",
    consentVersion: "g11-synthetic-v1",
    privacyPath: "/politica-de-privacidade",
    slaMinutes: 30,
    retentionDays: 1,
    reason: "Formulário sintético do canário G11 " + qaRunTag,
  });
  qaFormId = saved.json.formId;
  qaFormVersionId = saved.json.versionId;
  await leads(ctx, operator, {
    action: "publish_form",
    formId: qaFormId,
    versionId: qaFormVersionId,
    expectedLockVersion: saved.json.lockVersion,
  });
  const stored = await rest(ctx, "cms_form_definitions", {
    query:
      "id=eq." +
      qaFormId +
      "&select=status,active_version_id,created_by,qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment",
  });
  const form = stored.json[0];
  check(
    "qa_fixture_form_owned_by_run",
    form?.status === "published" &&
      form?.active_version_id === qaFormVersionId &&
      form?.created_by === operator.id &&
      form?.qa_actor_id === operator.id &&
      form?.qa_run_tag === qaRunTag &&
      form?.qa_candidate_sha === expectedSha &&
      form?.qa_environment === "staging",
    JSON.stringify(form),
  );
}

async function createSyntheticLead(ctx) {
  if (!qaFormId || !qaFormVersionId)
    throw new Error("O formulário sintético do run G11 precisa existir antes da captura sintética.");
  leadId = randomUUID();
  outboxId = randomUUID();
  const leadCorrelation = randomUUID();
  await rest(ctx, "cms_leads", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: leadId,
      reference_code: "LD-G11-" + suffix.toUpperCase(),
      form_id: qaFormId,
      form_version_id: qaFormVersionId,
      idempotency_key: randomUUID(),
      payload: { synthetic: true, contact: "g11@example.invalid" },
      // A origem de um lead nao e texto livre: 0084 a valida contra o formulario que recebe a
      // captura. Para um formulario de QA a unica origem aceita e `qa_fixture` na rota exata
      // `/qa-cms-final/<run tag em minusculas>`, sem campanha e sem produto. Fora disso a insercao e
      // recusada com CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN antes de qualquer verificacao.
      //
      // A provenienca de QA do lead nao e enviada aqui: o gatilho de 0072 a copia do formulario, e o
      // formulario pertence ao operador deste run. E esse vinculo que mantem a fixture visivel para o
      // proprio operador -- sem ele, reprocessar a entrega responde CMS_LEAD_DELIVERY_NOT_FOUND e
      // anonimizar responde CMS_LEAD_NOT_FOUND -- e visivel somente dentro do run.
      origin_path: qaFixtureOriginPath,
      origin_source: "qa_fixture",
      utm: {},
      status: "new",
      sla_due_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      retention_until: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    },
  });
  await rest(ctx, "cms_lead_consents", {
    method: "POST",
    prefer: "return=representation",
    body: {
      lead_id: leadId,
      accepted: true,
      consent_text: "Consentimento exclusivamente sintético do G11.",
      consent_version: "g11-synthetic-v1",
      policy_path: "/privacidade",
      evidence_hash: createHash("sha256")
        .update(fixturePrefix + ":consent")
        .digest("hex"),
      technical_evidence: { synthetic: true },
    },
  });
  await rest(ctx, "cms_lead_status_history", {
    method: "POST",
    prefer: "return=representation",
    body: { lead_id: leadId, to_status: "new", reason: "Fixture sintética persistida antes da entrega" },
  });
  await rest(ctx, "cms_lead_outbox", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: outboxId,
      lead_id: leadId,
      event_type: "lead_received",
      status: "processing",
      idempotency_key: randomUUID(),
      attempts: 1,
      locked_at: new Date().toISOString(),
      correlation_id: leadCorrelation,
    },
  });
}

async function closeSyntheticResidue(ctx) {
  const cleanupErrors = [];
  const attempt = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push(new Error(label, { cause: error }));
    }
  };
  await attempt("lead_anonymization", async () => {
    if (!leadId || !operator) return;
    await leads(ctx, operator, {
      action: "anonymize_lead",
      leadId,
      reason: "Encerramento e anonimização da fixture sintética G11",
    });
  });
  await attempt("broad_override_cleanup", async () => {
    if (broadOverrideId)
      await rest(ctx, "cms_feature_flag_overrides", {
        method: "DELETE",
        query: "id=eq." + broadOverrideId,
      });
  });
  if (!actorIds.length) {
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Falha no encerramento sintético G11.");
    return;
  }

  const actorFilter = actorIds.join(",");
  let ownedItemIds = [];
  await attempt("owned_content_inventory", async () => {
    const items = await rest(ctx, "cms_content_items", {
      query: `created_by=in.(${actorFilter})&select=id`,
    });
    ownedItemIds = items.json.map((item) => item.id);
  });
  if (ownedItemIds.length) {
    const itemFilter = ownedItemIds.join(",");
    let liveProjections = [];
    await attempt("public_projection_inventory", async () => {
      const projections = await rest(ctx, "cms_published_projection", {
        query: `item_id=in.(${itemFilter})&select=item_id,revision_id`,
      });
      liveProjections = projections.json;
    });
    if (liveProjections.length)
      await attempt("public_withdrawal_outbox", () =>
        rest(ctx, "cms_publication_outbox", {
          method: "POST",
          query: "on_conflict=item_id,revision_id,event_type",
          prefer: "resolution=ignore-duplicates,return=minimal",
          body: liveProjections.map((projection) => ({
            item_id: projection.item_id,
            revision_id: projection.revision_id,
            event_type: "unpublish",
            correlation_id: randomUUID(),
          })),
        }),
      );
    await attempt("publication_cleanup", async () => {
      await rest(ctx, "cms_publications", { method: "DELETE", query: `item_id=in.(${itemFilter})` });
      await rest(ctx, "cms_published_projection", {
        method: "DELETE",
        query: `item_id=in.(${itemFilter})`,
      });
    });
    await attempt("route_cleanup", () =>
      rest(ctx, "cms_route_rules", {
        method: "PATCH",
        query: `item_id=in.(${itemFilter})&active=eq.true`,
        prefer: "return=minimal",
        body: { active: false },
      }),
    );
    await attempt("content_archive", () =>
      rest(ctx, "cms_content_items", {
        method: "PATCH",
        query: `id=in.(${itemFilter})&workflow_status=neq.archived`,
        prefer: "return=minimal",
        body: {
          workflow_status: "archived",
          archived_at: new Date().toISOString(),
          scheduled_for: null,
          deleted_at: null,
          deleted_by: null,
        },
      }),
    );
  }

  for (const actorId of actorIds) {
    const now = new Date().toISOString();
    await attempt(`overrides:${actorId}`, () =>
      rest(ctx, "cms_feature_flag_overrides", {
        method: "DELETE",
        query: `scope_type=eq.user&scope_key=eq.${actorId}`,
      }),
    );
    await attempt(`scoped_roles:${actorId}`, () =>
      rest(ctx, "cms_scoped_role_assignments", {
        method: "PATCH",
        query: `user_id=eq.${actorId}&revoked_at=is.null`,
        prefer: "return=minimal",
        body: {
          revoked_at: now,
          revoked_by: actorId,
          revocation_reason: "QA synthetic G11 cleanup",
        },
      }),
    );
    await attempt(`legacy_roles:${actorId}`, () =>
      rest(ctx, "cms_user_roles", { method: "DELETE", query: `user_id=eq.${actorId}` }),
    );
    await attempt(`rdo_access:${actorId}`, () =>
      rest(ctx, "rdo_user_access", {
        method: "PATCH",
        query: `user_id=eq.${actorId}&active=eq.true`,
        prefer: "return=minimal",
        body: {
          active: false,
          suspended_at: now,
          suspended_by: actorId,
          updated_at: now,
        },
      }),
    );
    await attempt(`profile:${actorId}`, () =>
      rest(ctx, "cms_profiles", {
        method: "PATCH",
        query: `user_id=eq.${actorId}`,
        prefer: "return=minimal",
        body: {
          status: "suspended",
          suspended_at: now,
          suspended_by: actorId,
          sessions_valid_after: now,
        },
      }),
    );
    await attempt(`sessions:${actorId}`, () =>
      managementQuery(`delete from auth.sessions where user_id = '${actorId}'::uuid`),
    );
    await attempt(`credentials:${actorId}`, () =>
      request(ctx.url + "/auth/v1/admin/users/" + actorId, {
        method: "PUT",
        headers: ctx.serviceHeaders,
        body: {
          password: "Revoked!" + randomBytes(32).toString("base64url") + "9Z",
          ban_duration: "876000h",
        },
      }),
    );
    await attempt(`lease:${actorId}`, () =>
      completeQaActorLease((name, body) => durableLeaseRpc(ctx, name, body), {
        actorId,
        runTag: qaRunTag,
        candidateSha: expectedSha,
        environment: "staging",
      }),
    );
  }
  if (cleanupErrors.length)
    throw new AggregateError(cleanupErrors, "Falha no encerramento sintético G11; watchdog permanece ativo.");
}

async function residue(ctx) {
  const actorFilter = actorIds.join(",");
  const [
    profiles,
    overrides,
    legacyRoles,
    scopedRoles,
    rdoAccess,
    ownedItems,
    leadsResult,
    authUsers,
    retainedActors,
    retainedLeads,
    retainedAudit,
    leaseStatuses,
    sessionRows,
    liveQaForms,
  ] = await Promise.all([
    actorIds.length
      ? rest(ctx, "cms_profiles", {
          query: `user_id=in.(${actorFilter})&status=neq.suspended&select=user_id`,
        })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "cms_feature_flag_overrides", {
          query: `scope_type=eq.user&scope_key=in.(${actorFilter})&select=id`,
        })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "cms_user_roles", { query: `user_id=in.(${actorFilter})&select=user_id` })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "cms_scoped_role_assignments", {
          query: `user_id=in.(${actorFilter})&revoked_at=is.null&select=id`,
        })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "rdo_user_access", {
          query: `user_id=in.(${actorFilter})&active=eq.true&select=user_id`,
        })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "cms_content_items", {
          query: `created_by=in.(${actorFilter})&workflow_status=neq.archived&select=id`,
        })
      : Promise.resolve({ json: [] }),
    leadId
      ? rest(ctx, "cms_leads", { query: "id=eq." + leadId + "&anonymized_at=is.null&select=id" })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? Promise.all(
          actorIds.map((actorId) =>
            request(ctx.url + "/auth/v1/admin/users/" + actorId, {
              headers: ctx.serviceHeaders,
              allowed: [200, 404],
            }),
          ),
        )
      : Promise.resolve([]),
    rest(ctx, "cms_profiles", {
      query: "display_email=like.ev2-g11-*@example.invalid&select=user_id",
    }),
    rest(ctx, "cms_leads", {
      query: `qa_run_tag=eq.${qaRunTag}&anonymized_at=not.is.null&select=id`,
    }),
    actorIds.length
      ? rest(ctx, "cms_audit_log", {
          query: `target_type=eq.qa_fixture&target_id=eq.${qaRunTag}&actor_id=in.(${actorFilter})&select=id`,
        })
      : Promise.resolve({ json: [] }),
    Promise.all(
      actorIds.map((actorId) =>
        assertQaActorLease(
          (name, body) => leaseRpc(ctx, name, body),
          {
            actorId,
            runTag: qaRunTag,
            candidateSha: expectedSha,
            environment: "staging",
          },
          "cleaned",
        ),
      ),
    ),
    actorIds.length
      ? managementQuery(
          `select count(*)::integer as count from auth.sessions where user_id in (${actorIds
            .map((actorId) => `'${actorId}'::uuid`)
            .join(",")})`,
        )
      : Promise.resolve([{ count: 0 }]),
    rest(ctx, "cms_form_definitions", {
      query: `qa_run_tag=eq.${qaRunTag}&or=(status.neq.retired,active_version_id.not.is.null)&select=id`,
    }),
  ]);
  return {
    activeActors: profiles.json.length,
    activeCredentials: authUsers.filter((response) => {
      if (response.status !== 200) return false;
      const bannedUntil = Date.parse(response.json?.banned_until ?? "");
      return !Number.isFinite(bannedUntil) || bannedUntil <= Date.now();
    }).length,
    activeOverrides: overrides.json.length,
    activeLegacyRoles: legacyRoles.json.length,
    activeScopedRoles: scopedRoles.json.length,
    activeRdoAccess: rdoAccess.json.length,
    activeOwnedContent: ownedItems.json.length,
    activeSessions: Number(sessionRows[0]?.count ?? 0),
    activeQaForms: liveQaForms.json.length,
    personalLeadPayloads: leadsResult.json.length,
    retainedSyntheticActors: retainedActors.json.length,
    retainedAnonymizedLeads: retainedLeads.json.length,
    retainedLeaseAuditEvents: retainedAudit.json.length,
    cleanedLeases: leaseStatuses.length,
    semantics: "zero-active-residue; retained tombstones are counted separately",
  };
}

let operationError;
let cleanupError;
let finalEvidence;
let finalResidue;

try {
  context = await loadContext();
  const before = await baseline(context);
  check("exact_candidate_sha", before.candidateRelease === expectedSha, before.candidateRelease);
  check("stable_not_promoted", before.stableRelease !== expectedSha, before.stableRelease);
  check(
    "system_flag_default_off",
    before.flags.find((flag) => flag.flag_key === "ev2.system_assurance")?.default_enabled === false,
    JSON.stringify(before.flags.find((flag) => flag.flag_key === "ev2.system_assurance")),
  );

  operator = await createActor(context, "super_admin", "operator");
  reviewer = await createActor(context, "technical", "reviewer");
  check(
    "qa_actor_watchdog_leases_active",
    [operator, reviewer].every(
      (actor) =>
        actor.lease.status === "active" && actor.lease.ttlSeconds === QA_ACTOR_LEASE_TTL_MINUTES * 60,
    ),
    qaRunTag,
  );
  await installOverride(context, operator.id, operator.id);
  await installOverride(context, reviewer.id, operator.id);

  const operatorCapability = await system(context, operator, "capability");
  const reviewerCapability = await system(context, reviewer, "capability");
  check(
    "individual_overrides_only",
    operatorCapability.json.enabled === true && reviewerCapability.json.enabled === true,
    JSON.stringify({ operator: operatorCapability.json, reviewer: reviewerCapability.json }),
  );
  const anonymous = await request(context.url + "/functions/v1/cms-system", {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.candidateOrigin },
    body: { envelope: envelope(), action: "snapshot" },
    allowed: [401],
  });
  check("anonymous_system_access_denied", anonymous.status === 401, anonymous.status);
  const production = await system(
    context,
    operator,
    "capability",
    {},
    { environment: "production", allowed: [403] },
  );
  check(
    "production_environment_denied",
    production.json.code === "CMS_SYSTEM_PRODUCTION_GATED",
    production.json.code,
  );

  await createQaFixtureForm(context);
  await createSyntheticLead(context);
  await rpc(context, "cms_finish_lead_outbox", {
    p_id: outboxId,
    p_success: false,
    p_error_code: "synthetic_provider_failure",
  });
  const failedLead = await rest(context, "cms_leads", {
    query: "id=eq." + leadId + "&select=id,status,payload",
  });
  const failedEvent = await rest(context, "cms_lead_outbox", {
    query: "id=eq." + outboxId + "&select=id,status,attempts,last_error_code,available_at",
  });
  check(
    "lead_preserved_after_delivery_failure",
    failedLead.json.length === 1 && failedEvent.json[0]?.status === "failed",
    JSON.stringify({ lead: failedLead.json, event: failedEvent.json }),
  );
  check(
    "delivery_failure_visible_for_inbox",
    failedEvent.json[0]?.last_error_code === "synthetic_provider_failure" &&
      Boolean(failedEvent.json[0]?.available_at),
    JSON.stringify(failedEvent.json[0]),
  );

  const retryIdempotency = randomUUID();
  const retryBody = {
    action: "retry_delivery",
    eventId: outboxId,
    justification: "Dependência sintética recuperada no canary G11",
  };
  const commandDurations = [];
  const commandWallDurations = [];
  let retryCorrelationId;
  for (let index = 0; index < 10; index += 1) {
    const replay = await leads(context, operator, retryBody, { idempotencyKey: retryIdempotency });
    commandDurations.push(serverTimingDuration(replay.headers, "command"));
    commandWallDurations.push(replay.durationMs);
    if (index === 0) {
      retryCorrelationId = replay.json.correlationId;
      check("failed_delivery_requeued", replay.json.status === "pending", JSON.stringify(replay.json));
    }
    if (index === 1)
      check("delivery_retry_idempotent", replay.json.duplicate === true, JSON.stringify(replay.json));
  }
  const aal1Retry = await leads(context, operator, retryBody, {
    aal1: true,
    idempotencyKey: randomUUID(),
    allowed: [403],
  });
  check("delivery_retry_requires_mfa", aal1Retry.status === 403, aal1Retry.json.code);

  await rest(context, "cms_lead_outbox", {
    method: "PATCH",
    query: "id=eq." + outboxId,
    prefer: "return=minimal",
    body: { status: "processing", attempts: 20, locked_at: new Date().toISOString() },
  });
  await rpc(context, "cms_finish_lead_outbox", {
    p_id: outboxId,
    p_success: false,
    p_error_code: "synthetic_provider_failure",
  });
  const deadLetter = await rest(context, "cms_lead_outbox", {
    query: "id=eq." + outboxId + "&select=status",
  });
  check(
    "delivery_dead_letter_after_bounded_retries",
    deadLetter.json[0]?.status === "dead_letter",
    deadLetter.json[0]?.status,
  );
  await leads(
    context,
    operator,
    { ...retryBody, justification: "Reprocessamento do dead-letter sintético G11" },
    { idempotencyKey: randomUUID() },
  );
  await rest(context, "cms_lead_outbox", {
    method: "PATCH",
    query: "id=eq." + outboxId,
    prefer: "return=minimal",
    body: { status: "processing", attempts: 1, locked_at: new Date().toISOString() },
  });
  await rpc(context, "cms_finish_lead_outbox", { p_id: outboxId, p_success: true, p_error_code: null });
  const resolvedDeadLetter = await rest(context, "cms_operational_events", {
    query:
      "event_type=eq.cms.leads.delivery_dead_letter&correlation_id=eq." +
      retryCorrelationId +
      "&select=resolved_at",
  });
  check(
    "dead_letter_alert_resolved_on_requeue",
    resolvedDeadLetter.json.length === 1 && Boolean(resolvedDeadLetter.json[0]?.resolved_at),
    JSON.stringify(resolvedDeadLetter.json),
  );

  const broadNow = await authenticationClock(context);
  const broad = await rest(context, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.system_assurance",
      environment: "staging",
      scope_type: "environment",
      scope_key: "staging",
      enabled: true,
      reason: "Teste negativo temporário do fail-closed G11.",
      starts_at: new Date(broadNow - 1000).toISOString(),
      expires_at: new Date(broadNow + 5 * 60_000).toISOString(),
      created_by: operator.id,
    },
  });
  broadOverrideId = broad.json[0].id;
  const broadCapability = await system(context, operator, "capability");
  check(
    "broad_override_fails_closed",
    broadCapability.json.enabled === false &&
      broadCapability.json.source === "broad_activation_not_supported",
    JSON.stringify(broadCapability.json),
  );
  await rest(context, "cms_feature_flag_overrides", { method: "DELETE", query: "id=eq." + broadOverrideId });
  broadOverrideId = undefined;

  for (let warmup = 0; warmup < 5; warmup += 1) await system(context, operator, "snapshot");

  const snapshotDurations = [];
  const snapshotWallDurations = [];
  let latestSnapshot;
  for (let index = 0; index < 20; index += 1) {
    const response = await system(context, operator, "snapshot");
    snapshotDurations.push(serverTimingDuration(response.headers, "admin-read"));
    snapshotWallDurations.push(response.durationMs);
    latestSnapshot = response.json;
  }
  check(
    "backend_server_timing_available",
    commandDurations.every(Number.isFinite) && snapshotDurations.every(Number.isFinite),
    JSON.stringify({ commandSamples: commandDurations.length, adminReadSamples: snapshotDurations.length }),
  );
  check("database_snapshot_ready", latestSnapshot.gateReady === true, JSON.stringify(latestSnapshot.metrics));
  check(
    "outbox_lag_within_budget",
    latestSnapshot.metrics.outboxWorstLagSeconds <= 60,
    latestSnapshot.metrics.outboxWorstLagSeconds,
  );
  check(
    "database_reconciliation_clean",
    latestSnapshot.metrics.projectionDivergence === 0 && latestSnapshot.metrics.leadDivergence === 0,
    JSON.stringify(latestSnapshot.metrics),
  );

  const publicLoad = await runHttpLoadProbe({
    url: TARGET.candidateOrigin + "/release-manifest.json",
    requests: 30,
    concurrency: 5,
  });
  check("candidate_availability", publicLoad.availabilityPercent >= 99.9, publicLoad.availabilityPercent);
  const restore = runRestoreDrill();
  check(
    "transactional_restore_rpo_zero",
    restore.rows === 1000 && restore.rpoMinutes === 0,
    JSON.stringify(restore),
  );
  check("transactional_restore_rto_within_budget", restore.durationMs <= 15 * 60_000, restore.durationMs);
  // O alias so serve o candidato depois que um run canonico o publica. Num passe que nao publica, a
  // suite de acessibilidade mede o build ANTERIOR, e o numero que ela produz nao e do candidato.
  //
  // Isso ja produziu falso negativo: no passe 34552942444 a varredura devolveu zero violacoes e no
  // 34554432797, mesma fonte e mesmo alias, devolveu dezesseis — o elemento infrator e transitorio e
  // depende de estar no DOM no instante da varredura. Zero por sorte foi lido como prova.
  //
  // A medicao depende disso duas vezes: o relatorio enviado ao `record_run` declara
  // `accessibilityCritical` e `accessibilitySerious`, e o backend exige ambos em zero para decidir
  // `measured`. Declarar zero a partir de uma varredura que nao mediu o candidato seria afirmar ao
  // banco algo que nao foi verificado. Entao, sem frontend sob teste, nada disso roda: os checks
  // saem como NAO EXERCITADOS, que e diferente de aprovados.
  let measurementEvidence = null;
  if (frontendUnderTest) {
    const accessibility = runAccessibility();
    check(
      "accessibility_critical_serious_zero",
      accessibility.critical === 0 && accessibility.serious === 0,
      JSON.stringify(accessibility),
    );

    const metrics = {
      availabilityPercent: publicLoad.availabilityPercent,
      adminReadP95Ms: Math.round(percentile(snapshotDurations, 95)),
      commandP95Ms: Math.round(percentile(commandDurations, 95)),
      adminReadWallP95Ms: Math.round(percentile(snapshotWallDurations, 95)),
      commandWallP95Ms: Math.round(percentile(commandWallDurations, 95)),
      outboxLagP95Ms: latestSnapshot.metrics.outboxWorstLagSeconds * 1000,
      auditCoveragePercent: latestSnapshot.metrics.auditCoveragePercent,
      restoreRpoMinutes: restore.rpoMinutes,
      restoreRtoMinutes: Math.ceil(restore.durationMs / 60_000),
    };
    // `SKIPPED` nao entra nem no total nem no aprovado: contar como exercitado inflaria a cobertura.
    const measuredChecks = checks.filter((entry) => entry.result === "PASS").length;
    const report = {
      suiteKey: "g11-staging-system",
      candidateSha: expectedSha,
      startedAt: canaryStartedAt,
      finishedAt: new Date().toISOString(),
      totalChecks: measuredChecks,
      passedChecks: measuredChecks,
      p0Count: 0,
      p1Count: 0,
      accessibilityCritical: accessibility.critical,
      accessibilitySerious: accessibility.serious,
      securityStatus: "passed",
      restoreStatus: "passed",
      metrics,
      evidenceHash: createHash("sha256").update(JSON.stringify({ checks, metrics })).digest("hex"),
      syntheticOnly: true,
      realDataUsed: false,
    };
    // A resposta de `record_run` diz apenas `failed`, sem nomear o orcamento estourado. Sem isto, a
    // reprovacao nao tem causa em lugar nenhum: nem na resposta, nem no log.
    const submittedMetrics = {
      ...metrics,
      accessibilityCritical: report.accessibilityCritical,
      accessibilitySerious: report.accessibilitySerious,
    };
    const missedBudgets = budgetsMissed(operatorCapability.json.baselines, submittedMetrics);
    console.log(JSON.stringify({ event: "g11.metrics", submitted: submittedMetrics, missedBudgets }));
    const record = await system(
      context,
      operator,
      "record_run",
      { report },
      { idempotencyKey: randomUUID() },
    );
    check(
      "measurement_requires_independent_review",
      record.json.status === "measured" && record.json.requiresIndependentReview === true,
      JSON.stringify({ ...record.json, missedBudgets }),
    );
    const selfReview = await system(
      context,
      operator,
      "review_run",
      { runId: record.json.runId, accept: true, rationale: "Tentativa negativa de autoaprovação" },
      { idempotencyKey: randomUUID(), allowed: [409] },
    );
    check(
      "independent_review_required",
      selfReview.json.code === "CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED",
      selfReview.json.code,
    );
    const accepted = await system(
      context,
      reviewer,
      "review_run",
      {
        runId: record.json.runId,
        accept: true,
        rationale: "Evidência sintética G11 conferida por revisor segregado",
      },
      { idempotencyKey: randomUUID() },
    );
    check("segregated_review_accepted", accepted.json.status === "accepted", JSON.stringify(accepted.json));
    measurementEvidence = { metrics, assuranceRunId: record.json.runId };
  } else {
    for (const name of [
      "accessibility_critical_serious_zero",
      "measurement_requires_independent_review",
      "independent_review_required",
      "segregated_review_accepted",
    ])
      skip(name, "EV2_G11_FRONTEND_UNDER_TEST=false: o alias publicado nao serve o candidato");
  }
  const after = await baseline(context);
  check(
    "stable_manifest_and_default_flags_unchanged",
    before.stableRelease === after.stableRelease &&
      JSON.stringify(before.flags) === JSON.stringify(after.flags),
    JSON.stringify({ before, after }),
  );
  finalEvidence = measurementEvidence
    ? { before, after, ...measurementEvidence }
    : { before, after, frontendUnderTest: false };
} catch (error) {
  operationError = error;
} finally {
  try {
    if (context) {
      await closeSyntheticResidue(context);
      const remaining = await residue(context);
      finalResidue = remaining;
      check(
        "synthetic_active_residue_zero",
        remaining.activeActors === 0 &&
          remaining.activeCredentials === 0 &&
          remaining.activeOverrides === 0 &&
          remaining.activeLegacyRoles === 0 &&
          remaining.activeScopedRoles === 0 &&
          remaining.activeRdoAccess === 0 &&
          remaining.activeOwnedContent === 0 &&
          remaining.activeSessions === 0 &&
          remaining.activeQaForms === 0 &&
          remaining.personalLeadPayloads === 0 &&
          remaining.cleanedLeases === actorIds.length &&
          remaining.retainedLeaseAuditEvents >= actorIds.length * 2,
        JSON.stringify(remaining),
      );
    }
  } catch (error) {
    cleanupError = error;
  }
}

if (operationError || cleanupError)
  throw new AggregateError(
    [operationError, cleanupError].filter(Boolean),
    "Canary G11 falhou; consulte os erros operacional e de encerramento seguro.",
  );

const finalReport = {
  outcome: "G11_CANARY_PASS",
  target: TARGET,
  candidateSha: expectedSha,
  checks: checks.length,
  passed: checks.filter((item) => item.result === "PASS").length,
  p0: 0,
  p1: 0,
  realDataUsed: false,
  productionMutations: 0,
  stablePromoted: false,
  evidence: finalEvidence,
  syntheticResidue: finalResidue,
};
if (process.env.EV2_G11_REPORT_PATH)
  writeFileSync(process.env.EV2_G11_REPORT_PATH, `${JSON.stringify(finalReport, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
console.log(JSON.stringify(finalReport, null, 2));
