const FULL_SHA = /^[a-f0-9]{40}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const TERMINAL = new Set(["success", "failure", "cancelled", "skipped", "timed_out"]);
const PROFILES = new Set(["frontend-only", "edge-only", "database-auth", "full-release", "diagnostic"]);

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`);
  return timestamp;
}

function durationSeconds(start, end, label) {
  const seconds = Math.round(
    (parseTimestamp(end, `${label}.end`) - parseTimestamp(start, `${label}.start`)) / 1000,
  );
  if (seconds < 0) throw new Error(`${label} duration cannot be negative`);
  return seconds;
}

export function validatePipelineSloBaseline(baseline) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new Error("pipeline SLO baseline must be an object");
  }
  if (baseline.schemaVersion !== 1) throw new Error("unsupported pipeline SLO baseline schemaVersion");
  const minimum = baseline.target?.happyPathMinimumSeconds;
  const maximum = baseline.target?.happyPathMaximumSeconds;
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 1 || maximum <= minimum) {
    throw new Error("pipeline SLO target bounds are invalid");
  }
  if (baseline.target?.policy !== "report-bottleneck-without-relaxing-gates") {
    throw new Error("pipeline SLO policy cannot relax gates");
  }
  if (baseline.sourceRepository !== "Vnd93/gaiatec-cms") {
    throw new Error("pipeline SLO baseline repository is invalid");
  }
  if (!Array.isArray(baseline.observations) || baseline.observations.length < 1) {
    throw new Error("pipeline SLO baseline requires real observations");
  }
  for (const [index, observation] of baseline.observations.entries()) {
    if (!Number.isSafeInteger(observation.runId) || observation.runId < 1) {
      throw new Error(`observations.${index}.runId is invalid`);
    }
    if (!FULL_SHA.test(observation.headSha ?? "")) {
      throw new Error(`observations.${index}.headSha is invalid`);
    }
    const observed = durationSeconds(observation.startedAt, observation.completedAt, `observations.${index}`);
    if (observed !== observation.durationSeconds) {
      throw new Error(`observations.${index}.durationSeconds is not source-derived`);
    }
    const criticalJobDuration = durationSeconds(
      observation.criticalJobStartedAt,
      observation.criticalJobCompletedAt,
      `observations.${index}.criticalJob`,
    );
    if (criticalJobDuration !== observation.criticalJobDurationSeconds) {
      throw new Error(`observations.${index}.criticalJobDurationSeconds is not source-derived`);
    }
    if (
      parseTimestamp(observation.criticalJobStartedAt, `observations.${index}.criticalJobStartedAt`) <
        parseTimestamp(observation.startedAt, `observations.${index}.startedAt`) ||
      parseTimestamp(observation.criticalJobCompletedAt, `observations.${index}.criticalJobCompletedAt`) >
        parseTimestamp(observation.completedAt, `observations.${index}.completedAt`)
    ) {
      throw new Error(`observations.${index}.criticalJob timestamps are outside the run`);
    }
    if (observation.conclusion === "success") {
      if (
        observation.rawRunConclusion !== "success" ||
        observation.criticalJobConclusion !== "success" ||
        observation.recoveryEvidence !== null
      ) {
        throw new Error(`observations.${index}.success evidence is invalid`);
      }
    } else if (observation.conclusion === "failure-recovered") {
      const recovery = observation.recoveryEvidence;
      if (
        observation.rawRunConclusion !== "failure" ||
        observation.criticalJobConclusion !== "failure" ||
        !recovery ||
        recovery.finalizerJob !== "finalize" ||
        recovery.finalizerConclusion !== "success" ||
        !Number.isSafeInteger(recovery.terminalArtifactId) ||
        recovery.terminalArtifactId < 1 ||
        !PREFIXED_SHA256.test(recovery.terminalArtifactDigest ?? "")
      ) {
        throw new Error(`observations.${index}.recovery evidence is invalid`);
      }
    } else {
      throw new Error(`observations.${index}.conclusion is invalid`);
    }
  }
  return baseline.target;
}

function mapStep(step, jobName) {
  const conclusion = step.conclusion ?? (step.status === "completed" ? "failure" : "in_progress");
  const completed = conclusion !== "skipped" && step.started_at && step.completed_at;
  return {
    job: jobName,
    name: String(step.name ?? ""),
    number: Number(step.number),
    status: String(step.status ?? ""),
    conclusion: String(conclusion),
    durationSeconds: completed
      ? durationSeconds(step.started_at, step.completed_at, `step.${jobName}`)
      : null,
  };
}

export function buildPipelineDurationReport({
  run,
  jobsPayload,
  baseline,
  profile,
  scope = "component",
  capturedAt,
  expectedStages,
  candidateSha = run?.head_sha,
  metricsJobName = "pipeline-metrics",
}) {
  const target = validatePipelineSloBaseline(baseline);
  if (!["component", "end-to-end"].includes(scope)) throw new Error("pipeline duration scope is invalid");
  if (!PROFILES.has(profile)) throw new Error("pipeline duration profile is invalid");
  if (!Number.isSafeInteger(run?.id) || run.id < 1) throw new Error("run.id is invalid");
  if (!Number.isSafeInteger(run?.run_attempt) || run.run_attempt < 1)
    throw new Error("run.run_attempt is invalid");
  if (run?.repository?.full_name !== baseline.sourceRepository) throw new Error("run repository mismatch");
  if (!FULL_SHA.test(run?.head_sha ?? "")) throw new Error("run.head_sha is invalid");
  if (!FULL_SHA.test(candidateSha ?? "")) throw new Error("candidateSha is invalid");
  const captureTime = parseTimestamp(capturedAt, "capturedAt");
  const runStart = parseTimestamp(run.run_started_at ?? run.created_at, "run start");
  if (captureTime < runStart) throw new Error("capturedAt precedes the run");
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
  if (jobs.length === 0) throw new Error("jobs payload is empty");

  const stages = jobs.map((job) => {
    const conclusion = String(job.conclusion ?? "in_progress");
    const completed = conclusion !== "skipped" && job.started_at && job.completed_at;
    return {
      id: Number(job.id),
      name: String(job.name ?? ""),
      status: String(job.status ?? ""),
      conclusion,
      durationSeconds: completed
        ? durationSeconds(job.started_at, job.completed_at, `job.${job.name}`)
        : null,
      steps: (Array.isArray(job.steps) ? job.steps : []).map((step) => mapStep(step, String(job.name ?? ""))),
    };
  });
  const substantive = stages.filter((stage) => stage.name !== metricsJobName);
  if (substantive.length === 0) throw new Error("no substantive pipeline stages found");
  if (
    !Array.isArray(expectedStages) ||
    expectedStages.length === 0 ||
    new Set(expectedStages).size !== expectedStages.length ||
    expectedStages.some((name) => typeof name !== "string" || name.length === 0 || name === metricsJobName)
  ) {
    throw new Error("expected pipeline stages are invalid");
  }
  const requiredStages = expectedStages.map((name) => {
    const matches = substantive.filter((stage) => stage.name === name);
    if (matches.length !== 1) throw new Error(`expected pipeline stage ${name} is missing or duplicated`);
    return matches[0];
  });
  const expectedStageNames = new Set(expectedStages);
  const unexpectedActive = substantive.filter(
    (stage) => !expectedStageNames.has(stage.name) && stage.conclusion !== "skipped",
  );
  if (unexpectedActive.length > 0) {
    throw new Error(`unexpected active pipeline stage ${unexpectedActive[0].name}`);
  }
  const allTerminal = requiredStages.every((stage) => TERMINAL.has(stage.conclusion));
  const failed = requiredStages.some((stage) => stage.conclusion !== "success");
  const releaseOutcome = !allTerminal ? "in-progress" : failed ? "non-happy-path" : "success";
  const observedSeconds = Math.round((captureTime - runStart) / 1000);
  const completedStages = requiredStages.filter((stage) => stage.durationSeconds !== null);
  const longestStage =
    completedStages.sort((left, right) => right.durationSeconds - left.durationSeconds)[0] ?? null;
  const longestStep = longestStage
    ? (longestStage.steps
        .filter((step) => step.durationSeconds !== null)
        .sort((left, right) => right.durationSeconds - left.durationSeconds)[0] ?? null)
    : null;

  let sloState = scope === "component" ? "component-only" : "not-evaluated-non-happy-path";
  if (scope === "end-to-end" && releaseOutcome === "success") {
    if (observedSeconds < target.happyPathMinimumSeconds) sloState = "below-target-window";
    else if (observedSeconds <= target.happyPathMaximumSeconds) sloState = "within-target-window";
    else sloState = "above-target-window";
  }
  return {
    schemaVersion: 1,
    event: "release.pipeline.duration",
    repository: baseline.sourceRepository,
    workflow: String(run.name ?? ""),
    runId: run.id,
    runAttempt: Number(run.run_attempt),
    candidateSha,
    controlSha: run.head_sha,
    profile,
    scope,
    expectedStages,
    runStartedAt: new Date(runStart).toISOString(),
    capturedAt: new Date(captureTime).toISOString(),
    observedSeconds,
    releaseOutcome,
    slo: {
      happyPathMinimumSeconds: target.happyPathMinimumSeconds,
      happyPathMaximumSeconds: target.happyPathMaximumSeconds,
      state: sloState,
      gatesRelaxed: false,
    },
    bottleneck: longestStage
      ? {
          stage: longestStage.name,
          stageDurationSeconds: longestStage.durationSeconds,
          step: longestStep?.name ?? null,
          stepDurationSeconds: longestStep?.durationSeconds ?? null,
        }
      : null,
    stages,
    baseline: {
      capturedAt: baseline.capturedAt,
      representativeSeconds: baseline.derivedBaseline?.representativeSeconds,
      confidence: baseline.derivedBaseline?.confidence,
    },
  };
}
