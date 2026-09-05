import { createHash } from "node:crypto";

export const TOOL_POLICY = Object.freeze({
  "draft.apply_patch": { risk: "draft", from: ["draft"], to: "draft", permission: "cms:ai.execute" },
  "workflow.submit": { risk: "workflow", from: ["draft"], to: "review", permission: "cms:ai.execute" },
  "release.schedule": { risk: "critical", from: ["review"], to: "scheduled", permission: "cms:ai.execute" },
  "release.publish": {
    risk: "critical",
    from: ["review", "scheduled"],
    to: "published",
    permission: "cms:ai.execute",
  },
  "release.rollback": {
    risk: "critical",
    from: ["published"],
    to: "review",
    permission: "cms:ai.compensate",
  },
});

const RISK_RANK = { draft: 0, workflow: 1, critical: 2 };
const STEP_KEY = /^step-[a-z0-9-]{3,60}$/;
const TARGET_REF = /^g14x-[a-z0-9-]{3,100}$/;

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

export function planHash({ environment, siteKey, version, title, steps }) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({ environment, siteKey, version, title, steps })))
    .digest("hex");
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateArguments(step, now) {
  const keys = Object.keys(step.arguments ?? {});
  if (step.toolKey === "draft.apply_patch") {
    if (keys.length !== 1 || keys[0] !== "patch") fail("CMS_AI_EXECUTE_PATCH_INVALID");
    const patch = step.arguments.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("CMS_AI_EXECUTE_PATCH_INVALID");
    if (Object.keys(patch).join(",") !== "summary") fail("CMS_AI_EXECUTE_PATCH_INVALID");
    if (typeof patch.summary !== "string" || patch.summary.trim().length < 3 || patch.summary.length > 3000)
      fail("CMS_AI_EXECUTE_PATCH_INVALID");
    return;
  }
  if (step.toolKey === "release.schedule") {
    if (keys.length !== 1 || keys[0] !== "scheduledAt") fail("CMS_AI_EXECUTE_SCHEDULE_INVALID");
    const scheduledAt = Date.parse(step.arguments.scheduledAt);
    if (!Number.isFinite(scheduledAt) || scheduledAt <= now || scheduledAt > now + 24 * 60 * 60 * 1000)
      fail("CMS_AI_EXECUTE_SCHEDULE_INVALID");
    return;
  }
  if (keys.length) fail("CMS_AI_EXECUTE_STEP_INVALID");
}

export function simulatePlan({ targets, steps, now = Date.now(), actorId }) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) fail("CMS_AI_EXECUTE_PLAN_INVALID");
  const state = new Map(
    targets.map((target) => [
      target.reference,
      { ...target, payload: structuredClone(target.payload), before: structuredClone(target) },
    ]),
  );
  const seen = new Set();
  let risk = "draft";
  const snapshots = [];
  for (const step of steps) {
    if (!step || Object.keys(step).sort().join(",") !== "arguments,expectedVersion,stepKey,targetRef,toolKey")
      fail("CMS_AI_EXECUTE_STEP_INVALID");
    if (!STEP_KEY.test(step.stepKey) || seen.has(step.stepKey)) fail("CMS_AI_EXECUTE_STEP_DUPLICATE");
    seen.add(step.stepKey);
    if (!TARGET_REF.test(step.targetRef)) fail("CMS_AI_EXECUTE_TARGET_NOT_FOUND");
    const tool = TOOL_POLICY[step.toolKey];
    if (!tool) fail("CMS_AI_EXECUTE_TOOL_DENIED");
    const target = state.get(step.targetRef);
    if (!target || target.environment === "production" || target.dataClass !== "synthetic")
      fail("CMS_AI_EXECUTE_TARGET_NOT_FOUND");
    if (actorId && target.createdBy !== actorId) fail("CMS_AI_EXECUTE_TARGET_NOT_FOUND");
    if (target.version !== step.expectedVersion) fail("CMS_AI_EXECUTE_TARGET_CONFLICT");
    if (!tool.from.includes(target.lifecycle)) fail("CMS_AI_EXECUTE_TRANSITION_INVALID");
    validateArguments(step, now);
    const before = structuredClone(target);
    if (step.toolKey === "draft.apply_patch") target.payload = { ...target.payload, ...step.arguments.patch };
    if (step.toolKey === "release.schedule") target.payload.scheduledAt = step.arguments.scheduledAt;
    if (step.toolKey === "release.publish") target.payload.publishedAt = new Date(now).toISOString();
    if (step.toolKey === "release.rollback") {
      delete target.payload.scheduledAt;
      delete target.payload.publishedAt;
    }
    target.lifecycle = tool.to;
    target.version += 1;
    snapshots.push({
      stepKey: step.stepKey,
      targetRef: step.targetRef,
      before,
      after: structuredClone(target),
    });
    if (RISK_RANK[tool.risk] > RISK_RANK[risk]) risk = tool.risk;
  }
  return {
    valid: true,
    risk,
    stepCount: steps.length,
    targetCount: new Set(steps.map((step) => step.targetRef)).size,
    reversible: true,
    targets: [...state.values()].map((target) => {
      const projected = { ...target };
      delete projected.before;
      return projected;
    }),
    snapshots,
  };
}

export function approvalValid({ plan, approval, actorId, now = Date.now() }) {
  if (!plan || !approval) return false;
  return (
    approval.decision === "approved" &&
    approval.status === "active" &&
    approval.purpose === "execute" &&
    approval.planHash === plan.planHash &&
    approval.planVersion === plan.planVersion &&
    approval.approvedBy !== plan.createdBy &&
    approval.approvedBy !== actorId &&
    Date.parse(approval.expiresAt) > now
  );
}

export function compensateSnapshots(targets, snapshots) {
  const restored = new Map(targets.map((target) => [target.reference, structuredClone(target)]));
  const references = [...new Set(snapshots.map((snapshot) => snapshot.targetRef))].sort();
  for (const reference of references) {
    const relevant = snapshots.filter((snapshot) => snapshot.targetRef === reference);
    const target = restored.get(reference);
    if (!target || target.version !== relevant.at(-1).after.version)
      fail("CMS_AI_EXECUTE_COMPENSATION_CONFLICT");
    const original = relevant[0].before;
    target.payload = structuredClone(original.payload);
    target.lifecycle = original.lifecycle;
    target.version += 1;
  }
  return [...restored.values()];
}
