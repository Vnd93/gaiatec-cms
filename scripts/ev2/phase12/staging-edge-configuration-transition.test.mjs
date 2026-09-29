import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { functionInventorySnapshot } from "./staging-cms-public-hotfix-lib.mjs";
import { expectedStagingEdgePublicSecrets } from "./staging-edge-public-secrets-lib.mjs";
import {
  STAGING_AI_EXTERNAL_PROVIDER_ENABLED,
  STAGING_OPENROUTER_MODEL,
} from "./staging-ai-provider-secrets-lib.mjs";
import {
  appendStagingEdgeConfigurationReceipt,
  evaluateConfigurationVersionTransition,
  verifyStagingEdgeConfigurationContext,
  verifyStagingEdgeConfigurationReceipt,
} from "./staging-edge-configuration-transition-lib.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const expected = {
  candidateSha: "a".repeat(40),
  projectRef: "glcqsosxwgmlhzgcsnzv",
  workflow: { runId: "36577142069", runAttempt: 1, controlSha: "b".repeat(40) },
};
const initial = functionInventorySnapshot(
  PRODUCTION_FUNCTIONS.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    slug: name,
    status: "ACTIVE",
    verifyJwt: !PUBLIC_FUNCTIONS.has(name),
    version: 200 + index,
    bundleSha256: digest(name),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    entrypointPath: `file:///workspace/supabase/functions/${name}/index.ts`,
    importMap: true,
    importMapPath: "file:///workspace/deno.json",
  })),
).records;
const baseline = {
  manifestSha256: "c".repeat(64),
  manifest: { ...expected, inventorySha256: functionInventorySnapshot(initial).inventorySha256 },
  functions: initial.map((tuple) => ({ slug: tuple.name, tuple })),
};
const publicSettings = expectedStagingEdgePublicSecrets(expected.candidateSha);
const publicProof = {
  event: "g12.staging.edge_public_secrets.verified",
  candidateSha: expected.candidateSha,
  configuredNames: Object.keys(publicSettings),
  expectedDigests: Object.fromEntries(
    Object.entries(publicSettings).map(([key, value]) => [key, digest(value)]),
  ),
  unmanagedSecretCount: 5,
  unmanagedSecretsPreserved: true,
  valuesDisclosed: 0,
};
const aiProof = {
  event: "g12.staging.ai_provider_secrets.verified",
  model: STAGING_OPENROUTER_MODEL,
  modelDigest: digest(STAGING_OPENROUTER_MODEL),
  switchDigest: digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED),
  apiKeyPreserved: true,
  unmanagedSecretCount: 12,
  unmanagedSecretsPreserved: true,
  valuesDisclosed: 0,
};
const advance = (records) => records.map((record) => ({ ...record, version: record.version + 1 }));
function fixture() {
  const first = advance(initial);
  const after = advance(first);
  const publicReceipt = appendStagingEdgeConfigurationReceipt({
    baseline,
    expected,
    kind: "public",
    before: initial,
    after: first,
    proof: publicProof,
  });
  const receipt = appendStagingEdgeConfigurationReceipt({
    previous: publicReceipt,
    baseline,
    expected,
    kind: "ai",
    before: first,
    after,
    proof: aiProof,
  });
  return { publicReceipt, receipt, after };
}

test("binds both authorized version-only transitions without modifying the durable baseline", () => {
  const before = structuredClone(baseline);
  const { receipt, after } = fixture();
  const verified = verifyStagingEdgeConfigurationReceipt({ receipt, baseline, expected });
  assert.deepEqual(verified.records, after);
  assert.deepEqual(baseline, before);
  assert.equal(receipt.steps.length, 2);
  assert.equal(verified.records.length, 34);
  assert.notEqual(verified.inventorySha256, baseline.manifest.inventorySha256);
});

test("does not treat raw +2 version drift or a partial configuration as an initial deployment baseline", () => {
  const { publicReceipt, after } = fixture();
  assert.equal(evaluateConfigurationVersionTransition(initial, after).valid, false);
  assert.throws(
    () => verifyStagingEdgeConfigurationReceipt({ receipt: publicReceipt, baseline, expected }),
    /RECEIPT_REFUSED/,
  );
  assert.throws(
    () =>
      appendStagingEdgeConfigurationReceipt({
        baseline,
        expected,
        kind: "public",
        before: after,
        after: advance(after),
        proof: publicProof,
      }),
    /PRESTATE_REFUSED/,
  );
});

test("validates the exact execution and durable baseline before allowing configuration mutation", () => {
  assert.equal(verifyStagingEdgeConfigurationContext({ baseline, expected }).valid, true);
  const mutations = [
    (r) => {
      r.expected.projectRef = "production";
    },
    (r) => {
      r.expected.candidateSha = "d".repeat(40);
    },
    (r) => {
      r.expected.workflow.runId = "36577142070";
    },
    (r) => {
      r.expected.workflow.runAttempt = 2;
    },
    (r) => {
      r.expected.workflow.controlSha = "e".repeat(40);
    },
    (r) => {
      delete r.baseline.manifest.workflow;
    },
    (r) => {
      r.baseline.manifest.inventorySha256 = "d".repeat(64);
    },
    (r) => {
      r.baseline.functions[0].tuple.version++;
    },
    (r) => {
      r.expected.workflow.runAttempt = 0;
    },
    (r) => {
      r.expected = undefined;
    },
    (r) => {
      r.baseline = undefined;
    },
  ];
  for (const mutate of mutations) {
    const input = { baseline: structuredClone(baseline), expected: structuredClone(expected) };
    mutate(input);
    assert.throws(() => verifyStagingEdgeConfigurationContext(input));
  }
});

