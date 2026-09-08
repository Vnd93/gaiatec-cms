type AuthUserSummary = { id: string; email?: string | null };

type AuthUserPage = {
  data: { users: AuthUserSummary[] } | null;
  error: unknown;
};

export const AUTH_USER_LOOKUP_PAGE_SIZE = 200;
export const AUTH_USER_LOOKUP_MAX_PAGES = 50;

export async function findExistingAuthUserByEmail(
  email: string,
  listPage: (page: number, perPage: number) => Promise<AuthUserPage>,
): Promise<AuthUserSummary | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("CMS_AUTH_EMAIL_INVALID");

  for (let page = 1; page <= AUTH_USER_LOOKUP_MAX_PAGES; page += 1) {
    const result = await listPage(page, AUTH_USER_LOOKUP_PAGE_SIZE);
    if (result.error || !result.data) throw new Error("CMS_AUTH_DIRECTORY_UNAVAILABLE");
    const match = result.data.users.find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === normalized,
    );
    if (match) return match;
    if (result.data.users.length < AUTH_USER_LOOKUP_PAGE_SIZE) return null;
  }

  throw new Error("CMS_AUTH_DIRECTORY_LIMIT_EXCEEDED");
}
