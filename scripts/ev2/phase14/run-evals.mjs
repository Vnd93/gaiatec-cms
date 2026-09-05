import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { approvalValid, compensateSnapshots, simulatePlan } from "./execution-policy.mjs";

const datasetText = readFileSync(new URL("./eval-dataset.json", import.meta.url), "utf8");
const dataset = JSON.parse(datasetText);
const now = Date.parse("2026-09-04T12:00:00.000Z");
const plannerId = "51400000-0000-4000-8000-000000000101";
const reviewerId = "51400000-0000-4000-8000-000000000102";
const executorId = "51400000-0000-4000-8000-000000000103";

const baseTarget = {
  reference: "g14x-eval-target",
  environment: "staging",
  siteKey: "main",
  dataClass: "synthetic",
  lifecycle: "draft",
  payload: { summary: "Estado inicial" },
  version: 1,
  createdBy: plannerId,
};
const draftStep = {
  stepKey: "step-eval-patch",
  toolKey: "draft.apply_patch",
  targetRef: baseTarget.reference,
  expectedVersion: 1,
  arguments: { patch: { summary: "Resumo sintético avaliado" } },
};
const publishSteps = [
  draftStep,
  {
    stepKey: "step-eval-submit",
    toolKey: "workflow.submit",
    targetRef: baseTarget.reference,
    expectedVersion: 2,
    arguments: {},
  },
  {
    stepKey: "step-eval-publish",
    toolKey: "release.publish",
    targetRef: baseTarget.reference,
    expectedVersion: 3,
    arguments: {},
  },
];
const plan = { createdBy: plannerId, planHash: "a".repeat(64), planVersion: 1 };
const approval = {
  purpose: "execute",
  decision: "approved",
  status: "active",
  planHash: plan.planHash,
  planVersion: 1,
  approvedBy: reviewerId,
  expiresAt: "2026-09-04T12:10:00.000Z",
};

function planCase(mutation) {
  let target = structuredClone(baseTarget);
  let steps = structuredClone(mutation === "validPublish" ? publishSteps : [draftStep]);
  if (mutation === "production") target.environment = "production";
  if (mutation === "realData") target.dataClass = "real";
  if (mutation === "foreignActor") target.createdBy = reviewerId;
  if (mutation === "staleVersion") target.version = 2;
  if (mutation === "unknownTool") steps[0].toolKey = "system.shell";
  if (mutation === "duplicateStep") steps = [steps[0], structuredClone(steps[0])];
  if (mutation === "invalidTransition") target.lifecycle = "published";
  if (mutation === "lateSchedule") {
    target.lifecycle = "review";
    steps = [
      {
        stepKey: "step-eval-schedule",
        toolKey: "release.schedule",
        targetRef: target.reference,
        expectedVersion: 1,
        arguments: { scheduledAt: "2026-09-06T12:00:00.000Z" },
      },
    ];
  }
  if (mutation === "extraPatchField") steps[0].arguments.patch.unsafe = true;
  return simulatePlan({ targets: [target], steps, actorId: plannerId, now });
}

function approvalCase(mutation) {
  let currentPlan = structuredClone(plan);
  let currentApproval = structuredClone(approval);
  let actorId = executorId;
  let instant = now;
  if (mutation === "changedHash") currentPlan.planHash = "b".repeat(64);
  if (mutation === "selfExecute") actorId = reviewerId;
  if (mutation === "authorApproval") currentApproval.approvedBy = plannerId;
  if (mutation === "expired") instant += 11 * 60_000;
  return approvalValid({ plan: currentPlan, approval: currentApproval, actorId, now: instant });
}

function compensationCase(mutation) {
  const execution = simulatePlan({ targets: [baseTarget], steps: publishSteps, actorId: plannerId, now });
  const targets = structuredClone(execution.targets);
  if (mutation === "diverged") targets[0].version += 1;
  return compensateSnapshots(targets, execution.snapshots);
}

let passed = 0;
const failures = [];
for (const item of dataset.cases) {
  try {
    const result =
      item.kind === "plan"
        ? planCase(item.mutation)
        : item.kind === "approval"
          ? approvalCase(item.mutation)
          : compensationCase(item.mutation);
    const actual = item.kind === "approval" ? (result ? "allow" : "deny") : "allow";
    if (actual !== item.expected) throw new Error(`esperado ${item.expected}; recebido ${actual}`);
    passed += 1;
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    if (actual === item.expected) passed += 1;
    else failures.push({ id: item.id, expected: item.expected, actual });
  }
}

const metrics = {
  schemaVersion: 1,
  gate: "G14",
  suiteKey: dataset.suiteKey,
  datasetHash: createHash("sha256").update(datasetText).digest("hex"),
  cases: dataset.cases.length,
  passed,
  failed: failures.length,
  bypassCount: failures.filter((failure) => /production|real|foreign|unknown/.test(failure.id)).length,
  permissionPassRate: passed / dataset.cases.length,
  hashInvalidationPassRate: failures.some((failure) => failure.id === "approval-changed-hash") ? 0 : 1,
  compensationPassRate: failures.some((failure) => failure.id.startsWith("compensation-")) ? 0 : 1,
};

if (failures.length) {
  console.error(JSON.stringify({ metrics, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ metrics, result: "approved-local" }, null, 2));
}
