import type {
  Ev2AiExecutionRisk,
  Ev2AiExecutionStep,
  Ev2AiExecutionTool,
  Ev2AiSyntheticTarget,
} from "@/shared/contracts/ev2-ai-execute";

const riskRank: Record<Ev2AiExecutionRisk, number> = {
  draft: 0,
  workflow: 1,
  critical: 2,
};

export function expectedVersionForNextStep(
  target: Ev2AiSyntheticTarget,
  steps: readonly Ev2AiExecutionStep[],
): number {
  return target.version + steps.filter((step) => step.targetRef === target.reference).length;
}

export function planRisk(
  steps: readonly Ev2AiExecutionStep[],
  tools: readonly Ev2AiExecutionTool[],
): Ev2AiExecutionRisk {
  const byKey = new Map(tools.map((tool) => [tool.key, tool]));
  return steps.reduce<Ev2AiExecutionRisk>((highest, step) => {
    const next = byKey.get(step.toolKey)?.risk ?? "critical";
    return riskRank[next] > riskRank[highest] ? next : highest;
  }, "draft");
}

export function planTargetCount(steps: readonly Ev2AiExecutionStep[]): number {
  return new Set(steps.map((step) => step.targetRef)).size;
}

export function rebaseExpectedVersions(
  steps: readonly Ev2AiExecutionStep[],
  targets: readonly Ev2AiSyntheticTarget[],
): Ev2AiExecutionStep[] {
  const nextVersions = new Map(targets.map((target) => [target.reference, target.version]));
  return steps.map((step) => {
    const expectedVersion = nextVersions.get(step.targetRef);
    if (expectedVersion === undefined) return step;
    nextVersions.set(step.targetRef, expectedVersion + 1);
    return { ...step, expectedVersion };
  });
}

export function createExecutionStep(input: {
  key?: string;
  toolKey: Ev2AiExecutionStep["toolKey"];
  target: Ev2AiSyntheticTarget;
  existingSteps: readonly Ev2AiExecutionStep[];
  patchText?: string;
  scheduledAt?: string;
}): Ev2AiExecutionStep {
  const argumentsByTool: Record<Ev2AiExecutionStep["toolKey"], Record<string, unknown>> = {
    "draft.apply_patch": { patch: { summary: input.patchText?.trim() ?? "" } },
    "workflow.submit": {},
    "release.schedule": { scheduledAt: input.scheduledAt ?? "" },
    "release.publish": {},
    "release.rollback": {},
  };
  return {
    stepKey: input.key ?? `step-${crypto.randomUUID()}`,
    toolKey: input.toolKey,
    targetRef: input.target.reference,
    expectedVersion: expectedVersionForNextStep(input.target, input.existingSteps),
    arguments: argumentsByTool[input.toolKey],
  };
}

export function validateExecutionStep(step: Ev2AiExecutionStep): string | null {
  if (step.toolKey === "draft.apply_patch") {
    const patch = step.arguments.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return "Informe o patch sintético.";
    const summary = (patch as Record<string, unknown>).summary;
    if (typeof summary !== "string" || summary.trim().length < 3)
      return "O resumo sintético deve ter ao menos 3 caracteres.";
  }
  if (step.toolKey === "release.schedule") {
    const scheduledAt = step.arguments.scheduledAt;
    const instant = typeof scheduledAt === "string" ? Date.parse(scheduledAt) : Number.NaN;
    if (!Number.isFinite(instant)) return "Informe uma data válida para o agendamento sintético.";
  }
  return null;
}

export function canApprovePlan(createdBy: string, actorId: string, status: string): boolean {
  return status === "ready" && createdBy !== actorId;
}

export function canExecuteApprovedPlan(input: {
  status: string;
  expectedHash: string;
  currentHash: string;
  approvalStatus?: string;
  approvalExpiresAt?: string;
  now?: number;
}): boolean {
  const expiresAt = input.approvalExpiresAt ? Date.parse(input.approvalExpiresAt) : Number.NaN;
  return (
    input.status === "approved" &&
    input.expectedHash === input.currentHash &&
    input.approvalStatus === "active" &&
    Number.isFinite(expiresAt) &&
    expiresAt > (input.now ?? Date.now())
  );
}
