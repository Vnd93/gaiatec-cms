// The staging canary captured both its operation and cleanup errors and then reported neither, so a
// failed run could only be diagnosed by running it again. These helpers put the failure identity into
// the report, and only the identity: the project's error codes carry method, path and HTTP status and
// never a payload, a query string, a credential or a personal identifier. Anything that does not look
// like one of those codes is reduced to the error class name rather than echoed.
const CODED_FAILURE = /^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9_./-]{1,120}){0,4}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

export function canaryFailureIdentity(error) {
  if (error === undefined || error === null) return null;
  const message = typeof error?.message === "string" ? error.message : "";
  if (CODED_FAILURE.test(message)) return message;
  const name = typeof error?.name === "string" && SAFE_NAME.test(error.name) ? error.name : "Error";
  return `UNCODED_FAILURE:${name}`;
}

// A canary that stops early leaves checks unexecuted, which is not the same as a canary whose checks
// ran and disagreed. The distinction has to survive into the report, otherwise an early abort reads as
// a contract violation.
export function canaryFailureStage({ operationError, cleanupError }) {
  if (operationError) return cleanupError ? "operation-and-cleanup" : "operation";
  if (cleanupError) return "cleanup";
  return null;
}

// A rejected sign-in or MFA verification only says what happened through the auth service's own
// status and error slug. Both are bounded identifiers, never free text and never a credential, so
// they are safe to carry into a coded failure. Anything unexpected collapses to "unknown".
const SAFE_SLUG = /^[a-z][a-z0-9_]{0,39}$/;
// A credential can be shaped like a slug, so slug shape alone is not enough for something that lands
// in a published evidence artifact. Anything carrying a known secret prefix is refused outright.
const CREDENTIAL_LIKE = /^(?:sbp?|sb|eyj|bearer|token|secret|apikey|key|password|pat)_/i;

function safeSlug(value) {
  return typeof value === "string" && SAFE_SLUG.test(value) && !CREDENTIAL_LIKE.test(value);
}

export function authFailureIdentity(error) {
  const status = Number(error?.status);
  const code = safeSlug(error?.code) ? error.code : "unknown";
  const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : "0";
  return `${httpStatus}:${code}`;
}
