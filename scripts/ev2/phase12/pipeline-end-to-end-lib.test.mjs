import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { buildPipelineEndToEndReport } from "./pipeline-end-to-end-lib.mjs";

const execFile = promisify(execFileCallback);
const baseline = JSON.parse(
  await readFile(
    new URL("../../../.github/release-controls/pipeline-slo-baseline.json", import.meta.url),
    "utf8",
  ),
);
const cli = path.resolve(
  new URL("./write-pipeline-end-to-end-report.mjs", import.meta.url).pathname.replace(/^\/(.:)/u, "$1"),
);
const chainCli = path.resolve(
  new URL("./write-pipeline-chain-binding.mjs", import.meta.url).pathname.replace(/^\/(.:)/u, "$1"),
);
const deployWorkflow = await readFile(
  new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
);
const candidateSha = "a".repeat(40);
const artifact = Object.freeze({
  name: `staging-frontend-${candidateSha}-101-1`,
  id: "9001",
  digest: `sha256:${"b".repeat(64)}`,
  archiveSha256: "c".repeat(64),
  treeSha256: "d".repeat(64),
});
const ciStagesByProfile = Object.freeze({
  "frontend-only": ["release-plan", "quality", "package-staging", "browser"],
  "edge-only": ["release-plan", "quality", "package-staging", "hotfix-bundle-smoke", "browser"],
  "database-auth": ["release-plan", "quality", "package-staging", "database", "browser"],
  "full-release": [
    "release-plan",
    "quality",
    "package-staging",
    "hotfix-bundle-smoke",
    "database",
    "browser",
  ],
});
const expectedStagesByWorkflow = Object.freeze({
  "Promote staging frontend bridge": ["promote"],
  "Deploy staging": [
    "preflight",
    "validate_source",
    "validate_live_baseline",
    "deploy",
    "post_deploy_frontend_readonly",
    "post_deploy_backend_readonly",
    "browser_attestation",
    "evidence",
    "finalize",
  ],
});

function componentReport({
  workflow,
  runId,
  runAttempt,
  stage,
  observedSeconds,
  stageDurationSeconds,
  stepDurationSeconds,
  capturedAt,
  profile = "full-release",
  controlSha = candidateSha,
}) {
  const expectedStages = workflow === "CI" ? ciStagesByProfile[profile] : expectedStagesByWorkflow[workflow];
  return {
    schemaVersion: 1,
    event: "release.pipeline.duration",
    repository: "Vnd93/gaiatec-cms",
    workflow,
    runId,
    runAttempt,
    candidateSha,
    controlSha,
    profile,
    scope: "component",
    expectedStages,
    runStartedAt: new Date(Date.parse(capturedAt) - observedSeconds * 1000).toISOString(),
    capturedAt,
    observedSeconds,
    releaseOutcome: "success",
    slo: {
      happyPathMinimumSeconds: 2400,
      happyPathMaximumSeconds: 3600,
      state: "component-only",
      gatesRelaxed: false,
    },
    bottleneck: {
      stage,
      stageDurationSeconds,
      step: `${stage} critical step`,
      stepDurationSeconds,
    },
    stages: expectedStages.map((name, index) => ({
      id: runId * 100 + index + 1,
      name,
      status: "completed",
      conclusion: "success",
      durationSeconds: name === stage ? stageDurationSeconds : 1,
      steps:
        name === stage
          ? [
              {
                job: stage,
                name: `${stage} critical step`,
                number: 1,
                status: "completed",
                conclusion: "success",
                durationSeconds: stepDurationSeconds,
              },
            ]
          : [],
    })),
    baseline: {
      capturedAt: baseline.capturedAt,
      representativeSeconds: baseline.derivedBaseline.representativeSeconds,
      confidence: baseline.derivedBaseline.confidence,
    },
  };
}

