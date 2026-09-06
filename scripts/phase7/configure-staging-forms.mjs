import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.GAIATEC_SUPABASE_URL;
const anonKey = process.env.GAIATEC_SUPABASE_ANON_KEY;
const serviceKey = process.env.GAIATEC_SUPABASE_SERVICE_ROLE_KEY;
const stagingProject = "glcqsosxwgmlhzgcsnzv";
const targetEnvironment = process.env.GAIATEC_CMS_TARGET_ENVIRONMENT ?? "staging";
const targetProject = process.env.GAIATEC_SUPABASE_PROJECT_REF ?? stagingProject;
const productionCandidate = process.env.GAIATEC_PRODUCTION_CANDIDATE_SHA ?? "";
const siteOrigin =
  targetEnvironment === "production"
    ? "https://gaiatecsistemas.com.br"
    : "https://gaiatec-cms-staging.pages.dev";

if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Credenciais seguras do CMS ausentes.");
if (!new Set(["staging", "production"]).has(targetEnvironment))
  throw new Error("Ambiente de configuração de formulários inválido.");
if (new URL(supabaseUrl).hostname !== `${targetProject}.supabase.co`)
  throw new Error("O projeto informado não corresponde à URL Supabase.");
if (targetEnvironment === "staging" && targetProject !== stagingProject)
  throw new Error("A configuração de staging aceita somente o projeto homologado.");
