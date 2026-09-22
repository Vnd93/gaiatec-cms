import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deployEdgeArtifactWithVerifiedCompensation,
  evaluateExactBaselineRestoration,
  evaluateExactEdgeArtifactDeployment,
  evaluateExactFunctionInventoryPreflight,
  evaluateStagingFunctionReconciliationPreflight,
  pollForVerifiedFunctionState,
} from "./staging-edge-artifact-deployment-lib.mjs";

const deployCli = await readFile(new URL("./deploy-staging-functions.mjs", import.meta.url), "utf8");
const verifyCli = await readFile(new URL("./verify-all-edge-runtime-artifact.mjs", import.meta.url), "utf8");

function remote(name, digest, version, updatedAt, verifyJwt) {
  return {
    name,
    status: "ACTIVE",
    version,
    updated_at: updatedAt,
    verify_jwt: verifyJwt,
    ezbr_sha256: digest,
  };
}

function artifact(slug, digest, verifyJwt) {
  return {
    slug,
    verifyJwt,
    entrypointPath: `file:///workspace/supabase/functions/${slug}/index.ts`,
    importMapPath: "file:///workspace/deno.json",
    raw: { sha256: "e".repeat(64), bytes: 10 },
    deployable: { sha256: digest, bytes: 8 },
  };
}

function fullRemote(name, digest, version, updatedAt, verifyJwt, overrides = {}) {
  const suffix = name === "private" ? "1" : "2";
  return {
    id: `00000000-0000-4000-8000-00000000000${suffix}`,
    name,
    slug: name,
    status: "ACTIVE",
    version,
    created_at: "2026-09-22T00:00:00Z",
    updated_at: updatedAt,
    verify_jwt: verifyJwt,
    ezbr_sha256: digest,
    entrypoint_path: `file:///workspace/supabase/functions/${name}/index.ts`,
    import_map: false,
    import_map_path: "file:///workspace/deno.json",
    ...overrides,
  };
}

function baselineFunction(tuple) {
  return { slug: tuple.slug, tuple };
}

test("candidate preflight requires one complete digest- and timestamp-valid live inventory", () => {
  const names = ["private", "public"];
  const publicFunctions = new Set(["public"]);
  const complete = [
    remote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true),
    remote("public", "b".repeat(64), 7, "2026-09-22T01:00:00Z", false),
  ];
  assert.equal(
    evaluateExactFunctionInventoryPreflight({ payload: complete, names, publicFunctions }).valid,
    true,
  );
  const missing = evaluateExactFunctionInventoryPreflight({
    payload: complete.slice(0, 1),
    names,
    publicFunctions,
  });
  assert.match(missing.violations.join(","), /public:missing/);
  assert.match(missing.violations.join(","), /inventory_cardinality_invalid/);
  const invalidEvidence = evaluateExactFunctionInventoryPreflight({
    payload: [{ ...complete[0], ezbr_sha256: "unknown", updated_at: "invalid" }, complete[1]],
    names,
    publicFunctions,
  });
  assert.match(invalidEvidence.violations.join(","), /private:bundle_digest_invalid/);
  assert.match(invalidEvidence.violations.join(","), /private:updated_at_invalid/);
});

test("candidate verification binds exact EZBR digest, JWT mode, and one bounded transition", () => {
  const before = [
    remote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true),
    remote("public", "b".repeat(64), 7, "2026-09-22T01:00:00Z", false),
  ];
  const after = [remote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true), before[1]];
  const result = evaluateExactEdgeArtifactDeployment({
    beforePayload: before,
    afterPayload: after,
    functions: [artifact("private", "c".repeat(64), true), artifact("public", "b".repeat(64), false)],
    candidateSourceDigests: { private: "1".repeat(64), public: "2".repeat(64) },
    baselineBundleDigests: { private: "3".repeat(64), public: "4".repeat(64) },
    mutatedNames: new Set(["private"]),
  });
  assert.equal(result.valid, true);
  assert.deepEqual(
    result.deployments.map(({ name, outcome, bundleSha256, verifyJwt }) => ({
      name,
      outcome,
      bundleSha256,
      verifyJwt,
    })),
    [
      {
        name: "private",
        outcome: "patched",
        bundleSha256: "c".repeat(64),
        verifyJwt: true,
      },
      {
        name: "public",
        outcome: "already-current",
        bundleSha256: "b".repeat(64),
        verifyJwt: false,
      },
    ],
  );
});

