export const AI_SAFETY_POLICY_VERSION = "f015-v1" as const;
export const AI_LOW_CONFIDENCE_THRESHOLD = 0.8;

export type AiRedactionCategory = "email" | "phone" | "cpf" | "credential" | "token" | "private_key";

export type AiRedactionResult = {
  value: string;
  categories: AiRedactionCategory[];
  blocked: boolean;
  risk: "safe" | "redacted" | "blocked";
};

const REDACTIONS: ReadonlyArray<{
  category: AiRedactionCategory;
  replacement: string;
  pattern: RegExp;
  blocks: boolean;
}> = [
  {
    category: "private_key",
    replacement: "[CHAVE_PRIVADA_REMOVIDA]",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
    blocks: true,
  },
  {
    category: "token",
    replacement: "[TOKEN_REMOVIDO]",
    pattern: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g,
    blocks: true,
  },
  {
    category: "credential",
    replacement: "[CREDENCIAL_REMOVIDA]",
    pattern: /\b(?:bearer|api[_ -]?key|secret|password|senha)\s*[:=]\s*[^\s,;]{8,}/gi,
    blocks: true,
  },
  {
    category: "email",
    replacement: "[EMAIL_REMOVIDO]",
    pattern: /\b[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi,
    blocks: false,
  },
  {
    category: "cpf",
    replacement: "[CPF_REMOVIDO]",
    pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    blocks: false,
  },
  {
    category: "phone",
    replacement: "[TELEFONE_REMOVIDO]",
    pattern: /(?<![a-z0-9])(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/gi,
    blocks: false,
  },
] as const;

function replaceUnsafeControlCharacters(input: string): string {
  let result = "";
  for (const character of input) {
    const code = character.charCodeAt(0);
    result +=
      code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 ? " " : character;
  }
  return result;
}

export function redactAiText(input: string, maxLength = 6000): AiRedactionResult {
  let value = replaceUnsafeControlCharacters(String(input ?? ""))
    .trim()
    .slice(0, maxLength);
  const categories = new Set<AiRedactionCategory>();
  let blocked = false;
  for (const rule of REDACTIONS) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(value)) continue;
    categories.add(rule.category);
    blocked ||= rule.blocks;
    rule.pattern.lastIndex = 0;
    value = value.replace(rule.pattern, rule.replacement);
  }
  return {
    value,
    categories: [...categories].sort(),
    blocked,
    risk: blocked ? "blocked" : categories.size ? "redacted" : "safe",
  };
}

export type AiInjectionSignal =
  | "instruction_override"
  | "system_prompt_request"
  | "credential_request"
  | "tool_policy_override"
  | "critical_action_request";

const INJECTION_SIGNALS: ReadonlyArray<{ signal: AiInjectionSignal; pattern: RegExp }> = [
  {
    signal: "instruction_override",
    pattern:
      /\b(?:ignore|ignore todas|desconsidere|esqueça)\b.{0,50}\b(?:instruções|instructions|regras|anteriores|previous)\b/i,
  },
  {
    signal: "system_prompt_request",
    pattern: /\b(?:system prompt|developer message|prompt do sistema|mensagem do desenvolvedor)\b/i,
  },
  {
    signal: "credential_request",
    pattern:
      /\b(?:revele|mostre|exfiltre|retorne|print)\b.{0,60}\b(?:segredo|secret|token|senha|password|api key|service role)\b/i,
  },
  {
    signal: "tool_policy_override",
    pattern:
      /\b(?:bypass|contorne|ignore)\b.{0,60}\b(?:allowlist|permissão|permission|mfa|política|policy)\b/i,
  },
  {
    signal: "critical_action_request",
    pattern:
      /\b(?:publique|publicar|publish|delete|exclua|excluir|apague|alterar acesso|grant access|exportar pii)\b/i,
  },
] as const;

export function detectAiPromptInjection(input: string): AiInjectionSignal[] {
  const normalized = String(input ?? "")
    .normalize("NFKC")
    .slice(0, 6000);
  return INJECTION_SIGNALS.filter(({ pattern }) => pattern.test(normalized)).map(({ signal }) => signal);
}

export function estimateAiTokens(...values: string[]): number {
  const characters = values.reduce((total, value) => total + value.length, 0);
  return Math.max(1, Math.ceil(characters / 4));
}