function fixture({
  ciObserved = 600,
  bridgeObserved = 700,
  stagingObserved = 1200,
  ciToBridgeWait = 60,
  bridgeToStagingWait = 60,
  profile = "full-release",
} = {}) {
  const ciStartedAt = Date.parse("2026-09-22T14:00:00Z");
  const ciCapturedAt = ciStartedAt + ciObserved * 1000;
  const bridgeStartedAt = ciCapturedAt + ciToBridgeWait * 1000;
  const bridgeCapturedAt = bridgeStartedAt + bridgeObserved * 1000;
  const stagingStartedAt = bridgeCapturedAt + bridgeToStagingWait * 1000;
  const stagingCapturedAt = stagingStartedAt + stagingObserved * 1000;
  return {
    ciReport: componentReport({
      workflow: "CI",
      runId: 101,
      runAttempt: 2,
      stage: "quality",
      observedSeconds: ciObserved,
      stageDurationSeconds: Math.min(400, ciObserved),
      stepDurationSeconds: Math.min(300, ciObserved),
      capturedAt: new Date(ciCapturedAt).toISOString(),
      profile,
    }),
    bridgeReport: componentReport({
      workflow: "Promote staging frontend bridge",
      runId: 202,
      runAttempt: 1,
      stage: "promote",
      observedSeconds: bridgeObserved,
      stageDurationSeconds: Math.min(600, bridgeObserved),
      stepDurationSeconds: Math.min(500, bridgeObserved),
      capturedAt: new Date(bridgeCapturedAt).toISOString(),
      profile,
      controlSha: "b".repeat(40),
    }),
    stagingReport: componentReport({
      workflow: "Deploy staging",
      runId: 303,
      runAttempt: 3,
      stage: "deploy",
      observedSeconds: stagingObserved,
      stageDurationSeconds: Math.min(1000, stagingObserved),
      stepDurationSeconds: Math.min(900, stagingObserved),
      capturedAt: new Date(stagingCapturedAt).toISOString(),
      profile,
      controlSha: "c".repeat(40),
    }),
    baseline: structuredClone(baseline),
    chain: {
      schemaVersion: 1,
      event: "release.pipeline.chain.binding",
      repository: "Vnd93/gaiatec-cms",
      candidateSha,
      profile,
      matrixSha256: "e".repeat(64),
      policySha256: "f".repeat(64),
      capturedAt: new Date(stagingCapturedAt + 60_000).toISOString(),
      ci: {
        workflow: "CI",
        runId: 101,
        runAttempt: 2,
        producerRunAttempt: 1,
        controlSha: candidateSha,
        artifact: structuredClone(artifact),
      },
      bridge: {
        workflow: "Promote staging frontend bridge",
        runId: 202,
        runAttempt: 1,
        sourceCiRunId: 101,
        gateCiRunAttempt: 2,
        sourceCiRunAttempt: 1,
        controlSha: "b".repeat(40),
        artifact: structuredClone(artifact),
      },
      staging: {
        workflow: "Deploy staging",
        runId: 303,
        runAttempt: 3,
        sourceBridgeRunId: 202,
        sourceBridgeRunAttempt: 1,
        controlSha: "c".repeat(40),
        artifact: structuredClone(artifact),
      },
    },
    capturedAt: "2026-09-22T15:31:00Z",
  };
}

test("aggregates the exact green chain and preserves the owning bottleneck", () => {
  const report = buildPipelineEndToEndReport(fixture());
  assert.equal(report.scope, "end-to-end");
  assert.equal(report.releaseOutcome, "success");
  assert.equal(report.observedSeconds, 2620);
  assert.equal(report.activeSeconds, 2500);
  assert.equal(report.handoffWaitSeconds, 120);
  assert.equal(report.handoffs.ciToBridge.waitSeconds, 60);
  assert.equal(report.handoffs.bridgeToStaging.waitSeconds, 60);
  assert.equal(report.slo.state, "within-target-window");
  assert.equal(report.slo.gatesRelaxed, false);
  assert.equal(report.bottleneck.component, "staging");
  assert.equal(report.bottleneck.stage, "staging:deploy");
  assert.equal(report.bottleneck.step, "deploy critical step");
  assert.deepEqual(
    report.stages.map((stage) => stage.name),
    [
      ...ciStagesByProfile["full-release"].map((stage) => `ci:${stage}`),
      "bridge:promote",
      ...expectedStagesByWorkflow["Deploy staging"].map((stage) => `staging:${stage}`),
    ],
  );
  assert.equal(report.components.ci.runAttempt, 2);
  assert.equal(report.chain.ci.producerRunAttempt, 1);
  assert.equal(report.baseline.provisional, true);
});

