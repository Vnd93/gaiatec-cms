import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  releaseA: "41000000-0000-4000-8000-000000000001",
  releaseB: "41000000-0000-4000-8000-000000000002",
  itemA: "42000000-0000-4000-8000-000000000001",
  itemB: "42000000-0000-4000-8000-000000000002",
  revisionA: "43000000-0000-4000-8000-000000000001",
  revisionB: "43000000-0000-4000-8000-000000000002",
  releaseItemA: "44000000-0000-4000-8000-000000000001",
  releaseItemB: "44000000-0000-4000-8000-000000000002",
  bulkJob: "45000000-0000-4000-8000-000000000001",
  correlation: "46000000-0000-4000-8000-000000000001",
};

const candidates = [
  {
    id: ids.itemA,
    content_type: "page",
    slug: "conteudo-a",
    cms_content_drafts: { payload: { title: "Conteúdo Alpha" } },
    cms_content_revisions: [
      {
        id: ids.revisionA,
        revision_number: 3,
        created_at: "2026-09-08T12:00:00Z",
        payload: { title: "Título Alpha congelado" },
      },
    ],
  },
  {
    id: ids.itemB,
    content_type: "post",
    slug: "conteudo-b",
    cms_content_drafts: { payload: { title: "Conteúdo Beta" } },
    cms_content_revisions: [
      {
        id: ids.revisionB,
        revision_number: 2,
        created_at: "2026-09-08T12:00:00Z",
        payload: { title: "Título Beta congelado" },
      },
    ],
  },
];

const revisionRows = candidates.flatMap((candidate) =>
  candidate.cms_content_revisions.map((revision) => ({ ...revision, item_id: candidate.id })),
);

const summaries = [
  {
    releaseId: ids.releaseA,
    title: "Pacote Alpha",
    status: "draft",
    planHash: "a".repeat(64),
    lockVersion: 1,
    updatedAt: "2026-09-08T12:00:00Z",
    itemCount: 1,
  },
  {
    releaseId: ids.releaseB,
    title: "Pacote Beta",
    status: "draft",
    planHash: "b".repeat(64),
    lockVersion: 1,
    updatedAt: "2026-09-08T12:00:00Z",
    itemCount: 1,
  },
] as const;

function releaseDetail(which: "A" | "B") {
  const isA = which === "A";
  const summary = summaries[isA ? 0 : 1];
  const itemId = isA ? ids.itemA : ids.itemB;
  const revisionId = isA ? ids.revisionA : ids.revisionB;
  return {
    releaseId: summary.releaseId,
    title: summary.title,
    status: "draft",
    planHash: summary.planHash,
    lockVersion: 1,
    updatedAt: summary.updatedAt,
    reason: "Homologação controlada",
    items: [
      {
        id: isA ? ids.releaseItemA : ids.releaseItemB,
        itemId,
        revisionId,
        contentType: isA ? "page" : "post",
        slug: isA ? "conteudo-a" : "conteudo-b",
        position: 1,
        dependencies: [],
        frozenHash: isA ? "hash-a" : "hash-b",
        validationStatus: "pending",
        diff: { toRevisionId: revisionId, changedFields: [], seoChanged: false },
      },
    ],
    validations: [],
    approvals: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  release: vi.fn(),
  collaboration: vi.fn(),
  bulk: vi.fn(),
  auth: {
    session: { access_token: "synthetic-test-token" },
    profile: {
      permissions: [
        "cms:collaboration.read",
        "cms:releases.read",
        "cms:releases.create",
        "cms:releases.edit",
        "cms:bulk.dry_run",
      ],
    },
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/admin/api/cms-api", () => ({
  releaseV2Command: mocks.release,
  collaborationCommand: mocks.collaboration,
  bulkV2Command: mocks.bulk,
}));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => mocks.auth,
}));
vi.mock("@/admin/ev2-runtime", () => ({
  cmsEnvironment: () => "local",
  isEv2FeatureEnabled: () => true,
}));

function candidateQuery(data: unknown[] = candidates, onIn?: (values: unknown[]) => void) {
  const result = Promise.resolve({ data, error: null });
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.in = vi.fn((_column: string, values: unknown[]) => {
    onIn?.(values);
    return query;
  });
  query.then = result.then.bind(result);
  return query;
}

let AdminWorkPage: ComponentType;

function renderWorkPage() {
  return render(
    <MemoryRouter>
      <AdminWorkPage />
    </MemoryRouter>,
  );
}

