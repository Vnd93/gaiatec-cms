import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ACTOR_LEASE_MAX_MINUTES, QA_ACTOR_LEASE_TTL_MINUTES } from "./qa-actor-lease.mjs";

const TARGETS = Object.freeze({
  staging: Object.freeze({
    environment: "staging",
    ref: "glcqsosxwgmlhzgcsnzv",
    name: "GAIATEC CMS Staging",
    region: "us-east-2",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  }),
  production: Object.freeze({
    environment: "production",
    ref: "chfuhctnhqgyjowkvllv",
    name: "GAIATEC CMS Production",
    origin: "https://gaiatecsistemas.com.br",
  }),
});
const FEATURE_KEYS = Object.freeze([
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
  "ev2.system_assurance",
]);
const mode = process.argv[2];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const expectedSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
const targetEnvironment = process.env.QA_CMS_TARGET_ENVIRONMENT ?? "";
const productionAuthorization = process.env.QA_CMS_PRODUCTION_AUTHORIZATION ?? "";
const authLifecycleProvisioning = process.env.QA_CMS_PROVISION_AUTH_LIFECYCLE ?? "";
const statePath = path.resolve(
  process.env.QA_CMS_FIXTURE_STATE_PATH ?? "test-results/cms-browser-fixture-state.json",
);
const reportPath = path.resolve(
  process.env.QA_CMS_FIXTURE_REPORT_PATH ?? "test-results/cms-browser-fixture.json",
);
const adminOpsReportPath = path.resolve(
  process.env.QA_CMS_ADMIN_OPS_REPORT_PATH ?? "outputs/cms-admin-ops-cycles.json",
);
const uiCreatedStatePath = path.resolve(
  process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json",
);
const githubEnvironmentPath = process.env.GITHUB_ENV;
const runTagPattern = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_DEFINITIONS = Object.freeze({
  operator: Object.freeze({ prefix: "cms-browser", displayName: "Operador QA" }),
  reviewer: Object.freeze({ prefix: "cms-browser-managed", displayName: "Revisor QA gerenciado" }),
  existing_identity: Object.freeze({
    prefix: "cms-browser-existing",
    displayName: "Identidade Auth/RDO existente QA",
  }),
  recovery: Object.freeze({
    prefix: "cms-browser-recovery",
    displayName: "Recuperação CMS QA",
  }),
  invitee: Object.freeze({
    prefix: "cms-browser-invitee",
    displayName: "Convite CMS QA",
  }),
});

let context;
let target;

export function resolveTarget(environment, candidateSha, authorization = "") {
  if (!Object.hasOwn(TARGETS, environment)) throw new Error("QA_CMS_FIXTURE_ENVIRONMENT_INVALID");
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw new Error("QA_CMS_FIXTURE_SHA_INVALID");
  if (environment === "production" && authorization !== `AUTORIZO-G12-PRODUCAO:${candidateSha}`)
    throw new Error("QA_CMS_FIXTURE_PRODUCTION_AUTHORIZATION_REQUIRED");
  return TARGETS[environment];
}

function assertArtifactPath(file) {
  const workspace = path.resolve(process.cwd());
  const relative = path.relative(workspace, file);
  if (
    relative === "" ||
    relative === ".git" ||
    relative.startsWith(`.git${path.sep}`) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("QA_CMS_FIXTURE_ARTIFACT_PATH_REFUSED");
}

function validateRuntime() {
  if (!["setup", "cleanup", "residue"].includes(mode)) throw new Error("QA_CMS_FIXTURE_MODE_INVALID");
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("QA_CMS_FIXTURE_SHA_INVALID");
  target = resolveTarget(targetEnvironment, expectedSha, productionAuthorization);
  if (!accessToken.startsWith("sbp_") || accessToken.length < 24)
    throw new Error("QA_CMS_FIXTURE_ACCESS_TOKEN_INVALID");
  if (mode === "setup" && !githubEnvironmentPath) throw new Error("QA_CMS_FIXTURE_GITHUB_ENV_REQUIRED");
  if (!["", "true"].includes(authLifecycleProvisioning))
    throw new Error("QA_CMS_FIXTURE_AUTH_LIFECYCLE_FLAG_INVALID");
  assertArtifactPath(statePath);
  assertArtifactPath(reportPath);
  assertArtifactPath(adminOpsReportPath);
  assertArtifactPath(uiCreatedStatePath);
  const checkout = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30_000,
  });
  if (checkout.status !== 0 || checkout.stdout.trim() !== expectedSha)
    throw new Error("QA_CMS_FIXTURE_CHECKOUT_SHA_MISMATCH");
}

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runSupabase(args) {
  const binary = "npx";
  const pinned = ["--yes", "supabase@2.116.0", ...args];
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...pinned].map(quoteWindowsArgument).join(" ")]
      : pinned;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    timeout: 2 * 60_000,
  });
  if (result.error || result.status !== 0) throw new Error("QA_CMS_FIXTURE_SUPABASE_CLI_FAILED");
  return result.stdout.trim();
}

function supabaseJson(args) {
  try {
    return JSON.parse(runSupabase([...args, "--output", "json"]));
  } catch {
    throw new Error("QA_CMS_FIXTURE_SUPABASE_JSON_FAILED");
  }
}

async function loadContext() {
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === target.ref);
  if (
    !project ||
    project.name !== target.name ||
    (target.region !== undefined && project.region !== target.region)
  )
    throw new Error("QA_CMS_FIXTURE_TARGET_REFUSED");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", target.ref, "--reveal"]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("QA_CMS_FIXTURE_KEYS_UNAVAILABLE");
  const url = `https://${target.ref}.supabase.co`;
  return {
    url,
    anonKey,
    serviceKey,
    admin: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  };
}

async function exactHealth() {
  const response = await fetch(`${target.origin}/healthz`, {
    headers: { "Cache-Control": "no-store" },
    signal: AbortSignal.timeout(20_000),
  });
  const health = response.ok ? await response.json().catch(() => null) : null;
  if (
    response.status !== 200 ||
    health?.environment !== target.environment ||
    health?.release !== expectedSha ||
    response.headers.get("x-release") !== expectedSha
  )
    throw new Error("QA_CMS_FIXTURE_RELEASE_MISMATCH");
}

async function managementQuery(query, timeoutMs = 30_000) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${target.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // A causa do banco nao pode se perder aqui: sem ela, uma falha de encerramento vira codigo nu e
    // exige leitura de log bruto. So o identificador fechado viaja, nunca o corpo da resposta.
    const detail = await response.text().catch(() => "");
    const code = /"code"\s*:\s*"([0-9A-Z]{5})"/.exec(detail)?.[1] ?? "unknown";
    throw new Error(`QA_CMS_FIXTURE_MANAGEMENT_QUERY_FAILED:${response.status}:${code}`);
  }
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("QA_CMS_FIXTURE_MANAGEMENT_RESPONSE_INVALID");
  return payload;
}

function sqlText(value) {
  if (typeof value !== "string" || /\0/.test(value)) throw new Error("QA_CMS_FIXTURE_SQL_TEXT_INVALID");
  return `'${value.replaceAll("'", "''")}'`;
}

