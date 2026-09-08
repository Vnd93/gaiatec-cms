import { describe, expect, it } from "vitest";
import { safeAdminDestination } from "@/admin/auth/admin-auth-route";

describe("safeAdminDestination", () => {
  it("preserva rotas protegidas e rejeita redirecionamentos externos ou públicos", () => {
    expect(safeAdminDestination("/admin/produtos/importacao?lote=1")).toBe(
      "/admin/produtos/importacao?lote=1",
    );
    for (const unsafe of [
      "https://example.invalid/admin",
      "//example.invalid/admin",
      "/admin/login",
      "/admin/mfa",
      "/admin\\example.invalid",
      null,
    ])
      expect(safeAdminDestination(unsafe)).toBe("/admin");
  });
});
