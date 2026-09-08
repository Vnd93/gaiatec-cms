const PUBLIC_ADMIN_ROUTES = new Set([
  "/admin/login",
  "/admin/recuperar-senha",
  "/admin/definir-senha",
  "/admin/mfa",
]);

export function safeAdminDestination(value: unknown): string {
  if (typeof value !== "string") return "/admin";
  const candidate = value.trim();
  if (!/^\/admin(?:\/|$)/.test(candidate) || candidate.includes("\\") || candidate.includes("//"))
    return "/admin";
  const path = candidate.split(/[?#]/, 1)[0];
  return PUBLIC_ADMIN_ROUTES.has(path) ? "/admin" : candidate;
}
