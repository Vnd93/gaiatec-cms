import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  leadCommand: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/admin/api/cms-api", () => ({
  leadCommand: mocks.leadCommand,
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    session: { access_token: "synthetic-test-token" },
    profile: {
      roles: ["super_admin"],
      permissions: [
        "cms:products.read",
        "cms:products.edit",
        "cms:leads.read",
        "cms:leads.assign",
        "cms:leads.export",
      ],
    },
  }),
}));

vi.mock("@/admin/ev2-runtime", () => ({
  isEv2FeatureEnabled: () => false,
}));

import AdminAuditPage from "@/admin/pages/AdminAuditPage";
import AdminLeadsPage from "@/admin/pages/AdminLeadsPage";
import AdminProductsPage from "@/admin/pages/AdminProductsPage";

type QueryResult = { data: unknown[]; count?: number | null; error: null };

function createRequest(result: QueryResult) {
  const request: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<QueryResult>["then"];
  } = {};
  for (const method of ["select", "order", "eq", "or", "ilike", "range", "gte", "is"]) {
    request[method] = vi.fn(() => request);
  }
  request.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return request;
}

describe("paginação das listagens administrativas", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.leadCommand.mockReset();
  });

  it("pagina produtos com contagem exata sem truncar silenciosamente em 50", async () => {
    const productRequests: ReturnType<typeof createRequest>[] = [];
    mocks.from.mockImplementation((table: string) => {
      const request = createRequest({
        data:
          table === "cms_content_items"
            ? [
                {
                  id: "product-1",
                  slug: "produto-qa",
                  workflow_status: "draft",
                  updated_at: "2026-09-06T12:00:00.000Z",
                  cms_content_drafts: { payload: { title: "Produto QA" } },
                },
              ]
            : [],
        count: table === "cms_content_items" ? 51 : 0,
        error: null,
      });
      if (table === "cms_content_items") productRequests.push(request);
      return request;
    });

    render(
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Produto QA")).toBeInTheDocument();
    expect(screen.getAllByText("Rascunho")).not.toHaveLength(0);
    expect(screen.queryByText(/^draft$/)).not.toBeInTheDocument();
    expect(screen.getByText(/51 no filtro de busca e situação/)).toBeInTheDocument();
    expect(productRequests[0].select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(productRequests[0].range).toHaveBeenCalledWith(0, 49);

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(productRequests).toHaveLength(2));
    expect(productRequests[1].range).toHaveBeenCalledWith(50, 99);
  });

  it("pagina leads e informa quantos registros pertencem ao filtro", async () => {
    const lead = {
      id: "lead-1",
      reference_code: "QA-LEAD-1",
      status: "new",
      origin_path: "/qa",
      origin_source: "qa",
      assigned_to: null,
      sla_due_at: "2030-09-06T12:00:00.000Z",
      retention_until: "2030-12-06T12:00:00.000Z",
      created_at: "2026-09-06T12:00:00.000Z",
      payload: {},
      utm: {},
      cms_lead_consents: [],
      cms_lead_status_history: [],
      cms_lead_outbox: [],
    };
    mocks.leadCommand.mockResolvedValue({ items: [lead], total: 51, assignees: [] });

    render(<AdminLeadsPage />);

    expect(await screen.findByText("QA-LEAD-1")).toBeInTheDocument();
    expect(screen.getByText("1 lead(s) nesta página · 51 no filtro atual.")).toBeInTheDocument();
    expect(mocks.leadCommand).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "list_leads", limit: 50, offset: 0 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(mocks.leadCommand).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ action: "list_leads", limit: 50, offset: 50 }),
      ),
    );
  });

  it("consulta auditoria pelo timestamp canônico e expõe carregamento adicional", async () => {
    const auditRequests: ReturnType<typeof createRequest>[] = [];
    mocks.from.mockImplementation((table: string) => {
      const request = createRequest({
        data:
          table === "cms_audit_log"
            ? [
                {
                  id: "audit-1",
                  actor_id: null,
                  action: "cms:leads.export",
                  target_type: "lead_export",
                  target_id: "qa",
                  correlation_id: null,
                  event_data: { result: "success" },
                  occurred_at: "2026-09-06T12:00:00.000Z",
                },
              ]
            : [],
        count: table === "cms_audit_log" ? 501 : 0,
        error: null,
      });
      if (table === "cms_audit_log") auditRequests.push(request);
      return request;
    });

    render(<AdminAuditPage />);

    expect(await screen.findByText("Dados exportados")).toBeInTheDocument();
    expect(screen.getAllByText("Leads")).not.toHaveLength(0);
    expect(screen.queryByText("cms leads export")).not.toBeInTheDocument();
    expect(auditRequests[0].select).toHaveBeenCalledWith(expect.stringContaining("occurred_at"), {
      count: "exact",
    });
    expect(auditRequests[0].order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(auditRequests[0].range).toHaveBeenCalledWith(0, 499);
    expect(screen.getByRole("button", { name: "Carregar mais 500 eventos" })).toBeEnabled();
    expect(screen.getByText(/1 de 501 carregado no período/)).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
});