function base32Bytes(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("QA_CMS_FIXTURE_TOTP_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, now) {
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Bytes(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function authenticationClock() {
  const response = await fetch(`${context.url}/auth/v1/health`, {
    headers: { apikey: context.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const serverDate = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(serverDate) ? serverDate : Date.now();
}

function richTextBlock() {
  return {
    id: randomUUID(),
    type: "rich_text",
    data: { text: "Conteúdo temporário sem dado pessoal ou comercial real." },
  };
}

function pageRichTextBlock() {
  return {
    ...richTextBlock(),
    hidden: false,
    width: "content",
    tone: "light",
  };
}

function fixtureBase(contentType, consumerId, title, canonicalPath, runTag) {
  return {
    schemaVersion: 1,
    consumerId,
    contentType,
    title,
    summary: `Conteúdo sintético controlado ${runTag}.`,
    blocks: [richTextBlock()],
    seo: {
      title: `${title} | GAIATEC`,
      description: "Conteúdo temporário não indexável para homologação integral do CMS.",
      canonicalPath,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        authorizationReference: runTag,
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Homologação sintética descartável em staging",
        rightsConfirmed: true,
        commercialOwner: "Owner QA sintético",
        technicalOwner: "Revisor QA sintético",
        verifiedAt: new Date().toISOString(),
      },
    ],
  };
}

function discoveryPayload(contentType, slug, runTag) {
  const names = {
    service: ["cms.service.v1", "Serviço QA"],
    industry: ["cms.industry.v1", "Indústria QA"],
    application: ["cms.application.v1", "Aplicação QA"],
    solution: ["cms.solution.v1", "Solução QA"],
  };
  const [consumerId, title] = names[contentType];
  const common = {
    ...fixtureBase(contentType, consumerId, `${title} ${runTag}`, `/qa/${slug}`, runTag),
    governanceState: "synthetic_test",
    media: [],
    search: { synonyms: ["qa-sintetico"], keywords: ["homologacao"] },
    cta: { label: "Contato", href: "/contato" },
  };
  if (contentType === "service")
    return {
      ...common,
      approval: {
        operationalOwner: "Owner QA",
        technicalReviewer: "Revisor QA",
        commercialReviewer: "Revisor QA",
        editorialReviewer: "Revisor QA",
      },
      relations: { productIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      serviceKind: "Homologação",
      scope: "Escopo sintético",
      whenToHire: ["Cenário sintético"],
      deliverables: ["Entregável sintético"],
      prerequisites: ["Pré-requisito sintético"],
      executionSteps: ["Etapa sintética"],
    };
  const shared = {
    ...common,
    approval: {
      businessOwner: "Owner QA",
      technicalReviewer: "Revisor QA",
      commercialReviewer: "Revisor QA",
      editorialReviewer: "Revisor QA",
    },
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  };
  if (contentType === "industry")
    return {
      ...shared,
      displayOrder: 999,
      marketName: "Mercado sintético",
      challenges: ["Desafio sintético"],
      evidence: ["Evidência sintética"],
      processAreas: ["Processo sintético"],
    };
  if (contentType === "application")
    return {
      ...shared,
      process: "Processo sintético",
      problem: "Problema sintético",
      benefits: ["Benefício sintético"],
      points: [
        {
          id: randomUUID(),
          title: "Ponto sintético",
          need: "Necessidade sintética",
          variable: "Variável sintética",
          function: "Função sintética",
          technicalBenefit: "Benefício técnico sintético",
          operationalBenefit: "Benefício operacional sintético",
          productIds: [],
          serviceIds: [],
        },
      ],
    };
  return {
    ...shared,
    problem: "Problema sintético",
    approach: "Abordagem sintética",
    benefits: ["Benefício sintético"],
    components: ["Componente sintético"],
    gasDetectionModel: "integrated_master_catalog",
  };
}

function postPayload(slug, runTag) {
  return {
    ...fixtureBase("post", "cms.blog-article.v1", `Artigo auxiliar ${runTag}`, `/blog/${slug}`, runTag),
    excerpt: "Artigo auxiliar temporário para navegação autenticada.",
    authorName: "Equipe QA sintética",
    author: { id: randomUUID(), name: "Equipe QA", slug: `equipe-${slug}` },
    category: { id: randomUUID(), name: "Homologação", slug: `homologacao-${slug}` },
    tags: [{ id: randomUUID(), name: "QA", slug: `qa-${slug}` }],
    relations: { postIds: [], productIds: [], serviceIds: [], applicationIds: [], solutionIds: [] },
    readingMinutes: 1,
  };
}

function productPayload(slug, runTag) {
  const base = fixtureBase(
    "product",
    "cms.catalog-product.v1",
    `Produto auxiliar ${runTag}`,
    `/produtos/${slug}`,
    runTag,
  );
  return {
    ...base,
    pilotState: "synthetic_test",
    fieldVisibility: {
      brand: "public",
      manufacturer: "internal",
      productLine: "public",
      commercialModel: "public",
      manufacturerReference: "internal",
      sku: "internal",
      classification: "public",
      function: "public",
      technology: "public",
      specifications: "public",
      relations: "public",
      documents: "public",
    },
    brand: { name: "GATFLOW", slug: "gatflow" },
    manufacturer: { name: "OEM sintético", slug: `oem-${slug}` },
    productLine: { name: "Linha sintética", slug: `linha-${slug}` },
    classification: { segment: "QA", category: "QA", family: "QA" },
    commercial: {
      shortDescription: "Produto auxiliar sintético.",
      valueProposition: "Validar o editor real.",
      benefits: ["Benefício sintético"],
      differentiators: [],
    },
    function: "Medição sintética",
    technology: "Tecnologia sintética",
    models: [
      {
        id: randomUUID(),
        model: `MODELO-${slug}`,
        manufacturerReference: `REF-${slug}`,
        sku: `SKU-${slug}`,
        status: "active",
        variants: [{ id: randomUUID(), name: "Variante QA", code: `VAR-${slug}`, order: 0 }],
      },
    ],
    specifications: [
      {
        id: randomUUID(),
        key: "faixa-qa",
        label: "Faixa QA",
        type: "range",
        value: { min: 0, max: 1 },
        unit: "u",
        required: true,
        filterable: true,
        comparable: true,
        searchable: true,
      },
    ],
    media: [],
    documents: [],
    relations: { productIds: [], applicationIds: [], sectorIds: [], serviceIds: [] },
    search: { synonyms: [], keywords: ["qa"] },
    redirects: [],
    approval: {
      portfolioOwner: "Owner QA",
      technicalReviewer: "Revisor QA",
      commercialReviewer: "Revisor QA",
      editorialReviewer: "Revisor QA",
    },
  };
}

function pagePayload(slug, runTag) {
  const base = fixtureBase("page", "cms.managed-page.v1", `Página auxiliar ${runTag}`, `/qa/${slug}`, runTag);
  return {
    ...base,
    blocks: [pageRichTextBlock()],
    pageKind: "institutional",
    templateKey: "standard",
    route: { path: `/qa/${slug}`, navigationLabel: "QA", breadcrumbLabel: "QA" },
    governanceState: "synthetic_test",
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    retirement: { mode: "not_found" },
    approval: { businessOwner: "Owner QA", editorialReviewer: "Revisor QA" },
  };
}

function campaignPayload(slug, runTag) {
  const base = fixtureBase(
    "campaign",
    "cms.campaign-landing.v1",
    `Campanha auxiliar ${runTag}`,
    `/campanhas/${slug}`,
    runTag,
  );
  return {
    ...base,
    blocks: [pageRichTextBlock()],
    campaignKind: "lead_generation",
    templateKey: "landing_conversion",
    route: { path: `/campanhas/${slug}` },
    window: {
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      timezone: "America/Sao_Paulo",
    },
    placements: [],
    tracking: { enabled: true, requiresConsent: true, provider: "internal", eventName: "qa" },
    expiry: { mode: "not_found" },
    relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
    governanceState: "synthetic_test",
    approval: {
      businessOwner: "Owner QA",
      marketingReviewer: "Revisor QA",
      privacyReviewer: "Revisor QA",
    },
  };
}

async function createActor(
  runTag,
  onCreated,
  {
    actorKind = "operator",
    initialRole = "super_admin",
    provisionCms = true,
    rdoRole = null,
    rdoInvitedBy = null,
  } = {},
) {
  if (typeof onCreated !== "function") throw new Error("QA_CMS_FIXTURE_ACTOR_CALLBACK_REQUIRED");
  const definition = ACTOR_DEFINITIONS[actorKind];
  if (!definition) throw new Error("QA_CMS_FIXTURE_ACTOR_KIND_INVALID");
  if (
    typeof provisionCms !== "boolean" ||
    (provisionCms && (typeof initialRole !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(initialRole))) ||
    (!provisionCms && initialRole !== null) ||
    !(rdoRole === null || new Set(["rdo_admin", "rdo_member"]).has(rdoRole)) ||
    !(rdoInvitedBy === null || uuidPattern.test(rdoInvitedBy))
  )
    throw new Error("QA_CMS_FIXTURE_ACTOR_OPTIONS_INVALID");
  const email = `${definition.prefix}-${runTag.toLowerCase()}-${randomUUID()}@example.invalid`;
  const password = `Qa!${randomBytes(30).toString("base64url")}9Z`;
  const created = await context.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      synthetic: true,
      purpose: "qa-cms-browser",
      runTag,
      environment: target.environment,
      candidateSha: expectedSha,
      actorKind,
    },
  });
  if (created.error || !created.data.user) throw new Error("QA_CMS_FIXTURE_USER_FAILED");
  const actorId = created.data.user.id;
  onCreated(actorId);
  const lease = await assertActorLease(actorId, runTag, "active");
  if (provisionCms) {
    const profile = await context.admin.from("cms_profiles").insert({
      user_id: actorId,
      display_name: `${definition.displayName} ${runTag}`,
      display_email: email,
      status: "active",
    });
    if (profile.error) throw new Error("QA_CMS_FIXTURE_PROFILE_FAILED");
    const role = await context.admin
      .from("cms_user_roles")
      .insert({ user_id: actorId, role_key: initialRole });
    if (role.error) throw new Error("QA_CMS_FIXTURE_ROLE_FAILED");
  }
  if (rdoRole) {
    const rdo = await context.admin.from("rdo_user_access").insert({
      user_id: actorId,
      role: rdoRole,
      active: true,
      invited_by: rdoInvitedBy,
    });
    if (rdo.error) throw new Error("QA_CMS_FIXTURE_RDO_ACCESS_FAILED");
  }
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("QA_CMS_FIXTURE_SIGNIN_FAILED");
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `QA ${runTag}` });
  const secret = enrolled.data?.totp?.secret;
  if (enrolled.error || !secret) throw new Error("QA_CMS_FIXTURE_MFA_ENROLL_FAILED");
  let verifiedToken = "";
  for (let attempt = 0; attempt < 3 && !verifiedToken; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw new Error("QA_CMS_FIXTURE_MFA_CHALLENGE_FAILED");
    const result = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(secret, await authenticationClock()),
    });
    verifiedToken = result.data?.session?.access_token ?? result.data?.access_token ?? "";
    if (result.error || !verifiedToken) {
      verifiedToken = "";
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  if (!verifiedToken) throw new Error("QA_CMS_FIXTURE_MFA_VERIFY_FAILED");
  if (provisionCms) {
    const marked = await context.admin
      .from("cms_profiles")
      .update({ mfa_enrolled_at: new Date().toISOString() })
      .eq("user_id", actorId);
    if (marked.error) throw new Error("QA_CMS_FIXTURE_MFA_PROFILE_FAILED");
  } else {
    const [profile, roles] = await Promise.all([
      context.admin
        .from("cms_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", actorId),
      context.admin
        .from("cms_user_roles")
        .select("role_key", { count: "exact", head: true })
        .eq("user_id", actorId),
    ]);
    if (profile.error || roles.error || profile.count !== 0 || roles.count !== 0)
      throw new Error("QA_CMS_FIXTURE_AUTH_ONLY_BOUNDARY_FAILED");
  }
  return { actorId, email, password, secret, token: verifiedToken, lease };
}

function exactActionLink(generated, actionType) {
  const actionLink = generated?.data?.properties?.action_link;
  if (typeof actionLink !== "string") throw new Error("QA_CMS_FIXTURE_ACTION_LINK_UNAVAILABLE");
  let parsed;
  try {
    parsed = new URL(actionLink);
  } catch {
    throw new Error("QA_CMS_FIXTURE_ACTION_LINK_INVALID");
  }
  const redirect = parsed.searchParams.get("redirect_to");
  const token = parsed.searchParams.get("token") ?? parsed.searchParams.get("token_hash");
  if (
    parsed.origin !== context.url ||
    parsed.pathname !== "/auth/v1/verify" ||
    parsed.searchParams.get("type") !== actionType ||
    redirect !== `${target.origin}/admin/definir-senha` ||
    !token ||
    token.length < 16
  ) {
    throw new Error("QA_CMS_FIXTURE_ACTION_LINK_INVALID");
  }
  return actionLink;
}

async function createRecoveryLifecycle(actor) {
  const password = `Qa!${randomBytes(30).toString("base64url")}9R`;
  const generated = await context.admin.auth.admin.generateLink({
    type: "recovery",
    email: actor.email,
    options: { redirectTo: `${target.origin}/admin/definir-senha` },
  });
  if (generated.error || generated.data?.user?.id !== actor.actorId)
    throw new Error("QA_CMS_FIXTURE_RECOVERY_LINK_FAILED");
  return {
    actorId: actor.actorId,
    email: actor.email,
    password,
    secret: actor.secret,
    actionLink: exactActionLink(generated, "recovery"),
    lease: actor.lease,
  };
}

async function createInvitedLifecycleActor(runTag, invitedBy, onCreated) {
  if (!uuidPattern.test(invitedBy) || typeof onCreated !== "function")
    throw new Error("QA_CMS_FIXTURE_INVITEE_INPUT_INVALID");
  const definition = ACTOR_DEFINITIONS.invitee;
  const email = `${definition.prefix}-${runTag.toLowerCase()}-${randomUUID()}@example.invalid`;
  const password = `Qa!${randomBytes(30).toString("base64url")}9I`;
  const generated = await context.admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${target.origin}/admin/definir-senha`,
      data: {
        synthetic: true,
        purpose: "qa-cms-browser",
        runTag,
        environment: target.environment,
        candidateSha: expectedSha,
        actorKind: "invitee",
      },
    },
  });
  const user = generated.data?.user;
  if (generated.error || !user?.id) throw new Error("QA_CMS_FIXTURE_INVITEE_CREATE_FAILED");
  const actorId = user.id;
  onCreated(actorId);
  if (
    user.email !== email ||
    user.user_metadata?.synthetic !== true ||
    user.user_metadata?.runTag !== runTag ||
    user.user_metadata?.candidateSha !== expectedSha ||
    user.user_metadata?.environment !== target.environment ||
    user.user_metadata?.actorKind !== "invitee"
  ) {
    throw new Error("QA_CMS_FIXTURE_INVITEE_CREATE_FAILED");
  }
  const lease = await assertActorLease(actorId, runTag, "active");
  const profile = await context.admin.from("cms_profiles").insert({
    user_id: actorId,
    display_name: `${definition.displayName} ${runTag}`,
    display_email: email,
    status: "invited",
    invited_by: invitedBy,
  });
  const role = await context.admin.from("cms_user_roles").insert({
    user_id: actorId,
    role_key: "admin",
    granted_by: invitedBy,
  });
  const loginEvent = await context.admin.from("cms_login_events").insert({
    user_id: actorId,
    event_type: "invite",
    success: true,
    reason_code: "qa_synthetic_link",
    correlation_id: randomUUID(),
  });
  const audit = await context.admin.from("cms_audit_log").insert({
    actor_id: invitedBy,
    action: "cms:users.invite",
    target_type: "profile",
    target_id: actorId,
    event_data: {
      schemaVersion: 1,
      syntheticOnly: true,
      delivery: "generate_link_no_email",
      role: "super_admin",
    },
    correlation_id: randomUUID(),
  });
  if (profile.error || role.error || loginEvent.error || audit.error)
    throw new Error("QA_CMS_FIXTURE_INVITEE_PROFILE_FAILED");
  return {
    actorId,
    email,
    password,
    actionLink: exactActionLink(generated, "invite"),
    lease,
  };
}

async function actorLeaseStatus(actorId, runTag) {
  const result = await context.admin.rpc("cms_qa_actor_lease_status", {
    p_actor_id: actorId,
    p_run_tag: runTag,
    p_candidate_sha: expectedSha,
    p_environment: target.environment,
  });
  if (result.error || !result.data || typeof result.data !== "object")
    throw new Error("QA_CMS_FIXTURE_LEASE_UNAVAILABLE");
  return result.data;
}

async function assertActorLease(actorId, runTag, expectedStatus) {
  const lease = await actorLeaseStatus(actorId, runTag);
  if (
    lease.schemaVersion !== 1 ||
    lease.status !== expectedStatus ||
    lease.environment !== target.environment ||
    lease.candidateSha !== expectedSha ||
    lease.runTag !== runTag ||
    !Number.isInteger(lease.ttlSeconds) ||
    lease.ttlSeconds !== QA_ACTOR_LEASE_TTL_MINUTES * 60
  )
    throw new Error("QA_CMS_FIXTURE_LEASE_INVALID");
  return lease;
}

// O encerramento de lease dispara doze limpezas terminais num unico statement, e juntas elas varrem
// mais de trinta tabelas do run. Pelo PostgREST isso corre sob o `statement_timeout` de oito segundos
// herdado do `authenticator`, que nunca foi orcamento para essa varredura: o deploy 34528923953
// reprovou aqui, e o canario G11 reproduziu a mesma causa tres vezes, SQLSTATE 57014.
//
// Nao adianta corrigir dentro da funcao: mudar `statement_timeout` ali nao reprograma o timer do
// statement que ja esta correndo. O limite precisa ser armado ANTES do statement. Alargar no papel
// `service_role` funcionaria, mas ele atende producao pelas Edge Functions, e afrouxar protecao de
// producao para resolver teardown de QA e a troca errada.
//
// O teto de statement e necessariamente MENOR que o de requisicao: se o abort da requisicao cortar
// primeiro, a causa do banco se perde e a falha volta a ser codigo nu.
//
// Transporte duravel identico ao ja provado em scripts/ev2/phase11/staging-canary.mjs, f3771d8.
const LEASE_COMPLETION_STATEMENT_TIMEOUT_MS = 60_000;
const LEASE_COMPLETION_REQUEST_TIMEOUT_MS = 90_000;

function leaseStatementTimedOut(error) {
  return /"code"\s*:\s*"57014"|:57014$|:57014:/.test(String(error?.message ?? "")) || error?.code === "57014";
}

async function completeActorLease(actorId, runTag) {
  const result = await context.admin.rpc("cms_complete_qa_actor_lease", {
    p_actor_id: actorId,
    p_run_tag: runTag,
    p_candidate_sha: expectedSha,
    p_environment: target.environment,
  });

  let completed = result.data;
  if (result.error) {
    // A falha nomeia a si mesma: SQLSTATE do banco mais o identificador fechado do dominio.
    const identity = `${result.error.code ?? "unknown"}:${
      /CMS_[A-Z0-9_]{3,60}/.exec(result.error.message ?? "")?.[0] ?? "unknown"
    }`;
    if (!leaseStatementTimedOut(result.error))
      throw new Error(`QA_CMS_FIXTURE_LEASE_COMPLETION_FAILED:${identity}`);

    // A identidade e validada contra padroes fechados ANTES de qualquer interpolacao em SQL.
    if (
      !uuidPattern.test(actorId) ||
      !runTagPattern.test(runTag) ||
      !/^[0-9a-f]{40}$/.test(expectedSha) ||
      !/^(staging|production)$/.test(target.environment)
    )
      throw new Error("QA_CMS_FIXTURE_LEASE_IDENTITY_UNSAFE", { cause: result.error });

    const rows = await managementQuery(
      [
        `set statement_timeout = '${LEASE_COMPLETION_STATEMENT_TIMEOUT_MS}ms';`,
        `select public.cms_complete_qa_actor_lease(`,
        `'${actorId}'::uuid, '${runTag}',`,
        `'${expectedSha}', '${target.environment}') as result;`,
      ].join("\n"),
      LEASE_COMPLETION_REQUEST_TIMEOUT_MS,
    );
    completed = rows.at(-1)?.result;
    if (!completed) throw new Error("QA_CMS_FIXTURE_LEASE_DURABLE_COMPLETION_EMPTY", { cause: result.error });
  }

  if (
    completed?.schemaVersion !== 1 ||
    completed?.status !== "cleaned" ||
    typeof completed?.replayed !== "boolean"
  )
    throw new Error("QA_CMS_FIXTURE_LEASE_COMPLETION_INVALID");
  await assertActorLease(actorId, runTag, "cleaned");
}

async function createScopedRoleAssignments(operatorId, reviewerId, runTag) {
  if (!uuidPattern.test(operatorId) || !uuidPattern.test(reviewerId) || !runTagPattern.test(runTag))
    throw new Error("QA_CMS_FIXTURE_SCOPED_ROLE_INPUT_INVALID");
  await Promise.all([
    assertActorLease(operatorId, runTag, "active"),
    assertActorLease(reviewerId, runTag, "active"),
  ]);
  const reason = `QA synthetic fixture ${runTag}`;
  const validFrom = new Date().toISOString();
  const expected = [
    { userId: operatorId, roleKey: "super_admin" },
    { userId: reviewerId, roleKey: "editor" },
  ];
  const inserted = await context.admin
    .from("cms_scoped_role_assignments")
    .insert(
      expected.map(({ userId, roleKey }) => ({
        user_id: userId,
        role_key: roleKey,
        site_key: "main",
        environment: target.environment,
        grant_type: "direct",
        reason,
        valid_from: validFrom,
        expires_at: null,
        granted_by: operatorId,
      })),
    )
    .select("id,user_id,role_key,site_key,environment,grant_type,reason,granted_by,revoked_at");
  if (inserted.error || inserted.data?.length !== expected.length)
    throw new Error("QA_CMS_FIXTURE_SCOPED_ROLE_FAILED");
  for (const assignment of inserted.data) {
    const match = expected.find(
      ({ userId, roleKey }) => assignment.user_id === userId && assignment.role_key === roleKey,
    );
    if (
      !match ||
      assignment.site_key !== "main" ||
      assignment.environment !== target.environment ||
      assignment.grant_type !== "direct" ||
      assignment.reason !== reason ||
      assignment.granted_by !== operatorId ||
      assignment.revoked_at !== null
    )
      throw new Error("QA_CMS_FIXTURE_SCOPED_ROLE_INVALID");
  }
  return inserted.data.length;
}

async function createFeatureOverrides(actorId, runTag) {
  const now = await authenticationClock();
  const startsAt = now - 30_000;
  const expiresAt = startsAt + QA_ACTOR_LEASE_TTL_MINUTES * 60_000;
  if (expiresAt > startsAt + QA_ACTOR_LEASE_MAX_MINUTES * 60_000)
    throw new Error("QA_CMS_FIXTURE_OVERRIDE_WINDOW_INVALID");
  const flags = await context.admin
    .from("cms_feature_flags")
    .select("flag_key")
    .in("flag_key", FEATURE_KEYS)
    .eq("kill_switch", false)
    .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`);
  const availableKeys = new Set(flags.data?.map(({ flag_key: flagKey }) => flagKey) ?? []);
  if (
    flags.error ||
    availableKeys.size !== FEATURE_KEYS.length ||
    FEATURE_KEYS.some((flagKey) => !availableKeys.has(flagKey))
  )
    throw new Error("QA_CMS_FIXTURE_FLAGS_INCOMPLETE");
  const inserted = await context.admin.from("cms_feature_flag_overrides").insert(
    FEATURE_KEYS.map((flagKey) => ({
      flag_key: flagKey,
      environment: target.environment,
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: `Homologação integral ${runTag}`,
      starts_at: new Date(startsAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      created_by: actorId,
    })),
  );
  if (inserted.error) throw new Error("QA_CMS_FIXTURE_FLAG_OVERRIDE_FAILED");
  return FEATURE_KEYS.length;
}

export function capabilityManifestReady(manifest, environment) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.status !== "ready" ||
    manifest.environment !== environment ||
    manifest.siteKey !== "main" ||
    !Number.isFinite(Date.parse(manifest.evaluatedAt ?? ""))
  )
    return false;
  const capabilities = manifest.capabilities;
  return Boolean(
    capabilities &&
    typeof capabilities === "object" &&
    Object.keys(capabilities).length === FEATURE_KEYS.length &&
    FEATURE_KEYS.every(
      (flagKey) =>
        capabilities[flagKey]?.schemaVersion === 1 &&
        capabilities[flagKey]?.key === flagKey &&
        capabilities[flagKey]?.enabled === true &&
        // "override" e a habilitacao nominal do ator sintetico, que e o caminho normal da fixture.
        // "default" com enabled=true so existe quando a funcionalidade foi declarada entregue no
        // livro de entregas (migration 0093) — a coluna default_enabled tem
        // check (default_enabled is false) desde a 0037, entao este par era impossivel antes.
        // Sem esta linha, a primeira entrega reprova a fixture com QA_CMS_FIXTURE_SESSION_NOT_READY,
        // que nao aponta para a causa.
        ["override", "default"].includes(capabilities[flagKey]?.source) &&
        Number.isFinite(Date.parse(capabilities[flagKey]?.evaluatedAt ?? "")),
    ),
  );
}

