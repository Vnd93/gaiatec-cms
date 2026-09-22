import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPipelineDurationReport, validatePipelineSloBaseline } from "./pipeline-duration-lib.mjs";

const baseline = JSON.parse(
  await readFile(
    new URL("../../../.github/release-controls/pipeline-slo-baseline.json", import.meta.url),
    "utf8",
  ),
);
const ciWorkflow = await readFile(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");
const bridgeWorkflow = await readFile(
  new URL("../../../.github/workflows/promote-staging-frontend-bridge.yml", import.meta.url),
  "utf8",
);
const deployWorkflow = await readFile(
  new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
);

function fixture({ deployConclusion = "success", deploySeconds = 2500 } = {}) {
  return {
    run: {
      id: 123,
      run_attempt: 1,
      name: "Deploy staging",
      head_sha: "a".repeat(40),
      run_started_at: "2026-09-22T10:00:00Z",
      repository: { full_name: "Vnd93/gaiatec-cms" },
    },
    jobsPayload: {
      jobs: [
        {
          id: 1,
          name: "deploy",
          status: "completed",
          conclusion: deployConclusion,
          started_at: "2026-09-22T10:00:00Z",
          completed_at: new Date(Date.parse("2026-09-22T10:00:00Z") + deploySeconds * 1000).toISOString(),
          steps: [
            {
              number: 1,
              name: "serial exclusive mutation",
              status: "completed",
              conclusion: deployConclusion,
              started_at: "2026-09-22T10:01:00Z",
              completed_at: "2026-09-22T10:21:00Z",
            },
          ],
        },
        {
          id: 2,
          name: "pipeline-metrics",
          status: "in_progress",
          conclusion: null,
          started_at: "2026-09-22T10:45:00Z",
          completed_at: null,
          steps: [],
        },
      ],
    },
  };
}

test("baseline is source-derived and cannot relax gates", () => {
  assert.doesNotThrow(() => validatePipelineSloBaseline(baseline));
  assert.equal(baseline.derivedBaseline.successfulFullReleaseSamples, 0);
  assert.equal(baseline.derivedBaseline.confidence, "provisional-until-first-green-full-release");
});

test("successful 40-60 minute path reports every stage and the bottleneck", () => {
  const input = fixture();
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "full-release",
    scope: "end-to-end",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.releaseOutcome, "success");
  assert.equal(report.observedSeconds, 2700);
  assert.equal(report.slo.state, "within-target-window");
  assert.equal(report.slo.gatesRelaxed, false);
  assert.equal(report.bottleneck.stage, "deploy");
  assert.equal(report.bottleneck.step, "serial exclusive mutation");
  assert.equal(report.stages.length, 2);
  assert.equal(report.controlSha, "a".repeat(40));
});

test("component duration separates the sealed candidate SHA from the workflow control SHA", () => {
  const input = fixture();
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "full-release",
    scope: "component",
    expectedStages: ["deploy"],
    candidateSha: "b".repeat(40),
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.candidateSha, "b".repeat(40));
  assert.equal(report.controlSha, "a".repeat(40));
});

test("overrun names the bottleneck without changing any gate", () => {
  const input = fixture({ deploySeconds: 3700 });
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "full-release",
    scope: "end-to-end",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T11:01:40Z",
  });
  assert.equal(report.slo.state, "above-target-window");
  assert.equal(report.slo.gatesRelaxed, false);
  assert.equal(report.bottleneck.stageDurationSeconds, 3700);
});

test("failed or recovered runs are measured but never claimed as a happy path", () => {
  const input = fixture({ deployConclusion: "failure" });
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "database-auth",
    scope: "end-to-end",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.releaseOutcome, "non-happy-path");
  assert.equal(report.slo.state, "not-evaluated-non-happy-path");
});

