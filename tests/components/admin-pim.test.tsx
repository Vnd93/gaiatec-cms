import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { comprehensiveProductPayload } from "../fixtures/product-payload";
import AdminPimPage from "@/admin/pages/AdminPimPage";

const mocks = vi.hoisted(() => ({
  enabled: true,
  rows: [] as Array<Record<string, unknown>>,
  query: vi.fn(),
  auth: {
    session: { access_token: "test-token" },
    profile: { permissions: ["cms:products.read"] },
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => mocks.auth,
}));

vi.mock("@/admin/ev2-runtime", () => ({
  isEv2FeatureEnabled: () => mocks.enabled,
  cmsEnvironment: () => "local",
}));

vi.mock("@/admin/api/cms-api", () => ({
  pimCommand: vi.fn().mockResolvedValue({ enabled: true }),
  attributesCommand: vi.fn().mockResolvedValue({ enabled: true }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      mocks.query(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => Promise.resolve({ data: mocks.rows, error: null }),
      };
      return query;
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPimPage />
    </MemoryRouter>,
  );
}

function canonicalRow(title = "Medidor ultrassônico", suffix = "1") {
  const payload = comprehensiveProductPayload();
  payload.title = title;
  return {
    id: `46000000-0000-4000-8000-00000000000${suffix}`,
    slug: "medidor-ultrassonico",
    workflow_status: "draft",
    updated_at: "2026-09-02T19:00:00+00:00",
    cms_content_drafts: { payload, lock_version: 3 },
  };
}

describe("PIM contextual sobre o produto canônico", () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.rows = [canonicalRow()];
    mocks.query.mockClear();
  });

  it("consulta a mesma fonte editorial e conduz toda mutação ao cadastro oficial", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Visão especializada de produtos" })).toBeVisible();
    expect(mocks.query).toHaveBeenCalledWith("cms_content_items");
    expect(screen.getByText("Medidor ultrassônico")).toBeVisible();
    expect(screen.getByText("Contrato íntegro")).toBeVisible();
    expect(screen.getByRole("link", { name: "Novo produto" })).toHaveAttribute(
      "href",
      "/admin/produtos/novo",
    );
    expect(screen.getByRole("link", { name: "Abrir cadastro completo" })).toHaveAttribute(
      "href",
      "/admin/produtos/46000000-0000-4000-8000-000000000001?etapa=modelos",
    );
    expect(screen.queryByRole("button", { name: /salvar produto normalizado/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/catálogo shadow|uuid|json governado/i)).not.toBeInTheDocument();
  });

  it("filtra semanticamente sem exigir endereço interno", async () => {
    const user = userEvent.setup();
    mocks.rows = [canonicalRow("Medidor ultrassônico", "1"), canonicalRow("Controlador de pressão", "2")];
    renderPage();
    await screen.findByText("Medidor ultrassônico");

    await user.type(screen.getByLabelText("Buscar por produto, marca, fabricante ou linha"), "pressão");
    expect(screen.getByText("Controlador de pressão")).toBeVisible();
    expect(screen.queryByText("Medidor ultrassônico")).not.toBeInTheDocument();
  });

  it("falha fechado por sessão e mantém o editor oficial acessível", async () => {
    mocks.enabled = false;
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent("visão especializada não está habilitada");
    expect(screen.getByRole("link", { name: "Produtos" })).toHaveAttribute("href", "/admin/produtos");
    await waitFor(() => expect(mocks.query).not.toHaveBeenCalled());
  });
});