// Prontidao e um estado que o sistema alcanca, nao um instante. O ator acabou de receber papeis e
// sobreposicoes de flag, e a avaliacao do manifesto de capacidades pode chegar alguns instantes
// depois. Uma janela curta de espera nao afrouxa nada: a condicao exigida continua exatamente a
// mesma, apenas deixa de ser lida no primeiro milissegundo possivel.
//
// Quando ela nao e alcancada, a falha precisa dizer o que faltou. Antes ela dizia apenas que a sessao
// nao estava pronta, e as tres razoes possiveis, resposta nao 200, acesso negado e manifesto ausente,
// ficavam indistinguiveis, o que custou um ciclo inteiro de staging para descobrir.
async function assertReadySession(token) {
  let status = 0;
  let accessGranted = false;
  let capabilities = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    const response = await fetch(`${context.url}/functions/v1/cms-session`, {
      method: "POST",
      headers: {
        apikey: context.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: target.origin,
      },
      body: JSON.stringify({ action: "resolve" }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = response.ok ? await response.json().catch(() => null) : null;
    status = response.status;
    accessGranted = result?.accessGranted === true;
    capabilities = capabilityManifestReady(result?.ev2Capabilities, target.environment);
    if (status === 200 && accessGranted && capabilities) return;
  }
  throw new Error(
    `QA_CMS_FIXTURE_SESSION_NOT_READY:${status}:${accessGranted ? "granted" : "denied"}:${
      capabilities ? "capabilities" : "no_capabilities"
    }`,
  );
}

export function buildRouteDefinitions(runTag, nonce = randomUUID().slice(0, 8)) {
  if (!runTagPattern.test(runTag) || !/^[0-9a-f]{8}$/.test(nonce))
    throw new Error("QA_CMS_FIXTURE_DEFINITION_ID_INVALID");
  const short = runTag.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return [
    ["post", postPayload],
    ["product", productPayload],
    ["service", discoveryPayload],
    ["industry", discoveryPayload],
    ["application", discoveryPayload],
    ["solution", discoveryPayload],
    ["page", pagePayload],
    ["campaign", campaignPayload],
  ].map(([contentType, builder], index) => {
    const slug = `qa-${contentType}-${short}-${nonce}-${index}`.slice(0, 150);
    const payload =
      contentType === "service" || ["industry", "application", "solution"].includes(contentType)
        ? builder(contentType, slug, runTag)
        : builder(slug, runTag);
    return { contentType, slug, payload };
  });
}

function writeReport(report) {
  writePrivateJson(reportPath, report);
}

function writeState(state) {
  writePrivateJson(statePath, state);
}

function writePrivateJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function finalizeAdminOpsEvidence(state, residue) {
  if (!existsSync(adminOpsReportPath)) return;
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(adminOpsReportPath, "utf8"));
  } catch {
    throw new Error("QA_CMS_FIXTURE_ADMIN_OPS_EVIDENCE_INVALID");
  }
  if (
    evidence?.schemaVersion !== 1 ||
    !["passed", "failed"].includes(evidence.status) ||
    evidence.environment !== state.environment ||
    evidence.candidateSha !== state.expectedSha ||
    evidence.runTag !== state.runTag
  ) {
    throw new Error("QA_CMS_FIXTURE_ADMIN_OPS_EVIDENCE_INVALID");
  }
  evidence.cleanup = {
    status: "passed",
    secondActorRevokedAndBanned:
      Boolean(state.managedActorId) && residue.activeProfiles === 0 && residue.activeCredentials === 0,
    existingIdentityRevokedAndBanned:
      Boolean(state.existingIdentityActorId) &&
      residue.activeProfiles === 0 &&
      residue.activeCredentials === 0,
    sessionsRevoked: residue.activeSessions === 0,
    rdoAccessInactive: residue.activeRdoAccess === 0,
    leadsInactive: residue.activeLeads === 0,
    outboxInactive: residue.actionableLeadOutbox === 0,
    formsRetired: residue.activeLeadForms === 0 && residue.activeLeadFormVersions === 0,
    aiInactive:
      residue.activeAiSessions === 0 &&
      residue.activeAiTargets === 0 &&
      residue.activeAiPlans === 0 &&
      residue.activeAiApprovals === 0,
    auditPreserved: residue.retainedAuditEvents > 0,
    watchdogLease: residue.leaseStatus,
  };
  writePrivateJson(adminOpsReportPath, evidence);
}

