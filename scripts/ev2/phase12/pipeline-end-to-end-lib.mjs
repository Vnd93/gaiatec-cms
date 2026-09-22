import { validatePipelineSloBaseline } from "./pipeline-duration-lib.mjs";

const REPOSITORY = "Vnd93/gaiatec-cms";
const EVENT = "release.pipeline.duration";
const CHAIN_EVENT = "release.pipeline.chain.binding";
const FULL_SHA = /^[a-f0-9]{40}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const PROFILES = new Set(["frontend-only", "edge-only", "database-auth", "full-release"]);
const HAPPY_PATH_MINIMUM_SECONDS = 40 * 60;
const HAPPY_PATH_MAXIMUM_SECONDS = 60 * 60;
const COMPONENT_ORDER = ["ci", "bridge", "staging"];
const COMPONENT_WORKFLOWS = Object.freeze({
  ci: "CI",
  bridge: "Promote staging frontend bridge",
  staging: "Deploy staging",
});
const CI_STAGES_BY_PROFILE = Object.freeze({
  "frontend-only": Object.freeze(["release-plan", "quality", "package-staging", "browser"]),
  "edge-only": Object.freeze([
    "release-plan",
    "quality",
    "package-staging",
    "hotfix-bundle-smoke",
    "browser",
  ]),
  "database-auth": Object.freeze(["release-plan", "quality", "package-staging", "database", "browser"]),
  "full-release": Object.freeze([
    "release-plan",
    "quality",
    "package-staging",
    "hotfix-bundle-smoke",
    "database",
    "browser",
  ]),
});
const STAGING_STAGES = Object.freeze([
  "preflight",
  "validate_source",
  "validate_live_baseline",
  "deploy",
  "post_deploy_frontend_readonly",
  "post_deploy_backend_readonly",
  "browser_attestation",
  "evidence",
  "finalize",
]);
const TERMINAL_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "skipped",
  "stale",
  "success",
  "timed_out",
]);
const WORKFLOW_STATUSES = new Set(["queued", "in_progress", "completed", "waiting", "pending", "requested"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function timestamp(value, label) {
  assert(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value),
    `${label} must be a canonical UTC timestamp`,
  );
  const parsed = Date.parse(value ?? "");
  assert(Number.isFinite(parsed), `${label} must be a canonical UTC timestamp`);
  return parsed;
}

function positiveInteger(value) {
  return POSITIVE_INTEGER.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function strictBaseline(baseline) {
  validatePipelineSloBaseline(baseline);
  assert(
    exactKeys(baseline, [
      "schemaVersion",
      "target",
      "capturedAt",
      "sourceRepository",
      "observations",
      "derivedBaseline",
    ]),
    "pipeline SLO baseline keys are invalid",
  );
  assert(
    exactKeys(baseline.target, ["scope", "happyPathMinimumSeconds", "happyPathMaximumSeconds", "policy"]),
    "pipeline SLO target keys are invalid",
  );
  assert(
    baseline.target.scope === "ci-critical-path-plus-staging-bridge-plus-staging-deploy",
    "pipeline SLO target scope is invalid",
  );
  assert(
    baseline.target.happyPathMinimumSeconds === HAPPY_PATH_MINIMUM_SECONDS &&
      baseline.target.happyPathMaximumSeconds === HAPPY_PATH_MAXIMUM_SECONDS,
    "pipeline SLO target must remain 40-60 minutes",
  );
  assert(baseline.sourceRepository === REPOSITORY, "pipeline SLO repository is invalid");
  const baselineCapturedAt = timestamp(baseline.capturedAt, "baseline.capturedAt");
  for (const [index, observation] of baseline.observations.entries()) {
    assert(
      exactKeys(observation, [
        "runId",
        "workflow",
        "headSha",
        "conclusion",
        "rawRunConclusion",
        "startedAt",
        "completedAt",
        "durationSeconds",
        "criticalJob",
        "criticalJobConclusion",
        "criticalJobStartedAt",
        "criticalJobCompletedAt",
        "criticalJobDurationSeconds",
        "recoveryEvidence",
      ]),
      `baseline.observations.${index} keys are invalid`,
    );
    assert(
      typeof observation.workflow === "string" && observation.workflow.length > 0,
      `baseline.observations.${index}.workflow is invalid`,
    );
    assert(
      typeof observation.conclusion === "string" && observation.conclusion.length > 0,
      `baseline.observations.${index}.conclusion is invalid`,
    );
    assert(
      typeof observation.criticalJob === "string" && observation.criticalJob.length > 0,
      `baseline.observations.${index}.criticalJob is invalid`,
    );
    assert(
      nonNegativeInteger(observation.criticalJobDurationSeconds) &&
        observation.criticalJobDurationSeconds <= observation.durationSeconds,
      `baseline.observations.${index}.criticalJobDurationSeconds is invalid`,
    );
    const criticalJobStartedAt = timestamp(
      observation.criticalJobStartedAt,
      `baseline.observations.${index}.criticalJobStartedAt`,
    );
    const criticalJobCompletedAt = timestamp(
      observation.criticalJobCompletedAt,
      `baseline.observations.${index}.criticalJobCompletedAt`,
    );
    assert(
      Math.round((criticalJobCompletedAt - criticalJobStartedAt) / 1000) ===
        observation.criticalJobDurationSeconds,
      `baseline.observations.${index}.criticalJobDurationSeconds is not source-derived`,
    );
    if (observation.recoveryEvidence !== null) {
      assert(
        exactKeys(observation.recoveryEvidence, [
          "finalizerJob",
          "finalizerConclusion",
          "terminalArtifactId",
          "terminalArtifactDigest",
        ]),
        `baseline.observations.${index}.recoveryEvidence keys are invalid`,
      );
    }
    assert(
      baselineCapturedAt >= timestamp(observation.completedAt, `baseline.observations.${index}.completedAt`),
      `baseline.observations.${index} completes after baseline capture`,
    );
  }
  assert(
    exactKeys(baseline.derivedBaseline, [
      "representativeSeconds",
      "representativeMinutes",
      "components",
      "sourceObservationRunIds",
      "successfulFullReleaseSamples",
      "confidence",
      "knownBottleneck",
    ]),
    "pipeline derived baseline keys are invalid",
  );
  assert(
    exactKeys(baseline.derivedBaseline.components, [
      "ciCriticalPathSeconds",
      "stagingBridgeSeconds",
      "stagingDeploySeconds",
    ]),
    "pipeline derived baseline component keys are invalid",
  );
  const componentSeconds = Object.values(baseline.derivedBaseline.components);
  assert(
    componentSeconds.every((value) => Number.isSafeInteger(value) && value > 0),
    "pipeline derived baseline component duration is invalid",
  );
  assert(
    exactKeys(baseline.derivedBaseline.sourceObservationRunIds, [
      "ciCriticalPathSeconds",
      "stagingBridgeSeconds",
      "stagingDeploySeconds",
    ]),
    "pipeline derived baseline source run keys are invalid",
  );
  const sourceWorkflows = {
    ciCriticalPathSeconds: "CI",
    stagingBridgeSeconds: "Promote staging frontend bridge",
    stagingDeploySeconds: "Deploy staging",
  };
  for (const [component, workflow] of Object.entries(sourceWorkflows)) {
    const runId = baseline.derivedBaseline.sourceObservationRunIds[component];
    const matches = baseline.observations.filter(
      (observation) => observation.runId === runId && observation.workflow === workflow,
    );
    assert(matches.length === 1, `pipeline derived baseline ${component} source is invalid`);
    assert(
      matches[0].durationSeconds === baseline.derivedBaseline.components[component],
      `pipeline derived baseline ${component} is not source-derived`,
    );
  }
  const representativeSeconds = componentSeconds.reduce((total, value) => total + value, 0);
  assert(
    baseline.derivedBaseline.representativeSeconds === representativeSeconds,
    "pipeline derived baseline representativeSeconds is invalid",
  );
  assert(
    baseline.derivedBaseline.representativeMinutes === Math.round((representativeSeconds / 60) * 100) / 100,
    "pipeline derived baseline representativeMinutes is invalid",
  );
  assert(
    Number.isSafeInteger(baseline.derivedBaseline.successfulFullReleaseSamples) &&
      baseline.derivedBaseline.successfulFullReleaseSamples ===
        baseline.observations.filter(
          (observation) => observation.workflow === "Deploy staging" && observation.conclusion === "success",
        ).length,
    "pipeline derived baseline sample count is invalid",
  );
  assert(
    baseline.derivedBaseline.confidence ===
      (baseline.derivedBaseline.successfulFullReleaseSamples === 0
        ? "provisional-until-first-green-full-release"
        : "observed-green-full-release"),
    "pipeline derived baseline confidence is invalid",
  );
  const bottleneckComponent = Object.entries(baseline.derivedBaseline.components).reduce(
    (current, candidate) => (candidate[1] > current[1] ? candidate : current),
  )[0];
  const bottleneckNames = {
    ciCriticalPathSeconds: "ci-critical-path",
    stagingBridgeSeconds: "staging-bridge",
    stagingDeploySeconds: "staging-deploy",
  };
  assert(
    baseline.derivedBaseline.knownBottleneck === bottleneckNames[bottleneckComponent],
    "pipeline derived baseline bottleneck is invalid",
  );
  return baseline.target;
}

function strictStep(step, component, stageName, index) {
  assert(
    exactKeys(step, ["job", "name", "number", "status", "conclusion", "durationSeconds"]),
    `${component}.stages.${stageName}.steps.${index} keys are invalid`,
  );
  assert(step.job === stageName, `${component}.stages.${stageName}.steps.${index} job is invalid`);
  assert(
    typeof step.name === "string" && step.name.length > 0,
    `${component}.stages.${stageName}.steps.${index} name is invalid`,
  );
  assert(
    Number.isSafeInteger(step.number) && step.number >= 1,
    `${component}.stages.${stageName}.steps.${index} number is invalid`,
  );
  assert(
    WORKFLOW_STATUSES.has(step.status),
    `${component}.stages.${stageName}.steps.${index} status is invalid`,
  );
  assert(
    TERMINAL_CONCLUSIONS.has(step.conclusion) || step.conclusion === "in_progress",
    `${component}.stages.${stageName}.steps.${index} conclusion is invalid`,
  );
  assert(
    step.durationSeconds === null || nonNegativeInteger(step.durationSeconds),
    `${component}.stages.${stageName}.steps.${index} duration is invalid`,
  );
}

function strictStage(stage, component, index) {
  assert(
    exactKeys(stage, ["id", "name", "status", "conclusion", "durationSeconds", "steps"]),
    `${component}.stages.${index} keys are invalid`,
  );
  assert(Number.isSafeInteger(stage.id) && stage.id >= 1, `${component}.stages.${index} id is invalid`);
  assert(
    typeof stage.name === "string" && stage.name.length > 0,
    `${component}.stages.${index} name is invalid`,
  );
  assert(WORKFLOW_STATUSES.has(stage.status), `${component}.stages.${index} status is invalid`);
  assert(
    TERMINAL_CONCLUSIONS.has(stage.conclusion) || stage.conclusion === "in_progress",
    `${component}.stages.${index} conclusion is invalid`,
  );
  assert(
    stage.durationSeconds === null || nonNegativeInteger(stage.durationSeconds),
    `${component}.stages.${index} duration is invalid`,
  );
  assert(Array.isArray(stage.steps), `${component}.stages.${index} steps are invalid`);
  stage.steps.forEach((step, stepIndex) => strictStep(step, component, stage.name, stepIndex));
  for (const [stepIndex, step] of stage.steps.entries()) {
    if (stage.durationSeconds !== null && step.durationSeconds !== null) {
      assert(
        step.durationSeconds <= stage.durationSeconds,
        `${component}.stages.${index}.steps.${stepIndex} exceeds its stage duration`,
      );
    }
  }
}

function strictBottleneck(report, requiredStages, component) {
  assert(
    exactKeys(report.bottleneck, ["stage", "stageDurationSeconds", "step", "stepDurationSeconds"]),
    `${component}.bottleneck keys are invalid`,
  );
  const stageMatches = requiredStages.filter(
    (stage) =>
      stage.name === report.bottleneck.stage &&
      stage.durationSeconds === report.bottleneck.stageDurationSeconds,
  );
  assert(stageMatches.length === 1, `${component}.bottleneck stage binding is invalid`);
  const maximum = Math.max(...requiredStages.map((stage) => stage.durationSeconds));
  assert(
    report.bottleneck.stageDurationSeconds === maximum,
    `${component}.bottleneck is not the longest required stage`,
  );
  if (report.bottleneck.step === null) {
    assert(
      report.bottleneck.stepDurationSeconds === null,
      `${component}.bottleneck step duration is invalid`,
    );
    assert(
      stageMatches[0].steps.every((step) => step.durationSeconds === null),
      `${component}.bottleneck omitted an observed step`,
    );
    return;
  }
  assert(
    typeof report.bottleneck.step === "string" && report.bottleneck.step.length > 0,
    `${component}.bottleneck step is invalid`,
  );
  assert(
    nonNegativeInteger(report.bottleneck.stepDurationSeconds),
    `${component}.bottleneck step duration is invalid`,
  );
  const stepMatches = stageMatches[0].steps.filter(
    (step) =>
      step.name === report.bottleneck.step && step.durationSeconds === report.bottleneck.stepDurationSeconds,
  );
  assert(stepMatches.length === 1, `${component}.bottleneck step binding is invalid`);
  const observedSteps = stageMatches[0].steps.filter((step) => step.durationSeconds !== null);
  assert(observedSteps.length > 0, `${component}.bottleneck step is not observed`);
  assert(
    report.bottleneck.stepDurationSeconds === Math.max(...observedSteps.map((step) => step.durationSeconds)),
    `${component}.bottleneck step is not the longest step in its stage`,
  );
}

function canonicalStages(component, profile) {
  if (component === "ci") return CI_STAGES_BY_PROFILE[profile];
  if (component === "bridge") return ["promote"];
  return STAGING_STAGES;
}

function strictComponentReport(report, component, baseline) {
  assert(
    exactKeys(report, [
      "schemaVersion",
      "event",
      "repository",
      "workflow",
      "runId",
      "runAttempt",
      "candidateSha",
      "controlSha",
      "profile",
      "scope",
      "expectedStages",
      "runStartedAt",
      "capturedAt",
      "observedSeconds",
      "releaseOutcome",
      "slo",
      "bottleneck",
      "stages",
      "baseline",
    ]),
    `${component} component report keys are invalid`,
  );
  assert(report.schemaVersion === 1, `${component} component report schemaVersion is invalid`);
  assert(report.event === EVENT, `${component} component report event is invalid`);
  assert(report.repository === REPOSITORY, `${component} component report repository is invalid`);
  assert(
    report.workflow === COMPONENT_WORKFLOWS[component],
    `${component} component report workflow is invalid`,
  );
  assert(positiveInteger(report.runId), `${component} component report runId is invalid`);
  assert(positiveInteger(report.runAttempt), `${component} component report runAttempt is invalid`);
  assert(FULL_SHA.test(report.candidateSha ?? ""), `${component} candidate SHA is invalid`);
  assert(FULL_SHA.test(report.controlSha ?? ""), `${component} control SHA is invalid`);
  assert(PROFILES.has(report.profile), `${component} release profile is invalid`);
  assert(report.scope === "component", `${component} report scope must be component`);
  const runStartedAt = timestamp(report.runStartedAt, `${component}.runStartedAt`);
  const capturedAt = timestamp(report.capturedAt, `${component}.capturedAt`);
  assert(capturedAt >= runStartedAt, `${component} capture precedes its run start`);
  assert(nonNegativeInteger(report.observedSeconds), `${component} observedSeconds is invalid`);
  assert(
    report.observedSeconds === Math.round((capturedAt - runStartedAt) / 1000),
    `${component} observedSeconds is not source-derived`,
  );
  assert(report.releaseOutcome === "success", `${component} release outcome is not success`);
  assert(
    exactKeys(report.slo, ["happyPathMinimumSeconds", "happyPathMaximumSeconds", "state", "gatesRelaxed"]),
    `${component}.slo keys are invalid`,
  );
  assert(
    report.slo.happyPathMinimumSeconds === baseline.target.happyPathMinimumSeconds &&
      report.slo.happyPathMaximumSeconds === baseline.target.happyPathMaximumSeconds,
    `${component}.slo target mismatch`,
  );
  assert(report.slo.state === "component-only", `${component}.slo state is invalid`);
  assert(report.slo.gatesRelaxed === false, `${component}.slo relaxed gates`);
  const expectedStages = canonicalStages(component, report.profile);
  assert(
    JSON.stringify(report.expectedStages) === JSON.stringify(expectedStages),
    `${component}.expectedStages does not match the canonical profile gates`,
  );
  assert(Array.isArray(report.stages) && report.stages.length > 0, `${component}.stages is invalid`);
  report.stages.forEach((stage, index) => strictStage(stage, component, index));
  const requiredStages = expectedStages.map((name) => {
    const matches = report.stages.filter((stage) => stage.name === name);
    assert(matches.length === 1, `${component} expected stage ${name} is missing or duplicated`);
    const stage = matches[0];
    assert(stage.status === "completed", `${component} expected stage ${name} is not completed`);
    assert(stage.conclusion === "success", `${component} expected stage ${name} is not successful`);
    assert(
      nonNegativeInteger(stage.durationSeconds),
      `${component} expected stage ${name} has no terminal duration`,
    );
    assert(
      stage.durationSeconds <= report.observedSeconds,
      `${component} expected stage ${name} exceeds observed duration`,
    );
    return stage;
  });
  const expectedNames = new Set(expectedStages);
  for (const stage of report.stages) {
    if (expectedNames.has(stage.name)) continue;
    assert(
      stage.name === "pipeline-metrics" || stage.conclusion === "skipped",
      `${component} contains an unexpected active stage`,
    );
  }
  strictBottleneck(report, requiredStages, component);
  assert(
    exactKeys(report.baseline, ["capturedAt", "representativeSeconds", "confidence"]),
    `${component}.baseline keys are invalid`,
  );
  assert(
    report.baseline.capturedAt === baseline.capturedAt &&
      report.baseline.representativeSeconds === baseline.derivedBaseline.representativeSeconds &&
      report.baseline.confidence === baseline.derivedBaseline.confidence,
    `${component}.baseline mismatch`,
  );
  return requiredStages;
}

function strictArtifact(artifact, component, candidateSha, ciRunId, producerRunAttempt) {
  assert(
    exactKeys(artifact, ["name", "id", "digest", "archiveSha256", "treeSha256"]),
    `chain.${component}.artifact keys are invalid`,
  );
  assert(positiveInteger(artifact.id), `chain.${component}.artifact.id is invalid`);
  assert(PREFIXED_SHA256.test(artifact.digest ?? ""), `chain.${component}.artifact.digest is invalid`);
  assert(
    HEX_SHA256.test(artifact.archiveSha256 ?? ""),
    `chain.${component}.artifact.archiveSha256 is invalid`,
  );
  assert(HEX_SHA256.test(artifact.treeSha256 ?? ""), `chain.${component}.artifact.treeSha256 is invalid`);
  assert(
    artifact.name === `staging-frontend-${candidateSha}-${ciRunId}-${producerRunAttempt}`,
    `chain.${component}.artifact.name is invalid`,
  );
}

function strictChain(chain) {
  assert(
    exactKeys(chain, [
      "schemaVersion",
      "event",
      "repository",
      "candidateSha",
      "profile",
      "matrixSha256",
      "policySha256",
      "capturedAt",
      "ci",
      "bridge",
      "staging",
    ]),
    "release chain keys are invalid",
  );
  assert(chain.schemaVersion === 1, "release chain schemaVersion is invalid");
  assert(chain.event === CHAIN_EVENT, "release chain event is invalid");
  assert(chain.repository === REPOSITORY, "release chain repository is invalid");
  assert(FULL_SHA.test(chain.candidateSha ?? ""), "release chain candidate SHA is invalid");
  assert(PROFILES.has(chain.profile), "release chain profile is invalid");
  assert(HEX_SHA256.test(chain.matrixSha256 ?? ""), "release chain matrix SHA-256 is invalid");
  assert(HEX_SHA256.test(chain.policySha256 ?? ""), "release chain policy SHA-256 is invalid");
  timestamp(chain.capturedAt, "chain.capturedAt");
  assert(
    exactKeys(chain.ci, ["workflow", "runId", "runAttempt", "producerRunAttempt", "controlSha", "artifact"]),
    "release chain CI keys are invalid",
  );
  assert(chain.ci.workflow === COMPONENT_WORKFLOWS.ci, "release chain CI workflow is invalid");
  assert(chain.ci.controlSha === chain.candidateSha, "release chain CI control SHA is invalid");
  assert(positiveInteger(chain.ci.runId), "release chain CI runId is invalid");
  assert(positiveInteger(chain.ci.runAttempt), "release chain CI runAttempt is invalid");
  assert(
    positiveInteger(chain.ci.producerRunAttempt) &&
      Number(chain.ci.producerRunAttempt) <= Number(chain.ci.runAttempt),
    "release chain CI producerRunAttempt is invalid",
  );
  assert(
    exactKeys(chain.bridge, [
      "workflow",
      "runId",
      "runAttempt",
      "sourceCiRunId",
      "gateCiRunAttempt",
      "sourceCiRunAttempt",
      "controlSha",
      "artifact",
    ]),
    "release chain bridge keys are invalid",
  );
  assert(chain.bridge.workflow === COMPONENT_WORKFLOWS.bridge, "release chain bridge workflow is invalid");
  assert(FULL_SHA.test(chain.bridge.controlSha ?? ""), "release chain bridge control SHA is invalid");
  for (const key of ["runId", "runAttempt", "sourceCiRunId", "gateCiRunAttempt", "sourceCiRunAttempt"]) {
    assert(positiveInteger(chain.bridge[key]), `release chain bridge ${key} is invalid`);
  }
  assert(
    String(chain.bridge.sourceCiRunId) === String(chain.ci.runId) &&
      Number(chain.bridge.gateCiRunAttempt) === Number(chain.ci.runAttempt) &&
      Number(chain.bridge.sourceCiRunAttempt) === Number(chain.ci.producerRunAttempt),
    "release chain CI to bridge link is invalid",
  );
  assert(
    exactKeys(chain.staging, [
      "workflow",
      "runId",
      "runAttempt",
      "sourceBridgeRunId",
      "sourceBridgeRunAttempt",
      "controlSha",
      "artifact",
    ]),
    "release chain staging keys are invalid",
  );
  assert(chain.staging.workflow === COMPONENT_WORKFLOWS.staging, "release chain staging workflow is invalid");
  assert(FULL_SHA.test(chain.staging.controlSha ?? ""), "release chain staging control SHA is invalid");
  for (const key of ["runId", "runAttempt", "sourceBridgeRunId", "sourceBridgeRunAttempt"]) {
    assert(positiveInteger(chain.staging[key]), `release chain staging ${key} is invalid`);
  }
  assert(
    String(chain.staging.sourceBridgeRunId) === String(chain.bridge.runId) &&
      Number(chain.staging.sourceBridgeRunAttempt) === Number(chain.bridge.runAttempt),
    "release chain bridge to staging link is invalid",
  );
  for (const component of COMPONENT_ORDER) {
    strictArtifact(
      chain[component].artifact,
      component,
      chain.candidateSha,
      chain.ci.runId,
      chain.ci.producerRunAttempt,
    );
  }
  for (const key of ["name", "id", "digest", "archiveSha256", "treeSha256"]) {
    assert(
      chain.bridge.artifact[key] === chain.ci.artifact[key] &&
        chain.staging.artifact[key] === chain.ci.artifact[key],
      "release chain immutable artifact tuple mismatch",
    );
  }
}

function assertComponentChainBinding(reports, chain) {
  for (const component of COMPONENT_ORDER) {
    const report = reports[component];
    const binding = chain[component];
    assert(
      report.candidateSha === chain.candidateSha,
      `${component} candidate SHA does not match release chain`,
    );
    assert(report.controlSha === binding.controlSha, `${component} control SHA does not match release chain`);
    assert(report.profile === chain.profile, `${component} profile does not match release chain`);
    assert(String(report.runId) === String(binding.runId), `${component} runId does not match release chain`);
    assert(
      Number(report.runAttempt) === Number(binding.runAttempt),
      `${component} runAttempt does not match release chain`,
    );
  }
}

function prefixedStage(component, stage) {
  return {
    component,
    id: stage.id,
    name: `${component}:${stage.name}`,
    status: stage.status,
    conclusion: stage.conclusion,
    durationSeconds: stage.durationSeconds,
    steps: stage.steps.map((step) => ({
      component,
      job: `${component}:${step.job}`,
      name: step.name,
      number: step.number,
      status: step.status,
      conclusion: step.conclusion,
      durationSeconds: step.durationSeconds,
    })),
  };
}

function normalizedChain(chain) {
  return {
    schemaVersion: chain.schemaVersion,
    event: chain.event,
    repository: chain.repository,
    candidateSha: chain.candidateSha,
    profile: chain.profile,
    matrixSha256: chain.matrixSha256,
    policySha256: chain.policySha256,
    capturedAt: chain.capturedAt,
    ci: structuredClone(chain.ci),
    bridge: structuredClone(chain.bridge),
    staging: structuredClone(chain.staging),
  };
}

export function validatePipelineChain(chain) {
  strictChain(chain);
  return normalizedChain(chain);
}

export function buildPipelineEndToEndReport({
  ciReport,
  bridgeReport,
  stagingReport,
  baseline,
  chain,
  capturedAt,
}) {
  const target = strictBaseline(baseline);
  strictChain(chain);
  const reports = { ci: ciReport, bridge: bridgeReport, staging: stagingReport };
  const requiredStages = {};
  for (const component of COMPONENT_ORDER) {
    requiredStages[component] = strictComponentReport(reports[component], component, baseline);
  }
  assertComponentChainBinding(reports, chain);
  const captureTime = timestamp(capturedAt, "capturedAt");
  const chainCapturedAt = timestamp(chain.capturedAt, "chain.capturedAt");
  assert(captureTime >= chainCapturedAt, "capturedAt precedes chain binding");
  const componentCaptureTimes = COMPONENT_ORDER.map((component) =>
    timestamp(reports[component].capturedAt, `${component}.capturedAt`),
  );
  const componentRunStartTimes = COMPONENT_ORDER.map((component) =>
    timestamp(reports[component].runStartedAt, `${component}.runStartedAt`),
  );
  for (let index = 1; index < componentCaptureTimes.length; index += 1) {
    assert(
      componentCaptureTimes[index] >= componentCaptureTimes[index - 1],
      `${COMPONENT_ORDER[index]} component capture precedes ${COMPONENT_ORDER[index - 1]}`,
    );
    assert(
      componentRunStartTimes[index] >= componentCaptureTimes[index - 1],
      `${COMPONENT_ORDER[index]} run starts before ${COMPONENT_ORDER[index - 1]} component capture`,
    );
  }
  assert(
    chainCapturedAt >= componentCaptureTimes.at(-1),
    "chain binding precedes the staging component report",
  );
  const activeSeconds = COMPONENT_ORDER.reduce(
    (total, component) => total + reports[component].observedSeconds,
    0,
  );
  assert(Number.isSafeInteger(activeSeconds), "end-to-end activeSeconds exceeds safe range");
  const handoffs = {
    ciToBridge: {
      fromCapturedAt: reports.ci.capturedAt,
      toRunStartedAt: reports.bridge.runStartedAt,
      waitSeconds: Math.round((componentRunStartTimes[1] - componentCaptureTimes[0]) / 1000),
    },
    bridgeToStaging: {
      fromCapturedAt: reports.bridge.capturedAt,
      toRunStartedAt: reports.staging.runStartedAt,
      waitSeconds: Math.round((componentRunStartTimes[2] - componentCaptureTimes[1]) / 1000),
    },
  };
  const handoffWaitSeconds = Object.values(handoffs).reduce(
    (total, handoff) => total + handoff.waitSeconds,
    0,
  );
  const observedSeconds = Math.round((componentCaptureTimes[2] - componentRunStartTimes[0]) / 1000);
  assert(
    Number.isSafeInteger(observedSeconds) && observedSeconds === activeSeconds + handoffWaitSeconds,
    "end-to-end wall-clock duration is not source-derived",
  );
  const bottleneckSegment = [
    ...COMPONENT_ORDER.map((component) => ({
      kind: "component",
      name: component,
      durationSeconds: reports[component].observedSeconds,
    })),
    ...Object.entries(handoffs).map(([name, handoff]) => ({
      kind: "handoff",
      name,
      durationSeconds: handoff.waitSeconds,
    })),
  ].reduce((current, candidate) =>
    candidate.durationSeconds > current.durationSeconds ? candidate : current,
  );
  const bottleneck =
    bottleneckSegment.kind === "component"
      ? {
          component: bottleneckSegment.name,
          componentDurationSeconds: bottleneckSegment.durationSeconds,
          ...reports[bottleneckSegment.name].bottleneck,
        }
      : {
          component: "handoff",
          componentDurationSeconds: bottleneckSegment.durationSeconds,
          stage: bottleneckSegment.name,
          stageDurationSeconds: bottleneckSegment.durationSeconds,
          step: null,
          stepDurationSeconds: null,
        };
  const sloState =
    observedSeconds < target.happyPathMinimumSeconds
      ? "below-target-window"
      : observedSeconds <= target.happyPathMaximumSeconds
        ? "within-target-window"
        : "above-target-window";
  const stages = COMPONENT_ORDER.flatMap((component) =>
    requiredStages[component].map((stage) => prefixedStage(component, stage)),
  );
  return {
    schemaVersion: 1,
    event: EVENT,
    repository: REPOSITORY,
    workflow: "CI -> Promote staging frontend bridge -> Deploy staging",
    candidateSha: chain.candidateSha,
    profile: chain.profile,
    scope: "end-to-end",
    capturedAt: new Date(captureTime).toISOString(),
    observedSeconds,
    activeSeconds,
    handoffWaitSeconds,
    handoffs,
    releaseOutcome: "success",
    slo: {
      happyPathMinimumSeconds: target.happyPathMinimumSeconds,
      happyPathMaximumSeconds: target.happyPathMaximumSeconds,
      state: sloState,
      gatesRelaxed: false,
    },
    bottleneck: {
      component: bottleneck.component,
      componentDurationSeconds: bottleneck.componentDurationSeconds,
      stage: `${bottleneck.component}:${bottleneck.stage}`,
      stageDurationSeconds: bottleneck.stageDurationSeconds,
      step: bottleneck.step,
      stepDurationSeconds: bottleneck.stepDurationSeconds,
    },
    components: Object.fromEntries(
      COMPONENT_ORDER.map((component) => [
        component,
        {
          workflow: reports[component].workflow,
          runId: reports[component].runId,
          runAttempt: reports[component].runAttempt,
          runStartedAt: reports[component].runStartedAt,
          capturedAt: reports[component].capturedAt,
          observedSeconds: reports[component].observedSeconds,
          stageCount: requiredStages[component].length,
          bottleneck: structuredClone(reports[component].bottleneck),
        },
      ]),
    ),
    chain: normalizedChain(chain),
    stages,
    baseline: {
      capturedAt: baseline.capturedAt,
      representativeSeconds: baseline.derivedBaseline.representativeSeconds,
      confidence: baseline.derivedBaseline.confidence,
      successfulFullReleaseSamples: baseline.derivedBaseline.successfulFullReleaseSamples,
      provisional: baseline.derivedBaseline.successfulFullReleaseSamples === 0,
    },
  };
}

export const PIPELINE_END_TO_END = Object.freeze({
  schemaVersion: 1,
  event: EVENT,
  chainEvent: CHAIN_EVENT,
  repository: REPOSITORY,
  componentOrder: COMPONENT_ORDER,
  componentWorkflows: COMPONENT_WORKFLOWS,
});