test("counts handoff waits in wall-clock duration and reports a waiting bottleneck", () => {
  const report = buildPipelineEndToEndReport(
    fixture({
      ciObserved: 100,
      bridgeObserved: 100,
      stagingObserved: 100,
      ciToBridgeWait: 2500,
      bridgeToStagingWait: 60,
    }),
  );
  assert.equal(report.activeSeconds, 300);
  assert.equal(report.handoffWaitSeconds, 2560);
  assert.equal(report.observedSeconds, 2860);
  assert.equal(report.bottleneck.component, "handoff");
  assert.equal(report.bottleneck.stage, "handoff:ciToBridge");
  assert.equal(report.bottleneck.stageDurationSeconds, 2500);
  assert.equal(report.bottleneck.step, null);
});

test("evaluates below, within and above the target without relaxing gates", () => {
  const cases = [
    [{ ciObserved: 300, bridgeObserved: 400, stagingObserved: 500 }, "below-target-window"],
    [{ ciObserved: 800, bridgeObserved: 900, stagingObserved: 1000 }, "within-target-window"],
    [{ ciObserved: 1500, bridgeObserved: 1800, stagingObserved: 1900 }, "above-target-window"],
  ];
  for (const [durations, state] of cases) {
    const report = buildPipelineEndToEndReport(fixture(durations));
    assert.equal(report.slo.state, state);
    assert.equal(report.slo.gatesRelaxed, false);
  }
});

test("requires the canonical component gates for every release profile", () => {
  for (const profile of Object.keys(ciStagesByProfile)) {
    assert.equal(buildPipelineEndToEndReport(fixture({ profile })).profile, profile);

    for (const mutation of [
      (stages) => stages.slice(0, -1),
      (stages) => [stages[1], stages[0], ...stages.slice(2)],
      (stages) => [...stages, stages[0]],
    ]) {
      const input = fixture({ profile });
      input.ciReport.expectedStages = mutation(input.ciReport.expectedStages);
      assert.throws(
        () => buildPipelineEndToEndReport(input),
        /expectedStages does not match the canonical profile gates/u,
      );
    }

    const skipped = fixture({ profile });
    skipped.ciReport.stages.find((stage) => stage.name === "quality").conclusion = "skipped";
    assert.throws(() => buildPipelineEndToEndReport(skipped), /expected stage quality is not successful/u);
  }
});

test("refuses any redefinition of the fixed 40-60 minute SLO", () => {
  const input = fixture();
  input.baseline.target.happyPathMinimumSeconds = 1;
  input.baseline.target.happyPathMaximumSeconds = 99_999;
  for (const report of [input.ciReport, input.bridgeReport, input.stagingReport]) {
    report.slo.happyPathMinimumSeconds = 1;
    report.slo.happyPathMaximumSeconds = 99_999;
  }
  assert.throws(() => buildPipelineEndToEndReport(input), /must remain 40-60 minutes/u);
});

test("rejects candidate SHA and profile divergence across components", () => {
  const shaMismatch = fixture();
  shaMismatch.bridgeReport.candidateSha = "e".repeat(40);
  assert.throws(
    () => buildPipelineEndToEndReport(shaMismatch),
    /bridge candidate SHA does not match release chain/u,
  );

  const profileMismatch = fixture();
  profileMismatch.stagingReport.profile = "database-auth";
  assert.throws(
    () => buildPipelineEndToEndReport(profileMismatch),
    /staging profile does not match release chain/u,
  );
});

test("rejects run id, attempt and both chain-link mismatches", () => {
  const runIdMismatch = fixture();
  runIdMismatch.ciReport.runId = 102;
  assert.throws(() => buildPipelineEndToEndReport(runIdMismatch), /ci runId does not match/u);

  const attemptMismatch = fixture();
  attemptMismatch.bridgeReport.runAttempt = 2;
  assert.throws(() => buildPipelineEndToEndReport(attemptMismatch), /bridge runAttempt does not match/u);

  const ciLinkMismatch = fixture();
  ciLinkMismatch.chain.bridge.gateCiRunAttempt = 1;
  assert.throws(() => buildPipelineEndToEndReport(ciLinkMismatch), /CI to bridge link is invalid/u);

  const bridgeLinkMismatch = fixture();
  bridgeLinkMismatch.chain.staging.sourceBridgeRunId = 999;
  assert.throws(() => buildPipelineEndToEndReport(bridgeLinkMismatch), /bridge to staging link is invalid/u);
});