function appendEnvironment(entries) {
  if (!githubEnvironmentPath) throw new Error("QA_CMS_FIXTURE_GITHUB_ENV_REQUIRED");
  const lines = entries.map(({ name, value, secret = false }) => {
    if (!/^[A-Z][A-Z0-9_]+$/.test(name) || typeof value !== "string" || /[\r\n\0]/.test(value))
      throw new Error("QA_CMS_FIXTURE_ENVIRONMENT_VALUE_INVALID");
    if (secret)
      process.stdout.write(
        `::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}\n`,
      );
    return `${name}=${value}`;
  });
  appendFileSync(githubEnvironmentPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
}

function safeErrorCode(error) {
  return /^QA_CMS_FIXTURE_[A-Z0-9_]+$/.test(error?.message ?? "")
    ? error.message
    : "QA_CMS_FIXTURE_UNEXPECTED_FAILURE";
}

function productionMutationSummary({
  actors = 0,
  drafts = 0,
  overrides = 0,
  cleanupAttempted = false,
  cleanupCompleted = false,
} = {}) {
  const production = target.environment === "production";
  return {
    syntheticOnly: true,
    attempted: production && (actors > 0 || drafts > 0 || overrides > 0 || cleanupAttempted),
    actors: production ? actors : 0,
    draftContentItems: production ? drafts : 0,
    individualFeatureOverrides: production ? overrides : 0,
    cleanupAttempted: production && cleanupAttempted,
    cleanupCompleted: production && cleanupAttempted && cleanupCompleted,
  };
}

function fixtureActorIds(state) {
  return [
    state.actorId,
    state.managedActorId,
    state.existingIdentityActorId,
    state.recoveryActorId,
    state.invitedActorId,
  ].filter(Boolean);
}

export function validateScopedRoleCleanupAssignments(assignments, actorIds, state) {
  if (
    !Array.isArray(assignments) ||
    !Array.isArray(actorIds) ||
    actorIds.length === 0 ||
    new Set(actorIds).size !== actorIds.length ||
    actorIds.some((actorId) => !uuidPattern.test(actorId)) ||
    !runTagPattern.test(state?.runTag ?? "") ||
    !["staging", "production"].includes(state?.environment)
  ) {
    throw new Error("QA_CMS_FIXTURE_SCOPED_ROLE_CLEANUP_BINDING_INVALID");
  }
  for (const assignment of assignments) {
    if (
      !uuidPattern.test(assignment?.id ?? "") ||
      !actorIds.includes(assignment.user_id) ||
      !actorIds.includes(assignment.granted_by) ||
      assignment.site_key !== "main" ||
      assignment.environment !== state.environment ||
      !/^[a-z][a-z0-9_]{1,63}$/.test(assignment.role_key ?? "") ||
      !["direct", "delegated"].includes(assignment.grant_type) ||
      typeof assignment.reason !== "string" ||
      !assignment.reason.includes(state.runTag) ||
      !Number.isInteger(assignment.lock_version) ||
      assignment.lock_version < 1 ||
      assignment.revoked_at !== null
    ) {
      throw new Error("QA_CMS_FIXTURE_SCOPED_ROLE_CLEANUP_PROVENANCE_MISMATCH");
    }
  }
  return assignments;
}

export function validateFixtureState(value, environment, projectRef, candidateSha) {
  const validRunTag =
    runTagPattern.test(value?.runTag ?? "") && value.runTag.endsWith(`-${candidateSha.slice(0, 8)}`);
  const validItems =
    Array.isArray(value?.itemIds) &&
    value.itemIds.length <= 64 &&
    new Set(value.itemIds).size === value.itemIds.length &&
    value.itemIds.every((itemId) => uuidPattern.test(itemId));
  const tombstone = value?.terminalArchivedTombstone;
  const validTombstone =
    tombstone === null ||
    (tombstone &&
      typeof tombstone === "object" &&
      !Array.isArray(tombstone) &&
      JSON.stringify(Object.keys(tombstone).sort()) === JSON.stringify(["itemId"]) &&
      uuidPattern.test(tombstone.itemId ?? "") &&
      Array.isArray(value?.itemIds) &&
      value.itemIds.includes(tombstone.itemId));
  const documentIds = value?.documentIds ?? [];
  const validDocuments =
    Array.isArray(documentIds) &&
    documentIds.length <= 20 &&
    new Set(documentIds).size === documentIds.length &&
    documentIds.every((documentId) => uuidPattern.test(documentId));
  if (
    value?.schemaVersion !== 1 ||
    !("terminalArchivedTombstone" in value) ||
    value.environment !== environment ||
    value.projectRef !== projectRef ||
    value.expectedSha !== candidateSha ||
    !validRunTag ||
    !["creating", "ready", "cleaned"].includes(value.status) ||
    typeof value.setupAudited !== "boolean" ||
    typeof value.authLifecycleEnabled !== "boolean" ||
    !(value.actorId === null || uuidPattern.test(value.actorId)) ||
    !(value.managedActorId === null || uuidPattern.test(value.managedActorId)) ||
    !(value.existingIdentityActorId === null || uuidPattern.test(value.existingIdentityActorId)) ||
    !(value.recoveryActorId === null || uuidPattern.test(value.recoveryActorId)) ||
    !(value.invitedActorId === null || uuidPattern.test(value.invitedActorId)) ||
    !(value.leadId === null || uuidPattern.test(value.leadId)) ||
    !(value.leadOutboxId === null || uuidPattern.test(value.leadOutboxId)) ||
    !(value.leadFormId === null || uuidPattern.test(value.leadFormId)) ||
    !(value.leadCampaignId === null || uuidPattern.test(value.leadCampaignId)) ||
    (value.status === "ready" &&
      [value.actorId, value.managedActorId, value.existingIdentityActorId].some(
        (id) => !uuidPattern.test(id ?? ""),
      )) ||
    (value.status === "ready" &&
      value.authLifecycleEnabled &&
      [value.recoveryActorId, value.invitedActorId].some((id) => !uuidPattern.test(id ?? ""))) ||
    (!value.authLifecycleEnabled && (value.recoveryActorId !== null || value.invitedActorId !== null)) ||
    !(
      value.leadReference === null ||
      (typeof value.leadReference === "string" && /^LD-[A-Z0-9]+$/.test(value.leadReference))
    ) ||
    !(
      value.leadStatus === null ||
      (typeof value.leadStatus === "string" && /^[a-z_]+$/.test(value.leadStatus))
    ) ||
    !(
      value.leadCampaignPath === null ||
      (typeof value.leadCampaignPath === "string" &&
        /^\/campanhas\/qa-[a-z0-9-]+$/.test(value.leadCampaignPath))
    ) ||
    ([value.leadCampaignId, value.leadReference, value.leadStatus, value.leadCampaignPath].some(
      (entry) => entry !== null,
    ) &&
      [
        value.leadFormId,
        value.leadCampaignId,
        value.leadReference,
        value.leadStatus,
        value.leadCampaignPath,
      ].some((entry) => entry === null)) ||
    (value.leadId !== null &&
      [
        value.leadFormId,
        value.leadCampaignId,
        value.leadReference,
        value.leadStatus,
        value.leadCampaignPath,
      ].some((entry) => entry === null)) ||
    (value.leadOutboxId !== null && value.leadId === null) ||
    !validItems ||
    !validTombstone ||
    !validDocuments
  )
    throw new Error("QA_CMS_FIXTURE_STATE_REFUSED");
  return value;
}

export function bindUiCreatedStateToFixture(state, uiState, environment, candidateSha) {
  const ids = uiState?.ids;
  const lease = uiState?.lease;
  const form = uiState?.form;
  const lead = uiState?.lead;
  const expectedIdKeys = [
    "applicationId",
    "campaignId",
    "contentId",
    "industryId",
    "pageId",
    "productId",
    "serviceId",
    "solutionId",
  ];
  const itemIds = ids && typeof ids === "object" ? Object.values(ids) : [];
  if (
    uiState?.schemaVersion !== 1 ||
    uiState.status !== "ready" ||
    uiState.environment !== environment ||
    uiState.candidateSha !== candidateSha ||
    uiState.runTag !== state.runTag ||
    !lease ||
    lease.actorId !== state.actorId ||
    lease.source !== "cms-browser-fixture" ||
    lease.resourceIdsCaptured !== true ||
    !ids ||
    typeof ids !== "object" ||
    JSON.stringify(Object.keys(ids).sort()) !== JSON.stringify(expectedIdKeys) ||
    itemIds.length !== 8 ||
    new Set(itemIds).size !== itemIds.length ||
    itemIds.some((id) => !uuidPattern.test(id)) ||
    !form ||
    !uuidPattern.test(form.id ?? "") ||
    !uuidPattern.test(form.versionId ?? "") ||
    form.key !== `qa-ops-${state.runTag.toLowerCase()}-${String(form.key ?? "").slice(-8)}` ||
    !/^[a-f0-9]{8}$/.test(String(form.key ?? "").slice(-8)) ||
    form.status !== "published" ||
    !lead ||
    !/^LD-[A-Z0-9]+$/.test(lead.reference ?? "") ||
    lead.status !== "responded" ||
    !new RegExp(`^/campanhas/qa-lead-${state.runTag.toLowerCase()}-[a-f0-9]{8}$`).test(
      lead.campaignPath ?? "",
    )
  ) {
    throw new Error("QA_CMS_FIXTURE_UI_STATE_REFUSED");
  }
  return validateFixtureState(
    {
      ...state,
      itemIds,
      leadFormId: form.id,
      leadCampaignId: ids.campaignId,
      leadReference: lead.reference,
      leadStatus: lead.status,
      leadCampaignPath: lead.campaignPath,
      terminalArchivedTombstone: { itemId: ids.pageId },
    },
    environment,
    state.projectRef,
    candidateSha,
  );
}

function hydrateFixtureStateFromUiHandoff(state, { required = true } = {}) {
  if (state.status !== "ready") return state;
  if (!existsSync(uiCreatedStatePath)) {
    if (required) throw new Error("QA_CMS_FIXTURE_UI_STATE_REQUIRED");
    return state;
  }
  let uiState;
  try {
    uiState = JSON.parse(readFileSync(uiCreatedStatePath, "utf8"));
  } catch {
    if (required) throw new Error("QA_CMS_FIXTURE_UI_STATE_REFUSED");
    return state;
  }
  let hydrated;
  try {
    hydrated = bindUiCreatedStateToFixture(state, uiState, target.environment, expectedSha);
  } catch (error) {
    if (required) throw error;
    return state;
  }
  Object.assign(state, hydrated);
  writeState(state);
  return state;
}

function hasLeadBinding(state) {
  return [
    state.leadId,
    state.leadOutboxId,
    state.leadCampaignId,
    state.leadReference,
    state.leadStatus,
    state.leadCampaignPath,
  ].some((entry) => entry !== null);
}

function exactOperationalFormKeyPattern(runTag) {
  return new RegExp(`^qa-ops-${runTag.toLowerCase()}-[a-f0-9]{8}$`);
}

function exactOperationalCampaignPathPattern(runTag) {
  return new RegExp(`^/campanhas/qa-lead-${runTag.toLowerCase()}-[a-f0-9]{8}$`);
}

function hasExactQaProvenance(row, state, environment, candidateSha) {
  return (
    row?.qa_actor_id === state.actorId &&
    row?.qa_run_tag === state.runTag &&
    row?.qa_candidate_sha === candidateSha &&
    row?.qa_environment === environment
  );
}

function assertQueryRows(result, errorCode) {
  if (result?.error || !Array.isArray(result?.data)) throw new Error(errorCode);
  return result.data;
}

/**
 * Reconstructs the operational UI binding after an interrupted browser bootstrap.
 * Discovery is deliberately actor-first: malformed, foreign or ambiguous rows
 * stop cleanup before any mutation instead of being treated as zero residue.
 */
export async function recoverInterruptedUiResourceBinding(
  state,
  admin,
  { environment, candidateSha, persist = () => {} },
) {
  validateFixtureState(state, environment, state.projectRef, candidateSha);
  if (!state.actorId) return state;

  const formKeyPrefix = `qa-ops-${state.runTag.toLowerCase()}-`;
  const formRows = assertQueryRows(
    await admin
      .from("cms_form_definitions")
      .select(
        "id,form_key,status,active_version_id,created_by,updated_by,qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment",
      )
      .eq("created_by", state.actorId)
      .like("form_key", `${formKeyPrefix}%`),
    "QA_CMS_FIXTURE_OPERATIONAL_FORM_DISCOVERY_UNAVAILABLE",
  );
  if (formRows.length > 1) throw new Error("QA_CMS_FIXTURE_OPERATIONAL_FORM_AMBIGUOUS");
  if (formRows.length === 0) {
    if (state.leadFormId !== null || hasLeadBinding(state))
      throw new Error("QA_CMS_FIXTURE_OPERATIONAL_BINDING_MISMATCH");
    return state;
  }

  const form = formRows[0];
  if (
    !uuidPattern.test(form?.id ?? "") ||
    !exactOperationalFormKeyPattern(state.runTag).test(form?.form_key ?? "") ||
    form.created_by !== state.actorId ||
    !hasExactQaProvenance(form, state, environment, candidateSha) ||
    !["draft", "published", "retired"].includes(form.status) ||
    !(form.active_version_id === null || uuidPattern.test(form.active_version_id ?? "")) ||
    (form.status === "published") !== (form.active_version_id !== null) ||
    (state.leadFormId !== null && state.leadFormId !== form.id)
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_FORM_PROVENANCE_MISMATCH");
  }

  const versionRows = assertQueryRows(
    await admin.from("cms_form_versions").select("id,form_id,status,created_by").eq("form_id", form.id),
    "QA_CMS_FIXTURE_OPERATIONAL_FORM_VERSION_DISCOVERY_UNAVAILABLE",
  );
  if (
    versionRows.length > 32 ||
    versionRows.some(
      (version) =>
        !uuidPattern.test(version?.id ?? "") ||
        version.form_id !== form.id ||
        version.created_by !== state.actorId ||
        !["draft", "published", "retired"].includes(version.status),
    ) ||
    (form.active_version_id !== null &&
      !versionRows.some((version) => version.id === form.active_version_id && version.status === "published"))
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_FORM_VERSION_PROVENANCE_MISMATCH");
  }

  const leadRows = assertQueryRows(
    await admin
      .from("cms_leads")
      .select(
        "id,reference_code,form_id,form_version_id,status,anonymized_at,origin_path,origin_source,campaign_id,product_id,qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment",
      )
      .eq("form_id", form.id),
    "QA_CMS_FIXTURE_OPERATIONAL_LEAD_DISCOVERY_UNAVAILABLE",
  );
  if (leadRows.length > 1) throw new Error("QA_CMS_FIXTURE_OPERATIONAL_LEAD_AMBIGUOUS");
  if (leadRows.length === 0) {
    if (hasLeadBinding(state)) throw new Error("QA_CMS_FIXTURE_OPERATIONAL_BINDING_MISMATCH");
    if (state.leadFormId !== form.id) {
      state.leadFormId = form.id;
      validateFixtureState(state, environment, state.projectRef, candidateSha);
      persist(state);
    }
    return state;
  }

  const lead = leadRows[0];
  const campaignPathMatch = exactOperationalCampaignPathPattern(state.runTag).exec(lead?.origin_path ?? "");
  if (
    !uuidPattern.test(lead?.id ?? "") ||
    lead.form_id !== form.id ||
    !versionRows.some((version) => version.id === lead.form_version_id) ||
    !/^LD-[A-Z0-9]+$/.test(lead.reference_code ?? "") ||
    !/^[a-z_]+$/.test(lead.status ?? "") ||
    (lead.status === "anonymized") !== Boolean(lead.anonymized_at) ||
    lead.origin_source !== "campaign" ||
    !campaignPathMatch ||
    !uuidPattern.test(lead.campaign_id ?? "") ||
    lead.product_id !== null ||
    !hasExactQaProvenance(lead, state, environment, candidateSha)
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_LEAD_PROVENANCE_MISMATCH");
  }

  const campaignRows = assertQueryRows(
    await admin
      .from("cms_content_items")
      .select("id,content_type,slug,workflow_status,created_by,updated_by")
      .eq("id", lead.campaign_id),
    "QA_CMS_FIXTURE_OPERATIONAL_CAMPAIGN_DISCOVERY_UNAVAILABLE",
  );
  const campaign = campaignRows[0];
  const expectedCampaignSlug = lead.origin_path.slice("/campanhas/".length);
  if (
    campaignRows.length !== 1 ||
    campaign?.id !== lead.campaign_id ||
    campaign.content_type !== "campaign" ||
    campaign.slug !== expectedCampaignSlug ||
    campaign.created_by !== state.actorId ||
    !["draft", "in_review", "approved", "published", "archived"].includes(campaign.workflow_status)
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_CAMPAIGN_PROVENANCE_MISMATCH");
  }

  const campaignDraftRows = assertQueryRows(
    await admin
      .from("cms_content_drafts")
      .select("item_id,payload,updated_by")
      .eq("item_id", lead.campaign_id),
    "QA_CMS_FIXTURE_OPERATIONAL_CAMPAIGN_DRAFT_UNAVAILABLE",
  );
  const campaignDraft = campaignDraftRows[0];
  if (
    campaignDraftRows.length !== 1 ||
    campaignDraft?.item_id !== lead.campaign_id ||
    campaignDraft.updated_by !== state.actorId ||
    campaignDraft.payload?.contentType !== "campaign" ||
    campaignDraft.payload?.route?.path !== lead.origin_path ||
    !String(campaignDraft.payload?.title ?? "").startsWith(state.runTag)
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_CAMPAIGN_DRAFT_MISMATCH");
  }

  const outboxRows = assertQueryRows(
    await admin.from("cms_lead_outbox").select("id,lead_id,status").eq("lead_id", lead.id),
    "QA_CMS_FIXTURE_OPERATIONAL_LEAD_OUTBOX_DISCOVERY_UNAVAILABLE",
  );
  if (
    outboxRows.length === 0 ||
    outboxRows.length > 32 ||
    outboxRows.some(
      (entry) =>
        !uuidPattern.test(entry?.id ?? "") ||
        entry.lead_id !== lead.id ||
        !["pending", "processing", "completed", "failed", "dead_letter"].includes(entry.status),
    ) ||
    (state.leadOutboxId !== null && !outboxRows.some((entry) => entry.id === state.leadOutboxId))
  ) {
    throw new Error("QA_CMS_FIXTURE_OPERATIONAL_LEAD_OUTBOX_PROVENANCE_MISMATCH");
  }

  for (const [known, discovered] of [
    [state.leadId, lead.id],
    [state.leadFormId, form.id],
    [state.leadCampaignId, lead.campaign_id],
    [state.leadReference, lead.reference_code],
    [state.leadCampaignPath, lead.origin_path],
  ]) {
    if (known !== null && known !== discovered)
      throw new Error("QA_CMS_FIXTURE_OPERATIONAL_BINDING_MISMATCH");
  }

  const before = JSON.stringify(state);
  Object.assign(state, {
    leadId: lead.id,
    leadOutboxId: state.leadOutboxId ?? (outboxRows.length === 1 ? outboxRows[0].id : null),
    leadFormId: form.id,
    leadCampaignId: lead.campaign_id,
    leadReference: lead.reference_code,
    leadStatus:
      lead.status === "anonymized" && state.leadStatus && state.leadStatus !== "anonymized"
        ? state.leadStatus
        : lead.status,
    leadCampaignPath: lead.origin_path,
  });
  validateFixtureState(state, environment, state.projectRef, candidateSha);
  if (JSON.stringify(state) !== before) persist(state);
  return state;
}

async function recoverInterruptedUiResources(state) {
  return recoverInterruptedUiResourceBinding(state, context.admin, {
    environment: target.environment,
    candidateSha: expectedSha,
    persist: writeState,
  });
}

function readState() {
  try {
    return validateFixtureState(
      JSON.parse(readFileSync(statePath, "utf8")),
      target.environment,
      target.ref,
      expectedSha,
    );
  } catch {
    throw new Error("QA_CMS_FIXTURE_STATE_REFUSED");
  }
}

async function assertSyntheticActor(state, actorId = state.actorId, actorKind = "operator") {
  const found = await context.admin.auth.admin.getUserById(actorId);
  const user = found.data?.user;
  const definition = ACTOR_DEFINITIONS[actorKind];
  if (
    !definition ||
    found.error ||
    !user ||
    !user.email?.startsWith(`${definition.prefix}-${state.runTag.toLowerCase()}-`) ||
    !user.email.endsWith("@example.invalid") ||
    user.user_metadata?.synthetic !== true ||
    user.user_metadata?.purpose !== "qa-cms-browser" ||
    user.user_metadata?.runTag !== state.runTag ||
    user.user_metadata?.environment !== target.environment ||
    user.user_metadata?.candidateSha !== expectedSha ||
    user.user_metadata?.actorKind !== actorKind
  )
    throw new Error("QA_CMS_FIXTURE_SYNTHETIC_ACTOR_REFUSED");
  return user;
}

function deterministicUuid(scope) {
  const hex = createHash("sha256").update(scope).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function buildFixtureAuditSql(
  actorId,
  stage,
  runTag,
  runtime = { environment: target?.environment, candidateSha: expectedSha },
) {
  if (
    !uuidPattern.test(actorId ?? "") ||
    !["setup", "cleanup"].includes(stage) ||
    !runTagPattern.test(runTag ?? "") ||
    !["staging", "production"].includes(runtime?.environment) ||
    !/^[a-f0-9]{40}$/.test(runtime?.candidateSha ?? "") ||
    !runTag.endsWith(`-${runtime.candidateSha.slice(0, 8)}`)
  ) {
    throw new Error("QA_CMS_FIXTURE_AUDIT_BINDING_INVALID");
  }
  const action = stage === "setup" ? "cms:qa.fixture_setup" : "cms:qa.fixture_cleanup";
  const correlationId = deterministicUuid(
    `cms-browser-fixture:${runtime.environment}:${runtime.candidateSha}:${runTag}:${actorId}:${stage}`,
  );
  const actor = `${sqlText(actorId)}::uuid`;
  return `begin;
do $qa_fixture_audit$
declare
  v_total integer;
  v_exact integer;
begin
  perform 1 from auth.users actor where actor.id=${actor} for update;
  if not found or not private.cms_qa_actor_marker_is_exact(
    ${actor},${sqlText(runTag)},${sqlText(runtime.candidateSha)},${sqlText(runtime.environment)}
  ) then raise exception 'QA_CMS_FIXTURE_AUDIT_ACTOR_PROVENANCE_MISMATCH'; end if;
  perform 1 from private.cms_qa_actor_leases lease where lease.actor_id=${actor} for update;
  if not found or exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id=${actor} and (
      lease.run_tag is distinct from ${sqlText(runTag)} or
      lease.candidate_sha is distinct from ${sqlText(runtime.candidateSha)} or
      lease.environment is distinct from ${sqlText(runtime.environment)}
    )
  ) then raise exception 'QA_CMS_FIXTURE_AUDIT_LEASE_PROVENANCE_MISMATCH'; end if;
  select count(*)::int,count(*) filter (where
    audit.event_data->>'schemaVersion'='1' and
    audit.event_data->>'syntheticOnly'='true' and
    audit.event_data->>'environment'=${sqlText(runtime.environment)} and
    audit.event_data->>'candidateSha'=${sqlText(runtime.candidateSha)} and
    audit.correlation_id=${sqlText(correlationId)}::uuid
  )::int into v_total,v_exact
  from public.cms_audit_log audit where audit.actor_id=${actor} and
    audit.action=${sqlText(action)} and audit.target_type='qa_fixture' and audit.target_id=${sqlText(runTag)};
  if v_total>1 or (v_total=1 and v_exact<>1)
  then raise exception 'QA_CMS_FIXTURE_AUDIT_CARDINALITY_MISMATCH'; end if;
  if v_total=0 then
    insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
    values (${actor},${sqlText(action)},'qa_fixture',${sqlText(runTag)},jsonb_build_object(
      'schemaVersion',1,'syntheticOnly',true,'environment',${sqlText(runtime.environment)},
      'candidateSha',${sqlText(runtime.candidateSha)}
    ),${sqlText(correlationId)}::uuid);
  end if;
end
$qa_fixture_audit$;
commit;
select true as recorded;`;
}

async function recordFixtureAudit(actorId, stage, runTag) {
  const result = await managementQuery(buildFixtureAuditSql(actorId, stage, runTag));
  if (result.length !== 1 || result[0]?.recorded !== true) throw new Error("QA_CMS_FIXTURE_AUDIT_FAILED");
}

async function exactCount(query, code) {
  const result = await query;
  if (result.error || !Number.isInteger(result.count)) throw new Error(code);
  return result.count;
}

function terminalGonePath() {
  return `/qa-cms-final-gone-${expectedSha.slice(0, 8)}`;
}

async function activateTerminalArchivedTombstone(state, itemIds) {
  const tombstoneItemId = state.terminalArchivedTombstone?.itemId;
  if (!tombstoneItemId) return false;
  if (!itemIds.includes(tombstoneItemId)) {
    throw new Error("terminal-tombstone-owner");
  }
  const expectedPath = terminalGonePath();
  const [item, draft, routes] = await Promise.all([
    context.admin
      .from("cms_content_items")
      .select("id,content_type,slug,workflow_status,archived_at,created_by,updated_by")
      .eq("id", tombstoneItemId)
      .maybeSingle(),
    context.admin
      .from("cms_content_drafts")
      .select("item_id,payload,seo,provenance")
      .eq("item_id", tombstoneItemId)
      .maybeSingle(),
    context.admin
      .from("cms_route_rules")
      .select("id,item_id,source_path,destination_path,status_code,active")
      .eq("item_id", tombstoneItemId)
      .eq("source_path", expectedPath),
  ]);
  const payload = draft.data?.payload;
  const retirement = payload?.retirement;
  const serializedGovernedContent = JSON.stringify({
    payload,
    seo: draft.data?.seo,
    provenance: draft.data?.provenance,
  });
  if (
    item.error ||
    draft.error ||
    routes.error ||
    !item.data ||
    !draft.data ||
    routes.data?.length !== 1 ||
    item.data.id !== tombstoneItemId ||
    item.data.created_by !== state.actorId ||
    item.data.updated_by !== state.actorId ||
    item.data.content_type !== "page" ||
    item.data.slug !== expectedPath.slice(1) ||
    item.data.workflow_status !== "archived" ||
    !item.data.archived_at ||
    payload?.contentType !== "page" ||
    payload?.consumerId !== "cms.managed-page.v1" ||
    payload?.pageKind !== "institutional" ||
    payload?.title !== `${state.runTag} gone` ||
    payload?.summary !== "Página sintética para validar retirada gone." ||
    payload?.route?.path !== expectedPath ||
    retirement?.mode !== "gone" ||
    !(retirement?.destinationPath === null || retirement?.destinationPath === undefined) ||
    draft.data.seo?.indexable !== false ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedGovernedContent)
  ) {
    throw new Error("terminal-tombstone-contract");
  }
  const route = routes.data[0];
  const activated = await context.admin
    .from("cms_route_rules")
    .update({ active: true, status_code: 410, destination_path: null })
    .eq("id", route.id)
    .eq("item_id", tombstoneItemId)
    .eq("source_path", expectedPath);
  if (activated.error) throw new Error("terminal-tombstone-route");
  return true;
}

async function terminalArchivedTombstoneEvidence(state) {
  const tombstoneItemId = state.terminalArchivedTombstone?.itemId;
  if (!tombstoneItemId) return null;
  const expectedPath = terminalGonePath();
  const [item, draft, routes, publicationCount, projectionCount, actionableOutboxCount] = await Promise.all([
    context.admin
      .from("cms_content_items")
      .select("id,content_type,slug,workflow_status,archived_at,created_by,updated_by")
      .eq("id", tombstoneItemId)
      .maybeSingle(),
    context.admin
      .from("cms_content_drafts")
      .select("item_id,payload,seo,provenance")
      .eq("item_id", tombstoneItemId)
      .maybeSingle(),
    context.admin
      .from("cms_route_rules")
      .select("id,item_id,source_path,destination_path,status_code,active")
      .eq("item_id", tombstoneItemId)
      .eq("active", true),
    exactCount(
      context.admin
        .from("cms_publications")
        .select("item_id", { count: "exact", head: true })
        .eq("item_id", tombstoneItemId),
      "QA_CMS_FIXTURE_TOMBSTONE_PUBLICATION_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_published_projection")
        .select("item_id", { count: "exact", head: true })
        .eq("item_id", tombstoneItemId),
      "QA_CMS_FIXTURE_TOMBSTONE_PROJECTION_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_publication_outbox")
        .select("id", { count: "exact", head: true })
        .eq("item_id", tombstoneItemId)
        .in("status", ["pending", "processing", "failed"]),
      "QA_CMS_FIXTURE_TOMBSTONE_OUTBOX_UNAVAILABLE",
    ),
  ]);
  const payload = draft.data?.payload;
  const retirement = payload?.retirement;
  const route = routes.data?.[0];
  const serializedGovernedContent = JSON.stringify({
    payload,
    seo: draft.data?.seo,
    provenance: draft.data?.provenance,
  });
  if (
    item.error ||
    draft.error ||
    routes.error ||
    !item.data ||
    !draft.data ||
    routes.data?.length !== 1 ||
    route?.item_id !== tombstoneItemId ||
    route?.source_path !== expectedPath ||
    route?.status_code !== 410 ||
    route?.destination_path !== null ||
    route?.active !== true ||
    item.data.created_by !== state.actorId ||
    item.data.updated_by !== state.actorId ||
    item.data.content_type !== "page" ||
    item.data.slug !== expectedPath.slice(1) ||
    item.data.workflow_status !== "archived" ||
    !item.data.archived_at ||
    payload?.contentType !== "page" ||
    payload?.consumerId !== "cms.managed-page.v1" ||
    payload?.pageKind !== "institutional" ||
    payload?.title !== `${state.runTag} gone` ||
    payload?.summary !== "Página sintética para validar retirada gone." ||
    payload?.route?.path !== expectedPath ||
    retirement?.mode !== "gone" ||
    !(retirement?.destinationPath === null || retirement?.destinationPath === undefined) ||
    draft.data.seo?.indexable !== false ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedGovernedContent) ||
    publicationCount !== 0 ||
    projectionCount !== 0 ||
    actionableOutboxCount !== 0
  ) {
    throw new Error("QA_CMS_FIXTURE_TOMBSTONE_INVALID");
  }
  return {
    classification: "terminalArchivedTombstone",
    count: 1,
    statusCode: 410,
    destinationAbsent: true,
    itemArchived: true,
    publicationCount,
    projectionCount,
    actionableOutboxCount,
    piiExposed: false,
  };
}

