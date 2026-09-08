export const DEFAULT_OPERATOR_ERROR_MESSAGE = "Não foi possível concluir a operação. Tente novamente.";

type OperatorErrorMessageOptions = {
  fallback?: string;
  source?: "local" | "remote";
  status?: number;
};

const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const delimitedHashPattern = /(?:^|[^0-9a-f])[0-9a-f]{40,128}(?![0-9a-f])/i;
const jsonPropertyPattern = /["'][a-z0-9_.-]+["']\s*:/i;
const technicalCodePattern =
  /\b(?:CMS_[A-Z0-9_]+|PGRST\d+|SQLSTATE|EV2(?:\.\d+|_[A-Z0-9_]+))\b|\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/;
const internalFieldPattern =
  /\b(?:correlation|command|schema|lock|expected|current|revision|target|diff|actor|item|tenant|site|request|trace|job|user|profile|publication|document|media|product|lead|form|campaign)[_-]?(?:id|ref|version|context)\b/i;
const storagePattern = /(?:\/storage\/v\d+|storage:\/\/|\b(?:storage|bucket|blob)\b)/i;
const databasePattern =
  /\b(?:postgres(?:ql)?|sqlstate|pgrst\d*|duplicate key|foreign key|row[- ]level security|rls|constraint|database error)\b|\brelation\s+["']|\bcolumn\s+["']/i;
const sqlPattern =
  /\b(?:select\s+.+\s+from|insert\s+into|update\s+\S+\s+set|delete\s+from|alter\s+table|create\s+(?:table|policy|function)|drop\s+(?:table|policy|function))\b/i;
const schemaIssuePattern =
  /\b(?:ZodError|invalid_type|unrecognized_keys|too_small|too_big)\b|["'](?:code|path|expected|received)["']\s*:/i;
const secretPattern =
  /\b(?:bearer\s+\S+|service[_-]?role|anon[_-]?key|api[_-]?key|client[_-]?secret)\b|\beyJ[a-z0-9_-]{20,}/i;
const stackPattern = /(?:^|\s)at\s+\S+(?:\s+\([^)]+:\d+:\d+\)|:\d+:\d+)/;
const platformErrorPattern =
  /\b(?:ENOENT|EACCES|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|NetworkError)\b|failed to fetch|load failed/i;
const fileParserPattern =
  /\b(?:ExcelJS|workbook|worksheet|central directory|invalid (?:zip|archive)|parse error|unexpected token|ArrayBuffer)\b|xl\/worksheets|\bXML\b/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function messageFrom(value: unknown): string {
  if (value instanceof Error) return value.message.trim();
  return typeof value === "string" ? value.trim() : "";
}

export function isOperatorSafeMessage(value: unknown): boolean {
  const message = messageFrom(value);
  const hasControlCharacter = [...message].some((character) => character.charCodeAt(0) < 32);
  if (!message || message.length > 240 || hasControlCharacter) {
    return false;
  }
  if (
    message.startsWith("[") ||
    message.startsWith("{") ||
    jsonPropertyPattern.test(message) ||
    /<\/?[a-z][^>]*>/i.test(message)
  ) {
    return false;
  }
  return ![
    uuidPattern,
    delimitedHashPattern,
    technicalCodePattern,
    internalFieldPattern,
    storagePattern,
    databasePattern,
    sqlPattern,
    schemaIssuePattern,
    secretPattern,
    stackPattern,
    platformErrorPattern,
    fileParserPattern,
    emailPattern,
  ].some((pattern) => pattern.test(message));
}

function messageForStatus(status: number | undefined, fallback: string): string {
  if (status === 0) return "Não foi possível conectar ao CMS. Verifique sua conexão e tente novamente.";
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 403) return "Você não tem permissão para concluir esta operação.";
  if (status === 404) return "O conteúdo solicitado não está mais disponível.";
  if (status === 409 || status === 412)
    return "O conteúdo foi alterado por outra pessoa. Recarregue a página e tente novamente.";
  if (status === 413) return "O arquivo selecionado excede o tamanho permitido.";
  if (status === 429) return "Há muitas solicitações em andamento. Aguarde um instante e tente novamente.";
  if (status === 400 || status === 422) return "Revise os dados informados e tente novamente.";
  if (status !== undefined && status >= 500)
    return "O CMS está temporariamente indisponível. Tente novamente em instantes.";
  return fallback;
}

export function operatorErrorMessage(error: unknown, options: OperatorErrorMessageOptions = {}): string {
  const requestedFallback = options.fallback ?? DEFAULT_OPERATOR_ERROR_MESSAGE;
  const fallback = isOperatorSafeMessage(requestedFallback)
    ? requestedFallback
    : DEFAULT_OPERATOR_ERROR_MESSAGE;

  // Responses from a remote boundary are untrusted. Status-based copy is deliberately used
  // instead of trying to recognize every possible backend, database or provider message.
  if (options.source === "remote") return messageForStatus(options.status, fallback);

  const message = messageFrom(error);
  return isOperatorSafeMessage(message) ? message : fallback;
}