describe("conteúdos elegíveis para pacotes editoriais", () => {
  beforeAll(async () => {
    AdminWorkPage = (await import("@/admin/pages/AdminWorkPage")).default;
  });

  beforeEach(() => {
    mocks.auth.profile.permissions = [
      "cms:collaboration.read",
      "cms:releases.read",
      "cms:releases.create",
      "cms:releases.edit",
      "cms:bulk.dry_run",
    ];
    mocks.from.mockReset();
    mocks.release.mockReset();
    mocks.collaboration.mockReset();
    mocks.bulk.mockReset();
    mocks.from.mockImplementation((table: string) =>
      candidateQuery(table === "cms_content_revisions" ? revisionRows : candidates),
    );
    mocks.collaboration.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "capability") return Promise.resolve({ enabled: true });
      if (body.action === "list") return Promise.resolve({ items: [], savedViews: [] });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
    mocks.release.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: summaries });
      if (body.action === "status")
        return Promise.resolve(body.releaseId === ids.releaseA ? releaseDetail("A") : releaseDetail("B"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
    mocks.bulk.mockResolvedValue({
      jobId: ids.bulkJob,
      operation: "add_to_release",
      status: "validated",
      atomic: true,
      targetCount: 1,
      report: { valid: true, validItems: 1, errors: 0, writes: 0 },
      lockVersion: 1,
      correlationId: ids.correlation,
      items: [
        {
          position: 1,
          targetType: "content",
          targetId: ids.itemA,
          validationStatus: "valid",
          errors: [],
        },
      ],
    });
  });

  it("separa a permissão de criar pacote da permissão de editar", async () => {
    const user = userEvent.setup();
    mocks.auth.profile.permissions = ["cms:releases.read", "cms:releases.edit"];
    const firstRender = renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    expect(screen.queryByRole("button", { name: "Criar pacote vazio" })).not.toBeInTheDocument();

    firstRender.unmount();
    mocks.auth.profile.permissions = ["cms:releases.read", "cms:releases.create"];
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    expect(screen.getByRole("button", { name: "Criar pacote vazio" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Conteúdo e revisão aprovada")).not.toBeInTheDocument();
  });

  it("mantém as pendências disponíveis quando a lista auxiliar de responsáveis falha", async () => {
    mocks.auth.profile.permissions = [
      "cms:collaboration.read",
      "cms:collaboration.assign",
      "cms:releases.read",
    ];
    mocks.collaboration.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "capability") return Promise.resolve({ enabled: true });
      if (body.action === "list") {
        return Promise.resolve({
          items: [
            {
              id: "49000000-0000-4000-8000-000000000001",
              sourceKind: "manual",
              title: "Pendência resiliente",
              description: "Tarefa ainda disponível durante falha auxiliar.",
              status: "open",
              priority: "normal",
              anchor: { route: "/admin/conteudo" },
              lockVersion: 1,
              updatedAt: "2026-09-08T12:00:00Z",
              commentCount: 0,
              comments: [],
              history: [],
            },
          ],
          savedViews: [],
        });
      }
      if (body.action === "assignees") return Promise.reject(new Error("service unavailable"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    renderWorkPage();

    expect(await screen.findByText("Pendência resiliente")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A lista de responsáveis não pôde ser atualizada.");
    expect(screen.getByText("Área disponível")).toBeInTheDocument();
  });

  it("omite no seletor individual o conteúdo já presente no pacote", async () => {
    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    await user.click(screen.getByRole("button", { name: "Pacote Alpha" }));

    const selector = await screen.findByLabelText("Conteúdo e revisão aprovada");
    expect(within(selector).queryByRole("option", { name: /Conteúdo Alpha/ })).not.toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: /Conteúdo Beta/ })).toBeInTheDocument();
  });

  it("hidrata o título e a revisão congelada ao abrir um pacote já publicado", async () => {
    const requestedRevisionIds: unknown[][] = [];
    mocks.from.mockImplementation((table: string) =>
      table === "cms_content_revisions"
        ? candidateQuery([revisionRows[0]!], (values) => requestedRevisionIds.push(values))
        : candidateQuery(table === "cms_content_items" ? candidates : []),
    );
    mocks.release.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: summaries });
      if (body.action === "status") return Promise.resolve({ ...releaseDetail("A"), status: "published" });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    await user.click(screen.getByRole("button", { name: "Pacote Alpha" }));

    expect(await screen.findByText("Título Alpha congelado")).toBeInTheDocument();
    expect(screen.getByText("Revisão 3")).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo sem título")).not.toBeInTheDocument();
    expect(requestedRevisionIds).toEqual([[ids.revisionA]]);
  });

  it("não substitui o título congelado ausente pelo título mutável do rascunho", async () => {
    const candidateWithoutFrozenTitle = {
      ...candidates[0]!,
      cms_content_drafts: { payload: { title: "Título mutável atual" } },
      cms_content_revisions: candidates[0]!.cms_content_revisions.map((revision) => ({
        ...revision,
        payload: { title: "   " },
      })),
    };
    mocks.from.mockImplementation((table: string) =>
      candidateQuery(
        table === "cms_content_revisions"
          ? candidateWithoutFrozenTitle.cms_content_revisions.map((revision) => ({
              ...revision,
              item_id: ids.itemA,
            }))
          : candidates,
      ),
    );

    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    await user.click(screen.getByRole("button", { name: "Pacote Alpha" }));

    expect(await screen.findByText("Título da revisão indisponível")).toBeInTheDocument();
    expect(screen.queryByText("Título mutável atual")).not.toBeInTheDocument();
  });

  it("remove o pacote anterior quando a nova seleção falha", async () => {
    mocks.auth.profile.permissions = ["cms:releases.read", "cms:releases.rollback"];
    mocks.release.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: summaries });
      if (body.action === "status" && body.releaseId === ids.releaseA) {
        return Promise.resolve({ ...releaseDetail("A"), status: "published" });
      }
      if (body.action === "status" && body.releaseId === ids.releaseB) {
        return Promise.reject(new Error("Pacote temporariamente indisponível."));
      }
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    await user.click(screen.getByRole("button", { name: "Pacote Alpha" }));
    expect(await screen.findByRole("button", { name: "Reverter publicação" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Pacote Beta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pacote temporariamente indisponível.");
    expect(screen.queryByRole("button", { name: "Reverter publicação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar conjunto" })).not.toBeInTheDocument();
  });

  it("bloqueia outra seleção enquanto o detalhe solicitado ainda está em voo", async () => {
    const pending = deferred<ReturnType<typeof releaseDetail>>();
    mocks.release.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: summaries });
      if (body.action === "status" && body.releaseId === ids.releaseA) return pending.promise;
      if (body.action === "status" && body.releaseId === ids.releaseB)
        return Promise.resolve(releaseDetail("B"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Pacotes editoriais/ }));
    await user.click(screen.getByRole("button", { name: "Pacote Alpha" }));
    expect(screen.getByRole("button", { name: "Pacote Beta" })).toBeDisabled();

    pending.resolve(releaseDetail("A"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pacote Beta" })).toBeEnabled());
  });

  it("usa o detalhe do destino, ignora resposta atrasada e limpa plano validado ao trocar pacote", async () => {
    const firstAlpha = deferred<ReturnType<typeof releaseDetail>>();
    let alphaRequests = 0;
    mocks.release.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: summaries });
      if (body.action === "status" && body.releaseId === ids.releaseA) {
        alphaRequests += 1;
        return alphaRequests === 1 ? firstAlpha.promise : Promise.resolve(releaseDetail("A"));
      }
      if (body.action === "status" && body.releaseId === ids.releaseB)
        return Promise.resolve(releaseDetail("B"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    const user = userEvent.setup();
    renderWorkPage();
    await user.click(await screen.findByRole("tab", { name: /Em massa/ }));
    const destination = screen.getByLabelText("Pacote editorial de destino");

    await user.selectOptions(destination, ids.releaseA);
    await user.selectOptions(destination, ids.releaseB);
    expect(await screen.findByLabelText(/Conteúdo Alpha/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Conteúdo Beta/)).not.toBeInTheDocument();

    firstAlpha.resolve(releaseDetail("A"));
    await waitFor(() => expect(destination).toHaveValue(ids.releaseB));
    expect(screen.getByLabelText(/Conteúdo Alpha/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Conteúdo Beta/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/Conteúdo Alpha/));
    await user.type(screen.getByLabelText("Motivo"), "Inclusão editorial controlada");
    await user.click(screen.getByRole("button", { name: "Validar sem alterar" }));
    expect(await screen.findByText(/Total 1/)).toBeInTheDocument();

    await user.selectOptions(destination, ids.releaseA);
    await waitFor(() => expect(screen.queryByText(/Total 1/)).not.toBeInTheDocument());
    expect(await screen.findByLabelText(/Conteúdo Beta/)).not.toBeChecked();
    expect(screen.queryByLabelText(/Conteúdo Alpha/)).not.toBeInTheDocument();
  });
});
