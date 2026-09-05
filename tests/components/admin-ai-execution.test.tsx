import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR_ID = "51400000-0000-4000-8000-000000000101";
const PLANNER_ID = "51400000-0000-4000-8000-000000000102";
const TARGET_REF = "g14x-component-target";
const OTHER_PLAN_ID = "51400000-0000-4000-8000-000000000201";
const OWN_PLAN_ID = "51400000-0000-4000-8000-000000000202";
const timestamp = "2026-09-04T12:00:00.000Z";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  auth: {
    session: { access_token: "synthetic-test-token" },
    profile: {
      userId: "51400000-0000-4000-8000-000000000101",
      mfaVerified: true,
      permissions: ["cms:ai.read", "cms:ai.plan", "cms:ai.approve", "cms:ai.execute"],
      ev2Capabilities: {
        schemaVersion: 1,
        status: "ready",
        environment: "staging",
        siteKey: "main",
        evaluatedAt: new Date().toISOString(),
        capabilities: Object.fromEntries(
          ["ev2.ai_assist", "ev2.ai_execute"].map((key) => [
            key,
            {
              schemaVersion: 1,
              key,
              enabled: true,
              source: "override",
              evaluatedAt: new Date().toISOString(),
            },
          ]),
        ),
      },
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ aiExecuteCommand: mocks.command }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

let AdminAiExecutionPage: ComponentType;

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: <AdminAiExecutionPage />,
      },
    ],
    { initialEntries: ["/admin/ia-execution"] },
  );
  return render(<RouterProvider router={router} />);
}

const tools = [
  ["draft.apply_patch", "Aplicar patch sintético", "draft", "cms:ai.execute"],
  ["workflow.submit", "Submeter alvo sintético", "workflow", "cms:ai.execute"],
  ["release.schedule", "Agendar publicação sintética", "critical", "cms:ai.execute"],
  ["release.publish", "Publicar projeção sintética", "critical", "cms:ai.execute"],
  ["release.rollback", "Retirar publicação sintética", "critical", "cms:ai.compensate"],
].map(([key, name, risk, permission]) => ({
  key,
  name,
  risk,
  permission,
  syntheticOnly: true,
  reversible: true,
  active: true,
}));

function step(key = "step-component") {
  return {
    stepKey: key,
    toolKey: "draft.apply_patch",
    targetRef: TARGET_REF,
    expectedVersion: 1,
    arguments: { patch: { summary: "Resumo sintético atualizado." } },
  };
}

function plan(id: string, owned: boolean) {
  return {
    id,
    title: owned ? "Meu plano sintético" : "Plano segregado para revisão",
    status: "ready",
    risk: "draft",
    planVersion: 1,
    planHash: owned ? "a".repeat(64) : "b".repeat(64),
    steps: [step(owned ? "step-owned" : "step-review")],
    dryRun: { valid: true, stepCount: 1, targetCount: 1, risk: "draft", reversible: true },
    createdBy: owned ? ACTOR_ID : PLANNER_ID,
    owned,
    approvable: !owned,
    executable: false,
    compensatable: false,
    expiresAt: "2026-09-04T12:30:00.000Z",
    createdAt: timestamp,
    approvals: [],
    runs: [],
  };
}

function workspace(correlationId: string) {
  return {
    schemaVersion: 1,
    correlationId,
    policy: {
      gate: "G14",
      dataClass: "synthetic",
      productionAllowed: false,
      externalProviderEnabled: false,
      maxPlanSteps: 20,
      approvalMinutes: 10,
      reviewerSeparationRequired: true,
      compensationRequired: true,
    },
    permissions: { canPlan: true, canApprove: true, canExecute: true, canCompensate: false },
    tools,
    targets: [
      {
        reference: TARGET_REF,
        title: "Alvo sintético do componente",
        lifecycle: "draft",
        payload: { summary: "Estado inicial" },
        version: 1,
        owned: true,
        updatedAt: timestamp,
      },
    ],
    plans: [plan(OTHER_PLAN_ID, false), plan(OWN_PLAN_ID, true)],
  };
}

function responseFor(body: Record<string, unknown>) {
  const requestEnvelope = body.envelope as { correlationId: string };
  if (body.action === "capability")
    return {
      schemaVersion: 1,
      enabled: true,
      source: "individual_overrides",
      environment: "staging",
      siteKey: "main",
      providerMode: "synthetic",
      externalProviderEnabled: false,
      realDataAllowed: false,
      syntheticOnly: true,
      requiresAiAssist: true,
      planHashRequired: true,
      reviewerSeparationRequired: true,
      compensationRequired: true,
      maxPlanSteps: 20,
      approvalMinutes: 10,
      manualFallback: true,
      correlationId: requestEnvelope.correlationId,
    };
  if (body.action === "workspace") return workspace(requestEnvelope.correlationId);
  return {
    schemaVersion: 1,
    action: body.action,
    targetRef: body.action === "create_target" ? TARGET_REF : null,
    planId: body.action === "create_plan" ? OWN_PLAN_ID : (body.planId ?? null),
    runId: null,
    status: body.action === "approve_plan" ? body.decision : "ready",
    planHash: body.action === "create_target" ? null : "c".repeat(64),
    applied: false,
    published: false,
    syntheticOnly: true,
    correlationId: requestEnvelope.correlationId,
  };
}