test("candidate verification fails closed on digest, JWT, version, or unselected drift", () => {
  const before = [remote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true)];
  const common = {
    beforePayload: before,
    functions: [artifact("private", "c".repeat(64), true)],
    candidateSourceDigests: { private: "1".repeat(64) },
    baselineBundleDigests: { private: "2".repeat(64) },
  };
  const digestMismatch = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [remote("private", "d".repeat(64), 4, "2026-09-22T01:01:00Z", true)],
    mutatedNames: new Set(["private"]),
  });
  assert.match(digestMismatch.violations.join(","), /artifact_bundle_digest_mismatch/);
  const jwtMismatch = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [remote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", false)],
    mutatedNames: new Set(["private"]),
  });
  assert.match(jwtMismatch.violations.join(","), /artifact_verify_jwt_mismatch/);
  const skippedVersion = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [remote("private", "c".repeat(64), 5, "2026-09-22T01:01:00Z", true)],
    mutatedNames: new Set(["private"]),
  });
  assert.match(skippedVersion.violations.join(","), /version_advance_invalid/);
  const unselectedDrift = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [remote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true)],
    mutatedNames: new Set(),
  });
  assert.match(unselectedDrift.violations.join(","), /unexpected_remote_mutation/);
});

test("reconciliation accepts only exact baseline/candidate states and patches only baseline members", () => {
  const baselinePrivate = fullRemote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true);
  const baselinePublic = fullRemote("public", "b".repeat(64), 7, "2026-09-22T01:00:00Z", false);
  const functions = [artifact("private", "c".repeat(64), true), artifact("public", "d".repeat(64), false)];
  const baselineFunctions = [baselineFunction(baselinePrivate), baselineFunction(baselinePublic)];
  const mixed = [baselinePrivate, fullRemote("public", "d".repeat(64), 8, "2026-09-22T01:01:00Z", false)];
  const reconciliation = evaluateStagingFunctionReconciliationPreflight({
    payload: mixed,
    functions,
    baselineFunctions,
    mode: "reconcile-candidate",
  });
  assert.equal(reconciliation.valid, true);
  assert.deepEqual(reconciliation.patchNames, ["private"]);
  assert.deepEqual(reconciliation.candidateOnlyNames, ["public"]);

  const alreadyCandidate = evaluateStagingFunctionReconciliationPreflight({
    payload: [
      fullRemote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true),
      fullRemote("public", "d".repeat(64), 8, "2026-09-22T01:01:00Z", false),
    ],
    functions,
    baselineFunctions,
    mode: "reconcile-candidate",
  });
  assert.equal(alreadyCandidate.valid, true);
  assert.deepEqual(alreadyCandidate.patchNames, []);

  const restoredWithAdvancedClocks = evaluateStagingFunctionReconciliationPreflight({
    payload: [
      fullRemote("private", "a".repeat(64), 6, "2026-09-22T01:04:00Z", true),
      fullRemote("public", "b".repeat(64), 10, "2026-09-22T01:04:00Z", false),
    ],
    functions,
    baselineFunctions,
    mode: "reconcile-candidate",
  });
  assert.equal(restoredWithAdvancedClocks.valid, true);
  assert.deepEqual(restoredWithAdvancedClocks.patchNames, ["private", "public"]);
});