test("rejects any immutable artifact tuple mismatch", () => {
  for (const [component, key, value] of [
    ["bridge", "id", "9002"],
    ["bridge", "digest", `sha256:${"e".repeat(64)}`],
    ["staging", "archiveSha256", "e".repeat(64)],
    ["staging", "treeSha256", "f".repeat(64)],
  ]) {
    const input = fixture();
    input.chain[component].artifact[key] = value;
    assert.throws(() => buildPipelineEndToEndReport(input), /immutable artifact tuple mismatch/u);
  }
  const nameMismatch = fixture();
  nameMismatch.chain.ci.artifact.name = `staging-frontend-${candidateSha}-101-2`;
  assert.throws(() => buildPipelineEndToEndReport(nameMismatch), /artifact.name is invalid/u);
});

test("rejects non-success and skipped component gates", () => {
  const nonSuccess = fixture();
  nonSuccess.bridgeReport.releaseOutcome = "non-happy-path";
  assert.throws(() => buildPipelineEndToEndReport(nonSuccess), /release outcome is not success/u);

  const skipped = fixture();
  skipped.stagingReport.stages.find((stage) => stage.name === "deploy").conclusion = "skipped";
  assert.throws(() => buildPipelineEndToEndReport(skipped), /expected stage deploy is not successful/u);
});

test("rejects capture before a component or the chain binding", () => {
  const futureComponent = fixture();
  futureComponent.stagingReport.capturedAt = "2026-09-22T15:32:00Z";
  futureComponent.stagingReport.runStartedAt = new Date(
    Date.parse(futureComponent.stagingReport.capturedAt) -
      futureComponent.stagingReport.observedSeconds * 1000,
  ).toISOString();
  assert.throws(
    () => buildPipelineEndToEndReport(futureComponent),
    /chain binding precedes the staging component report/u,
  );

  const futureChain = fixture();
  futureChain.chain.capturedAt = "2026-09-22T15:32:00Z";
  assert.throws(() => buildPipelineEndToEndReport(futureChain), /capturedAt precedes chain binding/u);

  const invertedComponents = fixture();
  invertedComponents.bridgeReport.capturedAt = "2026-09-22T15:21:00Z";
  invertedComponents.bridgeReport.runStartedAt = new Date(
    Date.parse(invertedComponents.bridgeReport.capturedAt) -
      invertedComponents.bridgeReport.observedSeconds * 1000,
  ).toISOString();
  assert.throws(
    () => buildPipelineEndToEndReport(invertedComponents),
    /staging component capture precedes bridge/u,
  );
});

test("derives component duration from canonical timestamps and rejects contradictory terminal evidence", () => {
  const duration = fixture();
  duration.ciReport.observedSeconds += 1;
  assert.throws(() => buildPipelineEndToEndReport(duration), /observedSeconds is not source-derived/u);

  const status = fixture();
  status.bridgeReport.stages[0].status = "in_progress";
  assert.throws(() => buildPipelineEndToEndReport(status), /expected stage promote is not completed/u);

  const step = fixture();
  const deploy = step.stagingReport.stages.find((stage) => stage.name === "deploy");
  deploy.steps[0].durationSeconds = deploy.durationSeconds + 1;
  assert.throws(() => buildPipelineEndToEndReport(step), /exceeds its stage duration/u);
});

test("reports the dominant component even when another component owns the longest individual stage", () => {
  const report = buildPipelineEndToEndReport(
    fixture({ ciObserved: 1800, bridgeObserved: 700, stagingObserved: 1200 }),
  );
  assert.equal(report.bottleneck.component, "ci");
  assert.equal(report.bottleneck.componentDurationSeconds, 1800);
  assert.equal(report.bottleneck.stage, "ci:quality");
});

test("requires every derived baseline component to name its real source observation", () => {
  const duration = fixture();
  duration.baseline.derivedBaseline.components.ciCriticalPathSeconds += 1;
  duration.baseline.derivedBaseline.representativeSeconds += 1;
  duration.baseline.derivedBaseline.representativeMinutes =
    Math.round((duration.baseline.derivedBaseline.representativeSeconds / 60) * 100) / 100;
  assert.throws(() => buildPipelineEndToEndReport(duration), /is not source-derived/u);

  const source = fixture();
  source.baseline.derivedBaseline.sourceObservationRunIds.stagingBridgeSeconds = 1;
  assert.throws(() => buildPipelineEndToEndReport(source), /source is invalid/u);
});