async function inspectResidue(state, itemIds) {
  await recoverInterruptedUiResources(state);
  const actorIds = fixtureActorIds(state);
  const aiTargetProvenance = await context.admin
    .from("cms_ai_synthetic_targets")
    .select("target_ref,created_by,qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment")
    .in("created_by", actorIds);
  if (aiTargetProvenance.error) throw new Error("QA_CMS_FIXTURE_AI_TARGET_PROVENANCE_UNAVAILABLE");
  for (const targetRow of aiTargetProvenance.data ?? []) {
    if (
      targetRow.qa_actor_id !== targetRow.created_by ||
      targetRow.qa_run_tag !== state.runTag ||
      targetRow.qa_candidate_sha !== expectedSha ||
      targetRow.qa_environment !== target.environment ||
      !targetRow.target_ref.startsWith("g14x-")
    )
      throw new Error("QA_CMS_FIXTURE_AI_TARGET_PROVENANCE_MISMATCH");
  }
  let operationalLeadIds = [];
  if (state.leadFormId) {
    const operationalLeads = await context.admin
      .from("cms_leads")
      .select("id")
      .eq("form_id", state.leadFormId);
    if (operationalLeads.error) throw new Error("QA_CMS_FIXTURE_LEAD_RESIDUE_UNAVAILABLE");
    operationalLeadIds = (operationalLeads.data ?? []).map(({ id }) => id);
  }
  const aiPlans = await context.admin.from("cms_ai_execution_plans").select("id").in("created_by", actorIds);
  if (aiPlans.error) throw new Error("QA_CMS_FIXTURE_AI_PLAN_RESIDUE_UNAVAILABLE");
  const aiPlanIds = (aiPlans.data ?? []).map(({ id }) => id);
  const zeroCount = Promise.resolve({ error: null, count: 0 });
  const [
    activeContent,
    activeProfiles,
    overrides,
    legacyRoles,
    activeScopedRoles,
    activeRdoAccess,
    setupAudits,
    cleanupAudits,
    activeLeads,
    actionableLeadOutbox,
    activeLeadForms,
    activeLeadFormVersions,
    activeAiSessions,
    activeAiTargets,
    activeAiPlans,
    activeAiApprovals,
    activeDocuments,
  ] = await Promise.all([
    exactCount(
      context.admin
        .from("cms_content_items")
        .select("id", { count: "exact", head: true })
        .in("created_by", actorIds)
        .neq("workflow_status", "archived"),
      "QA_CMS_FIXTURE_CONTENT_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_profiles")
        .select("user_id", { count: "exact", head: true })
        .in("user_id", actorIds)
        .neq("status", "suspended"),
      "QA_CMS_FIXTURE_PROFILE_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_feature_flag_overrides")
        .select("id", { count: "exact", head: true })
        .eq("scope_type", "user")
        .in("scope_key", actorIds),
      "QA_CMS_FIXTURE_OVERRIDE_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_user_roles")
        .select("role_key", { count: "exact", head: true })
        .in("user_id", actorIds),
      "QA_CMS_FIXTURE_ROLE_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_scoped_role_assignments")
        .select("id", { count: "exact", head: true })
        .or(`user_id.in.(${actorIds.join(",")}),granted_by.in.(${actorIds.join(",")})`)
        .is("revoked_at", null),
      "QA_CMS_FIXTURE_SCOPED_ROLE_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("rdo_user_access")
        .select("user_id", { count: "exact", head: true })
        .in("user_id", actorIds)
        .eq("active", true),
      "QA_CMS_FIXTURE_RDO_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", state.actorId)
        .eq("action", "cms:qa.fixture_setup")
        .eq("target_type", "qa_fixture")
        .eq("target_id", state.runTag),
      "QA_CMS_FIXTURE_SETUP_AUDIT_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", state.actorId)
        .eq("action", "cms:qa.fixture_cleanup")
        .eq("target_type", "qa_fixture")
        .eq("target_id", state.runTag),
      "QA_CMS_FIXTURE_CLEANUP_AUDIT_UNAVAILABLE",
    ),
    exactCount(
      state.leadFormId
        ? context.admin
            .from("cms_leads")
            .select("id", { count: "exact", head: true })
            .eq("form_id", state.leadFormId)
            .is("anonymized_at", null)
        : zeroCount,
      "QA_CMS_FIXTURE_LEAD_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      operationalLeadIds.length
        ? context.admin
            .from("cms_lead_outbox")
            .select("id", { count: "exact", head: true })
            .in("lead_id", operationalLeadIds)
            .in("status", ["pending", "processing", "failed", "dead_letter"])
        : zeroCount,
      "QA_CMS_FIXTURE_LEAD_OUTBOX_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      state.leadFormId
        ? context.admin
            .from("cms_form_definitions")
            .select("id", { count: "exact", head: true })
            .eq("id", state.leadFormId)
            .neq("status", "retired")
        : zeroCount,
      "QA_CMS_FIXTURE_FORM_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      state.leadFormId
        ? context.admin
            .from("cms_form_versions")
            .select("id", { count: "exact", head: true })
            .eq("form_id", state.leadFormId)
            .neq("status", "retired")
        : zeroCount,
      "QA_CMS_FIXTURE_FORM_VERSION_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_ai_sessions")
        .select("id", { count: "exact", head: true })
        .in("actor_id", actorIds)
        .eq("status", "active"),
      "QA_CMS_FIXTURE_AI_SESSION_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_ai_synthetic_targets")
        .select("target_ref", { count: "exact", head: true })
        .in("created_by", actorIds)
        .eq("qa_run_tag", state.runTag)
        .eq("qa_candidate_sha", expectedSha)
        .eq("qa_environment", target.environment)
        .neq("lifecycle", "retired"),
      "QA_CMS_FIXTURE_AI_TARGET_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_ai_execution_plans")
        .select("id", { count: "exact", head: true })
        .in("created_by", actorIds)
        .in("status", ["ready", "approved", "executing"]),
      "QA_CMS_FIXTURE_AI_PLAN_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      aiPlanIds.length
        ? context.admin
            .from("cms_ai_execution_approvals")
            .select("id", { count: "exact", head: true })
            .in("plan_id", aiPlanIds)
            .eq("status", "active")
        : zeroCount,
      "QA_CMS_FIXTURE_AI_APPROVAL_RESIDUE_UNAVAILABLE",
    ),
    exactCount(
      context.admin
        .from("cms_document_assets")
        .select("id", { count: "exact", head: true })
        .in("created_by", actorIds)
        .eq("source_kind", "synthetic_test")
        .eq("source_reference", state.runTag)
        .or("processing_status.neq.neutralized,blob_disposition.eq.available"),
      "QA_CMS_FIXTURE_DOCUMENT_RESIDUE_UNAVAILABLE",
    ),
  ]);
  let activePublications = 0;
  let publishedProjections = 0;
  let activeRouteRules = 0;
  let actionablePublicationOutbox = 0;
  let terminalArchivedTombstone = null;
  if (itemIds.length) {
    const [publicationTotal, projectionTotal, routeRows, publicationOutboxTotal] = await Promise.all([
      exactCount(
        context.admin
          .from("cms_publications")
          .select("item_id", { count: "exact", head: true })
          .in("item_id", itemIds),
        "QA_CMS_FIXTURE_PUBLICATION_RESIDUE_UNAVAILABLE",
      ),
      exactCount(
        context.admin
          .from("cms_published_projection")
          .select("item_id", { count: "exact", head: true })
          .in("item_id", itemIds),
        "QA_CMS_FIXTURE_PROJECTION_RESIDUE_UNAVAILABLE",
      ),
      context.admin
        .from("cms_route_rules")
        .select("id,item_id,source_path,destination_path,status_code,active")
        .in("item_id", itemIds)
        .eq("active", true),
      exactCount(
        context.admin
          .from("cms_publication_outbox")
          .select("id", { count: "exact", head: true })
          .in("item_id", itemIds)
          .in("status", ["pending", "processing", "failed"]),
        "QA_CMS_FIXTURE_PUBLICATION_OUTBOX_RESIDUE_UNAVAILABLE",
      ),
    ]);
    if (routeRows.error) throw new Error("QA_CMS_FIXTURE_ROUTE_RESIDUE_UNAVAILABLE");
    activePublications = publicationTotal;
    publishedProjections = projectionTotal;
    actionablePublicationOutbox = publicationOutboxTotal;
    const tombstoneItemId = state.terminalArchivedTombstone?.itemId;
    const expectedPath = terminalGonePath();
    activeRouteRules = (routeRows.data ?? []).filter(
      (route) =>
        !(
          tombstoneItemId &&
          route.item_id === tombstoneItemId &&
          route.source_path === expectedPath &&
          route.destination_path === null &&
          route.status_code === 410 &&
          route.active === true
        ),
    ).length;
    terminalArchivedTombstone = await terminalArchivedTombstoneEvidence(state);
  }
  const quotedActors = actorIds.map((actorId) => `'${actorId}'::uuid`).join(",");
  const sessionRows = await managementQuery(
    `select count(*)::integer as count from auth.sessions where user_id in (${quotedActors})`,
  );
  const activeSessions = Number(sessionRows[0]?.count);
  if (!Number.isInteger(activeSessions)) throw new Error("QA_CMS_FIXTURE_SESSION_RESIDUE_UNAVAILABLE");
  let activeCredentials = 0;
  for (const actorId of actorIds) {
    const authUser = await context.admin.auth.admin.getUserById(actorId);
    const bannedUntil = Date.parse(authUser.data?.user?.banned_until ?? "");
    if (authUser.error || !authUser.data?.user) throw new Error("QA_CMS_FIXTURE_AUTH_RESIDUE_UNAVAILABLE");
    activeCredentials += !Number.isFinite(bannedUntil) || bannedUntil <= Date.now() ? 1 : 0;
  }
  const activeResidue =
    activeContent +
    activeProfiles +
    overrides +
    legacyRoles +
    activeScopedRoles +
    activeRdoAccess +
    activePublications +
    publishedProjections +
    activeRouteRules +
    actionablePublicationOutbox +
    activeSessions +
    activeCredentials +
    activeLeads +
    actionableLeadOutbox +
    activeLeadForms +
    activeLeadFormVersions +
    activeAiSessions +
    activeAiTargets +
    activeAiPlans +
    activeAiApprovals +
    activeDocuments;
  return {
    activeResidue,
    activeContent,
    activeProfiles,
    activeCredentials,
    activeFeatureOverrides: overrides,
    activeLegacyRoles: legacyRoles,
    activeScopedRoles,
    activeRdoAccess,
    activePublications,
    publishedProjections,
    activeRouteRules,
    actionablePublicationOutbox,
    activeSessions,
    activeLeads,
    actionableLeadOutbox,
    activeLeadForms,
    activeLeadFormVersions,
    activeAiSessions,
    activeAiTargets,
    activeAiPlans,
    activeAiApprovals,
    activeDocuments,
    retainedAuditEvents: setupAudits + cleanupAudits,
    setupAuditEvents: setupAudits,
    cleanupAuditEvents: cleanupAudits,
    terminalArchivedTombstone,
    terminalNoSyntheticRoute:
      !state.terminalArchivedTombstone && activeRouteRules === 0
        ? {
            classification: "terminalNoSyntheticRoute",
            count: 0,
            activeRouteRules: 0,
            identifiersOrPathsPersisted: false,
          }
        : null,
  };
}

async function neutralizeSyntheticDocuments(state, actorIds) {
  const documents = await context.admin
    .from("cms_document_assets")
    .select("id,storage_path")
    .in("created_by", actorIds)
    .eq("source_kind", "synthetic_test")
    .eq("source_reference", state.runTag);
  if (documents.error) throw new Error("QA_CMS_FIXTURE_DOCUMENT_DISCOVERY_FAILED");
  state.documentIds = [...new Set((documents.data ?? []).map(({ id }) => id))];
  writeState(state);
  for (const document of documents.data ?? []) {
    const prepared = await context.admin.rpc("cms_fixture_neutralize_synthetic_document", {
      p_actor_id: state.actorId,
      p_document_id: document.id,
      p_run_tag: state.runTag,
      p_candidate_sha: state.expectedSha,
      p_environment: state.environment,
      p_blob_removed: false,
      p_correlation_id: randomUUID(),
    });
    if (
      prepared.error ||
      prepared.data?.status !== "neutralized" ||
      !["access_revoked", "removed"].includes(prepared.data?.blobDisposition)
    )
      throw new Error("QA_CMS_FIXTURE_DOCUMENT_NEUTRALIZATION_PREPARE_FAILED");
    const separator = document.storage_path.lastIndexOf("/");
    const prefix = document.storage_path.slice(0, separator);
    const filename = document.storage_path.slice(separator + 1);
    const inspect = () =>
      context.admin.storage.from("cms-documents-private").list(prefix, { limit: 100, search: filename });
    const before = await inspect();
    if (before.error) throw new Error("QA_CMS_FIXTURE_DOCUMENT_BLOB_VERIFICATION_FAILED");
    if ((before.data ?? []).some((object) => object.name === filename)) {
      const removed = await context.admin.storage
        .from("cms-documents-private")
        .remove([document.storage_path]);
      if (removed.error) throw new Error("QA_CMS_FIXTURE_DOCUMENT_BLOB_REMOVAL_FAILED");
    }
    const after = await inspect();
    if (after.error) throw new Error("QA_CMS_FIXTURE_DOCUMENT_BLOB_VERIFICATION_FAILED");
    if ((after.data ?? []).some((object) => object.name === filename))
      throw new Error("QA_CMS_FIXTURE_DOCUMENT_BLOB_RESIDUE");
    const confirmed = await context.admin.rpc("cms_fixture_neutralize_synthetic_document", {
      p_actor_id: state.actorId,
      p_document_id: document.id,
      p_run_tag: state.runTag,
      p_candidate_sha: state.expectedSha,
      p_environment: state.environment,
      p_blob_removed: true,
      p_correlation_id: randomUUID(),
    });
    if (confirmed.error) {
      if (
        confirmed.error.code !== "40001" ||
        !String(confirmed.error.message ?? "").includes("CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE")
      )
        throw new Error("QA_CMS_FIXTURE_DOCUMENT_NEUTRALIZATION_FAILED");
      continue;
    }
    if (confirmed.data?.status !== "neutralized" || confirmed.data?.blobDisposition !== "removed")
      throw new Error("QA_CMS_FIXTURE_DOCUMENT_NEUTRALIZATION_FAILED");
  }
  return state.documentIds.length;
}

