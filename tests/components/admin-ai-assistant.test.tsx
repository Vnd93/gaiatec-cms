import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const REVIEW_SESSION_ID = "51000000-0000-4000-8000-000000000201";
const OWN_SESSION_ID = "51000000-0000-4000-8000-000000000202";
const HIGH_PROPOSAL_ID = "51000000-0000-4000-8000-000000000301";
const LOW_PROPOSAL_ID = "51000000-0000-4000-8000-000000000302";
const SOURCE_ID = "51000000-0000-4000-8000-000000000401";
const OWNER_ID = "51000000-0000-4000-8000-000000000501";
const REVIEWER_ID = "51000000-0000-4000-8000-000000000502";
const timestamp = "2026-09-03T12:00:00.000Z";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  auth: {
    session: { access_token: "synthetic-test-token" },
    profile: {
      mfaVerified: true,
      permissions: ["cms:ai.read", "cms:ai.review"],
      ev2Capabilities: {
        schemaVersion: 1,
        status: "ready",
        environment: "staging",
        siteKey: "main",
        evaluatedAt: new Date().toISOString(),
        capabilities: {
          "ev2.ai_assist": {
            schemaVersion: 1,
            key: "ev2.ai_assist",
            enabled: true,
            source: "override",
            evaluatedAt: new Date().toISOString(),
          },
        },
      },
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ aiAssistCommand: mocks.command }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

let AdminAiAssistantPage: ComponentType;

function field(confidence: number, status: "supported" | "pending") {
  return {
    path: "content.extracted_summary",
    label: "Campo extraído",
    value: status === "pending" ? "Dado ausente na fonte." : "Faixa sintética de zero a cem.",
    sourceId: SOURCE_ID,
    sourceTitle: "Fonte inteiramente sintética",
    sourceVersion: "v1",
    locator: "seção-1",
    page: 1,
    excerpt: "Trecho sintético autorizado para o teste.",
    confidence,
    status,
  };
}

function proposal(id: string, confidence: number, status: "supported" | "pending") {
  return {
    id,
    kind: "extract",
    status: "proposed",
    summary: "Proposta sintética apoiada na fonte.",
    targetRef: null,
    fields: [field(confidence, status)],
    diff: { before: "", after: "Resumo sintético." },
    sourceIds: [SOURCE_ID],
    confidence,
    hasPendingFields: status === "pending",
    proposalHash: status === "pending" ? "b".repeat(64) : "a".repeat(64),
    lockVersion: 1,
    createdAt: timestamp,
  };
}

function workspace(correlationId: string) {
  return {
    schemaVersion: 1,
    correlationId,
    policy: {
      decisionKey: "EV2-D04",
      status: "technical_draft",
      providerMode: "openrouter",
      providerModel: "nvidia/nemotron-3.5-lightning:free",
      externalProviderEnabled: true,
      externalProviderReady: true,
      allowedDataClasses: ["synthetic"],
      realDataAllowed: false,
      automaticPublishAllowed: false,
      manualFallback: true,
      retentionHours: 24,
      aiExecute: false,
    },
    tools: [
      ["content.search", "Localizar", "read", "cms:ai.read"],
      ["content.read", "Ler fonte", "read", "cms:ai.read"],
      ["source.inspect", "Inspecionar fonte", "read", "cms:ai.read"],
      ["draft.propose_patch", "Propor patch", "draft", "cms:ai.draft"],
    ].map(([key, name, mode, permission]) => ({
      key,
      name,
      mode,
      permission,
      syntheticOnly: true,
      mutatesCms: false,
    })),
    sessions: [
      {
        id: REVIEW_SESSION_ID,
        actorId: OWNER_ID,
        owned: false,
        reviewable: true,
        title: "Fila segregada do editor",
        mode: "draft",
        status: "active",
        providerMode: "openrouter",
        providerModel: "nvidia/nemotron-3.5-lightning:free",
        providerStatus: "succeeded",
        tokensUsed: 120,
        tokenBudget: 8000,
        costUsedMicros: 0,
        expiresAt: timestamp,
        proposals: [
          proposal(HIGH_PROPOSAL_ID, 0.98, "supported"),
          proposal(LOW_PROPOSAL_ID, 0.62, "pending"),
        ],
        sources: [],
      },
      {
        id: OWN_SESSION_ID,
        actorId: REVIEWER_ID,
        owned: true,
        reviewable: false,
        title: "Minha sessão de leitura",
        mode: "read",
        status: "active",
        providerMode: "openrouter",
        providerModel: "nvidia/nemotron-3.5-lightning:free",
        providerStatus: null,
        tokensUsed: 0,
        tokenBudget: 8000,
        costUsedMicros: 0,
        expiresAt: timestamp,
        proposals: [],
        sources: [],
      },
    ],
  };
}

function responseFor(body: Record<string, unknown>) {
  const envelope = body.envelope as { correlationId: string };
  if (body.action === "capability")
    return {
      schemaVersion: 1,
      enabled: true,
      source: "individual_override",
      environment: "staging",
      siteKey: "main",
      providerMode: "openrouter",
      providerModel: "nvidia/nemotron-3.5-lightning:free",
      allowedModel: "nvidia/nemotron-3.5-lightning:free",
      externalProviderEnabled: true,
      externalProviderReady: true,
      aiExecute: false,
      realDataAllowed: false,
      decisionKey: "EV2-D04",
      decisionStatus: "technical_draft",
      policyVersion: 1,
      toolCatalogVersion: 1,
      retentionHours: 24,
      maxSessionMinutes: 30,
      maxSessionTokens: 8000,
      manualFallback: true,
      correlationId: envelope.correlationId,
    };
  if (body.action === "workspace") return workspace(envelope.correlationId);
  if (body.action === "decide_proposal")
    return {
      schemaVersion: 1,
      proposalId: body.proposalId,
      decision: body.decision,
      applied: false,
      published: false,
      correlationId: envelope.correlationId,
    };
  throw new Error("Ação inesperada no teste: " + String(body.action));
}

describe("EV2.10 controlled AI assistant", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_EV2_AI_ASSIST_CANDIDATE", "true");
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "staging");
    AdminAiAssistantPage = (await import("@/admin/pages/AdminAiAssistantPage")).default;
  });

  afterAll(() => vi.unstubAllEnvs());

  beforeEach(() => {
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) =>
      Promise.resolve(responseFor(body)),
    );
  });

  it("keeps generation owned, review segregated and low confidence pending", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminAiAssistantPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/fila segregada do editor/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assistente controlada" })).toBeVisible();
    expect(screen.getByRole("option", { name: /Em andamento · fila de revisão/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /Extração · Aguardando decisão/ })).not.toHaveLength(0);
    expect(screen.queryByLabelText(/referência g10x/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Referência interna do rascunho")).not.toBeInTheDocument();
    expect(screen.queryByText(/g10x-/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preparar proposta sem aplicar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aceitar para uso manual" })).toBeEnabled();

    await user.selectOptions(screen.getByLabelText("Proposta"), LOW_PROPOSAL_ID);
    expect(screen.getByText(/aguarda confirmação/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Aceitar para uso manual" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar edição" })).toBeEnabled();

    const editedValue = screen.getByLabelText("Ajuste manual do primeiro campo");
    await user.clear(editedValue);
    await user.type(editedValue, "Valor sintético conferido manualmente.");
    await user.click(screen.getByRole("button", { name: "Registrar edição" }));

    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "decide_proposal",
          proposalId: LOW_PROPOSAL_ID,
          decision: "edited",
          editedFields: [
            {
              path: "content.extracted_summary",
              value: "Valor sintético conferido manualmente.",
            },
          ],
        }),
        expect.any(String),
      ),
    );
  });
});
