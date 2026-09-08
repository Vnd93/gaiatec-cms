const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function exactCorporateOperatorEmail(operatorEmail, loginEmail, allowedDomain) {
  const operator = String(operatorEmail ?? "")
    .trim()
    .toLowerCase();
  const login = String(loginEmail ?? "")
    .trim()
    .toLowerCase();
  const domain = String(allowedDomain ?? "")
    .trim()
    .toLowerCase();
  if (
    !operator ||
    operator.length > 320 ||
    !EMAIL_PATTERN.test(operator) ||
    operator !== login ||
    !DOMAIN_PATTERN.test(domain) ||
    !operator.endsWith(`@${domain}`)
  ) {
    throw new Error("CMS_PRODUCTION_OPERATOR_IDENTITY_SECRET_INVALID");
  }
  return operator;
}