test("initial and recovery reconciliation reject clock drift, third bytes, and metadata drift", () => {
  const baseline = fullRemote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true);
  const functions = [artifact("private", "c".repeat(64), true)];
  const baselineFunctions = [baselineFunction(baseline)];
  assert.equal(
    evaluateStagingFunctionReconciliationPreflight({
      payload: [baseline],
      functions,
      baselineFunctions,
      mode: "initial",
    }).valid,
    true,
  );
  assert.match(
    evaluateStagingFunctionReconciliationPreflight({
      payload: [fullRemote("private", "a".repeat(64), 4, "2026-09-22T01:01:00Z", true)],
      functions,
      baselineFunctions,
      mode: "initial",
    }).violations.join(","),
    /initial_baseline_mismatch/,
  );
  for (const payload of [
    [fullRemote("private", "f".repeat(64), 4, "2026-09-22T01:01:00Z", true)],
    [
      fullRemote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true, {
        entrypoint_path: "file:///unexpected/index.ts",
      }),
    ],
    [
      fullRemote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true, {
        id: "00000000-0000-4000-8000-000000000099",
      }),
    ],
  ]) {
    const refused = evaluateStagingFunctionReconciliationPreflight({
      payload,
      functions,
      baselineFunctions,
      mode: "reconcile-candidate",
    });
    assert.equal(refused.valid, false);
    assert.match(refused.violations.join(","), /reconciliation_third_state/);
  }
  const candidateWithoutAdvance = evaluateStagingFunctionReconciliationPreflight({
    payload: [fullRemote("private", "c".repeat(64), 3, "2026-09-22T01:00:00Z", true)],
    functions,
    baselineFunctions,
    mode: "reconcile-candidate",
  });
  assert.match(candidateWithoutAdvance.violations.join(","), /reconciliation_third_state/);
});

test("candidate verification binds immutable metadata and artifact paths", () => {
  const baseline = fullRemote("private", "a".repeat(64), 3, "2026-09-22T01:00:00Z", true);
  const candidateArtifact = artifact("private", "c".repeat(64), true);
  const common = {
    beforePayload: [baseline],
    functions: [candidateArtifact],
    candidateSourceDigests: { private: "1".repeat(64) },
    baselineBundleDigests: { private: "a".repeat(64) },
    mutatedNames: new Set(["private"]),
    baselineFunctions: [baselineFunction(baseline)],
  };
  const valid = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [fullRemote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true)],
  });
  assert.equal(valid.valid, true);
  const metadataDrift = evaluateExactEdgeArtifactDeployment({
    ...common,
    afterPayload: [
      fullRemote("private", "c".repeat(64), 4, "2026-09-22T01:01:00Z", true, {
        import_map_path: "file:///unexpected/deno.json",
      }),
    ],
  });
  assert.match(metadataDrift.violations.join(","), /candidate_state/);
});

test("baseline compensation verifies the exact pre-mutation digests and JWT modes", () => {
  const expected = [remote("one", "a".repeat(64), 2, "2026-09-22T01:00:00Z", true)];
  assert.equal(
    evaluateExactBaselineRestoration({
      expectedPayload: expected,
      currentPayload: [remote("one", "a".repeat(64), 4, "2026-09-22T01:02:00Z", true)],
      names: ["one"],
      publicFunctions: new Set(),
    }).valid,
    true,
  );
  assert.match(
    evaluateExactBaselineRestoration({
      expectedPayload: expected,
      currentPayload: [remote("one", "b".repeat(64), 4, "2026-09-22T01:02:00Z", true)],
      names: ["one"],
      publicFunctions: new Set(),
    }).violations.join(","),
    /baseline_digest_mismatch/,
  );
  assert.match(
    evaluateExactBaselineRestoration({
      expectedPayload: expected,
      currentPayload: [remote("one", "a".repeat(64), 4, "2026-09-22T00:59:00Z", true)],
      names: ["one"],
      publicFunctions: new Set(),
    }).violations.join(","),
    /baseline_updated_at_regressed/,
  );
});