describe("EV2.14 transactional AI surface", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_EV2_AI_ASSIST_CANDIDATE", "true");
    vi.stubEnv("VITE_EV2_AI_EXECUTE_CANDIDATE", "true");
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "staging");
    AdminAiExecutionPage = (await import("@/admin/pages/AdminAiExecutionPage")).default;
  });

  afterAll(() => vi.unstubAllEnvs());

  beforeEach(() => {
    mocks.command.mockReset();
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) =>
      Promise.resolve(responseFor(body)),
    );
  });

  afterEach(() => cleanup());

  it("builds an expected-version plan without exposing raw JSON", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Execução transacional controlada" })).toBeVisible(),
    );
    expect(screen.getByText(/alvos sintéticos g14x-\*/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Adicionar ao plano" }));
    expect(screen.getByText(/espera v1/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Validar dry-run e solicitar revisão" }));

    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "create_plan",
          steps: [
            expect.objectContaining({
              toolKey: "draft.apply_patch",
              targetRef: TARGET_REF,
              expectedVersion: 1,
              arguments: { patch: { summary: "Resumo sintético preparado pelo plano G14." } },
            }),
          ],
        }),
        expect.any(String),
      ),
    );
    await waitFor(() =>
      expect(mocks.command.mock.calls.filter(([, body]) => body.action === "workspace")).toHaveLength(2),
    );
    expect(screen.queryByLabelText(/json/i)).not.toBeInTheDocument();
  });

  it("offers approval only for another planner and sends the immutable hash", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("option", { name: /Plano segregado para revisão/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Aprovar por 10 minutos" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "approve_plan",
          planId: OTHER_PLAN_ID,
          expectedPlanHash: "b".repeat(64),
          decision: "approved",
        }),
        expect.any(String),
      ),
    );
    await waitFor(() =>
      expect(mocks.command.mock.calls.filter(([, body]) => body.action === "workspace")).toHaveLength(2),
    );

    await user.selectOptions(screen.getByLabelText("Plano"), OWN_PLAN_ID);
    expect(screen.queryByRole("button", { name: "Aprovar por 10 minutos" })).not.toBeInTheDocument();
    expect(screen.getByText(/outro usuário sintético com mfa/i)).toBeVisible();
  });

  it("reuses the original command and idempotency key after an ambiguous response", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Execução transacional controlada" })).toBeVisible(),
    );
    let mutationAttempts = 0;
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "create_plan" && mutationAttempts < 2) {
        mutationAttempts += 1;
        return Promise.reject(new TypeError("resposta de rede ausente"));
      }
      return Promise.resolve(responseFor(body));
    });

    await user.click(screen.getByRole("button", { name: "Adicionar ao plano" }));
    await user.click(screen.getByRole("button", { name: "Validar dry-run e solicitar revisão" }));

    const retry = await screen.findByRole("button", { name: "Repetir comando pendente" });
    const initialAttempts = mocks.command.mock.calls.filter(([, body]) => body.action === "create_plan");
    expect(initialAttempts).toHaveLength(2);
    expect(initialAttempts[1][1]).toEqual(initialAttempts[0][1]);
    expect(initialAttempts[1][2]).toBe(initialAttempts[0][2]);
    expect(screen.getByRole("button", { name: "Validar dry-run e solicitar revisão" })).toBeDisabled();

    await user.click(retry);
    expect(await screen.findByText(/dry-run validado e plano sintético criado/i)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Repetir comando pendente" })).toBeNull(),
    );

    const recoveredAttempts = mocks.command.mock.calls.filter(([, body]) => body.action === "create_plan");
    expect(recoveredAttempts).toHaveLength(3);
    expect(new Set(recoveredAttempts.map(([, body]) => JSON.stringify(body))).size).toBe(1);
    expect(new Set(recoveredAttempts.map(([, , key]) => key)).size).toBe(1);
  });

  it("does not report a confirmed mutation as refused when only the refresh fails", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Execução transacional controlada" })).toBeVisible(),
    );
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) =>
      body.action === "workspace"
        ? Promise.reject(new Error("refresh indisponível"))
        : Promise.resolve(responseFor(body)),
    );
    await user.click(screen.getByRole("button", { name: "Adicionar ao plano" }));
    await user.click(screen.getByRole("button", { name: "Validar dry-run e solicitar revisão" }));

    expect(await screen.findByText(/dry-run validado e plano sintético criado/i)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/operação confirmada pelo servidor/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/não repita o comando/i);
  });
});
