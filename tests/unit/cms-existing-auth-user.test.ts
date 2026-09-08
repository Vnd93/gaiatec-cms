import { describe, expect, it, vi } from "vitest";

import {
  AUTH_USER_LOOKUP_MAX_PAGES,
  AUTH_USER_LOOKUP_PAGE_SIZE,
  findExistingAuthUserByEmail,
} from "../../supabase/functions/_shared/cms-existing-auth-user";

describe("existing Auth identity lookup for CMS invitations", () => {
  it("reuses the exact existing identity without creating a duplicate Auth user", async () => {
    const listPage = vi.fn(async () => ({
      data: { users: [{ id: "existing-id", email: "Operador@GAIATEC.com.br" }] },
      error: null,
    }));

    await expect(findExistingAuthUserByEmail(" operador@gaiatec.com.br ", listPage)).resolves.toEqual({
      id: "existing-id",
      email: "Operador@GAIATEC.com.br",
    });
    expect(listPage).toHaveBeenCalledWith(1, AUTH_USER_LOOKUP_PAGE_SIZE);
  });

  it("walks bounded pages and returns absence only after a short final page", async () => {
    const fullPage = Array.from({ length: AUTH_USER_LOOKUP_PAGE_SIZE }, (_, index) => ({
      id: `id-${index}`,
      email: `user-${index}@example.invalid`,
    }));
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });

    await expect(findExistingAuthUserByEmail("missing@example.invalid", listPage)).resolves.toBeNull();
    expect(listPage).toHaveBeenCalledTimes(2);
  });

  it("fails closed on directory errors or an unexpectedly unbounded directory", async () => {
    await expect(
      findExistingAuthUserByEmail("operator@example.invalid", async () => ({
        data: null,
        error: new Error("unavailable"),
      })),
    ).rejects.toThrow("CMS_AUTH_DIRECTORY_UNAVAILABLE");

    const fullPage = Array.from({ length: AUTH_USER_LOOKUP_PAGE_SIZE }, (_, index) => ({
      id: `id-${index}`,
      email: `user-${index}@example.invalid`,
    }));
    const listPage = vi.fn(async () => ({ data: { users: fullPage }, error: null }));
    await expect(findExistingAuthUserByEmail("missing@example.invalid", listPage)).rejects.toThrow(
      "CMS_AUTH_DIRECTORY_LIMIT_EXCEEDED",
    );
    expect(listPage).toHaveBeenCalledTimes(AUTH_USER_LOOKUP_MAX_PAGES);
  });
});