test("rejects noncanonical or timezone-free timestamps", () => {
  for (const value of [0, "2026-09-22", "2026-09-22T15:30:00", "Tue, 22 Sep 2026 15:30:00 GMT"]) {
    const input = fixture();
    input.chain.capturedAt = value;
    assert.throws(() => buildPipelineEndToEndReport(input), /canonical UTC timestamp/u);
  }
});

test("rejects unexpected keys in every signed input family", () => {
  const reportExtra = fixture();
  reportExtra.ciReport.unexpected = true;
  assert.throws(() => buildPipelineEndToEndReport(reportExtra), /component report keys are invalid/u);

  const chainExtra = fixture();
  chainExtra.chain.bridge.unexpected = true;
  assert.throws(() => buildPipelineEndToEndReport(chainExtra), /release chain bridge keys are invalid/u);

  const baselineExtra = fixture();
  baselineExtra.baseline.target.unexpected = true;
  assert.throws(() => buildPipelineEndToEndReport(baselineExtra), /SLO target keys are invalid/u);
});

test("rejects a bottleneck stage or step not bound to its owning component", () => {
  const stageMismatch = fixture();
  stageMismatch.ciReport.bottleneck.stage = "promote";
  assert.throws(() => buildPipelineEndToEndReport(stageMismatch), /bottleneck stage binding is invalid/u);

  const stepMismatch = fixture();
  stepMismatch.stagingReport.bottleneck.step = "foreign step";
  assert.throws(() => buildPipelineEndToEndReport(stepMismatch), /bottleneck step binding is invalid/u);
});