export function buildRecoveredFormRetirementSql(state) {
  if (!state.leadFormId) return;
  const leadFields = [
    state.leadId,
    state.leadOutboxId,
    state.leadCampaignId,
    state.leadReference,
    state.leadStatus,
    state.leadCampaignPath,
  ];
  const hasLead = leadFields.some((value) => value !== null && value !== undefined);
  if (
    !uuidPattern.test(state.actorId ?? "") ||
    !uuidPattern.test(state.leadFormId) ||
    !runTagPattern.test(state.runTag ?? "") ||
    !/^[a-f0-9]{40}$/.test(state.expectedSha ?? "") ||
    !["staging", "production"].includes(state.environment) ||
    !state.runTag.endsWith(`-${state.expectedSha.slice(0, 8)}`) ||
    (hasLead &&
      (!uuidPattern.test(state.leadId ?? "") ||
        !uuidPattern.test(state.leadCampaignId ?? "") ||
        !/^LD-[A-Z0-9]+$/.test(state.leadReference ?? "") ||
        !/^[a-z_]+$/.test(state.leadStatus ?? "") ||
        !exactOperationalCampaignPathPattern(state.runTag).test(state.leadCampaignPath ?? "") ||
        !(
          state.leadOutboxId === null ||
          state.leadOutboxId === undefined ||
          uuidPattern.test(state.leadOutboxId)
        ))) ||
    (!hasLead &&
      [
        state.leadId,
        state.leadCampaignId,
        state.leadReference,
        state.leadStatus,
        state.leadCampaignPath,
      ].some((value) => value !== null && value !== undefined))
  ) {
    throw new Error("QA_CMS_FIXTURE_FORM_RETIREMENT_BINDING_INVALID");
  }
  const actorId = `${sqlText(state.actorId)}::uuid`;
  const formId = `${sqlText(state.leadFormId)}::uuid`;
  const formKeyPattern = `^qa-ops-${state.runTag.toLowerCase()}-[a-f0-9]{8}$`;
  const leadId = hasLead ? `${sqlText(state.leadId)}::uuid` : "null::uuid";
  const campaignId = hasLead ? `${sqlText(state.leadCampaignId)}::uuid` : "null::uuid";
  const knownOutboxId = state.leadOutboxId ? `${sqlText(state.leadOutboxId)}::uuid` : "null::uuid";
  const historyFromStatusMismatch = !hasLead
    ? "false"
    : state.leadStatus === "anonymized"
      ? "history.from_status is null or history.from_status not in ('new','assigned','in_service','responded','converted','disqualified','archived')"
      : `history.from_status is distinct from ${sqlText(state.leadStatus)}`;
  const historyFromStatusMatch = !hasLead
    ? "false"
    : state.leadStatus === "anonymized"
      ? "history.from_status in ('new','assigned','in_service','responded','converted','disqualified','archived')"
      : `history.from_status=${sqlText(state.leadStatus)}`;
  const leadPreflight = hasLead
    ? `
  perform 1 from public.cms_leads lead where lead.form_id=${formId} order by lead.id for update;
  select coalesce(array_agg(lead.id order by lead.id),'{}'::uuid[]) into v_lead_ids
  from public.cms_leads lead where lead.form_id=${formId};
  if cardinality(v_lead_ids)<>1 or v_lead_ids[1] is distinct from ${leadId}
  then raise exception 'QA_CMS_FIXTURE_LEAD_CARDINALITY_MISMATCH'; end if;
  select lead.* into strict v_lead from public.cms_leads lead where lead.id=${leadId};
  if v_lead.reference_code is distinct from ${sqlText(state.leadReference)} or
    v_lead.form_id is distinct from ${formId} or not v_lead.form_version_id=any(v_version_ids) or
    v_lead.origin_path is distinct from ${sqlText(state.leadCampaignPath)} or
    v_lead.origin_source is distinct from 'campaign' or
    v_lead.campaign_id is distinct from ${campaignId} or v_lead.product_id is not null or
    row(v_lead.qa_actor_id,v_lead.qa_run_tag,v_lead.qa_candidate_sha,v_lead.qa_environment) is distinct from
    row(${actorId},${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)})
  then raise exception 'QA_CMS_FIXTURE_LEAD_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_lead_status_history history
  where history.lead_id=${leadId} order by history.id for update;
  perform 1 from public.cms_lead_outbox outbox
  where outbox.lead_id=${leadId} order by outbox.id for update;
  select coalesce(array_agg(history.id order by history.id),'{}'::uuid[]) into v_cleanup_history_ids
  from public.cms_lead_status_history history where history.lead_id=${leadId} and
    history.to_status='anonymized' and
    history.reason in ('QA synthetic fixture cleanup','QA synthetic lease expired');
  if cardinality(v_cleanup_history_ids)>1 or exists (
    select 1 from public.cms_lead_status_history history
    where history.id=any(v_cleanup_history_ids) and (
      history.lead_id is distinct from ${leadId} or history.actor_id is distinct from ${actorId} or
      ${historyFromStatusMismatch}
    )
  ) then raise exception 'QA_CMS_FIXTURE_LEAD_HISTORY_PROVENANCE_MISMATCH'; end if;
  select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_outbox_ids
  from public.cms_lead_outbox outbox where outbox.lead_id=${leadId};
  if cardinality(v_outbox_ids)<1 or cardinality(v_outbox_ids)>32 or
    (${knownOutboxId} is not null and not ${knownOutboxId}=any(v_outbox_ids)) or exists (
      select 1 from public.cms_lead_outbox outbox where outbox.id=any(v_outbox_ids) and (
        outbox.lead_id is distinct from ${leadId} or
        outbox.event_type not in ('lead_received','lead_assigned','lead_status_changed','sla_breached','retention_due') or
        outbox.status not in ('pending','processing','completed','failed','dead_letter')
      )
    )
  then raise exception 'QA_CMS_FIXTURE_LEAD_OUTBOX_PROVENANCE_MISMATCH'; end if;
  if v_lead.anonymized_at is null then
    if ${sqlText(state.leadStatus)}='anonymized' or
      v_lead.status is distinct from ${sqlText(state.leadStatus)} or cardinality(v_cleanup_history_ids)<>0
    then raise exception 'QA_CMS_FIXTURE_LEAD_ACTIVE_STATE_MISMATCH'; end if;
    v_mutable_lead_ids:=array[${leadId}]::uuid[];
  else
    if v_lead.status<>'anonymized' or v_lead.payload<>'{}'::jsonb or v_lead.utm<>'{}'::jsonb or
      v_lead.assigned_to is not null or cardinality(v_cleanup_history_ids)<>1
    then raise exception 'QA_CMS_FIXTURE_LEAD_TERMINAL_STATE_MISMATCH'; end if;
    v_mutable_lead_ids:='{}'::uuid[];
  end if;
  select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_mutable_outbox_ids
  from public.cms_lead_outbox outbox where outbox.id=any(v_outbox_ids) and outbox.status<>'completed';`
    : `
  perform 1 from public.cms_leads lead where lead.form_id=${formId} order by lead.id for update;
  if found then raise exception 'QA_CMS_FIXTURE_UNBOUND_LEAD_PRESENT'; end if;
  v_lead_ids:='{}'::uuid[];
  v_cleanup_history_ids:='{}'::uuid[];
  v_outbox_ids:='{}'::uuid[];
  v_mutable_outbox_ids:='{}'::uuid[];
  v_mutable_lead_ids:='{}'::uuid[];`;
  const leadMutation = hasLead
    ? `
  with inserted as (
    insert into public.cms_lead_status_history(
      lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id
    ) select ${leadId},${sqlText(state.leadStatus)},'anonymized',v_lead.assigned_to,null,
      'QA synthetic fixture cleanup',${actorId}
    where cardinality(v_mutable_lead_ids)=1 returning id
  ) select coalesce(array_agg(inserted.id order by inserted.id),'{}'::uuid[])
    into v_changed_ids from inserted;
  if cardinality(v_changed_ids)<>cardinality(v_mutable_lead_ids)
  then raise exception 'QA_CMS_FIXTURE_LEAD_HISTORY_AFFECTED_IDS_MISMATCH'; end if;

  with changed as (
    update public.cms_leads lead set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,
      status='anonymized',anonymized_at=statement_timestamp(),last_activity_at=statement_timestamp()
    where lead.id=any(v_mutable_lead_ids) and lead.id=${leadId} and lead.form_id=${formId} and
      lead.campaign_id=${campaignId} and lead.origin_path=${sqlText(state.leadCampaignPath)} and
      lead.qa_actor_id=${actorId} and lead.qa_run_tag=${sqlText(state.runTag)} and
      lead.qa_candidate_sha=${sqlText(state.expectedSha)} and lead.qa_environment=${sqlText(state.environment)} and
      lead.status=${sqlText(state.leadStatus)} and lead.anonymized_at is null
    returning lead.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_mutable_lead_ids
  then raise exception 'QA_CMS_FIXTURE_LEAD_AFFECTED_IDS_MISMATCH'; end if;

  with changed as (
    update public.cms_lead_outbox outbox set status='completed',locked_at=null,
      completed_at=coalesce(outbox.completed_at,statement_timestamp()),last_error_code=null
    where outbox.id=any(v_mutable_outbox_ids) and outbox.lead_id=${leadId} and outbox.status<>'completed'
    returning outbox.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_mutable_outbox_ids
  then raise exception 'QA_CMS_FIXTURE_LEAD_OUTBOX_AFFECTED_IDS_MISMATCH'; end if;

  select coalesce(array_agg(history.id order by history.id),'{}'::uuid[]) into v_cleanup_history_ids
  from public.cms_lead_status_history history where history.lead_id=${leadId} and
    history.to_status='anonymized' and
    history.reason in ('QA synthetic fixture cleanup','QA synthetic lease expired') and
    history.actor_id=${actorId} and ${historyFromStatusMatch};
  if cardinality(v_cleanup_history_ids)<>1 or exists (
    select 1 from public.cms_leads lead where lead.id=${leadId} and (
      lead.status<>'anonymized' or lead.anonymized_at is null or lead.payload<>'{}'::jsonb or
      lead.utm<>'{}'::jsonb or lead.assigned_to is not null
    )
  ) or exists (
    select 1 from public.cms_lead_outbox outbox where outbox.id=any(v_outbox_ids) and outbox.status<>'completed'
  ) then raise exception 'QA_CMS_FIXTURE_LEAD_TERMINAL_STATE_INVALID'; end if;`
    : "";
  return `begin;
select set_config('cms.qa_mutation_actor_id', ${sqlText(state.actorId)}, true);
select set_config('cms.qa_compensating', 'on', true);
do $qa_fixture_form_retirement$
declare
  v_form public.cms_form_definitions%rowtype;
  v_form_ids uuid[];
  v_version_ids uuid[];
  v_mutable_version_ids uuid[];
  v_mutable_form_ids uuid[];
  v_lead_ids uuid[];
  v_mutable_lead_ids uuid[];
  v_cleanup_history_ids uuid[];
  v_outbox_ids uuid[];
  v_mutable_outbox_ids uuid[];
  v_lead public.cms_leads%rowtype;
  v_changed_ids uuid[];
begin
  perform 1 from auth.users actor where actor.id=${actorId} for update;
  if not found or not private.cms_qa_actor_marker_is_exact(
    ${actorId},${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)}
  ) then raise exception 'QA_CMS_FIXTURE_FORM_ACTOR_PROVENANCE_MISMATCH'; end if;

  perform 1 from private.cms_qa_actor_leases lease where lease.actor_id=${actorId} for update;
  if not found or exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id=${actorId} and (
      lease.run_tag is distinct from ${sqlText(state.runTag)} or
      lease.candidate_sha is distinct from ${sqlText(state.expectedSha)} or
      lease.environment is distinct from ${sqlText(state.environment)} or
      lease.status not in ('active','cleaned','expired')
    )
  ) then raise exception 'QA_CMS_FIXTURE_FORM_LEASE_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_profiles profile where profile.user_id=${actorId} for update;
  if not found then raise exception 'QA_CMS_FIXTURE_FORM_PROFILE_MISSING'; end if;

  perform 1 from public.cms_form_definitions form
  where form.id=${formId} or (
    form.created_by=${actorId} and (
      form.form_key~${sqlText(formKeyPattern)} or
      row(form.qa_actor_id,form.qa_run_tag,form.qa_candidate_sha,form.qa_environment)=
      row(${actorId},${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)})
    )
  )
  order by form.id for update;
  select coalesce(array_agg(form.id order by form.id),'{}'::uuid[]) into v_form_ids
  from public.cms_form_definitions form
  where form.id=${formId} or (
    form.created_by=${actorId} and (
      form.form_key~${sqlText(formKeyPattern)} or
      row(form.qa_actor_id,form.qa_run_tag,form.qa_candidate_sha,form.qa_environment)=
      row(${actorId},${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)})
    )
  );
  if cardinality(v_form_ids)<>1 or v_form_ids[1] is distinct from ${formId}
  then raise exception 'QA_CMS_FIXTURE_FORM_CARDINALITY_MISMATCH'; end if;

  select form.* into strict v_form from public.cms_form_definitions form where form.id=${formId};
  if v_form.form_key !~ ${sqlText(formKeyPattern)} or
    v_form.created_by is distinct from ${actorId} or
    row(v_form.qa_actor_id,v_form.qa_run_tag,v_form.qa_candidate_sha,v_form.qa_environment) is distinct from
    row(${actorId},${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)}) or
    v_form.status not in ('draft','published','retired') or
    not exists (
      select 1 from private.cms_qa_actor_leases updater
      where updater.actor_id=v_form.updated_by and updater.run_tag=${sqlText(state.runTag)} and
        updater.candidate_sha=${sqlText(state.expectedSha)} and updater.environment=${sqlText(state.environment)} and
        private.cms_qa_actor_marker_is_exact(updater.actor_id,updater.run_tag,updater.candidate_sha,updater.environment)
    )
  then raise exception 'QA_CMS_FIXTURE_FORM_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_form_versions version
  where version.form_id=${formId} order by version.id for update;
  select coalesce(array_agg(version.id order by version.id),'{}'::uuid[]) into v_version_ids
  from public.cms_form_versions version where version.form_id=${formId};
  if cardinality(v_version_ids)>32 or exists (
    select 1 from public.cms_form_versions version where version.form_id=${formId} and (
      version.created_by is distinct from ${actorId} or
      version.status not in ('draft','published','retired')
    )
  ) or (v_form.active_version_id is not null and not v_form.active_version_id=any(v_version_ids))
  then raise exception 'QA_CMS_FIXTURE_FORM_VERSION_PROVENANCE_MISMATCH'; end if;
${leadPreflight}

  select coalesce(array_agg(version.id order by version.id),'{}'::uuid[]) into v_mutable_version_ids
  from public.cms_form_versions version
  where version.id=any(v_version_ids) and version.status<>'retired';
  select case when v_form.status<>'retired' or v_form.active_version_id is not null
    then array[${formId}]::uuid[] else '{}'::uuid[] end into v_mutable_form_ids;

  with changed as (
    update public.cms_form_versions version
    set status='retired',published_at=coalesce(version.published_at,statement_timestamp())
    where version.id=any(v_mutable_version_ids) and version.form_id=${formId} and
      version.created_by=${actorId} and version.status<>'retired'
    returning version.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_mutable_version_ids
  then raise exception 'QA_CMS_FIXTURE_FORM_VERSION_AFFECTED_IDS_MISMATCH'; end if;

  with changed as (
    update public.cms_form_definitions form
    set status='retired',active_version_id=null,updated_by=${actorId}
    where form.id=any(v_mutable_form_ids) and form.id=${formId} and
      form.created_by=${actorId} and form.qa_actor_id=${actorId} and
      form.qa_run_tag=${sqlText(state.runTag)} and form.qa_candidate_sha=${sqlText(state.expectedSha)} and
      form.qa_environment=${sqlText(state.environment)} and
      (form.status<>'retired' or form.active_version_id is not null)
    returning form.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_mutable_form_ids
  then raise exception 'QA_CMS_FIXTURE_FORM_AFFECTED_IDS_MISMATCH'; end if;
${leadMutation}

  if exists (
    select 1 from public.cms_form_definitions form where form.id=${formId} and
      (form.status<>'retired' or form.active_version_id is not null)
  ) or exists (
    select 1 from public.cms_form_versions version where version.form_id=${formId} and version.status<>'retired'
  ) then raise exception 'QA_CMS_FIXTURE_FORM_TERMINAL_STATE_INVALID'; end if;
end
$qa_fixture_form_retirement$;
commit;
select true as retired;`;
}

export async function retireRecoveredFormResources(state, executeQuery = managementQuery) {
  const sql = buildRecoveredFormRetirementSql(state);
  if (sql === undefined) return;
  const result = await executeQuery(sql);
  if (result.length !== 1 || result[0]?.retired !== true)
    throw new Error("QA_CMS_FIXTURE_FORM_RETIREMENT_FAILED");
}