test("repository mismatches and tampered baseline durations fail closed", () => {
  const input = fixture();
  input.run.repository.full_name = "attacker/repository";
  assert.throws(
    () =>
      buildPipelineDurationReport({
        ...input,
        baseline,
        profile: "full-release",
        scope: "end-to-end",
        expectedStages: ["deploy"],
        capturedAt: "2026-09-22T10:45:00Z",
      }),
    /repository mismatch/u,
  );
  const tampered = structuredClone(baseline);
  tampered.observations[0].durationSeconds += 1;
  assert.throws(() => validatePipelineSloBaseline(tampered), /not source-derived/u);

  const tamperedCriticalJob = structuredClone(baseline);
  tamperedCriticalJob.observations[2].criticalJobDurationSeconds -= 1;
  assert.throws(() => validatePipelineSloBaseline(tamperedCriticalJob), /not source-derived/u);

  const unprovedRecovery = structuredClone(baseline);
  unprovedRecovery.observations[2].recoveryEvidence = null;
  assert.throws(() => validatePipelineSloBaseline(unprovedRecovery), /recovery evidence is invalid/u);
});

test("skipped jobs and steps ignore contradictory provider timestamps", () => {
  const input = fixture();
  input.jobsPayload.jobs.unshift({
    id: 99,
    name: "diagnostic",
    status: "completed",
    conclusion: "skipped",
    started_at: "2026-09-22T10:00:01Z",
    completed_at: "2026-09-22T10:00:00Z",
    steps: [
      {
        number: 1,
        name: "not executed",
        status: "completed",
        conclusion: "skipped",
        started_at: "2026-09-22T10:00:01Z",
        completed_at: "2026-09-22T10:00:00Z",
      },
    ],
  });
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "full-release",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  const skipped = report.stages.find((stage) => stage.name === "diagnostic");
  assert.equal(skipped.durationSeconds, null);
  assert.equal(skipped.steps[0].durationSeconds, null);
});

test("unknown profiles and invalid attempts fail closed", () => {
  const input = fixture();
  assert.throws(
    () =>
      buildPipelineDurationReport({
        ...input,
        baseline,
        profile: "unknown",
        scope: "component",
        expectedStages: ["deploy"],
        capturedAt: "2026-09-22T10:45:00Z",
      }),
    /profile is invalid/u,
  );
  input.run.run_attempt = 0;
  assert.throws(
    () =>
      buildPipelineDurationReport({
        ...input,
        baseline,
        profile: "full-release",
        scope: "component",
        expectedStages: ["deploy"],
        capturedAt: "2026-09-22T10:45:00Z",
      }),
    /run_attempt is invalid/u,
  );
});

test("component reports preserve stage metrics without misclaiming the end-to-end SLO", () => {
  const input = fixture();
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "frontend-only",
    scope: "component",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.slo.state, "component-only");
  assert.equal(report.slo.gatesRelaxed, false);
});

