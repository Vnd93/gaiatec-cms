import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalValid,
  compensateSnapshots,
  planHash,
  simulatePlan,
  TOOL_POLICY,
} from "./execution-policy.mjs";

const now = Date.parse("2026-09-04T12:00:00.000Z");
const plannerId = "51400000-0000-4000-8000-000000000101";
const reviewerId = "51400000-0000-4000-8000-000000000102";
const executorId = "51400000-0000-4000-8000-000000000103";

function target(overrides = {}) {
  return {
    reference: "g14x-node-target",
    environment: "staging",
    siteKey: "main",
    dataClass: "synthetic",
    lifecycle: "draft",
    payload: { summary: "Estado inicial" },
    version: 1,
    createdBy: plannerId,
    ...overrides,
  };
}

function completePlan() {
  return [
    {
      stepKey: "step-patch",
      toolKey: "draft.apply_patch",
      targetRef: "g14x-node-target",
      expectedVersion: 1,
      arguments: { patch: { summary: "Estado sintético revisado" } },
    },
    {
      stepKey: "step-submit",
      toolKey: "workflow.submit",
      targetRef: "g14x-node-target",
      expectedVersion: 2,
      arguments: {},
    },
    {
      stepKey: "step-schedule",
      toolKey: "release.schedule",
      targetRef: "g14x-node-target",
      expectedVersion: 3,
      arguments: { scheduledAt: "2026-09-04T13:00:00.000Z" },
    },
    {
      stepKey: "step-publish",
      toolKey: "release.publish",
      targetRef: "g14x-node-target",
      expectedVersion: 4,
      arguments: {},
    },
  ];
}

test("closed tool catalog is synthetic, reversible and risk classified", () => {
  assert.deepEqual(Object.keys(TOOL_POLICY).sort(), [
    "draft.apply_patch",
    "release.publish",
    "release.rollback",
    "release.schedule",
    "workflow.submit",
  ]);
  assert.ok(Object.values(TOOL_POLICY).every((tool) => tool.risk && tool.permission));
});

test("simulates a critical multi-step plan without touching the input", () => {
  const original = target();
  const result = simulatePlan({ targets: [original], steps: completePlan(), actorId: plannerId, now });
  assert.equal(result.valid, true);
  assert.equal(result.risk, "critical");
  assert.equal(result.stepCount, 4);
  assert.equal(result.targetCount, 1);
  assert.equal(result.targets[0].lifecycle, "published");
  assert.equal(result.targets[0].version, 5);
  assert.equal(original.lifecycle, "draft");
  assert.equal(original.version, 1);
});

test("plan hash changes after any version, title or step mutation", () => {
  const base = {
    environment: "staging",
    siteKey: "main",
    version: 1,
    title: "Plano G14",
    steps: completePlan(),
  };
  const hash = planHash(base);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(planHash({ ...base, version: 2 }), hash);
  assert.notEqual(planHash({ ...base, title: "Plano G14 revisto" }), hash);
  assert.notEqual(
    planHash({ ...base, steps: [{ ...base.steps[0], expectedVersion: 2 }, ...base.steps.slice(1)] }),
    hash,
  );
});

test("approval binds hash/version, expires and separates planner, reviewer and executor", () => {
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
  assert.equal(approvalValid({ plan, approval, actorId: executorId, now }), true);
  assert.equal(
    approvalValid({ plan, approval: { ...approval, planHash: "b".repeat(64) }, actorId: executorId, now }),
    false,
  );
  assert.equal(approvalValid({ plan, approval, actorId: reviewerId, now }), false);
  assert.equal(approvalValid({ plan, approval, actorId: executorId, now: now + 11 * 60_000 }), false);
});

test("fails closed for real/production targets, stale versions and invalid transitions", () => {
  assert.throws(
    () =>
      simulatePlan({
        targets: [target({ environment: "production" })],
        steps: completePlan(),
        actorId: plannerId,
        now,
      }),
    /CMS_AI_EXECUTE_TARGET_NOT_FOUND/,
  );
  assert.throws(
    () =>
      simulatePlan({
        targets: [target({ dataClass: "real" })],
        steps: completePlan(),
        actorId: plannerId,
        now,
      }),
    /CMS_AI_EXECUTE_TARGET_NOT_FOUND/,
  );
  assert.throws(
    () => simulatePlan({ targets: [target({ version: 2 })], steps: completePlan(), actorId: plannerId, now }),
    /CMS_AI_EXECUTE_TARGET_CONFLICT/,
  );
  assert.throws(
    () =>
      simulatePlan({
        targets: [target({ lifecycle: "review" })],
        steps: [completePlan()[0]],
        actorId: plannerId,
        now,
      }),
    /CMS_AI_EXECUTE_TRANSITION_INVALID/,
  );
});

test("compensation restores state but never moves the version counter backwards", () => {
  const execution = simulatePlan({ targets: [target()], steps: completePlan(), actorId: plannerId, now });
  const restored = compensateSnapshots(execution.targets, execution.snapshots);
  assert.equal(restored[0].lifecycle, "draft");
  assert.deepEqual(restored[0].payload, { summary: "Estado inicial" });
  assert.equal(restored[0].version, 6);
  assert.throws(
    () => compensateSnapshots([{ ...execution.targets[0], version: 9 }], execution.snapshots),
    /CMS_AI_EXECUTE_COMPENSATION_CONFLICT/,
  );
});
