import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pim: vi.fn(),
  attributes: vi.fn(),
  master: vi.fn(),
  capabilityEnabled: true,
  savedProduct: null as Record<string, unknown> | null,
  auth: {
    session: { access_token: "test-token" },
    profile: {
      permissions: ["cms:pim.read", "cms:pim.manage", "cms:pim.archive"],
      ev2Capabilities: {
        schemaVersion: 1,
        status: "ready",
        environment: "local",
        siteKey: "main",
        evaluatedAt: new Date().toISOString(),
        capabilities: {
          "ev2.pim_v2": {
            schemaVersion: 1,
            key: "ev2.pim_v2",
            enabled: true,
            source: "override",
            evaluatedAt: new Date().toISOString(),
          },
        },
      },
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({
  pimCommand: mocks.pim,
  masterDataCommand: mocks.master,
  attributesCommand: mocks.attributes,
}));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

const ids = {
  manufacturer: "46000000-0000-4000-8000-000000000001",
  category: "46000000-0000-4000-8000-000000000002",
  monitored: "46000000-0000-4000-8000-000000000003",
};
const timestamp = "2026-09-02T19:00:00+00:00";
let AdminPimPage: ComponentType;

function responseEnvelope(body: Record<string, any>) {
  return {
    schemaVersion: 1,
    commandId: body.envelope.commandId,
    correlationId: body.envelope.correlationId,
  };
}

function masterEntity(id: string, entityType: string, name: string) {
  return {
    id,
    entityType,
    canonicalName: name,
    normalizedName: name.toLowerCase(),
    description: "",
    externalDomain: null,
    sourceType: "manual",
    sourceRef: null,
    status: "active",
    mergedIntoId: null,
    lockVersion: 1,
    updatedAt: timestamp,
    aliases: [],
  };
}

describe("admin PIM candidate", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_EV2_PIM_CANDIDATE", "true");
    AdminPimPage = (await import("@/admin/pages/AdminPimPage")).default;
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => {
    mocks.pim.mockClear();
    mocks.master.mockClear();
    mocks.attributes.mockClear();
    mocks.capabilityEnabled = true;
    mocks.savedProduct = null;
    mocks.attributes.mockImplementation((_session, body: Record<string, any>) =>
      Promise.resolve({
        ...responseEnvelope(body),
        attributeSet: null,
        definitions: [],
        units: [],
      }),
    );
    mocks.master.mockImplementation((_session, body: Record<string, any>) => {
      const base = responseEnvelope(body);
      if (body.action === "list_entities") {
        return Promise.resolve({
          ...base,
          entities: [
            masterEntity(ids.manufacturer, "manufacturer", "Fabricante piloto"),
            masterEntity(ids.category, "category", "Vazão"),
            masterEntity(ids.monitored, "monitored_element", "Água"),
          ],
        });
      }
      return Promise.resolve({
        ...base,
        compatibilities:
          body.relationType === "category_monitored_element"
            ? [
                {
                  id: "46000000-0000-4000-8000-000000000009",
                  relationType: body.relationType,
                  sourceEntityId: ids.category,
                  targetEntityId: ids.monitored,
                  status: "active",
                  effectiveFrom: timestamp,
                  effectiveTo: null,
                  version: 1,
                  lockVersion: 1,
                  sourceType: "manual",
                  sourceRef: null,
                  updatedAt: timestamp,
                  target: {
                    id: ids.monitored,
                    entityType: "monitored_element",
                    canonicalName: "Água",
                    status: "active",
                    lockVersion: 1,
                  },
                },
              ]
            : [],
      });
    });
    mocks.pim.mockImplementation((_session, body: Record<string, any>) => {
      const base = responseEnvelope(body);
      if (body.action === "capability") {
        return Promise.resolve({
          ...base,
          key: "ev2.pim_v2",
          enabled: mocks.capabilityEnabled,
          source: mocks.capabilityEnabled ? "override" : "default",
          evaluatedAt: timestamp,
        });
      }
      if (body.action === "list_products") return Promise.resolve({ ...base, products: [] });
      if (body.action === "save_product") {
        mocks.savedProduct = { ...body.product };
        return Promise.resolve({
          ...base,
          productId: body.product.id,
          status: "draft",
          lockVersion: 1,
          replayed: false,
        });
      }
      if (body.action === "get_product") {
        return Promise.resolve({ product: { ...mocks.savedProduct, lockVersion: 1, skus: [] } });
      }
      throw new Error(`Unexpected action ${body.action}`);
    });
  });

  it("creates a simple product without exposing JSON or UUID fields", async () => {
    const user = userEvent.setup();
    render(<AdminPimPage />);
    expect(await screen.findByRole("heading", { name: "Produtos, modelos, variantes e SKU" })).toBeVisible();
    await user.type(screen.getByLabelText("Nome do produto"), "Medidor ultrassônico");
    await user.selectOptions(screen.getByLabelText("Fabricante"), ids.manufacturer);
    await user.selectOptions(screen.getByLabelText("Categoria"), ids.category);
    await waitFor(() => expect(screen.getByRole("option", { name: "Água" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^Elementos monitorados/), ids.monitored);
    await user.type(screen.getByLabelText("Nome comercial"), "UFX-100");
    await user.click(screen.getByRole("button", { name: "Salvar produto normalizado" }));
    await waitFor(() =>
      expect(mocks.pim).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "save_product",
          mode: "create",
          product: expect.objectContaining({ name: "Medidor ultrassônico", slug: "medidor-ultrassonico" }),
        }),
        expect.any(String),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Produto normalizado salvo");
    expect(screen.queryByText(/JSON governado/i)).not.toBeInTheDocument();
  });

  it("fails closed when the server-side flag is disabled", async () => {
    mocks.capabilityEnabled = false;
    render(<AdminPimPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("PIM EV2.4 está desativado");
    expect(screen.queryByRole("button", { name: "Salvar produto normalizado" })).not.toBeInTheDocument();
  });

  it("loads the category attribute set and blocks a missing required specification", async () => {
    mocks.attributes.mockImplementation((_session, body: Record<string, any>) =>
      Promise.resolve({
        ...responseEnvelope(body),
        attributeSet: {
          id: "46000000-0000-4000-8000-000000000020",
          categoryId: ids.category,
          name: "Medição de vazão",
          versionId: "46000000-0000-4000-8000-000000000021",
          version: 1,
        },
        definitions: [
          {
            id: "46000000-0000-4000-8000-000000000022",
            attributeKey: "flow_range",
            label: "Faixa de vazão",
            description: "Intervalo homologável.",
            dataType: "range",
            canonicalUnitCode: "m3/h",
            enumOptions: [],
            filterable: true,
            comparable: true,
            searchable: true,
            required: true,
            inherited: true,
            position: 0,
          },
        ],
        units: [
          {
            code: "m3/h",
            label: "Metro cúbico por hora",
            symbol: "m³/h",
            dimensionKey: "volumetric_flow",
            canonicalCode: "m3/h",
            factorToCanonical: 1,
            offsetToCanonical: 0,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<AdminPimPage />);
    await screen.findByRole("heading", { name: "Produtos, modelos, variantes e SKU" });
    await user.selectOptions(screen.getByLabelText("Categoria"), ids.category);
    expect(await screen.findByText("Medição de vazão · versão 1")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Salvar produto normalizado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preencha as especificações obrigatórias: Faixa de vazão",
    );
    expect(mocks.pim.mock.calls.some(([, body]) => body.action === "save_product")).toBe(false);
  });
});