test("bounded polling exits early and otherwise uses capped exponential backoff", async () => {
  let reads = 0;
  const delays = [];
  const verified = await pollForVerifiedFunctionState({
    readInventory: async () => ({ reads: ++reads }),
    evaluate: (payload) => ({ valid: payload.reads === 3, violations: ["not_yet"] }),
    attempts: 5,
    initialDelayMs: 10,
    maximumDelayMs: 15,
    sleep: async (milliseconds) => delays.push(milliseconds),
  });
  assert.equal(verified.attempts, 3);
  assert.deepEqual(delays, [10, 15]);
  await assert.rejects(
    pollForVerifiedFunctionState({
      readInventory: async () => ({}),
      evaluate: () => ({ valid: false, violations: ["digest_mismatch"] }),
      attempts: 2,
      initialDelayMs: 1,
      maximumDelayMs: 1,
      sleep: async () => undefined,
    }),
    /G12_STAGING_EDGE_ARTIFACT_POLL_REFUSED:digest_mismatch/,
  );
});

test("an ambiguous or failed artifact PATCH restores baseline and still fails", async () => {
  const events = [];
  await assert.rejects(
    deployEdgeArtifactWithVerifiedCompensation({
      names: ["one", "two"],
      deployOne: async (name) => {
        events.push(`patch:${name}`);
        if (name === "two") throw new Error("ambiguous");
      },
      verifyCandidate: async () => events.push("verify"),
      restoreBaseline: async () => events.push("restore-baseline-source"),
    }),
    /G12_STAGING_FUNCTION_DEPLOY_FAILED_COMPENSATED:two/,
  );
  assert.deepEqual(events, ["patch:one", "patch:two", "restore-baseline-source"]);
});

test("staging candidate CLI accepts only a verified artifact and PATCHes exact EZBR bytes", () => {
  assert.match(deployCli, /--candidate-artifact/);
  assert.match(deployCli, /--artifact-manifest-sha256/);
  assert.match(deployCli, /--baseline-artifact/);
  assert.match(deployCli, /--baseline-manifest-sha256/);
  assert.match(deployCli, /--mode/);
  assert.match(deployCli, /reconcile-candidate/);
  assert.match(deployCli, /loadAndVerifyAllEdgeRuntimeArtifact/);
  assert.match(deployCli, /sourceDigestInventory\(artifact\.sourceRoot/);
  assert.match(deployCli, /method: "PATCH"/);
  assert.match(deployCli, /contentType: "application\/vnd\.denoland\.eszip"/);
  for (const parameter of ["ezbr_sha256", "verify_jwt", "entrypoint_path", "import_map_path"])
    assert.match(deployCli, new RegExp(`${parameter}:`));
  assert.match(deployCli, /sha256\(body\) !== expectedBody\.sha256/);
  assert.match(deployCli, /evaluateExactEdgeArtifactDeployment/);
  assert.match(deployCli, /evaluateExactBaselineRestoration/);
  assert.match(deployCli, /loadAndVerifyStagingEdgeBaselineArtifact/);
  assert.doesNotMatch(deployCli, /runBaselineDeploy|rollbackSourceRoot|"functions",\s*"deploy"/);
  assert.doesNotMatch(deployCli, /classifyFunctionDeploymentOutput|reconvergeCandidate/);
});

test("read-only artifact verifier exposes stable integration outputs", () => {
  assert.match(verifyCli, /argument\("root"\)/);
  assert.match(verifyCli, /argument\("candidate-sha"\)/);
  assert.match(verifyCli, /argument\("manifest-sha256"\)/);
  assert.match(verifyCli, /loadAndVerifyAllEdgeRuntimeArtifact/);
  for (const output of [
    "candidate_sha",
    "manifest_sha256",
    "file_index_sha256",
    "inventory_sha256",
    "function_count",
    "transport",
  ])
    assert.match(verifyCli, new RegExp(`${output}=`));
});