test("skipped required stages and unexpected active stages never become a happy path", () => {
  const skipped = fixture({ deployConclusion: "skipped" });
  const report = buildPipelineDurationReport({
    ...skipped,
    baseline,
    profile: "full-release",
    scope: "end-to-end",
    expectedStages: ["deploy"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.releaseOutcome, "non-happy-path");

  const unexpected = fixture();
  unexpected.jobsPayload.jobs.splice(1, 0, {
    id: 3,
    name: "unbound-gate",
    status: "completed",
    conclusion: "success",
    started_at: "2026-09-22T10:00:00Z",
    completed_at: "2026-09-22T10:01:00Z",
    steps: [],
  });
  assert.throws(
    () =>
      buildPipelineDurationReport({
        ...unexpected,
        baseline,
        profile: "full-release",
        scope: "component",
        expectedStages: ["deploy"],
        capturedAt: "2026-09-22T10:45:00Z",
      }),
    /unexpected active pipeline stage/u,
  );
});

test("the bottleneck step always belongs to the reported bottleneck stage", () => {
  const input = fixture();
  input.jobsPayload.jobs.splice(1, 0, {
    id: 3,
    name: "preflight",
    status: "completed",
    conclusion: "success",
    started_at: "2026-09-22T10:00:00Z",
    completed_at: "2026-09-22T10:05:00Z",
    steps: [
      {
        number: 1,
        name: "slow preflight child",
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-22T10:00:00Z",
        completed_at: "2026-09-22T10:04:59Z",
      },
    ],
  });
  const report = buildPipelineDurationReport({
    ...input,
    baseline,
    profile: "full-release",
    scope: "component",
    expectedStages: ["deploy", "preflight"],
    capturedAt: "2026-09-22T10:45:00Z",
  });
  assert.equal(report.bottleneck.stage, "deploy");
  assert.equal(report.bottleneck.step, "serial exclusive mutation");
});

test("CI always validates the fan-in and records main-push timing after selected jobs", () => {
  const metrics = ciWorkflow.slice(ciWorkflow.indexOf("  pipeline-metrics:"));
  assert.match(
    metrics,
    /needs: \[release-plan, quality, package-staging, hotfix-bundle-smoke, database, browser\]/,
  );
  assert.match(metrics, /^\s+if: always\(\)$/m);
  assert.match(metrics, /verify-ci-profile-needs\.mjs/);
  assert.match(
    metrics,
    /Capture every completed CI stage[\s\S]*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(metrics, /write-pipeline-duration-report\.mjs/);
  assert.match(metrics, /--scope component/);
  for (const stages of [
    "release-plan,quality,package-staging,browser",
    "release-plan,quality,package-staging,hotfix-bundle-smoke,browser",
    "release-plan,quality,package-staging,database,browser",
    "release-plan,quality,package-staging,hotfix-bundle-smoke,database,browser",
  ]) {
    assert.match(metrics, new RegExp(stages));
  }
  assert.match(metrics, /--expected-stages "\$expected_stages"/);
  assert.match(metrics, /retention-days: (?:9\d|[1-9]\d{2,})/);
  assert.match(metrics, /pipeline-duration-report\.json/);
});

test("bridge and staging record component timings after terminal recovery handling", () => {
  const bridgeMetrics = bridgeWorkflow.slice(bridgeWorkflow.indexOf("  pipeline-metrics:"));
  assert.match(bridgeMetrics, /needs: promote/);
  assert.match(bridgeMetrics, /if: always\(\)/);
  assert.match(bridgeMetrics, /RELEASE_PROFILE: \$\{\{ needs\.promote\.outputs\.release_profile \}\}/);
  assert.match(bridgeMetrics, /frontend-only\|edge-only\|database-auth\|full-release/);
  assert.match(bridgeMetrics, /--profile "\$RELEASE_PROFILE"/);
  assert.match(bridgeMetrics, /--scope component/);
  assert.match(bridgeMetrics, /--expected-stages promote/);
  assert.match(bridgeMetrics, /pipeline-duration-bridge-/);
  assert.match(bridgeMetrics, /retention-days: 90/);

  const stagingMetrics = deployWorkflow.slice(deployWorkflow.indexOf("  pipeline-metrics:"));
  for (const requiredStage of [
    "preflight",
    "validate_source",
    "validate_live_baseline",
    "deploy",
    "post_deploy_frontend_readonly",
    "post_deploy_backend_readonly",
    "browser_attestation",
    "evidence",
    "diagnostic",
    "finalize",
  ]) {
    assert.match(stagingMetrics, new RegExp(`- ${requiredStage}`));
  }
  assert.match(stagingMetrics, /if: always\(\)/);
  assert.match(stagingMetrics, /RELEASE_PROFILE:/);
  assert.match(stagingMetrics, /--scope component/);
  assert.match(stagingMetrics, /--expected-stages "\$EXPECTED_STAGES"/);
  assert.match(stagingMetrics, /inputs\.diagnostic_run && 'diagnostic'/);
  assert.match(
    stagingMetrics,
    /post_deploy_frontend_readonly,post_deploy_backend_readonly,browser_attestation,evidence,finalize/,
  );
  assert.match(stagingMetrics, /pipeline-duration-staging-/);
  assert.match(stagingMetrics, /retention-days: 90/);
});