export function buildOwnedContentCleanupSql(state, actorIds, itemIds) {
  if (
    !Array.isArray(itemIds) ||
    !Array.isArray(actorIds) ||
    !uuidPattern.test(state?.actorId ?? "") ||
    !runTagPattern.test(state?.runTag ?? "") ||
    !/^[a-f0-9]{40}$/.test(state?.expectedSha ?? "") ||
    !["staging", "production"].includes(state?.environment) ||
    !state.runTag.endsWith(`-${state.expectedSha.slice(0, 8)}`) ||
    actorIds.length === 0 ||
    new Set(actorIds).size !== actorIds.length ||
    actorIds.some((actorId) => !uuidPattern.test(actorId)) ||
    !actorIds.includes(state.actorId) ||
    itemIds.length > 64 ||
    new Set(itemIds).size !== itemIds.length ||
    itemIds.some((itemId) => !uuidPattern.test(itemId))
  ) {
    throw new Error("QA_CMS_FIXTURE_CONTENT_CLEANUP_BINDING_INVALID");
  }
  if (!itemIds.length) return;
  const actors = `array[${actorIds.map((actorId) => `${sqlText(actorId)}::uuid`).join(",")}]::uuid[]`;
  const items = `array[${itemIds.map((itemId) => `${sqlText(itemId)}::uuid`).join(",")}]::uuid[]`;
  return `begin;
select set_config('cms.qa_mutation_actor_id', ${sqlText(state.actorId)}, true);
select set_config('cms.qa_compensating', 'on', true);
do $qa_fixture_content_cleanup$
declare
  v_actor_ids uuid[]:=${actors};
  v_expected_item_ids uuid[]:=${items};
  v_owned_item_ids uuid[];
  v_mutable_item_ids uuid[];
  v_publication_ids uuid[];
  v_projection_ids uuid[];
  v_route_ids uuid[];
  v_outbox_ids uuid[];
  v_changed_ids uuid[];
begin
  perform 1 from auth.users actor where actor.id=any(v_actor_ids) order by actor.id for update;
  if (select count(*) from auth.users actor where actor.id=any(v_actor_ids))<>cardinality(v_actor_ids) or exists (
    select 1 from unnest(v_actor_ids) actor_id where not private.cms_qa_actor_marker_is_exact(
      actor_id,${sqlText(state.runTag)},${sqlText(state.expectedSha)},${sqlText(state.environment)}
    )
  ) then raise exception 'QA_CMS_FIXTURE_CONTENT_ACTOR_PROVENANCE_MISMATCH'; end if;
  perform 1 from private.cms_qa_actor_leases lease
  where lease.actor_id=any(v_actor_ids) order by lease.actor_id for update;
  if (select count(*) from private.cms_qa_actor_leases lease where lease.actor_id=any(v_actor_ids))<>
      cardinality(v_actor_ids) or exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id=any(v_actor_ids) and (
      lease.run_tag is distinct from ${sqlText(state.runTag)} or
      lease.candidate_sha is distinct from ${sqlText(state.expectedSha)} or
      lease.environment is distinct from ${sqlText(state.environment)} or
      lease.status not in ('active','cleaned','expired')
    )
  ) then raise exception 'QA_CMS_FIXTURE_CONTENT_LEASE_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_content_items item
  where item.created_by=any(v_actor_ids) or item.id=any(v_expected_item_ids)
  order by item.id for update;
  select coalesce(array_agg(item.id order by item.id),'{}'::uuid[]) into v_owned_item_ids
  from public.cms_content_items item where item.created_by=any(v_actor_ids);
  if cardinality(v_owned_item_ids)<>cardinality(v_expected_item_ids) or
    not (v_owned_item_ids @> v_expected_item_ids and v_expected_item_ids @> v_owned_item_ids) or exists (
      select 1 from public.cms_content_items item where item.id=any(v_expected_item_ids) and (
        not item.created_by=any(v_actor_ids) or not item.updated_by=any(v_actor_ids) or
        item.workflow_status not in ('draft','in_review','approved','published','archived')
      )
    )
  then raise exception 'QA_CMS_FIXTURE_CONTENT_CARDINALITY_MISMATCH'; end if;

  perform 1 from public.cms_content_drafts draft
  where draft.item_id=any(v_expected_item_ids) order by draft.item_id for update;
  if (select count(*) from public.cms_content_drafts draft where draft.item_id=any(v_expected_item_ids))<>
      cardinality(v_expected_item_ids) or exists (
    select 1 from public.cms_content_drafts draft
    join public.cms_content_items item on item.id=draft.item_id
    where draft.item_id=any(v_expected_item_ids) and (
      not draft.updated_by=any(v_actor_ids) or
      draft.payload->>'contentType' is distinct from item.content_type or
      position(${sqlText(state.runTag)} in coalesce(draft.payload->>'title',''))<>1 or
      not exists (
        select 1 from jsonb_array_elements(draft.provenance) provenance
        where provenance->>'authorizationReference'=${sqlText(state.runTag)}
      )
    )
  ) then raise exception 'QA_CMS_FIXTURE_CONTENT_PROVENANCE_MISMATCH'; end if;

  perform 1 from public.cms_publications publication
  where publication.item_id=any(v_expected_item_ids) order by publication.item_id for update;
  perform 1 from public.cms_published_projection projection
  where projection.item_id=any(v_expected_item_ids) order by projection.item_id for update;
  perform 1 from public.cms_route_rules route
  where route.item_id=any(v_expected_item_ids) order by route.id for update;
  perform 1 from public.cms_publication_outbox outbox
  where outbox.item_id=any(v_expected_item_ids) order by outbox.id for update;
  select coalesce(array_agg(publication.item_id order by publication.item_id),'{}'::uuid[])
    into v_publication_ids from public.cms_publications publication
    where publication.item_id=any(v_expected_item_ids);
  select coalesce(array_agg(projection.item_id order by projection.item_id),'{}'::uuid[])
    into v_projection_ids from public.cms_published_projection projection
    where projection.item_id=any(v_expected_item_ids);
  select coalesce(array_agg(route.id order by route.id),'{}'::uuid[]) into v_route_ids
    from public.cms_route_rules route where route.item_id=any(v_expected_item_ids) and route.active;
  select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_outbox_ids
    from public.cms_publication_outbox outbox where outbox.item_id=any(v_expected_item_ids) and
    outbox.status in ('pending','processing','failed');
  if cardinality(v_publication_ids)>cardinality(v_expected_item_ids) or
    cardinality(v_projection_ids)>cardinality(v_expected_item_ids) or exists (
      select 1 from public.cms_publications publication where publication.item_id=any(v_expected_item_ids) and
        not publication.published_by=any(v_actor_ids)
    ) or exists (
      select 1 from public.cms_publication_outbox outbox where outbox.item_id=any(v_expected_item_ids) and
        outbox.status not in ('pending','processing','completed','failed','dead_letter')
    )
  then raise exception 'QA_CMS_FIXTURE_CONTENT_GRAPH_PROVENANCE_MISMATCH'; end if;

  select coalesce(array_agg(item.id order by item.id),'{}'::uuid[]) into v_mutable_item_ids
  from public.cms_content_items item where item.id=any(v_expected_item_ids) and item.workflow_status<>'archived';
  with changed as (
    update public.cms_content_items item set workflow_status='archived',
      archived_at=coalesce(item.archived_at,statement_timestamp()),scheduled_for=null,
      deleted_at=null,deleted_by=null,updated_by=${sqlText(state.actorId)}::uuid
    where item.id=any(v_mutable_item_ids) and item.created_by=any(v_actor_ids) and
      item.updated_by=any(v_actor_ids) and item.workflow_status<>'archived' returning item.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_mutable_item_ids
  then raise exception 'QA_CMS_FIXTURE_CONTENT_AFFECTED_IDS_MISMATCH'; end if;

  insert into public.cms_publication_outbox(item_id,revision_id,event_type,correlation_id)
  select projection.item_id,projection.revision_id,'unpublish',gen_random_uuid()
  from public.cms_published_projection projection where projection.item_id=any(v_expected_item_ids)
  on conflict do nothing;
  with changed as (
    delete from public.cms_publications publication
    where publication.item_id=any(v_publication_ids) returning publication.item_id
  ) select coalesce(array_agg(changed.item_id order by changed.item_id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_publication_ids
  then raise exception 'QA_CMS_FIXTURE_PUBLICATION_AFFECTED_IDS_MISMATCH'; end if;
  with changed as (
    delete from public.cms_published_projection projection
    where projection.item_id=any(v_projection_ids) returning projection.item_id
  ) select coalesce(array_agg(changed.item_id order by changed.item_id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_projection_ids
  then raise exception 'QA_CMS_FIXTURE_PROJECTION_AFFECTED_IDS_MISMATCH'; end if;
  with changed as (
    update public.cms_route_rules route set active=false
    where route.id=any(v_route_ids) and route.item_id=any(v_expected_item_ids) and route.active
    returning route.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_route_ids
  then raise exception 'QA_CMS_FIXTURE_ROUTE_AFFECTED_IDS_MISMATCH'; end if;

  select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[]) into v_outbox_ids
  from public.cms_publication_outbox outbox where outbox.item_id=any(v_expected_item_ids) and
    outbox.status in ('pending','processing','failed');
  with changed as (
    update public.cms_publication_outbox outbox set status='completed',locked_at=null,
      completed_at=coalesce(outbox.completed_at,statement_timestamp()),last_error_code=null
    where outbox.id=any(v_outbox_ids) and outbox.item_id=any(v_expected_item_ids) and
      outbox.status in ('pending','processing','failed') returning outbox.id
  ) select coalesce(array_agg(changed.id order by changed.id),'{}'::uuid[])
    into v_changed_ids from changed;
  if v_changed_ids is distinct from v_outbox_ids
  then raise exception 'QA_CMS_FIXTURE_PUBLICATION_OUTBOX_AFFECTED_IDS_MISMATCH'; end if;

  if exists (
    select 1 from public.cms_content_items item where item.id=any(v_expected_item_ids) and
      item.workflow_status<>'archived'
  ) or exists (
    select 1 from public.cms_publications publication where publication.item_id=any(v_expected_item_ids)
  ) or exists (
    select 1 from public.cms_published_projection projection where projection.item_id=any(v_expected_item_ids)
  ) or exists (
    select 1 from public.cms_route_rules route where route.item_id=any(v_expected_item_ids) and route.active
  ) or exists (
    select 1 from public.cms_publication_outbox outbox where outbox.item_id=any(v_expected_item_ids) and
      outbox.status in ('pending','processing','failed')
  ) then raise exception 'QA_CMS_FIXTURE_CONTENT_TERMINAL_STATE_INVALID'; end if;
end
$qa_fixture_content_cleanup$;
commit;
select true as cleaned;`;
}

function transactionalSqlBody(sql, resultColumn) {
  const prefix = "begin;\n";
  const suffix = `\ncommit;\nselect true as ${resultColumn};`;
  if (!sql.startsWith(prefix) || !sql.endsWith(suffix))
    throw new Error("QA_CMS_FIXTURE_TRANSACTION_COMPOSITION_INVALID");
  return sql.slice(prefix.length, -suffix.length);
}

export function buildEditorialCleanupSql(state, actorIds, itemIds) {
  const formSql = buildRecoveredFormRetirementSql(state);
  const contentSql = buildOwnedContentCleanupSql(state, actorIds, itemIds);
  const statements = [];
  if (formSql) statements.push(transactionalSqlBody(formSql, "retired"));
  if (contentSql) statements.push(transactionalSqlBody(contentSql, "cleaned"));
  if (statements.length === 0) return;
  return `begin;\n${statements.join("\n")}\ncommit;\nselect true as cleaned;`;
}

async function cleanupEditorialGraph(state, actorIds, itemIds, executeQuery = managementQuery) {
  const sql = buildEditorialCleanupSql(state, actorIds, itemIds);
  if (sql === undefined) return;
  const result = await executeQuery(sql);
  if (result.length !== 1 || result[0]?.cleaned !== true)
    throw new Error("QA_CMS_FIXTURE_EDITORIAL_CLEANUP_FAILED");
}

async function cleanupState(state) {
  validateFixtureState(state, target.environment, target.ref, expectedSha);
  if (!state.actorId)
    return {
      activeResidue: 0,
      activeContent: 0,
      activeProfiles: 0,
      activeCredentials: 0,
      activeFeatureOverrides: 0,
      activeLegacyRoles: 0,
      activeScopedRoles: 0,
      activeRdoAccess: 0,
      activePublications: 0,
      publishedProjections: 0,
      activeRouteRules: 0,
      actionablePublicationOutbox: 0,
      activeSessions: 0,
      activeLeads: 0,
      actionableLeadOutbox: 0,
      activeLeadForms: 0,
      activeLeadFormVersions: 0,
      activeAiSessions: 0,
      activeAiTargets: 0,
      activeAiPlans: 0,
      activeAiApprovals: 0,
      activeDocuments: 0,
      retainedAuditEvents: 0,
      setupAuditEvents: 0,
      cleanupAuditEvents: 0,
      terminalArchivedTombstone: null,
      terminalNoSyntheticRoute: {
        classification: "terminalNoSyntheticRoute",
        count: 0,
        activeRouteRules: 0,
        identifiersOrPathsPersisted: false,
      },
    };
  const actorIds = fixtureActorIds(state);
  await assertSyntheticActor(state, state.actorId, "operator");
  if (state.managedActorId) await assertSyntheticActor(state, state.managedActorId, "reviewer");
  if (state.existingIdentityActorId)
    await assertSyntheticActor(state, state.existingIdentityActorId, "existing_identity");
  if (state.recoveryActorId) await assertSyntheticActor(state, state.recoveryActorId, "recovery");
  if (state.invitedActorId) await assertSyntheticActor(state, state.invitedActorId, "invitee");
  hydrateFixtureStateFromUiHandoff(state, { required: false });
  await recoverInterruptedUiResources(state);
  const now = new Date().toISOString();
  const failures = [];
  const runStep = async (code, operation) => {
    try {
      await operation();
    } catch {
      failures.push(code);
    }
  };
  let itemIds = [...state.itemIds];
  let ownedItemsReady = false;
  await runStep("QA_CMS_FIXTURE_OWNED_ITEMS_DISCOVERY_FAILED", async () => {
    const owned = await context.admin.from("cms_content_items").select("id").in("created_by", actorIds);
    if (owned.error) throw new Error("owned-items");
    const ownedItemIds = [...new Set((owned.data ?? []).map(({ id }) => id))];
    if (state.itemIds.some((itemId) => !ownedItemIds.includes(itemId)))
      throw new Error("owned-items-mismatch");
    if (ownedItemIds.length > 64) throw new Error("owned-items-limit");
    itemIds = ownedItemIds;
    state.itemIds = ownedItemIds;
    validateFixtureState(state, target.environment, target.ref, expectedSha);
    writeState(state);
    ownedItemsReady = true;
  });
  if (ownedItemsReady && (itemIds.length || state.leadFormId)) {
    await runStep("QA_CMS_FIXTURE_EDITORIAL_GRAPH_CLEANUP_FAILED", () =>
      cleanupEditorialGraph(state, actorIds, itemIds),
    );
    if (itemIds.length) {
      await runStep("QA_CMS_FIXTURE_TOMBSTONE_ACTIVATION_FAILED", () =>
        activateTerminalArchivedTombstone(state, itemIds),
      );
    }
  }
  await runStep("QA_CMS_FIXTURE_DOCUMENT_CLEANUP_FAILED", () =>
    neutralizeSyntheticDocuments(state, actorIds),
  );
  await runStep("QA_CMS_FIXTURE_OVERRIDE_CLEANUP_FAILED", async () => {
    const overrides = await context.admin
      .from("cms_feature_flag_overrides")
      .delete()
      .eq("scope_type", "user")
      .in("scope_key", actorIds);
    if (overrides.error) throw new Error("overrides");
  });
  await runStep("QA_CMS_FIXTURE_SCOPED_ROLE_CLEANUP_FAILED", async () => {
    const scopedRoles = await context.admin
      .from("cms_scoped_role_assignments")
      .select(
        "id,user_id,role_key,site_key,environment,grant_type,reason,expires_at,granted_by,revoked_at,lock_version",
      )
      .or(`user_id.in.(${actorIds.join(",")}),granted_by.in.(${actorIds.join(",")})`)
      .eq("site_key", "main")
      .eq("environment", state.environment)
      .is("revoked_at", null);
    if (scopedRoles.error) throw new Error("scoped-roles");
    const assignments = validateScopedRoleCleanupAssignments(scopedRoles.data ?? [], actorIds, state);
    for (const assignment of assignments) {
      let revokeQuery = context.admin
        .from("cms_scoped_role_assignments")
        .update({
          revoked_at: now,
          revoked_by: state.actorId,
          revocation_reason: "QA synthetic fixture cleanup",
          lock_version: assignment.lock_version + 1,
        })
        .eq("id", assignment.id)
        .eq("user_id", assignment.user_id)
        .eq("role_key", assignment.role_key)
        .eq("site_key", "main")
        .eq("environment", state.environment)
        .eq("grant_type", assignment.grant_type)
        .eq("reason", assignment.reason)
        .eq("granted_by", assignment.granted_by)
        .eq("lock_version", assignment.lock_version)
        .is("revoked_at", null);
      revokeQuery =
        assignment.expires_at === null
          ? revokeQuery.is("expires_at", null)
          : revokeQuery.eq("expires_at", assignment.expires_at);
      const revoked = await revokeQuery.select("id").maybeSingle();
      if (revoked.error || revoked.data?.id !== assignment.id) throw new Error("scoped-role-race");
    }
  });
  await runStep("QA_CMS_FIXTURE_ROLE_CLEANUP_FAILED", async () => {
    const roles = await context.admin.from("cms_user_roles").delete().in("user_id", actorIds);
    if (roles.error) throw new Error("roles");
  });
  await runStep("QA_CMS_FIXTURE_RDO_ACCESS_CLEANUP_FAILED", async () => {
    const rdoAccess = await context.admin
      .from("rdo_user_access")
      .update({
        active: false,
        suspended_at: now,
        suspended_by: state.actorId,
        updated_at: now,
      })
      .in("user_id", actorIds)
      .eq("active", true);
    if (rdoAccess.error) throw new Error("rdo-access");
  });
  await runStep("QA_CMS_FIXTURE_AI_SESSION_CLEANUP_FAILED", async () => {
    const closed = await context.admin
      .from("cms_ai_sessions")
      .update({ status: "closed", closed_at: now, updated_at: now })
      .in("actor_id", actorIds)
      .eq("status", "active");
    if (closed.error) throw new Error("ai-sessions");
  });
  await runStep("QA_CMS_FIXTURE_AI_PLAN_CLEANUP_FAILED", async () => {
    const ownedPlans = await context.admin
      .from("cms_ai_execution_plans")
      .select("id")
      .in("created_by", actorIds);
    if (ownedPlans.error) throw new Error("ai-plans-read");
    const planIds = (ownedPlans.data ?? []).map(({ id }) => id);
    if (planIds.length) {
      const approvals = await context.admin
        .from("cms_ai_execution_approvals")
        .update({ status: "expired" })
        .in("plan_id", planIds)
        .eq("status", "active");
      if (approvals.error) throw new Error("ai-approvals");
    }
    const plans = await context.admin
      .from("cms_ai_execution_plans")
      .update({ status: "canceled", updated_at: now })
      .in("created_by", actorIds)
      .in("status", ["ready", "approved", "rejected", "executing"]);
    if (plans.error) throw new Error("ai-plans");
  });
  await runStep("QA_CMS_FIXTURE_AI_TARGET_CLEANUP_FAILED", async () => {
    const targets = await context.admin
      .from("cms_ai_synthetic_targets")
      .update({
        lifecycle: "retired",
        title: "QA terminal target",
        payload: {},
        updated_by: state.actorId,
        updated_at: now,
      })
      .in("created_by", actorIds)
      .eq("qa_run_tag", state.runTag)
      .eq("qa_candidate_sha", expectedSha)
      .eq("qa_environment", target.environment);
    if (targets.error) throw new Error("ai-targets");
  });
  await runStep("QA_CMS_FIXTURE_CLEANUP_AUDIT_FAILED", () =>
    recordFixtureAudit(state.actorId, "cleanup", state.runTag),
  );
  await runStep("QA_CMS_FIXTURE_PROFILE_SUSPEND_FAILED", async () => {
    const suspended = await context.admin
      .from("cms_profiles")
      .update({
        status: "suspended",
        suspended_at: now,
        suspended_by: state.actorId,
        sessions_valid_after: now,
      })
      .in("user_id", actorIds)
      .neq("status", "suspended");
    if (suspended.error) throw new Error("suspend");
  });
  await runStep("QA_CMS_FIXTURE_SESSION_REVOCATION_FAILED", () =>
    managementQuery(
      `delete from auth.sessions where user_id in (${actorIds.map((actorId) => `'${actorId}'::uuid`).join(",")})`,
    ),
  );
  await runStep("QA_CMS_FIXTURE_CREDENTIAL_REVOCATION_FAILED", async () => {
    for (const actorId of actorIds) {
      const banned = await context.admin.auth.admin.updateUserById(actorId, {
        password: `Revoked!${randomBytes(32).toString("base64url")}9Z`,
        ban_duration: "876000h",
      });
      if (banned.error) throw new Error("credentials");
    }
  });
  let residue;
  await runStep("QA_CMS_FIXTURE_RESIDUE_VERIFICATION_FAILED", async () => {
    residue = await inspectResidue(state, itemIds);
  });
  if (
    failures.length ||
    !residue ||
    residue.activeResidue !== 0 ||
    residue.cleanupAuditEvents < 1 ||
    (state.setupAudited && residue.setupAuditEvents < 1)
  )
    throw new Error("QA_CMS_FIXTURE_CLEANUP_INCOMPLETE");
  for (const actorId of actorIds) await completeActorLease(actorId, state.runTag);
  return { ...residue, leaseStatus: "cleaned" };
}

