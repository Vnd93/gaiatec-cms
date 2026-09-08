export type AuthDirectoryUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
};

type AuthDirectoryClient = {
  auth: {
    admin: {
      listUsers(options: { page: number; perPage: number }): Promise<{
        data: {
          users?: AuthDirectoryUser[];
          nextPage?: number | null;
          lastPage?: number | null;
          total?: number | null;
        } | null;
        error: unknown;
      }>;
    };
  };
};

async function walkAuthDirectory(
  admin: AuthDirectoryClient,
  pageSize = 1_000,
): Promise<{ users: AuthDirectoryUser[]; error: unknown }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000)
    throw new Error("AUTH_DIRECTORY_PAGE_SIZE_INVALID");
  const users: AuthDirectoryUser[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) return { users: [], error };
    const batch = Array.isArray(data?.users) ? data.users : [];
    let additions = 0;
    for (const user of batch) {
      if (!user?.id || seen.has(user.id)) continue;
      seen.add(user.id);
      users.push(user);
      additions += 1;
    }
    if (batch.length === 0) return { users, error: null };
    if (additions === 0) throw new Error("AUTH_DIRECTORY_PAGINATION_STALLED");
    // Não use lastPage/nextPage como teto: versões do cliente Auth podem
    // truncar metadados de páginas com dois dígitos. Uma página curta (ou a
    // página vazia seguinte, no múltiplo exato) é o único término confiável.
    if (batch.length < pageSize) return { users, error: null };
  }
}

export async function listAllAuthUsers(admin: AuthDirectoryClient, pageSize = 1_000) {
  const result = await walkAuthDirectory(admin, pageSize);
  return { users: result.users, error: result.error };
}

export async function findAuthUserByEmail(
  admin: AuthDirectoryClient,
  email: string,
  pageSize = 1_000,
) {
  const normalized = email.trim().toLowerCase();
  // Percorra o diretório inteiro também quando houver correspondência para que
  // a duração da resposta do OTP não revele em qual página a identidade existe.
  const result = await walkAuthDirectory(admin, pageSize);
  const user = result.users.find(
    (candidate) => candidate.email?.trim().toLowerCase() === normalized,
  );
  return { user: user ?? null, error: result.error };
}
