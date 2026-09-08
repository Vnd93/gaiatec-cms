type RdoAdminAccess = { user_id: string };

type RdoAccessQueryResult = {
  data: RdoAdminAccess[] | null;
  error: unknown;
};

type RdoAccessFilter = {
  eq(column: string, value: unknown): RdoAccessFilter;
  order(column: string): RdoAccessFilter;
  range(from: number, to: number): PromiseLike<RdoAccessQueryResult>;
};

type RdoAccessClient = {
  from(table: string): {
    select(columns: string): RdoAccessFilter;
  };
};

export async function listAllActiveRdoAdminIds(
  admin: unknown,
  pageSize = 500,
): Promise<{ ids: string[]; error: unknown | null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("RDO_ACCESS_PAGE_SIZE_INVALID");
  }

  const client = admin as RdoAccessClient;
  const ids: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = (await client
      .from("rdo_user_access")
      .select("user_id")
      .eq("active", true)
      .eq("role", "rdo_admin")
      .order("user_id")
      .range(offset, offset + pageSize - 1)) as RdoAccessQueryResult;
    if (error) return { ids: [], error };
    const page = data ?? [];
    ids.push(...page.map((entry) => entry.user_id));
    if (page.length < pageSize) return { ids, error: null };
  }
}
