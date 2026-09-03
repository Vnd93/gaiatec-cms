import { createHash } from "node:crypto";

export const TOOL_CATALOG = Object.freeze({
  "content.search": { mode: "read", permission: "cms:ai.read", mutatesCms: false },
  "content.read": { mode: "read", permission: "cms:ai.read", mutatesCms: false },
  "source.inspect": { mode: "read", permission: "cms:ai.read", mutatesCms: false },
  "draft.propose_patch": { mode: "draft", permission: "cms:ai.draft", mutatesCms: false },
});

const ATTACKS = [
  /\b(?:ignore|desconsidere|esqueça)\b.{0,50}\b(?:instruções|instructions|regras|anteriores|previous)\b/i,
  /\b(?:system prompt|developer message|prompt do sistema|mensagem do desenvolvedor)\b/i,
  /\b(?:revele|mostre|exfiltre|retorne|print)\b.{0,60}\b(?:segredo|secret|token|senha|password|api key|service role)\b/i,
  /\b(?:bypass|contorne|ignore)\b.{0,60}\b(?:allowlist|permissão|permission|mfa|política|policy)\b/i,
  /\b(?:publique|publicar|publish|delete|exclua|excluir|apague|alterar acesso|grant access|exportar pii)\b/i,
];

export function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function isBlocked(value) {
  return ATTACKS.some((pattern) => pattern.test(String(value).normalize("NFKC")));
}

export function redact(value) {
  return String(value)
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
      "[CHAVE_PRIVADA_REMOVIDA]",
    )
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, "[TOKEN_REMOVIDO]")
    .replace(/\b[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, "[EMAIL_REMOVIDO]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REMOVIDO]")
    .replace(/(?<![a-z0-9])(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/gi, "[TELEFONE_REMOVIDO]")
    .replace(
      /\b(?:bearer|api[_ -]?key|secret|password|senha)\s*[:=]\s*[^\s,;]{8,}/gi,
      "[CREDENCIAL_REMOVIDA]",
    );
}

function wordSet(value) {
  return new Set(
    String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4),
  );
}

function sourceConfidence(prompt, excerpt, kind) {
  if (kind === "locate") return 1;
  const requested = wordSet(prompt);
  const available = wordSet(excerpt);
  if (!requested.size) return 0.8;
  const overlap = [...requested].filter((word) => available.has(word)).length / requested.size;
  return Math.round(Math.min(0.98, 0.62 + overlap * 0.36) * 1000) / 1000;
}

export function proposalFromSyntheticSource(input) {
  const sentence = (input.excerpt.trim().match(/^.*?[.!?](?:\s|$)/)?.[0] ?? input.excerpt)
    .trim()
    .slice(0, 900);
  const confidence = sourceConfidence(input.prompt, input.excerpt, input.kind);
  return {
    value: sentence,
    source: {
      reference: input.reference,
      title: input.title,
      version: input.version,
      locator: input.locator,
      page: input.page ?? null,
      excerpt: input.excerpt.slice(0, 1000),
    },
    confidence,
    status: confidence < 0.8 ? "pending" : "supported",
    applied: false,
    published: false,
    costMicros: 0,
  };
}

export function toolAllowed(toolKey, permissions, mode) {
  const tool = TOOL_CATALOG[toolKey];
  return Boolean(
    tool &&
    tool.mutatesCms === false &&
    permissions.includes(tool.permission) &&
    (mode === "draft" || tool.mode === "read"),
  );
}

export function decisionAllowed(
  { actorId, proposerId, hasPendingFields, decision },
  permissions,
  aal = "aal2",
) {
  return Boolean(
    aal === "aal2" &&
    permissions.includes("cms:ai.review") &&
    actorId !== proposerId &&
    ["accepted", "rejected", "edited"].includes(decision) &&
    !(decision === "accepted" && hasPendingFields),
  );
}
