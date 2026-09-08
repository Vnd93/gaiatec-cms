import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  assertQaActorLease,
  completeQaActorLease,
  createQaRunTag,
  qaActorMetadata,
  QA_ACTOR_LEASE_TTL_MINUTES,
} from "../qa/qa-actor-lease.mjs";

const stagingProjectRef = "glcqsosxwgmlhzgcsnzv";
const supabaseUrl = process.env.GAIATEC_SUPABASE_URL;
let anonKey = process.env.GAIATEC_SUPABASE_ANON_KEY;
let serviceKey = process.env.GAIATEC_SUPABASE_SERVICE_ROLE_KEY;
const expectedSha = process.env.GAIATEC_EXPECTED_SHA ?? "";
const supabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const siteOrigin = (process.env.GAIATEC_STAGING_ORIGIN ?? "https://gaiatec-cms-staging.pages.dev").replace(
  /\/$/,
  "",
);
if (supabaseUrl !== `https://${stagingProjectRef}.supabase.co`)
  throw new Error("Alvo recusado: a homologação integral só pode operar no projeto staging canônico.");

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
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

if ((!anonKey || !serviceKey) && supabaseAccessToken) {
  const keys = JSON.parse(
    runSupabase(["projects", "api-keys", "--project-ref", stagingProjectRef, "--reveal", "--output", "json"]),
  );
  anonKey ||= keys.find((key) => key.id === "anon")?.api_key;
  serviceKey ||= keys.find((key) => key.id === "service_role")?.api_key;
}
if (!anonKey || !serviceKey) throw new Error("Credenciais seguras de staging indisponíveis.");
if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("GAIATEC_EXPECTED_SHA deve ser um SHA completo.");
if (supabaseAccessToken.length < 24)
  throw new Error("SUPABASE_ACCESS_TOKEN é obrigatório para revogar as sessões sintéticas.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const generatedRunTag = createQaRunTag(expectedSha);
const runTag = process.env.GAIATEC_QA_RUN_TAG ?? generatedRunTag;
if (!/^QA-CMS-FINAL-\d{8}-[a-f0-9]{8}$/.test(runTag) || runTag.slice(-8) !== expectedSha.slice(0, 8))
  throw new Error("GAIATEC_QA_RUN_TAG não segue QA-CMS-FINAL-<data>-<sha-curto>.");
const shortTag = runTag.toLowerCase().replace(/[^a-z0-9]/g, "");
const createdUsers = [];
const createdItems = [];
const createdForms = [];
const evidence = [];
let controlledProductClassification = null;

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ""}`);
}
function record(name, details = {}) {
  evidence.push({ name, ok: true, ...details });
}
function uid() {
  return crypto.randomUUID();
}
function provenance(reference) {
  return [
    {
      sourceKind: "owner_authored",
      authorizationReference: reference,
      authorizationDate: new Date().toISOString().slice(0, 10),
      rightsScope: "Homologação sintética descartável em staging",
      rightsConfirmed: true,
      commercialOwner: "Owner sintético G7/G8",
      technicalOwner: "Revisor sintético G7/G8",
      verifiedAt: new Date().toISOString(),
    },
  ];
}
function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${stagingProjectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Consulta segura de gestão do staging falhou.");
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("Resposta de gestão do staging inválida.");
  return payload;
}

async function leaseRpc(name, body) {
  const result = await admin.rpc(name, body);
  if (result.error || !result.data || typeof result.data !== "object")
    throw new Error(`RPC de lease indisponível: ${name}`);
  return result.data;
}

async function createActor(role) {
  const email = `cms-${role}-${shortTag}@example.invalid`;
  const password = `T!${crypto.randomBytes(24).toString("base64url")}9a`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: qaActorMetadata(runTag, expectedSha, "staging"),
  });
  if (error) throw error;
  const identity = {
    actorId: data.user.id,
    runTag,
    candidateSha: expectedSha,
    environment: "staging",
  };
  const actor = {
    role,
    email,
    password,
    id: data.user.id,
    client: null,
    session: null,
    identity,
    lease: null,
  };
  createdUsers.push(actor);
  actor.lease = await assertQaActorLease(leaseRpc, identity, "active");
  const profile = await admin.from("cms_profiles").insert({
    user_id: actor.id,
    display_name: `Homologação ${role} ${runTag}`,
    display_email: email,
    status: "active",
  });
  if (profile.error) throw profile.error;
  const grant = await admin.from("cms_user_roles").insert({ user_id: actor.id, role_key: role });
  if (grant.error) throw grant.error;
  actor.client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await actor.client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error(`Login ${role} sem sessão.`);
  actor.session = signed.data.session;
  assert(decodeJwt(actor.session.access_token).aal === "aal1", `Sessão inicial ${role} não é AAL1`);
  return actor;
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(value) {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}
function totp(secret, offset = 0) {
  const counter = BigInt(Math.floor(Date.now() / 30000) + offset);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const position = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, "0");
}
async function elevate(actor) {
  const enrolled = await actor.client.auth.mfa.enroll({ factorType: "totp", friendlyName: `g7-${runTag}` });
  if (enrolled.error || !enrolled.data?.id || !enrolled.data?.totp?.secret)
    throw enrolled.error ?? new Error("MFA não matriculado.");
  let verified = null;
  for (const offset of [0, -1, 1]) {
    const attempt = await actor.client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret, offset),
    });
    if (!attempt.error && attempt.data?.access_token) {
      verified = {
        ...actor.session,
        ...attempt.data,
        expires_at: Math.round(Date.now() / 1000) + attempt.data.expires_in,
      };
      break;
    }
  }
  if (!verified) throw new Error(`MFA real não verificado para ${actor.role}.`);
  actor.session = verified;
  assert(
    decodeJwt(actor.session.access_token).aal === "aal2",
    `Sessão ${actor.role} não foi elevada para AAL2`,
  );
  const resolved = await invoke("cms-session", actor, { action: "mfa" }, { idempotent: false });
  assert(
    resolved.status === 200 && resolved.data.mfaVerified === true,
    `Sessão CMS ${actor.role} não reconheceu MFA`,
    resolved,
  );
}

async function invoke(fn, actor, body, options = {}) {
  const idempotencyKey = options.key ?? uid();
  const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${actor.session.access_token}`,
      Origin: siteOrigin,
      "Content-Type": "application/json",
      ...(options.idempotent === false ? {} : { "X-Idempotency-Key": idempotencyKey }),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, idempotencyKey };
}
async function expectInvoke(fn, actor, body, status = 200, options = {}) {
  const result = await invoke(fn, actor, body, options);
  assert(
    result.status === status,
    `${fn}/${body.action ?? "request"} retornou ${result.status}, esperado ${status}`,
    result.data,
  );
  return result;
}
async function editorial(actor, body, status = 200, key) {
  return expectInvoke("cms-content", actor, body, status, { key });
}
async function leadCommand(actor, body, status = 200) {
  return expectInvoke("cms-leads", actor, body, status);
}
async function publicApi(params) {
  const response = await fetch(`${supabaseUrl}/functions/v1/cms-public?${new URLSearchParams(params)}`, {
    headers: { apikey: anonKey },
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function serverNow() {
  const response = await fetch(`${supabaseUrl}/functions/v1/cms-public?type=sitemap`, {
    headers: { apikey: anonKey },
  });
  const timestamp = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function postPayload(slug) {
  return {
    schemaVersion: 1,
    consumerId: "cms.blog-article.v1",
    contentType: "post",
    title: `Artigo sintético G7 ${runTag}`,
    summary: "Resumo criado exclusivamente para homologar o fluxo editorial remoto.",
    blocks: [
      {
        id: uid(),
        type: "rich_text",
        data: { text: "Conteúdo sintético, descartável e sem informação comercial real." },
      },
    ],
    seo: {
      title: `Artigo sintético G7 | GAIATEC`,
      description: "Artigo sintético não indexável para validar o Gate G7 em staging.",
      canonicalPath: `/blog/${slug}`,
      indexable: false,
    },
    provenance: provenance(`G7-BLOG-${runTag}`),
    excerpt: "Artigo sintético para homologação do blog.",
    authorName: "Equipe sintética",
    author: {
      id: uid(),
      name: "Equipe sintética",
      slug: `equipe-${shortTag}`,
      role: "Homologação",
      bio: "Identidade temporária de teste.",
    },
    category: { id: uid(), name: "Homologação", slug: `homologacao-${shortTag}` },
    tags: [{ id: uid(), name: "Teste", slug: `teste-${shortTag}` }],
    relations: { postIds: [], productIds: [], serviceIds: [], applicationIds: [], solutionIds: [] },
    readingMinutes: 1,
  };
}
function campaignPayload(slug, options = {}) {
  const start = options.expired ? new Date(Date.now() - 3_600_000) : new Date(Date.now() - 60_000);
  const end = options.expired ? new Date(Date.now() - 30_000) : new Date(Date.now() + 3_600_000);
  const blocks = [
    {
      id: uid(),
      type: "hero",
      hidden: false,
      width: "wide",
      tone: "brand",
      data: {
        eyebrow: "HOMOLOGAÇÃO G7",
        title: `Campanha sintética ${runTag}`,
        text: "Landing descartável sem conteúdo real.",
        primaryCta: { label: "Contato", href: "/contato" },
        alignment: "left",
      },
    },
  ];
  if (options.form)
    blocks.push({
      id: uid(),
      type: "form",
      hidden: false,
      width: "wide",
      tone: "light",
      data: {
        heading: "Formulário sintético",
        text: "Envio descartável para homologação.",
        formKey: options.form.key,
        formId: options.form.formId,
        formVersionId: options.form.versionId,
        buttonLabel: "Enviar teste",
      },
    });
  return {
    schemaVersion: 1,
    consumerId: "cms.campaign-landing.v1",
    contentType: "campaign",
    title: `Campanha sintética ${runTag}`,
    summary: "Campanha descartável para validar publicação, expiração e captação.",
    campaignKind: "lead_generation",
    templateKey: "landing_conversion",
    route: { path: `/campanhas/${slug}` },
    window: { startsAt: start.toISOString(), endsAt: end.toISOString(), timezone: "America/Sao_Paulo" },
    blocks,
    placements: [],
    ...(options.form ? { form: options.form } : {}),
    tracking: { enabled: true, requiresConsent: true, provider: "internal", eventName: `g7-${shortTag}` },
    expiry: options.expiry ?? { mode: "not_found" },
    relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
    seo: {
      title: "Campanha sintética G7 | GAIATEC",
      description: "Landing sintética não indexável para validar expiração e formulário.",
      canonicalPath: `/campanhas/${slug}`,
      indexable: false,
    },
    provenance: provenance(`G7-CAMPANHA-${runTag}`),
    governanceState: "synthetic_test",
    approval: {
      businessOwner: "Owner sintético",
      marketingReviewer: "Marketing sintético",
      privacyReviewer: "Revisão DPO pendente",
    },
  };
}
function productPayload(slug, title, manufacturerVisibility = "internal") {
  assert(controlledProductClassification, "Listas mestras de produto não foram carregadas");
  return {
    schemaVersion: 1,
    consumerId: "cms.catalog-product.v1",
    contentType: "product",
    pilotState: "awaiting_owner",
    fieldVisibility: {
      brand: "public",
      manufacturer: manufacturerVisibility,
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
    title,
    summary: "Produto sintético e descartável criado por lote governado.",
    brand: { name: "GATFLOW", slug: "gatflow" },
    manufacturer: { name: `OEM-INTERNO-${shortTag}`, slug: `oem-${shortTag}` },
    productLine: { name: "Linha sintética", slug: `linha-${shortTag}` },
    classification: {
      segment: "Instrumentação sintética",
      category: "Medição sintética",
      family: "Família sintética",
    },
    controlledClassification: controlledProductClassification,
    commercial: {
      shortDescription: "Descrição sintética sem conteúdo legado.",
      valueProposition: "Proposta de valor sintética.",
      benefits: ["Benefício sintético"],
      differentiators: [],
    },
    function: "Medição sintética",
    technology: "Tecnologia sintética",
    models: [
      {
        id: uid(),
        model: `MODELO-${shortTag}`,
        manufacturerReference: `REF-${shortTag}`,
        sku: `SKU-${shortTag}`,
        status: "active",
        variants: [{ id: uid(), name: "Variante sintética", code: `VAR-${shortTag}`, order: 0 }],
      },
    ],
    specifications: [
      {
        id: uid(),
        key: "faixa-sintetica",
        label: "Faixa sintética",
        type: "range",
        value: { min: 0, max: 100 },
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
    search: { synonyms: [], keywords: ["homologacao-sintetica"] },
    redirects: [],
    blocks: [{ id: uid(), type: "rich_text", data: { text: "Conteúdo sintético do produto em lote." } }],
    seo: {
      title: `${title} | GAIATEC`,
      description: "Produto sintético não indexável criado para homologação do cadastro em massa.",
      canonicalPath: `/produtos/${slug}`,
      indexable: false,
    },
    provenance: provenance(`G8-LOTE-${runTag}`),
    approval: {
      portfolioOwner: "Owner sintético",
      technicalReviewer: "Revisor técnico sintético",
      commercialReviewer: "Revisor comercial sintético",
      editorialReviewer: "Revisor editorial sintético",
    },
  };
}

async function publishFlow({ creator, approver, publisher, contentType, slug, payload }) {
  const created = await editorial(creator, {
    action: "create",
    itemId: null,
    contentType,
    slug,
    payload,
    expectedLockVersion: null,
    revisionId: null,
    reason: `Criação sintética ${runTag}`,
    publishAt: null,
  });
  createdItems.push(created.data.itemId);
  const submitted = await editorial(creator, {
    action: "submit",
    itemId: created.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: created.data.lockVersion,
    revisionId: null,
    reason: `Submissão sintética ${runTag}`,
    publishAt: null,
  });
  await editorial(approver, {
    action: "approve",
    itemId: created.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: submitted.data.revisionId,
    reason: `Aprovação sintética ${runTag}`,
    publishAt: null,
  });
  const published = await editorial(publisher, {
    action: "publish",
    itemId: created.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: submitted.data.revisionId,
    reason: `Publicação sintética ${runTag}`,
    publishAt: null,
  });
  return {
    itemId: created.data.itemId,
    lockVersion: created.data.lockVersion,
    revisionId: submitted.data.revisionId,
    published: published.data,
  };
}

async function loadControlledProductClassification() {
  const dimensions = {
    "product.category": "productCategory",
    "product.application_magnitude": "applicationMagnitude",
    "product.technology": "technology",
    "product.installation_operation": "installationOperation",
    "product.monitored_element": "monitoredElement",
  };
  const { data: lists, error: listsError } = await admin
    .from("cms_controlled_lists")
    .select("id,list_key")
    .in("list_key", Object.keys(dimensions))
    .eq("active", true);
  if (listsError) throw listsError;
  assert(lists.length === Object.keys(dimensions).length, "Listas mestras de produto incompletas", lists);
  const { data: options, error: optionsError } = await admin
    .from("cms_controlled_options")
    .select("id,list_id,slug,label,sort_order")
    .in(
      "list_id",
      lists.map((list) => list.id),
    )
    .eq("active", true)
    .order("sort_order")
    .order("label");
  if (optionsError) throw optionsError;
  const refs = {};
  for (const list of lists) {
    const option = options.find((candidate) => candidate.list_id === list.id);
    assert(option, `Lista mestra sem opção ativa: ${list.list_key}`);
    refs[dimensions[list.list_key]] = { id: option.id, slug: option.slug, label: option.label };
  }
  return refs;
}

async function run() {
  const healthResponse = await fetch(`${siteOrigin}/healthz`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const health = await healthResponse.json().catch(() => null);
  assert(healthResponse.status === 200, "Healthcheck de staging indisponível", healthResponse.status);
  assert(health?.environment === "staging", "Shell não aponta para staging", health);
  if (expectedSha) {
    assert(health?.release === expectedSha, "Shell não corresponde ao SHA homologado", health);
    assert(
      healthResponse.headers.get("x-release") === expectedSha,
      "Cabeçalho de release não corresponde ao SHA homologado",
      healthResponse.headers.get("x-release"),
    );
  }
  record("Identidade imutável do shell", {
    environment: health.environment,
    release: health.release,
  });

  const [adminActor, marketing, reviewer, commercial] = await Promise.all([
    createActor("admin"),
    createActor("marketing"),
    createActor("reviewer"),
    createActor("commercial"),
  ]);
  assert(
    [adminActor, marketing, reviewer, commercial].every(
      (actor) =>
        actor.lease?.status === "active" && actor.lease.ttlSeconds === QA_ACTOR_LEASE_TTL_MINUTES * 60,
    ),
    "Lease automática não foi confirmada antes da concessão de acesso",
  );
  record("Identidades temporárias e RBAC", {
    roles: ["admin", "marketing", "reviewer", "commercial"],
    initialAal: "aal1",
    watchdogLease: `active-${QA_ACTOR_LEASE_TTL_MINUTES}m`,
  });

  const formKey = `form-g7-${shortTag}`;
  const consentText =
    "Autorizo o tratamento destes dados sintéticos exclusivamente para homologação técnica em staging.";
  const formDefinition = {
    fields: [
      {
        id: uid(),
        key: "nome",
        label: "Nome",
        type: "text",
        required: true,
        maxLength: 120,
        options: [],
        personalData: true,
        order: 0,
      },
      {
        id: uid(),
        key: "email",
        label: "E-mail",
        type: "email",
        required: true,
        maxLength: 320,
        options: [],
        personalData: true,
        order: 1,
      },
      {
        id: uid(),
        key: "mensagem",
        label: "Mensagem",
        type: "textarea",
        required: true,
        maxLength: 1000,
        options: [],
        personalData: true,
        order: 2,
      },
    ],
    successMessage: "Lead sintético registrado.",
    submitLabel: "Enviar homologação",
  };
  const savedForm = await leadCommand(marketing, {
    action: "save_form",
    formId: null,
    formKey,
    title: "Formulário sintético G7",
    purpose: "Homologação remota do fluxo de captação",
    definition: formDefinition,
    consentText,
    consentVersion: `g7-${runTag}`,
    privacyPath: "/politica-de-privacidade",
    slaMinutes: 60,
    retentionDays: 30,
    reason: `Homologação G7 ${runTag}`,
  });
  createdForms.push(savedForm.data.formId);
  await leadCommand(
    adminActor,
    { action: "publish_form", formId: savedForm.data.formId, versionId: savedForm.data.versionId },
    403,
  );
  await elevate(adminActor);
  await leadCommand(adminActor, {
    action: "publish_form",
    formId: savedForm.data.formId,
    versionId: savedForm.data.versionId,
  });
  const publishedForm = await publicApi({ type: "form", key: formKey });
  assert(
    publishedForm.status === 200 && publishedForm.data.versionId === savedForm.data.versionId,
    "Formulário publicado não chegou ao consumidor público",
    publishedForm,
  );
  record("Formulário versionado e MFA crítico", {
    aal1PublishDenied: true,
    publicVersion: publishedForm.data.version,
  });

  const blogSlug = `artigo-g7-${shortTag}`;
  const postCreated = await editorial(marketing, {
    action: "create",
    itemId: null,
    contentType: "post",
    slug: blogSlug,
    payload: postPayload(blogSlug),
    expectedLockVersion: null,
    revisionId: null,
    reason: `Criação blog ${runTag}`,
    publishAt: null,
  });
  createdItems.push(postCreated.data.itemId);
  const postSubmitted = await editorial(marketing, {
    action: "submit",
    itemId: postCreated.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: postCreated.data.lockVersion,
    revisionId: null,
    reason: `Submissão blog ${runTag}`,
    publishAt: null,
  });
  await editorial(
    reviewer,
    {
      action: "approve",
      itemId: postCreated.data.itemId,
      contentType: null,
      slug: null,
      payload: null,
      expectedLockVersion: null,
      revisionId: postSubmitted.data.revisionId,
      reason: `Aprovação blog ${runTag}`,
      publishAt: null,
    },
    403,
  );
  await elevate(reviewer);
  await editorial(reviewer, {
    action: "approve",
    itemId: postCreated.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: postSubmitted.data.revisionId,
    reason: `Aprovação blog ${runTag}`,
    publishAt: null,
  });
  const deniedPublishAt = new Date((await serverNow()) + 60_000).toISOString();
  await editorial(
    marketing,
    {
      action: "schedule",
      itemId: postCreated.data.itemId,
      contentType: null,
      slug: null,
      payload: null,
      expectedLockVersion: null,
      revisionId: postSubmitted.data.revisionId,
      reason: `Agendamento blog ${runTag}`,
      publishAt: deniedPublishAt,
    },
    403,
  );
  await elevate(marketing);
  const publishAt = new Date((await serverNow()) + 7000).toISOString();
  await editorial(marketing, {
    action: "schedule",
    itemId: postCreated.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: postSubmitted.data.revisionId,
    reason: `Agendamento blog ${runTag}`,
    publishAt,
  });
  await new Promise((resolve) => setTimeout(resolve, 7500));
  const due = await admin.rpc("cms_publish_due_schedule", {
    p_item_id: postCreated.data.itemId,
    p_correlation_id: uid(),
  });
  if (due.error) throw due.error;
  const blogPage = await fetch(`${siteOrigin}/blog/${blogSlug}?homologacao=${shortTag}`);
  const blogHtml = await blogPage.text();
  assert(
    blogPage.status === 200 &&
      blogHtml.includes(`Artigo sintético G7`) &&
      blogHtml.includes("application/ld+json"),
    "Artigo agendado não foi renderizado com schema",
    { status: blogPage.status },
  );
  const restored = await editorial(marketing, {
    action: "restore",
    itemId: postCreated.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: postSubmitted.data.revisionId,
    reason: `Restauração blog ${runTag}`,
    publishAt: null,
  });
  assert(restored.data.contentVersion >= 2, "Restauração não criou nova publicação", restored.data);
  record("Blog agendado, publicado e restaurado", {
    scheduledAt: publishAt,
    articleSchema: true,
    contentVersion: restored.data.contentVersion,
  });

  const campaignSlug = `campanha-g7-${shortTag}`;
  const activeCampaign = await publishFlow({
    creator: marketing,
    approver: reviewer,
    publisher: marketing,
    contentType: "campaign",
    slug: campaignSlug,
    payload: campaignPayload(campaignSlug, {
      form: { formId: savedForm.data.formId, versionId: savedForm.data.versionId, key: formKey },
    }),
  });
  const campaignPage = await fetch(`${siteOrigin}/campanhas/${campaignSlug}?homologacao=${shortTag}`);
  const campaignHtml = await campaignPage.text();
  const campaignApi = await publicApi({ type: "campaign-by-path", path: `/campanhas/${campaignSlug}` });
  assert(
    campaignPage.status === 200 &&
      !campaignHtml.includes("submit-contact") &&
      campaignApi.status === 200 &&
      campaignApi.data.form?.versionId === savedForm.data.versionId &&
      campaignApi.data.payload?.blocks?.some((block) => block.type === "form"),
    "Landing governada não recebeu o formulário versionado",
    { pageStatus: campaignPage.status, apiStatus: campaignApi.status },
  );
  record("Campanha publicada no frontend", { route: `/campanhas/${campaignSlug}`, governedForm: true });

  const leadIdempotency = uid();
  const leadBody = {
    formId: savedForm.data.formId,
    formVersionId: savedForm.data.versionId,
    idempotencyKey: leadIdempotency,
    fields: {
      nome: "Pessoa sintética",
      email: `lead-${shortTag}@example.com`,
      mensagem: "Solicitação sintética para homologação.",
    },
    origin: {
      path: `/campanhas/${campaignSlug}`,
      source: "campaign",
      campaignId: activeCampaign.itemId,
      utm: { source: "homologacao", medium: "synthetic", campaign: campaignSlug },
    },
    consent: { accepted: true, text: consentText, version: `g7-${runTag}` },
    honeypot: "",
    captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
  };
  const captureHeaders = {
    apikey: anonKey,
    Origin: siteOrigin,
    "Content-Type": "application/json",
    "User-Agent": `GAIATEC-G7/${runTag}`,
  };
  const missingCaptchaResponse = await fetch(`${supabaseUrl}/functions/v1/lead-capture`, {
    method: "POST",
    headers: captureHeaders,
    body: JSON.stringify({ ...leadBody, idempotencyKey: uid(), captchaToken: undefined }),
  });
  const missingCaptcha = await missingCaptchaResponse.json();
  assert(
    missingCaptchaResponse.status === 403 && missingCaptcha.challengeRequired === true,
    "Captação sem Turnstile não foi bloqueada",
    missingCaptcha,
  );
  const invalidCaptchaResponse = await fetch(`${supabaseUrl}/functions/v1/lead-capture`, {
    method: "POST",
    headers: captureHeaders,
    body: JSON.stringify({ ...leadBody, idempotencyKey: uid(), captchaToken: "token-invalido" }),
  });
  const invalidCaptcha = await invalidCaptchaResponse.json();
  assert(
    invalidCaptchaResponse.status === 403 && invalidCaptcha.challengeRequired === true,
    "Captação com Turnstile inválido não foi bloqueada",
    invalidCaptcha,
  );
  record("Turnstile obrigatório", { missingDenied: true, invalidDenied: true });

  const firstCaptureResponse = await fetch(`${supabaseUrl}/functions/v1/lead-capture`, {
    method: "POST",
    headers: captureHeaders,
    body: JSON.stringify(leadBody),
  });
  const firstCapture = await firstCaptureResponse.json();
  assert(
    firstCaptureResponse.status === 201 && firstCapture.duplicate === false,
    "Primeira captação falhou",
    firstCapture,
  );
  const repeatCaptureResponse = await fetch(`${supabaseUrl}/functions/v1/lead-capture`, {
    method: "POST",
    headers: captureHeaders,
    body: JSON.stringify(leadBody),
  });
  const repeatCapture = await repeatCaptureResponse.json();
  assert(
    repeatCaptureResponse.status === 201 &&
      repeatCapture.duplicate === true &&
      repeatCapture.reference === firstCapture.reference,
    "Idempotência do lead falhou",
    repeatCapture,
  );
  const leadQuery = await admin
    .from("cms_leads")
    .select("id,status,assigned_to,payload,utm")
    .eq("reference_code", firstCapture.reference)
    .single();
  if (leadQuery.error) throw leadQuery.error;
  await leadCommand(
    marketing,
    {
      action: "update_lead",
      leadId: leadQuery.data.id,
      status: "assigned",
      assignedTo: commercial.id,
      reason: `Teste negativo RBAC ${runTag}`,
    },
    403,
  );
  const commercialAssignment = await invoke("cms-leads", commercial, {
    action: "update_lead",
    leadId: leadQuery.data.id,
    status: "assigned",
    assignedTo: commercial.id,
    reason: `Atribuição sintética ${runTag}`,
  });
  if (commercialAssignment.status !== 200) {
    const claims = decodeJwt(commercial.session.access_token);
    const diagnostic = await admin.rpc("cms_manage_lead", {
      p_actor_id: commercial.id,
      p_lead_id: leadQuery.data.id,
      p_status: "assigned",
      p_assigned_to: commercial.id,
      p_reason: `Diagnóstico sintético ${runTag}`,
      p_aal: claims.aal,
      p_session_id: claims.session_id,
      p_issued_at: new Date(claims.iat * 1000).toISOString(),
      p_correlation_id: uid(),
    });
    throw new Error(
      `Atribuição comercial rejeitada: ${JSON.stringify({ edge: commercialAssignment.data, database: diagnostic.error })}`,
    );
  }
  await leadCommand(
    commercial,
    { action: "export_leads", status: "assigned", justification: `Exportação sintética ${runTag}` },
    403,
  );
  await elevate(commercial);
  const exported = await leadCommand(commercial, {
    action: "export_leads",
    status: "assigned",
    justification: `Exportação sintética ${runTag}`,
  });
  assert(
    exported.data.rows.some((row) => row.reference === firstCapture.reference),
    "Lead atribuído não apareceu na exportação auditada",
  );
  await leadCommand(adminActor, {
    action: "anonymize_lead",
    leadId: leadQuery.data.id,
    reason: `Anonimização sintética ${runTag}`,
  });
  const anonymized = await admin
    .from("cms_leads")
    .select("status,assigned_to,payload,utm,anonymized_at")
    .eq("id", leadQuery.data.id)
    .single();
  if (anonymized.error) throw anonymized.error;
  assert(
    anonymized.data.status === "anonymized" &&
      anonymized.data.assigned_to === null &&
      Object.keys(anonymized.data.payload).length === 0 &&
      Object.keys(anonymized.data.utm).length === 0,
    "Anonimização não removeu dados pessoais",
    anonymized.data,
  );
  const leadOutbox = await admin
    .from("cms_lead_outbox")
    .select("event_type,status")
    .eq("lead_id", leadQuery.data.id);
  if (leadOutbox.error) throw leadOutbox.error;
  assert(
    leadOutbox.data.length >= 2,
    "Outbox do lead não registrou recebimento e atribuição",
    leadOutbox.data,
  );
  record("Lead completo, RBAC, exportação e LGPD", {
    duplicateSuppressed: true,
    marketingAssignmentDenied: true,
    aal1ExportDenied: true,
    anonymized: true,
    outboxEvents: leadOutbox.data.length,
  });

  const expiryCases = [
    ["redirect", { mode: "redirect", destinationPath: "/contato" }, 301, "/contato"],
    ["not-found", { mode: "not_found" }, 404, null],
    ["gone", { mode: "gone" }, 410, null],
    [
      "fallback",
      { mode: "fallback", fallbackCampaignId: activeCampaign.itemId },
      302,
      `/campanhas/${campaignSlug}`,
    ],
  ];
  const expiryRoutes = [];
  for (const [name, expiry, expectedStatus, destination] of expiryCases) {
    const slug = `expira-${name}-${shortTag}`;
    const item = await publishFlow({
      creator: marketing,
      approver: reviewer,
      publisher: marketing,
      contentType: "campaign",
      slug,
      payload: campaignPayload(slug, { expired: true, expiry }),
    });
    expiryRoutes.push({ slug, itemId: item.itemId, expectedStatus, destination });
  }
  const expired = await admin.rpc("cms_expire_campaigns", { p_limit: 50, p_correlation_id: uid() });
  if (expired.error) throw expired.error;
  assert(expired.data >= 4, "Worker não expirou todas as campanhas sintéticas", expired.data);
  for (const route of expiryRoutes) {
    const response = await fetch(`${siteOrigin}/campanhas/${route.slug}?homologacao=${shortTag}`, {
      redirect: "manual",
    });
    assert(
      response.status === route.expectedStatus,
      `Rota expirada ${route.slug} retornou status incorreto`,
      { expected: route.expectedStatus, actual: response.status },
    );
    if (route.destination)
      assert(
        (response.headers.get("location") ?? "").endsWith(route.destination),
        `Destino de ${route.slug} incorreto`,
        response.headers.get("location"),
      );
  }
  record("Expiração de campanhas", { statuses: [301, 404, 410, 302] });

  controlledProductClassification = await loadControlledProductClassification();
  const bulkSlugs = [`produto-lote-a-${shortTag}`, `produto-lote-b-${shortTag}`];
  const validRows = bulkSlugs.map((slug, index) => ({
    sourceRow: index + 2,
    slug,
    payload: productPayload(slug, `Produto sintético ${index + 1} ${runTag}`),
  }));
  const invalidRows = structuredClone(validRows);
  invalidRows[1].payload.fieldVisibility.manufacturer = "restrito-invalido";
  const invalidCommit = uid();
  await editorial(
    adminActor,
    {
      action: "bulk_create",
      contentType: "product",
      reason: `Lote inválido sintético ${runTag}`,
      rows: invalidRows,
    },
    422,
    invalidCommit,
  );
  const afterInvalid = await admin
    .from("cms_content_items")
    .select("id", { count: "exact", head: true })
    .in("slug", bulkSlugs);
  if (afterInvalid.error) throw afterInvalid.error;
  assert(afterInvalid.count === 0, "Lote inválido criou conteúdo parcial", afterInvalid.count);
  const dryRun = await editorial(adminActor, {
    action: "bulk_validate",
    contentType: "product",
    reason: `Dry-run sintético ${runTag}`,
    rows: validRows,
  });
  assert(
    dryRun.data.status === "valid" && dryRun.data.errors.length === 0,
    "Dry-run válido falhou",
    dryRun.data,
  );
  const afterDryRun = await admin
    .from("cms_content_items")
    .select("id", { count: "exact", head: true })
    .in("slug", bulkSlugs);
  assert(afterDryRun.count === 0, "Dry-run criou cadastros", afterDryRun.count);
  const bulkCommit = uid();
  const createdBulk = await editorial(
    adminActor,
    { action: "bulk_create", contentType: "product", reason: `Lote sintético ${runTag}`, rows: validRows },
    200,
    bulkCommit,
  );
  const repeatedBulk = await editorial(
    adminActor,
    { action: "bulk_create", contentType: "product", reason: `Lote sintético ${runTag}`, rows: validRows },
    200,
    bulkCommit,
  );
  const bulkIds = createdBulk.data.rows.map((row) => row.itemId);
  createdItems.push(...bulkIds);
  assert(
    createdBulk.data.total === 2 && repeatedBulk.data.rows.map((row) => row.itemId).join() === bulkIds.join(),
    "Lote não foi atômico/idempotente",
    { first: createdBulk.data, repeat: repeatedBulk.data },
  );
  const afterBulk = await admin
    .from("cms_content_items")
    .select("id", { count: "exact", head: true })
    .in("slug", bulkSlugs);
  assert(afterBulk.count === 2, "Lote não criou exatamente dois rascunhos", afterBulk.count);
  record("Cadastro em massa atômico", {
    invalidCreated: 0,
    dryRunCreated: 0,
    draftsCreated: 2,
    idempotent: true,
    correlationId: createdBulk.data.correlationId,
  });

  const productId = bulkIds[0];
  const productDraft = await admin
    .from("cms_content_drafts")
    .select("lock_version,payload")
    .eq("item_id", productId)
    .single();
  if (productDraft.error) throw productDraft.error;
  const productSubmitted = await editorial(adminActor, {
    action: "submit",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: productDraft.data.lock_version,
    revisionId: null,
    reason: `Submissão produto ${runTag}`,
    publishAt: null,
  });
  await editorial(reviewer, {
    action: "approve",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: productSubmitted.data.revisionId,
    reason: `Aprovação produto ${runTag}`,
    publishAt: null,
  });
  await editorial(adminActor, {
    action: "publish",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: productSubmitted.data.revisionId,
    reason: `Publicação produto ${runTag}`,
    publishAt: null,
  });
  const internalProduct = await publicApi({ type: "detail", contentType: "product", slug: bulkSlugs[0] });
  const internalJson = JSON.stringify(internalProduct.data);
  assert(
    internalProduct.status === 200 &&
      !internalJson.includes(`OEM-INTERNO-${shortTag}`) &&
      !internalJson.includes(`REF-${shortTag}`) &&
      !internalJson.includes(`SKU-${shortTag}`) &&
      !internalJson.includes("fieldVisibility"),
    "Campo interno vazou na API pública",
  );
  const internalSearch = await publicApi({ type: "search", q: `OEM-INTERNO-${shortTag}` });
  assert(
    internalSearch.status === 200 && internalSearch.data.total === 0,
    "Busca encontrou fabricante interno",
    internalSearch.data,
  );
  const internalPageResponse = await fetch(`${siteOrigin}/produtos/${bulkSlugs[0]}?homologacao=${shortTag}`);
  const internalPage = await internalPageResponse.text();
  assert(
    internalPageResponse.status === 200 && !internalPage.includes(`OEM-INTERNO-${shortTag}`),
    "Fabricante interno vazou no HTML/JSON-LD",
  );

  await editorial(adminActor, {
    action: "reopen",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: null,
    reason: `Reabrir produto ${runTag}`,
    publishAt: null,
  });
  const publicPayload = structuredClone(productDraft.data.payload);
  publicPayload.fieldVisibility.manufacturer = "public";
  const savedProduct = await editorial(adminActor, {
    action: "save",
    itemId: productId,
    contentType: null,
    slug: bulkSlugs[0],
    payload: publicPayload,
    expectedLockVersion: productDraft.data.lock_version,
    revisionId: null,
    reason: `Fabricante público ${runTag}`,
    publishAt: null,
  });
  const resubmitted = await editorial(adminActor, {
    action: "submit",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: savedProduct.data.lockVersion,
    revisionId: null,
    reason: `Republicação produto ${runTag}`,
    publishAt: null,
  });
  await editorial(reviewer, {
    action: "approve",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: resubmitted.data.revisionId,
    reason: `Reaprovação produto ${runTag}`,
    publishAt: null,
  });
  await editorial(adminActor, {
    action: "publish",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: resubmitted.data.revisionId,
    reason: `Republicação produto ${runTag}`,
    publishAt: null,
  });
  const publicProduct = await publicApi({ type: "detail", contentType: "product", slug: bulkSlugs[0] });
  assert(
    publicProduct.status === 200 && JSON.stringify(publicProduct.data).includes(`OEM-INTERNO-${shortTag}`),
    "Fabricante marcado como público não chegou ao frontend",
    publicProduct.data,
  );
  record("Visibilidade de campos conectada ao frontend", {
    internalHidden: true,
    searchHidden: true,
    htmlSchemaHidden: true,
    republishedPublic: true,
  });

  await editorial(marketing, {
    action: "archive",
    itemId: postCreated.data.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: null,
    reason: `Retirada blog ${runTag}`,
    publishAt: null,
  });
  await editorial(marketing, {
    action: "archive",
    itemId: activeCampaign.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: null,
    reason: `Retirada campanha ${runTag}`,
    publishAt: null,
  });
  await editorial(adminActor, {
    action: "archive",
    itemId: productId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: null,
    reason: `Retirada produto ${runTag}`,
    publishAt: null,
  });
  const remainingProjection = await admin
    .from("cms_published_projection")
    .select("item_id", { count: "exact", head: true })
    .in("item_id", createdItems);
  if (remainingProjection.error) throw remainingProjection.error;
  assert(
    remainingProjection.count === 0,
    "Fixture permaneceu na projeção pública",
    remainingProjection.count,
  );
  const archivedPage = await fetch(`${siteOrigin}/blog/${blogSlug}?retirada=${shortTag}`);
  assert(archivedPage.status === 404, "Artigo arquivado continuou público", archivedPage.status);
  record("Retirada e projeção pública", { remainingPublishedFixtures: 0, archivedRouteStatus: 404 });

  const formBeforeArchive = await admin
    .from("cms_form_definitions")
    .select("lock_version")
    .eq("id", savedForm.data.formId)
    .single();
  if (formBeforeArchive.error) throw formBeforeArchive.error;
  const archivedForm = await leadCommand(adminActor, {
    action: "archive_form",
    formId: savedForm.data.formId,
    expectedLockVersion: formBeforeArchive.data.lock_version,
    reason: `Retirada controlada ${runTag}`,
  });
  const retiredPublicForm = await publicApi({ type: "form", key: formKey });
  assert(retiredPublicForm.status === 204, "Formulário retirado continuou público", retiredPublicForm);
  const restoredForm = await leadCommand(adminActor, {
    action: "restore_form",
    formId: savedForm.data.formId,
    sourceVersionId: savedForm.data.versionId,
    expectedLockVersion: archivedForm.data.lockVersion,
    reason: `Restauração controlada ${runTag}`,
  });
  const restoredPublicForm = await publicApi({ type: "form", key: formKey });
  assert(
    restoredPublicForm.status === 200 && restoredPublicForm.data.versionId === savedForm.data.versionId,
    "Formulário restaurado não voltou ao consumidor público",
    restoredPublicForm,
  );
  await leadCommand(adminActor, {
    action: "archive_form",
    formId: savedForm.data.formId,
    expectedLockVersion: restoredForm.data.lockVersion,
    reason: `Arquivamento final ${runTag}`,
  });
  const finallyRetiredForm = await publicApi({ type: "form", key: formKey });
  assert(finallyRetiredForm.status === 204, "Formulário sintético não terminou arquivado");
  record("Ciclo público do formulário", {
    archiveStatus: retiredPublicForm.status,
    restoredVersion: restoredPublicForm.data.version,
    finalStatus: finallyRetiredForm.status,
  });

  const audit = await admin
    .from("cms_audit_log")
    .select("action,target_id,correlation_id")
    .gte("occurred_at", new Date(Date.now() - 15 * 60_000).toISOString());
  if (audit.error) throw audit.error;
  const expectedAudit = [
    "cms:form.publish",
    "cms:form.archive",
    "cms:form.restore",
    "cms:content.publish",
    "cms:leads.update",
    "cms:leads.export",
    "cms:leads.anonymize",
    "cms:bulk_import.create",
    "cms:content.reopen",
  ];
  const observed = new Set(audit.data.map((entry) => entry.action));
  assert(
    expectedAudit.every((action) => observed.has(action)),
    "Trilha de auditoria incompleta",
    { expectedAudit, observed: [...observed] },
  );
  record("Auditoria remota", { requiredActions: expectedAudit.length });

  return {
    status: "passed",
    runTag,
    environment: { supabaseProject: "glcqsosxwgmlhzgcsnzv", siteOrigin, productionTouched: false },
    evidence,
    externalDependencies: {
      emailDelivery: "outside_this_canary",
      leadNotificationRecipient: "outside_this_canary",
      dpoApproval: "outside_this_canary_enforced_by_release_gate",
      goLiveApproval: "requires_sha_bound_literal_after_homologation",
    },
  };
}

async function cleanup() {
  const cleanupErrors = [];
  const attempt = async (label, operation) => {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      cleanupErrors.push(new Error(label, { cause: error }));
      return null;
    }
  };
  const now = new Date().toISOString();
  let cleanupItemIds = [...createdItems];
  let cleanupFormIds = [...createdForms];
  if (createdUsers.length) {
    const actorIds = createdUsers.map((actor) => actor.id);
    await attempt("owned_content_inventory", async () => {
      const result = await admin.from("cms_content_items").select("id").in("created_by", actorIds);
      if (result.error) throw result.error;
      cleanupItemIds = [...new Set([...cleanupItemIds, ...(result.data ?? []).map((item) => item.id)])];
    });
    await attempt("owned_form_inventory", async () => {
      const result = await admin.from("cms_form_definitions").select("id").in("created_by", actorIds);
      if (result.error) throw result.error;
      cleanupFormIds = [...new Set([...cleanupFormIds, ...(result.data ?? []).map((form) => form.id)])];
    });
  }
  if (cleanupItemIds.length) {
    let projections = [];
    await attempt("public_projection_inventory", async () => {
      const result = await admin
        .from("cms_published_projection")
        .select("item_id,revision_id")
        .in("item_id", cleanupItemIds);
      if (result.error) throw result.error;
      projections = result.data ?? [];
    });
    if (projections.length)
      await attempt("public_withdrawal_outbox", () =>
        admin.from("cms_publication_outbox").upsert(
          projections.map(({ item_id: itemId, revision_id: revisionId }) => ({
            item_id: itemId,
            revision_id: revisionId,
            event_type: "unpublish",
            correlation_id: uid(),
          })),
          { onConflict: "item_id,revision_id,event_type", ignoreDuplicates: true },
        ),
      );
    await attempt("publication_cleanup", () =>
      admin.from("cms_publications").delete().in("item_id", cleanupItemIds),
    );
    await attempt("projection_cleanup", () =>
      admin.from("cms_published_projection").delete().in("item_id", cleanupItemIds),
    );
    await attempt("route_cleanup", () =>
      admin
        .from("cms_route_rules")
        .update({ active: false })
        .in("item_id", cleanupItemIds)
        .eq("active", true),
    );
    await attempt("content_archive", () =>
      admin
        .from("cms_content_items")
        .update({
          workflow_status: "archived",
          archived_at: now,
          scheduled_for: null,
          deleted_at: null,
          deleted_by: null,
        })
        .in("id", cleanupItemIds)
        .neq("workflow_status", "archived"),
    );
  }
  if (cleanupFormIds.length) {
    await attempt("form_version_retirement", () =>
      admin
        .from("cms_form_versions")
        .update({ status: "retired" })
        .in("form_id", cleanupFormIds)
        .eq("status", "published"),
    );
    await attempt("form_retirement", () =>
      admin
        .from("cms_form_definitions")
        .update({ status: "retired", active_version_id: null })
        .in("id", cleanupFormIds)
        .neq("status", "retired"),
    );
  }
  for (const actor of createdUsers) {
    await attempt(`overrides:${actor.id}`, () =>
      admin.from("cms_feature_flag_overrides").delete().eq("scope_type", "user").eq("scope_key", actor.id),
    );
    await attempt(`scoped_roles:${actor.id}`, () =>
      admin
        .from("cms_scoped_role_assignments")
        .update({
          revoked_at: now,
          revoked_by: actor.id,
          revocation_reason: "QA synthetic phase7 cleanup",
        })
        .eq("user_id", actor.id)
        .is("revoked_at", null),
    );
    await attempt(`legacy_roles:${actor.id}`, () =>
      admin.from("cms_user_roles").delete().eq("user_id", actor.id),
    );
    await attempt(`rdo_access:${actor.id}`, () =>
      admin
        .from("rdo_user_access")
        .update({
          active: false,
          suspended_at: now,
          suspended_by: actor.id,
          updated_at: now,
        })
        .eq("user_id", actor.id)
        .eq("active", true),
    );
    await attempt(`profile:${actor.id}`, () =>
      admin
        .from("cms_profiles")
        .update({
          status: "suspended",
          suspended_at: now,
          suspended_by: actor.id,
          sessions_valid_after: now,
        })
        .eq("user_id", actor.id),
    );
    await attempt(`sessions:${actor.id}`, () =>
      managementQuery(`delete from auth.sessions where user_id = '${actor.id}'::uuid`),
    );
    await attempt(`credentials:${actor.id}`, async () => {
      const revoked = await admin.auth.admin.updateUserById(actor.id, {
        password: `R!${crypto.randomBytes(32).toString("base64url")}8z`,
        ban_duration: "876000h",
      });
      if (revoked.error) throw revoked.error;
    });
    await attempt(`lease:${actor.id}`, () => completeQaActorLease(leaseRpc, actor.identity));
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      cleanupErrors,
      "Encerramento da homologação sintética incompleto; o watchdog automático permanece ativo.",
    );
  const audit = createdUsers.length
    ? await admin
        .from("cms_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("target_type", "qa_fixture")
        .eq("target_id", runTag)
        .in(
          "actor_id",
          createdUsers.map((actor) => actor.id),
        )
    : { count: 0, error: null };
  if (audit.error) throw audit.error;
  assert(
    (audit.count ?? 0) >= createdUsers.length * 2,
    "Auditoria imutável das leases sintéticas não foi preservada",
    audit.count,
  );
  return {
    actorLeasesCleaned: createdUsers.length,
    retainedLeaseAuditEvents: audit.count,
    watchdogFallbackOnCancellation: true,
  };
}

let report;
try {
  report = await run();
} catch (error) {
  report = {
    status: "failed",
    runTag,
    error: error instanceof Error ? error.message : String(error),
    evidence,
  };
  process.exitCode = 1;
} finally {
  const cleanupEvidence = await cleanup();
  report = { ...report, cleanup: cleanupEvidence };
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
