import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, escapeHtml, isAllowedOrigin, isAllowedTurnstileVerification, json, readJsonLimited, sha256 } from "../_shared/security.ts";
import { verifyTurnstileSiteverify } from "../_shared/turnstile-siteverify-idempotency.ts";

const TURNSTILE_ACTION = "lead_capture";

const CONSENT_VERSION = "privacy-contact-v1-2026-08";
const CONSENT_TEXT = "Autorizo o tratamento dos dados enviados para responder a esta solicitação e declaro ter lido a Política de Privacidade.";
const PRIVACY_URL = "https://gaiatecsistemas.com.br/politica-de-privacidade";
const ENQUIRY_TYPES = new Set(["Orçamento", "Suporte Técnico", "Calibração", "Instrumentação", "Automação", "Proteção Catódica", "Outros", "Newsletter"]);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function verifyTurnstile(token: string, ip: string, commercialIdempotencyKey: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return "unavailable" as const;
  const expectedAction = Deno.env.get("TURNSTILE_EXPECTED_ACTION") || TURNSTILE_ACTION;
  return verifyTurnstileSiteverify({
    operation: "submit-contact",
    commercialKey: commercialIdempotencyKey,
    token,
    secret,
    remoteIp: ip,
    isAccepted: (result) =>
      isAllowedTurnstileVerification(result, secret, expectedAction, commercialIdempotencyKey),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return json(req, { error: "Serviço temporariamente indisponível." }, 503);
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 16_384);
  } catch (error) {
    return json(req, { error: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "Corpo excede o limite permitido." : "Corpo inválido." }, error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400);
  }

  // Honeypot: resposta genérica para não ensinar o bot.
  if (cleanText(body.website, 200)) return json(req, { success: true });

  const idempotencyKey = cleanText(body.idempotencyKey ?? req.headers.get("X-Idempotency-Key"), 40);
  const firstName = cleanText(body.firstName, 80);
  const lastName = cleanText(body.lastName, 100);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 40);
  const company = cleanText(body.company, 160);
  const enquiryType = cleanText(body.enquiryType, 80);
  const message = cleanText(body.message, 4_000);
  const originPath = cleanText(body.origem, 500);
  if (!isUuid(idempotencyKey)) return json(req, { error: "Identificador da solicitação inválido." }, 400);
  if (!firstName || !isEmail(email) || !message) return json(req, { error: "Preencha nome, e-mail e mensagem corretamente." }, 400);
  if (body.consent !== true) return json(req, { error: "É necessário aceitar a Política de Privacidade." }, 400);
  if (enquiryType && !ENQUIRY_TYPES.has(enquiryType)) return json(req, { error: "Tipo de solicitação inválido." }, 400);

  const ip = clientAddress(req);
  try {
    const ipAllowed = await consumeRateLimit(admin, req, "contact_ip", ip, 8, 900);
    const emailAllowed = await consumeRateLimit(admin, req, "contact_email", email, 4, 3600);
    if (!ipAllowed || !emailAllowed) return json(req, { error: "Limite de envios atingido. Tente novamente mais tarde." }, 429, { "Retry-After": "900" });
  } catch {
    return json(req, { error: "Serviço de proteção temporariamente indisponível." }, 503);
  }

  const linkCount = (message.match(/https?:\/\//gi) ?? []).length;
  const abuseScore = (linkCount > 2 ? 2 : 0) + (!req.headers.get("User-Agent") ? 1 : 0) + (message.length < 8 ? 1 : 0);
  const requiresCaptcha = Deno.env.get("CONTACT_CAPTCHA_ALWAYS") === "true" || abuseScore >= 2;
  if (requiresCaptcha) {
    const rawCaptchaToken = typeof body.captchaToken === "string" ? body.captchaToken : "";
    if (rawCaptchaToken.length > 2_048) return json(req, { error: "A verificação de segurança falhou. Tente novamente.", captchaRequired: true }, 403);
    const captchaToken = cleanText(rawCaptchaToken, 2_048);
    if (!captchaToken) return json(req, { error: "Confirme que você é uma pessoa para continuar.", captchaRequired: true }, 403);
    const verification = await verifyTurnstile(captchaToken, ip, idempotencyKey);
    if (verification === "unavailable") return json(req, { error: "Serviço de proteção temporariamente indisponível." }, 503);
    if (verification !== "accepted") return json(req, { error: "A verificação de segurança falhou. Tente novamente.", captchaRequired: true }, 403);
  }

  const evidenceSalt = Deno.env.get("EVIDENCE_SALT");
  if (!evidenceSalt) return json(req, { error: "Serviço de evidência não configurado." }, 503);
  const technicalEvidence = {
    ipHash: await sha256(`${evidenceSalt}:${ip}`),
    userAgentHash: await sha256(req.headers.get("User-Agent") ?? "unknown"),
    origin: req.headers.get("Origin") ?? null,
  };

  const submissionPayload = {
    idempotency_key: idempotencyKey,
    first_name: firstName,
    last_name: lastName || null,
    email,
    phone: phone || null,
    company: company || null,
    enquiry_type: enquiryType || null,
    message,
    origin_path: originPath || null,
    consent_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    privacy_policy_url: PRIVACY_URL,
    abuse_score: abuseScore,
    technical_evidence: technicalEvidence,
  };

  let submission: { id: string } | null = null;
  const inserted = await admin.from("contact_submissions").insert(submissionPayload).select("id").single();
  if (inserted.error?.code === "23505") {
    const existing = await admin.from("contact_submissions").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.data) return json(req, { success: true, id: existing.data.id, duplicate: true });
  }
  if (inserted.error || !inserted.data) return json(req, { error: "Não foi possível registrar o contato. Tente novamente." }, 500);
  submission = inserted.data;

  const outbox = await admin.from("contact_notification_outbox").insert({ submission_id: submission.id, status: "sending", attempt_count: 1 });
  if (outbox.error) return json(req, { success: true, id: submission.id, notificationPending: true }, 202);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notifyEmail = Deno.env.get("CONTACT_NOTIFY_EMAIL");
  const fromEmail = Deno.env.get("CONTACT_FROM_EMAIL");
  if (!resendKey || !notifyEmail || !fromEmail) {
    await admin.from("contact_notification_outbox").update({ status: "failed", last_error: "email_not_configured" }).eq("submission_id", submission.id);
    return json(req, { success: true, id: submission.id, notificationPending: true }, 202);
  }

  const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`;
  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        from: fromEmail,
        to: [notifyEmail],
        reply_to: email,
        subject: `Novo contato no site — ${enquiryType || "Geral"} (${fullName})`,
        html: `<h1>Novo contato pelo site</h1><p><strong>ID:</strong> ${escapeHtml(submission.id)}</p><p><strong>Nome:</strong> ${escapeHtml(fullName)}</p><p><strong>E-mail:</strong> ${escapeHtml(email)}</p><p><strong>Telefone:</strong> ${escapeHtml(phone || "—")}</p><p><strong>Empresa:</strong> ${escapeHtml(company || "—")}</p><p><strong>Tipo:</strong> ${escapeHtml(enquiryType || "Não informado")}</p><p><strong>Mensagem:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p><strong>Consentimento:</strong> ${escapeHtml(CONSENT_VERSION)} em ${escapeHtml(PRIVACY_URL)}</p>`,
      }),
    });
    if (!emailResponse.ok) throw new Error(`resend_${emailResponse.status}`);
    await admin.from("contact_notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("submission_id", submission.id);
  } catch (error) {
    await admin.from("contact_notification_outbox").update({ status: "failed", last_error: error instanceof Error ? error.message.slice(0, 500) : "send_failed" }).eq("submission_id", submission.id);
    return json(req, { success: true, id: submission.id, notificationPending: true }, 202);
  }

  return json(req, { success: true, id: submission.id });
});
