import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dam: vi.fn(),
  capabilityEnabled: true,
  auth: {
    session: { access_token: "test-token" },
    profile: { permissions: ["cms:media.read", "cms:media.upload", "cms:media.manage"] },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ damCommand: mocks.dam }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

const timestamp = "2026-09-02T23:00:00+00:00";
const asset = {
  id: "47000000-0000-4000-8000-000000000010",
  originalFilename: "produto.png",
  processingStatus: "ready",
  scanStatus: "clean",
  sourceKind: "official_manufacturer",
  sourceReference: "Catálogo oficial",
  licenseName: "Uso autorizado",
  ownerName: "Fabricante",
  rightsExpiresAt: "2027-09-02T23:00:00+00:00",
  rightsState: "valid",
  altText: "Vista frontal do produto",
  caption: null,
  credit: null,
  focalX: 0.5,
  focalY: 0.5,
  width: 1200,
  height: 800,
  sha256: "a".repeat(64),
  perceptualHash: "0123456789abcdef",
  previewUrl: "https://storage.example/preview.webp",
  lockVersion: 1,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  collections: [],
  tags: [],
  crops: [],
  usages: [],
} as const;

function base(body: Record<string, any>) {
  return { schemaVersion: 1, commandId: body.envelope.commandId, correlationId: body.envelope.correlationId };
}

let AdminDamPage: ComponentType;

describe("admin DAM candidate", () => {
  beforeAll(async () => {
    AdminDamPage = (await import("@/admin/pages/AdminDamPage")).default;
  });
  beforeEach(() => {
    mocks.dam.mockReset();
    mocks.capabilityEnabled = true;
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: mocks.capabilityEnabled,
          source: mocks.capabilityEnabled ? "override" : "default",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset")
        return Promise.resolve({
          ...base(body),
          asset: {
            ...asset,
            usages: [
              {
                itemId: "47000000-0000-4000-8000-000000000030",
                revisionId: null,
                blockId: null,
                usageKind: "content",
                createdAt: timestamp,
              },
            ],
          },
        });
      throw new Error(`Unexpected action ${body.action}`);
    });
  });

  it("lists governed assets and exposes their concrete usage map", async () => {
    const user = userEvent.setup();
    render(<AdminDamPage />);
    expect(await screen.findByRole("heading", { name: "Mídia contextual" })).toBeVisible();
    expect(screen.getByText("Vista frontal do produto")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos" }));
    expect(await screen.findByText(/item 47000000/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Arquivar ativo" })).toBeDisabled();
  });

  it("fails closed when the server-side DAM flag is disabled", async () => {
    mocks.capabilityEnabled = false;
    render(<AdminDamPage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("DAM EV2.5 desativado"));
    expect(screen.queryByRole("heading", { name: "Mídia contextual" })).not.toBeInTheDocument();
  });
});