async function writeCliInputs(root, input) {
  const paths = {};
  const values = {
    ci: input.ciReport,
    bridge: input.bridgeReport,
    staging: input.stagingReport,
    baseline: input.baseline,
    chain: input.chain,
  };
  for (const [name, value] of Object.entries(values)) {
    paths[name] = path.join(root, `${name}.json`);
    await writeFile(paths[name], `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
  }
  return paths;
}

function cliArguments(paths, output, capturedAt = "2026-09-22T15:31:00Z") {
  return [
    cli,
    "--ci-report",
    paths.ci,
    "--bridge-report",
    paths.bridge,
    "--staging-report",
    paths.staging,
    "--baseline",
    paths.baseline,
    "--chain",
    paths.chain,
    "--captured-at",
    capturedAt,
    "--output",
    output,
  ];
}

function chainCliArguments(chain, output) {
  return [
    chainCli,
    "--candidate",
    chain.candidateSha,
    "--profile",
    chain.profile,
    "--matrix-sha256",
    chain.matrixSha256,
    "--policy-sha256",
    chain.policySha256,
    "--ci-run-id",
    String(chain.ci.runId),
    "--ci-gate-run-attempt",
    String(chain.ci.runAttempt),
    "--ci-producer-run-attempt",
    String(chain.ci.producerRunAttempt),
    "--ci-control-sha",
    chain.ci.controlSha,
    "--bridge-run-id",
    String(chain.bridge.runId),
    "--bridge-run-attempt",
    String(chain.bridge.runAttempt),
    "--bridge-control-sha",
    chain.bridge.controlSha,
    "--staging-run-id",
    String(chain.staging.runId),
    "--staging-run-attempt",
    String(chain.staging.runAttempt),
    "--staging-control-sha",
    chain.staging.controlSha,
    "--artifact-name",
    chain.ci.artifact.name,
    "--artifact-id",
    String(chain.ci.artifact.id),
    "--artifact-digest",
    chain.ci.artifact.digest,
    "--archive-sha256",
    chain.ci.artifact.archiveSha256,
    "--tree-sha256",
    chain.ci.artifact.treeSha256,
    "--captured-at",
    chain.capturedAt,
    "--output",
    output,
  ];
}

test("chain writer seals the exact attempts and immutable artifact tuple exclusively", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pipeline-chain-"));
  try {
    const chain = fixture().chain;
    const output = path.join(root, "chain.json");
    await execFile(process.execPath, chainCliArguments(chain, output));
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), chain);
    await assert.rejects(execFile(process.execPath, chainCliArguments(chain, output)), /EEXIST/u);

    const invalid = structuredClone(chain);
    invalid.ci.producerRunAttempt = invalid.ci.runAttempt + 1;
    await assert.rejects(
      execFile(process.execPath, chainCliArguments(invalid, path.join(root, "invalid.json"))),
      /producerRunAttempt is invalid/u,
    );

    for (const key of ["matrixSha256", "policySha256"]) {
      const invalidDigest = structuredClone(chain);
      invalidDigest[key] = "0";
      await assert.rejects(
        execFile(process.execPath, chainCliArguments(invalidDigest, path.join(root, `${key}-invalid.json`))),
        /release chain .* SHA-256 is invalid/u,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminal-green staging aggregates the exact CI, bridge and staging duration chain", () => {
  const metrics = deployWorkflow.slice(deployWorkflow.indexOf("  pipeline-metrics:"));
  assert.match(metrics, /needs\.deploy\.outputs\.release_profile/);
  assert.match(metrics, /id: end_to_end_gate/);
  for (const result of [
    "PREFLIGHT_RESULT",
    "SOURCE_RESULT",
    "LIVE_RESULT",
    "DEPLOY_RESULT",
    "FRONTEND_RESULT",
    "BACKEND_RESULT",
    "BROWSER_RESULT",
    "EVIDENCE_RESULT",
    "DIAGNOSTIC_RESULT",
    "FINALIZE_RESULT",
  ]) {
    assert.match(metrics, new RegExp(`${result}:`));
  }
  assert.match(metrics, /DIAGNOSTIC_RESULT" = skipped/);
  assert.match(metrics, /resolve-pipeline-duration-artifact\.mjs[\s\S]*--component ci/);
  assert.match(metrics, /resolve-pipeline-duration-artifact\.mjs[\s\S]*--component bridge/);
  assert.match(metrics, /artifact-ids: \$\{\{ steps\.ci_duration\.outputs\.artifact_id \}\}/);
  assert.match(metrics, /artifact-ids: \$\{\{ steps\.bridge_duration\.outputs\.artifact_id \}\}/);
  assert.equal((metrics.match(/digest-mismatch: error/g) ?? []).length, 2);
  assert.match(metrics, /write-pipeline-chain-binding\.mjs/);
  assert.match(metrics, /--matrix-sha256 "\$MATRIX_SHA256"/);
  assert.match(metrics, /--policy-sha256 "\$POLICY_SHA256"/);
  assert.match(metrics, /--artifact-id "\$ARTIFACT_ID"/);
  assert.match(metrics, /--archive-sha256 "\$ARCHIVE_SHA256"/);
  assert.match(metrics, /--tree-sha256 "\$TREE_SHA256"/);
  assert.match(metrics, /write-pipeline-end-to-end-report\.mjs/);
  assert.match(metrics, /pipeline-end-to-end-\$\{\{ needs\.deploy\.outputs\.candidate_sha \}\}/);
  assert.match(metrics, /retention-days: 90/);
});

test("CLI uses stable reads, exclusive output and a concise summary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pipeline-e2e-"));
  try {
    const paths = await writeCliInputs(root, fixture());
    const output = path.join(root, "report.json");
    const summary = path.join(root, "summary.md");
    const result = await execFile(process.execPath, cliArguments(paths, output), {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(JSON.parse(result.stdout).observedSeconds, 2620);
    assert.equal(report.scope, "end-to-end");
    assert.match(await readFile(summary, "utf8"), /Gates relaxados: não/u);
    await assert.rejects(execFile(process.execPath, cliArguments(paths, output)), /EEXIST/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects noncanonical input paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pipeline-e2e-path-"));
  try {
    const paths = await writeCliInputs(root, fixture());
    paths.ci = `${root}${path.sep}..${path.sep}${path.basename(root)}${path.sep}ci.json`;
    await assert.rejects(
      execFile(process.execPath, cliArguments(paths, path.join(root, "report.json"))),
      /path must be canonical and absolute/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects a symlinked input", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "pipeline-e2e-link-"));
  try {
    const paths = await writeCliInputs(root, fixture());
    const link = path.join(root, "ci-link.json");
    try {
      await symlink(paths.ci, link, "file");
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        context.skip("symlink creation is unavailable on this host");
        return;
      }
      throw error;
    }
    paths.ci = link;
    await assert.rejects(
      execFile(process.execPath, cliArguments(paths, path.join(root, "report.json"))),
      /regular non-symlink file/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