test("rejects any field change except exactly one version advance in every known function", () => {
  const mutations = [
    (r) => {
      r[0].version += 1;
    },
    (r) => {
      r[0].version -= 1;
    },
    (r) => {
      r[0].bundleSha256 = "f".repeat(64);
    },
    (r) => {
      r[0].verifyJwt = !r[0].verifyJwt;
    },
    (r) => {
      r[0].updatedAt = "2026-09-29T00:00:00.000Z";
    },
    (r) => {
      r[0].createdAt = "2026-08-01T00:00:00.000Z";
    },
    (r) => {
      r[0].entrypointPath = "file:///other.ts";
    },
    (r) => {
      r[0].importMapPath = "file:///other.json";
    },
    (r) => {
      r[0].importMap = false;
    },
    (r) => {
      r[0].status = "REMOVED";
    },
    (r) => {
      r[0].id = "99999999-0000-4000-8000-000000000001";
    },
    (r) => {
      r[0].slug = "other";
    },
    (r) => {
      r.pop();
    },
    (r) => {
      r.push(r[0]);
    },
  ];
  for (const mutate of mutations) {
    const changed = advance(initial);
    mutate(changed);
    assert.equal(evaluateConfigurationVersionTransition(initial, changed).valid, false);
  }
});

test("rejects replay, reordered or broken chains, unbound proof, and weakened secret configuration", () => {
  const mutations = [
    (r) => {
      r.candidateSha = "d".repeat(40);
    },
    (r) => {
      r.projectRef = "production";
    },
    (r) => {
      r.workflow.runId = "36577142070";
    },
    (r) => {
      r.workflow.runAttempt = 2;
    },
    (r) => {
      r.workflow.controlSha = "e".repeat(40);
    },
    (r) => {
      r.baselineManifestSha256 = "d".repeat(64);
    },
    (r) => {
      r.steps.reverse();
    },
    (r) => {
      r.steps[1].beforeInventorySha256 = "f".repeat(64);
    },
    (r) => {
      r.steps[1].afterInventorySha256 = "f".repeat(64);
    },
    (r) => {
      r.steps[1].records[0].version++;
    },
    (r) => {
      r.steps[0].configurationProof.expectedDigests.CMS_RELEASE_SHA = "f".repeat(64);
    },
    (r) => {
      r.steps[1].configurationProof.apiKeyPreserved = false;
    },
    (r) => {
      r.steps[1].configurationProof.switchDigest = digest("false");
    },
    (r) => {
      r.steps[0].configurationProof.unmanagedSecretsPreserved = false;
    },
    (r) => {
      r.steps[0].configurationProof.valuesDisclosed = 1;
    },
    (r) => {
      r.shortcut = true;
    },
    (r) => {
      r.steps[0].extra = true;
    },
    (r) => {
      r.steps[0].configurationProof.payload = "unexpected";
    },
    (r) => {
      r.steps[1].configurationProof.payload = "unexpected";
    },
  ];
  for (const mutate of mutations) {
    const receipt = structuredClone(fixture().receipt);
    mutate(receipt);
    assert.throws(() => verifyStagingEdgeConfigurationReceipt({ receipt, baseline, expected }));
  }
});

test("workflow requires sealed configuration receipts before exact initial deployment and preserves recovery", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
    "utf8",
  );
  const wrapper = await readFile(new URL("./configure-staging-edge-transition.mjs", import.meta.url), "utf8");
  const deploy = await readFile(new URL("./deploy-staging-functions.mjs", import.meta.url), "utf8");
  const boundary = workflow.indexOf("Arm staging mutation only after every durable recovery proof exists");
  const publicStep = workflow.indexOf("id: staging_edge_public_transition");
  const aiStep = workflow.indexOf("id: staging_edge_ai_transition");
  const initialDeploy = workflow.indexOf(
    "Deploy the complete exact-candidate Edge Function inventory to staging",
  );
  assert.ok(boundary < publicStep && publicStep < aiStep && aiStep < initialDeploy);
  assert.match(
    workflow,
    /--previous-receipt-sha256 "\$\{\{ steps\.staging_edge_public_transition\.outputs\.receipt_sha256 \}\}"/,
  );
  assert.match(
    workflow,
    /--configuration-receipt-sha256 "\$\{\{ steps\.staging_edge_ai_transition\.outputs\.receipt_sha256 \}\}"/,
  );
  assert.match(wrapper, /loadAndVerifyAllEdgeRuntimeArtifact/);
  assert.match(wrapper, /join\(artifact\.sourceRoot, "scripts\/ev2\/phase12", script\)/);
  assert.ok(
    wrapper.indexOf("live.inventorySha256 !== beforeExpected.inventorySha256") <
      wrapper.indexOf("spawnSync(process.execPath"),
  );
  assert.ok(
    wrapper.indexOf("verifyStagingEdgeConfigurationContext({ baseline, expected })") <
      wrapper.indexOf("spawnSync(process.execPath"),
  );
  assert.equal((wrapper.match(/spawnSync\(process.execPath/g) ?? []).length, 1);
  assert.match(wrapper, /pollForVerifiedFunctionState/);
  assert.match(
    deploy,
    /deploymentMode === "initial" && liveSnapshot\.inventorySha256 !== initialInventorySha256/,
  );
  assert.match(deploy, /configurationReceiptSha256 !==\s+argument/);
  assert.match(
    deploy,
    /baselineFunctions: deploymentMode === "initial" \? initialBaselineFunctions : baseline.functions/,
  );
  assert.match(workflow, /--mode reconcile-candidate/);
  assert.doesNotMatch(wrapper, /--use-api|continue-on-error|method: "(?:PATCH|POST)"/);
});