if (
  targetEnvironment === "production" &&
  (targetProject === stagingProject ||
    !/^[a-f0-9]{40}$/.test(productionCandidate) ||
    process.env.GAIATEC_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${productionCandidate}`)
)
  throw new Error("Configuração de produção recusada sem projeto isolado, SHA completo e autorização exata.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runTag = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const actor = {
  id: "",
  email: `cms-g12-formularios-${targetEnvironment}-${runTag}@example.invalid`,
  password: `T!${crypto.randomBytes(24).toString("base64url")}9a`,
  client: null,
  session: null,
};

const uid = () => crypto.randomUUID();
const field = (key, label, type, order, options = {}) => ({
  id: uid(),
  key,
  label,
  type,
  required: options.required ?? false,
  ...(options.maxLength ? { maxLength: options.maxLength } : {}),
  options: options.options ?? [],
  personalData: options.personalData ?? false,
  order,
});

const forms = [
  {
    key: "contato-principal",
    title: "Contato principal",
    purpose: "Receber solicitações comerciais, técnicas e de suporte enviadas pelo site.",
    fields: [
      field("nome", "Nome", "text", 0, { required: true, maxLength: 80, personalData: true }),
      field("sobrenome", "Sobrenome", "text", 1, { maxLength: 100, personalData: true }),
      field("email", "E-mail", "email", 2, {
        required: true,
        maxLength: 254,
        personalData: true,
      }),
      field("telefone", "Telefone ou WhatsApp", "tel", 3, {
        maxLength: 40,
        personalData: true,
      }),
      field("empresa", "Empresa", "text", 4, { maxLength: 160 }),
      field("tipo-solicitacao", "Tipo de solicitação", "select", 5, {
        options: [
          "Orçamento",
          "Informações técnicas",
          "Suporte",
          "Serviços",
          "Parcerias",
          "Trabalhe conosco",
          "Outros",
        ],
      }),
      field("mensagem", "Mensagem", "textarea", 6, {
        required: true,
        maxLength: 4000,
        personalData: true,
      }),
    ],
    consentText:
      "Autorizo a GAIATEC SISTEMAS a utilizar meus dados para responder esta solicitação, conforme a",
    consentVersion: targetEnvironment === "production" ? "production-2026-09-06-v1" : "staging-2026-08-30-v1",
    slaMinutes: 240,
    retentionDays: 365,
    submitLabel: "Enviar solicitação",
    successMessage: "Recebemos sua solicitação e nossa equipe entrará em contato.",
  },
  {
    key: "newsletter",
    title: "Newsletter",
    purpose: "Receber inscrições voluntárias para comunicações e conteúdos técnicos.",
    fields: [
      field("email", "E-mail", "email", 0, {
        required: true,
        maxLength: 254,
        personalData: true,
      }),
    ],
    consentText:
      "Autorizo o envio de novidades, conteúdos técnicos e comunicações da GAIATEC SISTEMAS, conforme a",
    consentVersion: targetEnvironment === "production" ? "production-2026-09-06-v1" : "staging-2026-08-30-v1",
    slaMinutes: 1440,
    retentionDays: 730,
    submitLabel: "Inscrever",
    successMessage: "Inscrição recebida com sucesso.",
  },
];

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
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
  return ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function invoke(functionName, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${actor.session.access_token}`,
      Origin: siteOrigin,
      "Content-Type": "application/json",
      "X-Idempotency-Key": uid(),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${functionName} retornou ${response.status}: ${data.error ?? "falha"}`);
  return data;
}

async function createTemporaryActor() {
  const created = await admin.auth.admin.createUser({
    email: actor.email,
    password: actor.password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  actor.id = created.data.user.id;
  const profile = await admin.from("cms_profiles").insert({
    user_id: actor.id,
    display_name: `Configuração governada ${runTag}`,
    display_email: actor.email,
    status: "active",
  });
  if (profile.error) throw profile.error;
  const role = await admin.from("cms_user_roles").insert({
    user_id: actor.id,
    role_key: "super_admin",
  });
  if (role.error) throw role.error;
  actor.client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await actor.client.auth.signInWithPassword({
    email: actor.email,
    password: actor.password,
  });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error("Login temporário falhou.");
  actor.session = signed.data.session;
}

async function elevateWithMfa() {
  const enrolled = await actor.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `config-${targetEnvironment}-${runTag}`,
  });
  if (enrolled.error || !enrolled.data?.id || !enrolled.data?.totp?.secret)
    throw enrolled.error ?? new Error("MFA temporário não foi matriculado.");
  for (const offset of [0, -1, 1]) {
    const verified = await actor.client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret, offset),
    });
    if (!verified.error && verified.data?.access_token) {
      actor.session = {
        ...actor.session,
        ...verified.data,
        expires_at: Math.round(Date.now() / 1000) + verified.data.expires_in,
      };
      break;
    }
  }
  if (decodeJwt(actor.session.access_token).aal !== "aal2")
    throw new Error("A sessão temporária não atingiu AAL2.");
  await invoke("cms-session", { action: "mfa" });
}

async function configureForm(configuration) {
  const current = await admin
    .from("cms_form_definitions")
    .select("id")
    .eq("form_key", configuration.key)
    .maybeSingle();
  if (current.error) throw current.error;
  const saved = await invoke("cms-leads", {
    action: "save_form",
    formId: current.data?.id ?? null,
    formKey: configuration.key,
    title: configuration.title,
    purpose: configuration.purpose,
    definition: {
      fields: configuration.fields,
      successMessage: configuration.successMessage,
      submitLabel: configuration.submitLabel,
    },
    consentText: configuration.consentText,
    consentVersion: configuration.consentVersion,
    privacyPath: "/politica-de-privacidade",
    slaMinutes: configuration.slaMinutes,
    retentionDays: configuration.retentionDays,
    reason:
      targetEnvironment === "production"
        ? `Configuração inicial autorizada para produção no G12 ${productionCandidate}`
        : "Configuração inicial autorizada para homologação em staging",
  });
  const published = await invoke("cms-leads", {
    action: "publish_form",
    formId: saved.formId,
    versionId: saved.versionId,
  });
  const response = await fetch(
    `${supabaseUrl}/functions/v1/cms-public?${new URLSearchParams({ type: "form", key: configuration.key })}`,
    { headers: { apikey: anonKey } },
  );
  const publicForm = await response.json().catch(() => ({}));
  if (!response.ok || publicForm.versionId !== saved.versionId)
    throw new Error(`O formulário ${configuration.key} não chegou à API pública.`);
  return {
    key: configuration.key,
    formId: saved.formId,
    versionId: saved.versionId,
    version: saved.version,
    saveCorrelationId: saved.correlationId,
    publishCorrelationId: published.correlationId,
    publicFields: publicForm.fields.map((item) => item.key),
  };
}

async function cleanupActor() {
  if (!actor.id) return;
  const now = new Date().toISOString();
  await admin
    .from("cms_profiles")
    .update({ status: "suspended", suspended_at: now, sessions_valid_after: now })
    .eq("user_id", actor.id);
  await admin.auth.admin.updateUserById(actor.id, {
    password: `R!${crypto.randomBytes(32).toString("base64url")}8z`,
    ban_duration: "876000h",
  });
}

let report;
try {
  await createTemporaryActor();
  await elevateWithMfa();
  const configured = [];
  for (const configuration of forms) configured.push(await configureForm(configuration));
  report = {
    status: "passed",
    environment: targetEnvironment,
    productionTouched: targetEnvironment === "production",
    candidateSha: productionCandidate || null,
    configured,
    legalApproval: targetEnvironment === "production" ? "approved_dpo_marcelo_diaz" : "pending_dpo",
  };
} catch (error) {
  report = {
    status: "failed",
    environment: targetEnvironment,
    productionTouched: targetEnvironment === "production",
    candidateSha: productionCandidate || null,
    error: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
} finally {
  await cleanupActor();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
