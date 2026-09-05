import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  capabilityEnabled: true,
  auth: {
    session: { access_token: "test-token" },
    profile: {
      permissions: ["cms:masterdata.read", "cms:masterdata.manage", "cms:masterdata.merge"],
      ev2Capabilities: {
        schemaVersion: 1,
        status: "ready",
        environment: "local",
        siteKey: "main",
        evaluatedAt: new Date().toISOString(),
        capabilities: {
          "ev2.master_data": {
            schemaVersion: 1,
            key: "ev2.master_data",
            enabled: true,
            source: "override",
            evaluatedAt: new Date().toISOString(),
          },
        },
      },
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ masterDataCommand: mocks.command }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => mocks.auth,
}));

const timestamp = "2026-09-02T17:41:41.59918+00:00";
let AdminMasterDataPage: ComponentType;

function resultFor(body: Record<string, unknown>) {
  const responseEnvelope = {
    schemaVersion: 1,
    commandId: (body.envelope as { commandId: string }).commandId,
    correlationId: (body.envelope as { correlationId: string }).correlationId,
  };
  if (body.action === "capability") {
    return {
      ...responseEnvelope,
      key: "ev2.master_data",
      enabled: mocks.capabilityEnabled,
      source: mocks.capabilityEnabled ? "override" : "default",
      evaluatedAt: timestamp,
    };
  }
  if (body.action === "list_entities") {
    return {
      ...responseEnvelope,
      entities: [
        {
          id: "43000000-0000-4000-8000-000000000101",
          entityType: "manufacturer",
          canonicalName: "Fabricante piloto",
          normalizedName: "fabricante piloto",
          description: "",
          externalDomain: null,
          sourceType: "manual",
          sourceRef: null,
          status: "active",
          mergedIntoId: null,
          lockVersion: 1,
          updatedAt: timestamp,
          aliases: [],
        },
      ],
    };
  }
  if (body.action === "list_rules") return { ...responseEnvelope, rules: [] };
  if (body.action === "get_dependencies") return { ...responseEnvelope, compatibilities: [] };
  return {
    ...responseEnvelope,
    entityId: "43000000-0000-4000-8000-000000000102",
    status: "active",
    lockVersion: 1,
    replayed: false,
  };
}

describe("admin master-data candidate", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_EV2_MASTER_DATA_CANDIDATE", "true");
    AdminMasterDataPage = (await import("@/admin/pages/AdminMasterDataPage")).default;
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => {
    mocks.capabilityEnabled = true;
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) =>
      Promise.resolve(resultFor(body)),
    );
  });

  it("loads governed entities and performs a create command", async () => {
    const user = userEvent.setup();
    render(<AdminMasterDataPage />);
    expect(await screen.findByRole("heading", { name: "Dados mestres" })).toBeVisible();
    expect(await screen.findByText("Fabricante piloto")).toBeVisible();
    await user.type(screen.getByLabelText("Nome canônico"), "Novo fabricante");
    await user.click(screen.getByRole("button", { name: "Salvar entidade" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "create_entity",
          entityType: "manufacturer",
          name: "Novo fabricante",
        }),
        expect.any(String),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Alteração auditada");
  });

  it("fails closed when the server capability is disabled", async () => {
    mocks.capabilityEnabled = false;
    render(<AdminMasterDataPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("capacidade EV2.3 está desativada");
    expect(screen.queryByRole("button", { name: "Salvar entidade" })).not.toBeInTheDocument();
  });
});
