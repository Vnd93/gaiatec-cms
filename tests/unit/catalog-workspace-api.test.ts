import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), environment: vi.fn(() => "local") }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/admin/ev2-runtime", () => ({ cmsEnvironment: mocks.environment }));
import {
  executeCatalogWorkspaceCommand,
  readCatalogWorkspace,
  executeCatalogEditorialCommand,
} from "@/admin/api/catalog-workspace-api";
const command = {
  action: "archive_product" as const,
  id: "c0110000-0000-4000-8000-000000000020",
  expectedVersion: 3,
  reason: "Manual review",
};
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.environment.mockReturnValue("local");
});
describe("authenticated catalog RPC adapter", () => {
  it("preserves expectedVersion and uses no caller-controlled identity", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await executeCatalogWorkspaceCommand(command);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cms_catalog_workspace_command", {
      p_environment: "local",
      p_command: command,
      p_correlation_id: expect.any(String),
    });
  });
  it.each(["PT409", "40001"])("maps %s conflicts to 409 without retrying", async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "never expose backend content" },
    });
    await expect(executeCatalogWorkspaceCommand(command)).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed successful reads instead of exposing partial workspace", async () => {
    mocks.rpc.mockResolvedValue({ data: { enabled: true }, error: null });
    await expect(readCatalogWorkspace()).rejects.toMatchObject({ status: 503, code: "response_invalid" });
  });
  it("exposes only allowlisted conflict provenance and never raw database details", async () => {
    const detail = { author: "other", changedAt: "2026-09-29T02:00:00Z", correlationId: command.id };
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", details: JSON.stringify(detail) } });
    await expect(executeCatalogWorkspaceCommand(command)).rejects.toMatchObject({ conflict: detail });
    for (const details of [
      "untrusted text",
      JSON.stringify({ ...detail, email: "forbidden@example.test" }),
    ]) {
      mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", details } });
      await expect(executeCatalogWorkspaceCommand(command)).rejects.toMatchObject({
        status: 409,
        conflict: null,
      });
    }
  });
  it("blocks production before any read or write", async () => {
    mocks.environment.mockReturnValue("production");
    await expect(readCatalogWorkspace()).rejects.toMatchObject({ status: 403 });
    await expect(executeCatalogWorkspaceCommand(command)).rejects.toMatchObject({ status: 403 });
    await expect(
      executeCatalogEditorialCommand({
        action: "unpublish",
        termId: command.id,
        expectedVersion: 1,
        reason: "Manual review",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not retry transport failures with uncertain mutation outcome", async () => {
    mocks.rpc.mockRejectedValue(new TypeError("Network request failed"));
    await expect(executeCatalogWorkspaceCommand(command)).rejects.toThrow("Network request failed");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