async function setup() {
  await exactHealth();
  const runTag = `QA-CMS-FINAL-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${expectedSha.slice(0, 8)}`;
  if (existsSync(statePath)) {
    const previous = readState();
    if (previous.status !== "cleaned") throw new Error("QA_CMS_FIXTURE_ACTIVE_STATE_EXISTS");
  }
  const state = {
    schemaVersion: 1,
    environment: target.environment,
    projectRef: target.ref,
    expectedSha,
    runTag,
    status: "creating",
    setupAudited: false,
    authLifecycleEnabled: authLifecycleProvisioning === "true",
    actorId: null,
    managedActorId: null,
    existingIdentityActorId: null,
    recoveryActorId: null,
    invitedActorId: null,
    leadId: null,
    leadOutboxId: null,
    leadFormId: null,
    leadCampaignId: null,
    leadReference: null,
    leadStatus: null,
    leadCampaignPath: null,
    itemIds: [],
    terminalArchivedTombstone: null,
    documentIds: [],
  };
  writeState(state);
  try {
    let recoveryLifecycle = null;
    let invitedLifecycle = null;
    const actor = await createActor(runTag, (actorId) => {
      state.actorId = actorId;
      writeState(state);
    });
    const managedActor = await createActor(
      runTag,
      (actorId) => {
        state.managedActorId = actorId;
        writeState(state);
      },
      { actorKind: "reviewer", initialRole: "editor" },
    );
    const existingIdentityActor = await createActor(
      runTag,
      (actorId) => {
        state.existingIdentityActorId = actorId;
        writeState(state);
      },
      {
        actorKind: "existing_identity",
        initialRole: null,
        provisionCms: false,
        rdoRole: "rdo_member",
        rdoInvitedBy: actor.actorId,
      },
    );
    if (state.authLifecycleEnabled) {
      const recoveryActor = await createActor(
        runTag,
        (actorId) => {
          state.recoveryActorId = actorId;
          writeState(state);
        },
        { actorKind: "recovery" },
      );
      recoveryLifecycle = await createRecoveryLifecycle(recoveryActor);
      invitedLifecycle = await createInvitedLifecycleActor(runTag, actor.actorId, (actorId) => {
        state.invitedActorId = actorId;
        writeState(state);
      });
    }
    const scopedRoleAssignments = await createScopedRoleAssignments(
      actor.actorId,
      managedActor.actorId,
      runTag,
    );
    const featureFlags =
      (await createFeatureOverrides(actor.actorId, runTag)) +
      (await createFeatureOverrides(managedActor.actorId, runTag));
    await assertReadySession(actor.token);
    await assertReadySession(managedActor.token);
    if (recoveryLifecycle) {
      const recoverySession = await context.admin.auth.admin.getUserById(recoveryLifecycle.actorId);
      if (recoverySession.error || !recoverySession.data.user)
        throw new Error("QA_CMS_FIXTURE_RECOVERY_ACTOR_UNAVAILABLE");
    }
    await recordFixtureAudit(actor.actorId, "setup", runTag);
    state.setupAudited = true;
    state.status = "ready";
    writeState(state);
    appendEnvironment([
      { name: "QA_CMS_EMAIL", value: actor.email, secret: true },
      { name: "QA_CMS_PASSWORD", value: actor.password, secret: true },
      { name: "QA_CMS_TOTP_SECRET", value: actor.secret, secret: true },
      { name: "QA_CMS_REVIEWER_EMAIL", value: managedActor.email, secret: true },
      { name: "QA_CMS_REVIEWER_PASSWORD", value: managedActor.password, secret: true },
      { name: "QA_CMS_REVIEWER_TOTP_SECRET", value: managedActor.secret, secret: true },
      { name: "QA_CMS_MANAGED_USER_ID", value: managedActor.actorId, secret: true },
      { name: "QA_CMS_EXISTING_IDENTITY_EMAIL", value: existingIdentityActor.email, secret: true },
      { name: "QA_CMS_EXISTING_IDENTITY_PASSWORD", value: existingIdentityActor.password, secret: true },
      { name: "QA_CMS_EXISTING_IDENTITY_TOTP_SECRET", value: existingIdentityActor.secret, secret: true },
      { name: "QA_CMS_EXISTING_IDENTITY_USER_ID", value: existingIdentityActor.actorId, secret: true },
      ...(recoveryLifecycle && invitedLifecycle
        ? [
            { name: "QA_CMS_RECOVERY_USER_ID", value: recoveryLifecycle.actorId, secret: true },
            { name: "QA_CMS_RECOVERY_EMAIL", value: recoveryLifecycle.email, secret: true },
            { name: "QA_CMS_RECOVERY_PASSWORD", value: recoveryLifecycle.password, secret: true },
            {
              name: "QA_CMS_RECOVERY_TOTP_SECRET",
              value: recoveryLifecycle.secret,
              secret: true,
            },
            {
              name: "QA_CMS_RECOVERY_ACTION_LINK",
              value: recoveryLifecycle.actionLink,
              secret: true,
            },
            { name: "QA_CMS_INVITEE_USER_ID", value: invitedLifecycle.actorId, secret: true },
            { name: "QA_CMS_INVITEE_EMAIL", value: invitedLifecycle.email, secret: true },
            { name: "QA_CMS_INVITEE_PASSWORD", value: invitedLifecycle.password, secret: true },
            {
              name: "QA_CMS_INVITEE_ACTION_LINK",
              value: invitedLifecycle.actionLink,
              secret: true,
            },
          ]
        : []),
      { name: "QA_CMS_RUN_TAG", value: runTag },
      { name: "QA_CMS_REQUIRE_AUTHENTICATED", value: "true" },
      { name: "QA_CMS_AUTH_LIFECYCLE_REQUIRED", value: String(state.authLifecycleEnabled) },
      { name: "QA_CMS_FIXTURE_STATE_PATH", value: path.relative(process.cwd(), statePath) },
      {
        name: "QA_CMS_UI_CREATED_STATE_PATH",
        value: process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json",
      },
      { name: "QA_CMS_SUPABASE_URL", value: context.url },
      { name: "QA_CMS_SUPABASE_ANON_KEY", value: context.anonKey, secret: true },
      { name: "QA_CMS_EXPECTED_SHA", value: expectedSha },
      { name: "QA_CMS_TARGET_ENVIRONMENT", value: target.environment },
    ]);
    writeReport({
      schemaVersion: 1,
      status: "ready",
      environment: target.environment,
      candidateSha: expectedSha,
      runTag,
      syntheticUsers: fixtureActorIds(state).length,
      mfa: "verified-aal2",
      existingIdentityBaseline: {
        authIdentity: "existing-before-cms-invite",
        cmsProfile: "absent",
        cmsRoles: 0,
        rdoAccess: "active-member",
      },
      sessionCapabilities: "ready-all-expected",
      fixtureProvisioning: "actors-and-prerequisites-only",
      editorialEntitiesCreatedByFixture: 0,
      formsCreatedByFixture: 0,
      leadsCreatedByFixture: 0,
      authLifecycle: state.authLifecycleEnabled
        ? {
            status: "prepared",
            inviteIdentity: "new-auth-identity-with-pending-cms-profile",
            recoveryIdentity: "distinct-active-cms-identity",
            actionLinksPersisted: false,
            externalEmailSentByFixture: false,
          }
        : { status: "not-requested" },
      watchdogLease: {
        status:
          actor.lease.status === "active" &&
          managedActor.lease.status === "active" &&
          existingIdentityActor.lease.status === "active" &&
          (!recoveryLifecycle || recoveryLifecycle.lease.status === "active") &&
          (!invitedLifecycle || invitedLifecycle.lease.status === "active")
            ? "active"
            : "invalid",
        ttlSeconds: Math.min(
          actor.lease.ttlSeconds,
          managedActor.lease.ttlSeconds,
          existingIdentityActor.lease.ttlSeconds,
          ...(recoveryLifecycle ? [recoveryLifecycle.lease.ttlSeconds] : []),
          ...(invitedLifecycle ? [invitedLifecycle.lease.ttlSeconds] : []),
        ),
        automaticExpiryCleanup: true,
      },
      routeFixtures: state.itemIds.length,
      operationalFixtures: {
        isolatedLead: true,
        publicLeadCampaign: true,
        failedOutboxRetry: true,
      },
      scopedRoleAssignments,
      featureFlags,
      noindex: true,
      credentialsInStateOrReport: false,
      credentialsExportedOnlyToMaskedGithubEnvironment: true,
      productionMutations: productionMutationSummary({
        actors: fixtureActorIds(state).length,
        drafts: state.itemIds.length,
        overrides: featureFlags,
      }),
    });
  } catch (error) {
    let cleanupCompleted;
    if (state.actorId) {
      try {
        await cleanupState(state);
        cleanupCompleted = true;
        state.status = "cleaned";
        writeState(state);
      } catch {
        cleanupCompleted = false;
      }
    } else {
      cleanupCompleted = true;
      state.status = "cleaned";
      writeState(state);
    }
    const errorCode = cleanupCompleted ? safeErrorCode(error) : "QA_CMS_FIXTURE_CLEANUP_INCOMPLETE";
    writeReport({
      schemaVersion: 1,
      status: "failed",
      environment: target.environment,
      candidateSha: expectedSha,
      runTag,
      errorCode,
      cleanupCompleted,
      productionMutations: productionMutationSummary({
        actors: fixtureActorIds(state).length,
        cleanupAttempted: Boolean(state.actorId),
        cleanupCompleted,
      }),
    });
    throw new Error(errorCode, { cause: error });
  }
}

async function cleanup() {
  if (!existsSync(statePath)) {
    writeReport({
      schemaVersion: 1,
      status: "not-created",
      environment: target.environment,
      candidateSha: expectedSha,
      activeResidue: 0,
      productionMutations: productionMutationSummary(),
    });
    return;
  }
  const state = readState();
  try {
    const residue = await cleanupState(state);
    finalizeAdminOpsEvidence(state, residue);
    state.status = "cleaned";
    writeState(state);
    writeReport({
      schemaVersion: 1,
      status: "cleaned",
      environment: target.environment,
      candidateSha: expectedSha,
      runTag: state.runTag,
      syntheticUsersSuspended: fixtureActorIds(state).length,
      ...residue,
      auditRetained: residue.retainedAuditEvents > 0,
      productionMutations: productionMutationSummary({
        actors: fixtureActorIds(state).length,
        drafts: state.itemIds.length,
        cleanupAttempted: Boolean(state.actorId),
        cleanupCompleted: true,
      }),
    });
  } catch (error) {
    const errorCode = safeErrorCode(error);
    writeReport({
      schemaVersion: 1,
      status: "cleanup-failed",
      environment: target.environment,
      candidateSha: expectedSha,
      runTag: state.runTag,
      errorCode,
      productionMutations: productionMutationSummary({
        cleanupAttempted: Boolean(state.actorId),
        cleanupCompleted: false,
      }),
    });
    throw new Error(errorCode, { cause: error });
  }
}

async function verifyResidue() {
  if (!existsSync(statePath)) throw new Error("QA_CMS_FIXTURE_STATE_REQUIRED");
  const state = readState();
  if (state.status !== "cleaned") throw new Error("QA_CMS_FIXTURE_RESIDUE_STATE_NOT_CLEANED");
  const actorIds = fixtureActorIds(state);
  if (!actorIds.length) {
    writeReport({
      schemaVersion: 1,
      status: "passed",
      environment: target.environment,
      candidateSha: expectedSha,
      runTag: state.runTag,
      activeResidue: 0,
      activeLeases: 0,
      activeSessions: 0,
      auditRetained: false,
      terminalArchivedTombstone: null,
      terminalNoSyntheticRoute: {
        classification: "terminalNoSyntheticRoute",
        count: 0,
        activeRouteRules: 0,
        identifiersOrPathsPersisted: false,
      },
      credentialsInStateOrReport: false,
      productionMutations: productionMutationSummary(),
    });
    return;
  }
  for (const actorId of actorIds) {
    await assertSyntheticActor(
      state,
      actorId,
      actorId === state.actorId
        ? "operator"
        : actorId === state.managedActorId
          ? "reviewer"
          : actorId === state.existingIdentityActorId
            ? "existing_identity"
            : actorId === state.recoveryActorId
              ? "recovery"
              : "invitee",
    );
  }
  const leases = await Promise.all(actorIds.map((actorId) => actorLeaseStatus(actorId, state.runTag)));
  const activeLeases = leases.filter((lease) => lease.status !== "cleaned").length;
  const residue = await inspectResidue(state, state.itemIds);
  if (
    activeLeases !== 0 ||
    residue.activeResidue !== 0 ||
    residue.activeSessions !== 0 ||
    residue.retainedAuditEvents < 1 ||
    residue.cleanupAuditEvents < 1
  ) {
    throw new Error("QA_CMS_FIXTURE_RESIDUE_PRESENT");
  }
  writeReport({
    schemaVersion: 1,
    status: "passed",
    environment: target.environment,
    candidateSha: expectedSha,
    runTag: state.runTag,
    ...residue,
    activeLeases,
    auditRetained: true,
    credentialsInStateOrReport: false,
    productionMutations: productionMutationSummary(),
  });
}

export async function main() {
  validateRuntime();
  context = await loadContext();
  if (mode === "setup") await setup();
  else if (mode === "cleanup") await cleanup();
  else await verifyResidue();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
