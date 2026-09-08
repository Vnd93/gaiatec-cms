import { describe, expect, it } from "vitest";
import {
  Ev2AiExecutionCapabilitySchema,
  Ev2AiExecutionWorkspaceSchema,
  type Ev2AiExecutionStep,
  type Ev2AiExecutionTool,
  type Ev2AiSyntheticTarget,
} from "@/shared/contracts/ev2-ai-execute";
import {
  createExecutionStep,
  expectedVersionForNextStep,
  planRisk,
  planTargetCount,
  rebaseExpectedVersions,
  validateExecutionStep,
} from "@/admin/ai-execution-model";

const actorId = "51400000-0000-4000-8000-000000000101";
const target: Ev2AiSyntheticTarget = {
  reference: "g14x-test-target",
  title: "Alvo sintético",
  lifecycle: "draft",
  payload: { summary: "Estado inicial" },
  version: 4,
  owned: true,
  updatedAt: "2026-09-04T12:00:00.000Z",
};
const tools: Ev2AiExecutionTool[] = [
  ["draft.apply_patch", "Aplicar patch", "draft", "cms:ai.execute"],
  ["workflow.submit", "Submeter", "workflow", "cms:ai.execute"],
  ["release.schedule", "Agendar", "critical", "cms:ai.execute"],
  ["release.publish", "Publicar", "critical", "cms:ai.execute"],
  ["release.rollback", "Retirar", "critical", "cms:ai.compensate"],
].map(([key, name, risk, permission]) => ({
  key: key as Ev2AiExecutionTool["key"],
  name,
  risk: risk as Ev2AiExecutionTool["risk"],
  permission: permission as Ev2AiExecutionTool["permission"],
  syntheticOnly: true,
  reversible: true,
  active: true,
}));

describe("EV2.14 transactional AI model", () => {
  it("increments expected versions per target and raises risk monotonically", () => {
    const first = createExecutionStep({
      key: "step-first",
      toolKey: "draft.apply_patch",
      target,
      existingSteps: [],
      patchText: "Resumo sintético revisado.",
    });
    const second = createExecutionStep({
      key: "step-second",
      toolKey: "workflow.submit",
      target,
      existingSteps: [first],
    });
    const third = createExecutionStep({
      key: "step-third",
      toolKey: "release.publish",
      target,
      existingSteps: [first, second],
    });

    expect([first.expectedVersion, second.expectedVersion, third.expectedVersion]).toEqual([4, 5, 6]);
    expect(expectedVersionForNextStep(target, [first, second, third])).toBe(7);
    expect(planRisk([first], tools)).toBe("draft");
    expect(planRisk([first, second], tools)).toBe("workflow");
    expect(planRisk([first, second, third], tools)).toBe("critical");
    expect(planTargetCount([first, second, third])).toBe(1);
  });

  it("rejects empty patches and invalid schedules before calling the gateway", () => {
    const invalidPatch: Ev2AiExecutionStep = {
      stepKey: "step-empty",
      toolKey: "draft.apply_patch",
      targetRef: target.reference,
      expectedVersion: 4,
      arguments: { patch: { summary: "" } },
    };
    const invalidSchedule: Ev2AiExecutionStep = {
      stepKey: "step-schedule",
      toolKey: "release.schedule",
      targetRef: target.reference,
      expectedVersion: 4,
      arguments: { scheduledAt: "not-a-date" },
    };
    expect(validateExecutionStep(invalidPatch)).toMatch(/3 caracteres/i);
    expect(validateExecutionStep(invalidSchedule)).toMatch(/data válida/i);
  });

  it("rebases expected versions after a step is removed or a target changes", () => {
    const steps = [
      createExecutionStep({
        key: "step-rebase-first",
        toolKey: "draft.apply_patch",
        target,
        existingSteps: [],
        patchText: "Primeiro resumo sintético.",
      }),
      createExecutionStep({
        key: "step-rebase-second",
        toolKey: "workflow.submit",
        target,
        existingSteps: [
          {
            stepKey: "step-rebase-first",
            toolKey: "draft.apply_patch",
            targetRef: target.reference,
            expectedVersion: 4,
            arguments: { patch: { summary: "Primeiro resumo sintético." } },
          },
        ],
      }),
    ];
    expect(rebaseExpectedVersions(steps.slice(1), [target])[0].expectedVersion).toBe(4);
    expect(
      rebaseExpectedVersions(steps, [{ ...target, version: 9 }]).map((step) => step.expectedVersion),
    ).toEqual([9, 10]);
  });

  it("fails the capability contract closed in production", () => {
    const capability = {
      schemaVersion: 1,
      enabled: true,
      source: "individual_overrides",
      environment: "production",
      siteKey: "main",
      providerMode: "openrouter",
      providerModel: "nvidia/nemotron-3.5-lightning:free",
      externalProviderEnabled: true,
      externalProviderReady: true,
      realDataAllowed: false,
      syntheticOnly: true,
      requiresAiAssist: true,
      planHashRequired: true,
      reviewerSeparationRequired: true,
      compensationRequired: true,
      maxPlanSteps: 20,
      approvalMinutes: 10,
      manualFallback: true,
      correlationId: "51400000-0000-4000-8000-000000000102",
    };
    expect(Ev2AiExecutionCapabilitySchema.safeParse(capability).success).toBe(false);
    expect(Ev2AiExecutionCapabilitySchema.parse({ ...capability, enabled: false })).toMatchObject({
      enabled: false,
      environment: "production",
    });
  });

  it("accepts only the closed synthetic workspace topology", () => {
    const step = createExecutionStep({
      key: "step-contract",
      toolKey: "draft.apply_patch",
      target,
      existingSteps: [],
      patchText: "Resumo sintético atualizado.",
    });
    const workspace = {
      schemaVersion: 1,
      correlationId: "51400000-0000-4000-8000-000000000103",
      policy: {
        gate: "G14",
        dataClass: "synthetic",
        productionAllowed: false,
        providerMode: "openrouter",
        providerModel: "nvidia/nemotron-3.5-lightning:free",
        externalProviderEnabled: true,
        externalProviderReady: true,
        maxPlanSteps: 20,
        approvalMinutes: 10,
        reviewerSeparationRequired: true,
        compensationRequired: true,
        sameRunRequired: true,
        automaticPublishAllowed: false,
        manualFallback: true,
      },
      permissions: { canPlan: true, canApprove: false, canExecute: true, canCompensate: false },
      tools,
      targets: [target],
      plans: [
        {
          id: "51400000-0000-4000-8000-000000000201",
          title: "Plano sintético",
          status: "ready",
          risk: "draft",
          planVersion: 1,
          planHash: "a".repeat(64),
          steps: [step],
          dryRun: { valid: true, stepCount: 1, targetCount: 1, risk: "draft", reversible: true },
          createdBy: actorId,
          owned: true,
          approvable: false,
          executable: false,
          compensatable: false,
          expiresAt: "2026-09-04T12:30:00.000Z",
          createdAt: "2026-09-04T12:00:00.000Z",
          approvals: [],
          runs: [],
        },
      ],
    };
    expect(Ev2AiExecutionWorkspaceSchema.parse(workspace)).toMatchObject({
      policy: { productionAllowed: false, dataClass: "synthetic" },
      plans: [{ planHash: "a".repeat(64) }],
    });
    expect(
      Ev2AiExecutionWorkspaceSchema.safeParse({
        ...workspace,
        policy: { ...workspace.policy, productionAllowed: true },
      }).success,
    ).toBe(false);
  });
});
