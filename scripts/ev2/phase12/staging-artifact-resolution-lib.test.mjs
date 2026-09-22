import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCiStagingFrontendArtifact,
  evaluatePipelineDurationArtifact,
  evaluateStagingCandidateArtifact,
  normalizeStagingArtifactDigest,
} from "./staging-artifact-resolution-lib.mjs";

const candidateSha = "a".repeat(40);
const runId = "34000214001";
const runAttempt = 2;
const artifactId = "900000001";
const artifactDigest = `sha256:${"b".repeat(64)}`;
const expected = { candidateSha, runId, runAttempt, artifactId, artifactDigest };
const controlSha = "c".repeat(40);
const run = {
  id: Number(runId),
  run_attempt: runAttempt,
  name: "Deploy staging",
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: controlSha,
  path: ".github/workflows/deploy-staging.yml",
  actor: { login: "Vnd93" },
  triggering_actor: { login: "Vnd93" },
  repository: { full_name: "Vnd93/gaiatec-cms" },
  head_repository: { full_name: "Vnd93/gaiatec-cms" },
};
const artifact = {
  id: Number(artifactId),
  name: `staging-candidate-${candidateSha}-${runId}-${runAttempt}`,
  expired: false,
  digest: artifactDigest,
  size_in_bytes: 1024,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:01:00.000Z",
  expires_at: "2026-11-30T00:00:00.000Z",
  url: `https://api.github.com/repos/Vnd93/gaiatec-cms/actions/artifacts/${artifactId}`,
  archive_download_url: `https://api.github.com/repos/Vnd93/gaiatec-cms/actions/artifacts/${artifactId}/zip`,
  workflow_run: { id: Number(runId), head_branch: "main", head_sha: controlSha },
};

test("staging candidate resolver binds successful deploy run, artifact ID, digest and SHA", () => {
  const result = evaluateStagingCandidateArtifact({
    repository: "Vnd93/gaiatec-cms",
    run,
    artifacts: [artifact],
    expected,
    now: Date.parse("2026-09-07T00:00:00.000Z"),
  });
  assert.equal(result.valid, true);
  assert.equal(result.controlSha, controlSha);
  assert.equal(normalizeStagingArtifactDigest("b".repeat(64)), artifactDigest);

  assert.equal(
    evaluateStagingCandidateArtifact({
      repository: "Vnd93/gaiatec-cms",
      run,
      artifacts: [artifact],
      expected: { ...expected, controlSha },
      now: Date.parse("2026-09-07T00:00:00.000Z"),
    }).valid,
    true,
  );
});

test("staging candidate resolver rejects adversarial run substitutions", () => {
  const cases = [
    ["repository_input_invalid", { repository: "attacker/repository" }],
    ["run_id_invalid", { expected: { ...expected, runId: "9".repeat(30) } }],
    ["run_attempt_invalid", { expected: { ...expected, runAttempt: 101 } }],
    ["artifact_id_invalid", { expected: { ...expected, artifactId: "9".repeat(30) } }],
    ["candidate_sha_invalid", { expected: { ...expected, candidateSha: "short" } }],
    ["control_sha_invalid", { expected: { ...expected, controlSha: "short" } }],
    ["run_control_sha_mismatch", { expected: { ...expected, controlSha: "f".repeat(40) } }],
    ["run_identity_mismatch", { run: { ...run, id: 7 } }],
    ["run_attempt_mismatch", { run: { ...run, run_attempt: 3 } }],
    ["run_workflow_invalid", { run: { ...run, name: "Deploy production" } }],
    ["run_workflow_invalid", { run: { ...run, path: ".github/workflows/rollback-staging.yml" } }],
    ["run_event_invalid", { run: { ...run, event: "push" } }],
    ["run_branch_invalid", { run: { ...run, head_branch: "feature" } }],
    ["run_control_sha_invalid", { run: { ...run, head_sha: "short" } }],
    ["run_actor_invalid", { run: { ...run, actor: { login: "attacker" } } }],
    ["run_triggering_actor_invalid", { run: { ...run, triggering_actor: { login: "attacker" } } }],
    ["run_repository_invalid", { run: { ...run, repository: { full_name: "attacker/repository" } } }],
    [
      "run_head_repository_invalid",
      { run: { ...run, head_repository: { full_name: "attacker/repository" } } },
    ],
    ["run_not_successful", { run: { ...run, conclusion: "failure" } }],
  ];
  for (const [violation, overrides] of cases) {
    const result = evaluateStagingCandidateArtifact({
      repository: "Vnd93/gaiatec-cms",
      run,
      artifacts: [artifact],
      expected,
      now: Date.parse("2026-09-07T00:00:00.000Z"),
      ...overrides,
    });
    assert.ok(result.violations.includes(violation), violation);
    assert.equal(result.artifact, null);
  }
});

test("staging candidate resolver rejects adversarial artifact substitutions", () => {
  const changed = (value) => ({ artifacts: [{ ...artifact, ...value }] });
  const cases = [
    ["artifact_identity_ambiguous", { artifacts: [] }],
    ["artifact_identity_ambiguous", { artifacts: [artifact, { ...artifact }] }],
    ["artifact_name_not_unique", { artifacts: [artifact, { ...artifact, id: 900000002 }] }],
    ["artifact_name_invalid", changed({ name: `staging-candidate-${"d".repeat(40)}-${runId}-2` })],
    ["artifact_digest_invalid", changed({ digest: "b".repeat(64) })],
    ["artifact_digest_mismatch", changed({ digest: `sha256:${"e".repeat(64)}` })],
    ["artifact_expired", changed({ expired: true })],
    ["artifact_size_invalid", changed({ size_in_bytes: 0 })],
    ["artifact_retention_invalid", changed({ created_at: "invalid" })],
    ["artifact_retention_invalid", changed({ updated_at: "invalid" })],
    ["artifact_retention_invalid", changed({ updated_at: "2026-09-07T00:06:00.000Z" })],
    ["artifact_retention_invalid", changed({ expires_at: "2026-09-06T00:00:00.000Z" })],
    ["artifact_retention_invalid", changed({ expires_at: "2026-11-29T23:59:59.000Z" })],
    ["artifact_run_binding_invalid", changed({ workflow_run: { ...artifact.workflow_run, id: 99 } })],
    [
      "artifact_run_binding_invalid",
      changed({ workflow_run: { ...artifact.workflow_run, head_branch: "feature" } }),
    ],
    [
      "artifact_run_binding_invalid",
      changed({ workflow_run: { ...artifact.workflow_run, head_sha: "f".repeat(40) } }),
    ],
    ["artifact_api_url_invalid", changed({ url: "https://attacker.invalid/a" })],
    ["artifact_download_url_invalid", changed({ archive_download_url: "https://attacker.invalid/a" })],
  ];
  for (const [violation, overrides] of cases) {
    const result = evaluateStagingCandidateArtifact({
      repository: "Vnd93/gaiatec-cms",
      run,
      artifacts: [artifact],
      expected,
      now: Date.parse("2026-09-07T00:00:00.000Z"),
      ...overrides,
    });
    assert.ok(result.violations.includes(violation), violation);
    assert.equal(result.valid, false);
  }
});

function durationRun(component) {
  const headSha = component === "bridge" ? controlSha : candidateSha;
  return {
    id: 35731735256,
    run_attempt: 3,
    name: component === "ci" ? "CI" : "Promote staging frontend bridge",
    path:
      component === "ci"
        ? ".github/workflows/ci.yml"
        : ".github/workflows/promote-staging-frontend-bridge.yml",
    event: component === "ci" ? "push" : "workflow_dispatch",
    head_branch: "main",
    head_sha: headSha,
    status: "completed",
    conclusion: "success",
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
    repository: { full_name: "Vnd93/gaiatec-cms" },
    head_repository: { full_name: "Vnd93/gaiatec-cms" },
  };
}

function durationArtifact(component) {
  const headSha = component === "bridge" ? controlSha : candidateSha;
  return {
    id: 8001,
    name: `pipeline-duration-${component}-${candidateSha}-35731735256-3`,
    digest: `sha256:${"f".repeat(64)}`,
    size_in_bytes: 2048,
    expired: false,
    created_at: "2026-09-22T12:00:00.000Z",
    expires_at: "2026-12-21T12:00:00.000Z",
    archive_download_url: "https://api.github.com/repos/Vnd93/gaiatec-cms/actions/artifacts/8001/zip",
    workflow_run: { id: 35731735256, head_branch: "main", head_sha: headSha },
  };
}

function evaluateDuration(component, overrides = {}) {
  return evaluatePipelineDurationArtifact({
    component,
    repository: "Vnd93/gaiatec-cms",
    run: durationRun(component),
    artifacts: [durationArtifact(component)],
    expected: {
      runId: "35731735256",
      runAttempt: 3,
      candidateSha,
      controlSha: component === "bridge" ? controlSha : candidateSha,
    },
    now: Date.parse("2026-09-22T13:00:00.000Z"),
    ...overrides,
  });
}

test("duration artifact resolver binds exact green CI and bridge attempts", () => {
  for (const component of ["ci", "bridge"]) {
    const result = evaluateDuration(component);
    assert.equal(result.valid, true);
    assert.equal(result.artifactId, "8001");
    assert.equal(result.artifactDigest, `sha256:${"f".repeat(64)}`);
    assert.equal(result.artifactName, durationArtifact(component).name);
    assert.equal(result.candidateSha, candidateSha);
    assert.equal(result.controlSha, component === "bridge" ? controlSha : candidateSha);
  }
});

test("duration artifact resolver refuses wrong attempts, actors, workflows and artifact substitutions", () => {
  const baseRun = durationRun("ci");
  const baseArtifact = durationArtifact("ci");
  const cases = [
    ["component_invalid", { component: "staging" }],
    ["run_attempt_mismatch", { run: { ...baseRun, run_attempt: 2 } }],
    ["run_not_successful", { run: { ...baseRun, conclusion: "failure" } }],
    ["run_actor_invalid", { run: { ...baseRun, actor: { login: "attacker" } } }],
    ["run_workflow_invalid", { run: { ...baseRun, path: ".github/workflows/ci-copy.yml" } }],
    ["artifact_name_not_unique", { artifacts: [] }],
    ["artifact_digest_invalid", { artifacts: [{ ...baseArtifact, digest: "f".repeat(64) }] }],
    ["artifact_expired", { artifacts: [{ ...baseArtifact, expired: true }] }],
    [
      "artifact_run_binding_invalid",
      { artifacts: [{ ...baseArtifact, workflow_run: { ...baseArtifact.workflow_run, id: 7 } }] },
    ],
  ];
  for (const [violation, overrides] of cases) {
    assert.ok(evaluateDuration(overrides.component ?? "ci", overrides).violations.includes(violation));
  }
});

const ciHeadSha = "d".repeat(40);
const ciRunId = "35731735256";
const ciProducerAttempt = 1;
const ciGateAttempt = 3;
const ciExpected = {
  headSha: ciHeadSha,
  runId: ciRunId,
  runAttempt: ciProducerAttempt,
  gateRunAttempt: ciGateAttempt,
};
function ciRun(attempt, conclusion) {
  return {
    id: Number(ciRunId),
    run_attempt: attempt,
    name: "CI",
    path: ".github/workflows/ci.yml",
    event: "push",
    head_branch: "main",
    head_sha: ciHeadSha,
    status: "completed",
    conclusion,
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
    repository: { full_name: "Vnd93/gaiatec-cms" },
    head_repository: { full_name: "Vnd93/gaiatec-cms" },
  };
}
const ciGateRun = ciRun(ciGateAttempt, "success");
const ciProducerRun = ciRun(ciProducerAttempt, "failure");
const ciProducerJobs = [
  {
    id: 7001,
    run_id: Number(ciRunId),
    head_sha: ciHeadSha,
    name: "package-staging",
    status: "completed",
    conclusion: "success",
    steps: [
      {
        name: "Build, seal and verify the immutable staging frontend package",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Upload the only deployable staging frontend package",
        status: "completed",
        conclusion: "success",
      },
    ],
  },
];
const ciArtifact = {
  id: 10695766725,
  name: `staging-frontend-${ciHeadSha}-${ciRunId}-${ciProducerAttempt}`,
  digest: `sha256:${"e".repeat(64)}`,
  size_in_bytes: 4096,
  expired: false,
  created_at: "2026-09-20T12:00:00.000Z",
  expires_at: "2026-12-19T12:00:00.000Z",
  archive_download_url: "https://api.github.com/repos/Vnd93/gaiatec-cms/actions/artifacts/10695766725/zip",
  workflow_run: { id: Number(ciRunId), head_branch: "main", head_sha: ciHeadSha },
};
const ciNow = Date.parse("2026-09-22T12:00:00.000Z");

function evaluateCi(overrides = {}) {
  return evaluateCiStagingFrontendArtifact({
    repository: "Vnd93/gaiatec-cms",
    gateRun: ciGateRun,
    producerRun: ciProducerRun,
    producerJobs: ciProducerJobs,
    artifacts: [ciArtifact],
    expected: ciExpected,
    now: ciNow,
    ...overrides,
  });
}

test("CI staging frontend resolver binds a green gate attempt to its successful original package job", () => {
  const result = evaluateCi();
  assert.equal(result.valid, true);
  assert.equal(result.artifact, ciArtifact);
  assert.equal(result.expectedName, ciArtifact.name);
  assert.equal(result.normalizedDigest, ciArtifact.digest);
  assert.equal(result.sourceRunId, ciRunId);
  assert.equal(result.sourceRunAttempt, ciProducerAttempt);
  assert.equal(result.gateRunAttempt, ciGateAttempt);
  assert.equal(result.controlSha, ciHeadSha);

  const unrelated = { ...ciArtifact, id: 99, name: "unrelated" };
  assert.equal(evaluateCi({ artifacts: [unrelated, ciArtifact] }).valid, true);
});

test("CI staging frontend resolver rejects adversarial run identity substitutions", () => {
  const cases = [
    ["repository_input_invalid", { repository: "attacker/repository" }],
    ["run_id_invalid", { expected: { ...ciExpected, runId: "0" } }],
    ["run_id_invalid", { expected: { ...ciExpected, runId: "9".repeat(30) } }],
    ["run_attempt_invalid", { expected: { ...ciExpected, runAttempt: 0 } }],
    ["gate_run_attempt_invalid", { expected: { ...ciExpected, gateRunAttempt: 0 } }],
    ["gate_run_attempt_invalid", { expected: { ...ciExpected, gateRunAttempt: 101 } }],
    ["head_sha_invalid", { expected: { ...ciExpected, headSha: "short" } }],
    ["gate_run_identity_mismatch", { gateRun: { ...ciGateRun, id: 7 } }],
    ["gate_run_identity_mismatch", { gateRun: { ...ciGateRun, id: ciRunId } }],
    ["gate_run_attempt_mismatch", { gateRun: { ...ciGateRun, run_attempt: 2 } }],
    ["gate_run_workflow_invalid", { gateRun: { ...ciGateRun, name: "Not CI" } }],
    ["gate_run_event_invalid", { gateRun: { ...ciGateRun, event: "workflow_dispatch" } }],
    ["gate_run_branch_invalid", { gateRun: { ...ciGateRun, head_branch: "feature" } }],
    ["gate_run_head_sha_mismatch", { gateRun: { ...ciGateRun, head_sha: "f".repeat(40) } }],
    ["gate_run_actor_invalid", { gateRun: { ...ciGateRun, actor: { login: "attacker" } } }],
    [
      "gate_run_triggering_actor_invalid",
      { gateRun: { ...ciGateRun, triggering_actor: { login: "attacker" } } },
    ],
    ["gate_run_not_successful", { gateRun: { ...ciGateRun, conclusion: "failure" } }],
    [
      "gate_run_repository_invalid",
      { gateRun: { ...ciGateRun, repository: { full_name: "attacker/repository" } } },
    ],
    [
      "gate_run_head_repository_invalid",
      { gateRun: { ...ciGateRun, head_repository: { full_name: "attacker/repository" } } },
    ],
    ["producer_run_attempt_mismatch", { producerRun: { ...ciProducerRun, run_attempt: 2 } }],
  ];
  for (const [violation, overrides] of cases) {
    assert.ok(evaluateCi(overrides).violations.includes(violation), violation);
  }
});

test("CI staging frontend resolver requires the original producer job and both package steps green", () => {
  const changedJob = (value) => ({ producerJobs: [{ ...ciProducerJobs[0], ...value }] });
  const changedStep = (index, value) => {
    const steps = ciProducerJobs[0].steps.map((step, stepIndex) =>
      stepIndex === index ? { ...step, ...value } : step,
    );
    return changedJob({ steps });
  };
  const cases = [
    ["producer_package_job_not_unique", { producerJobs: [] }],
    ["producer_package_job_not_unique", { producerJobs: [...ciProducerJobs, ciProducerJobs[0]] }],
    ["producer_package_job_not_successful", changedJob({ conclusion: "failure" })],
    ["producer_build_not_successful", changedStep(0, { conclusion: "failure" })],
    ["producer_upload_not_successful", changedStep(1, { conclusion: "failure" })],
  ];
  for (const [violation, overrides] of cases)
    assert.ok(evaluateCi(overrides).violations.includes(violation), violation);
});

test("CI staging frontend resolver rejects adversarial artifact substitutions", () => {
  const changed = (value) => ({ artifacts: [{ ...ciArtifact, ...value }] });
  const cases = [
    ["artifact_name_not_unique", { artifacts: [] }],
    ["artifact_name_not_unique", { artifacts: [ciArtifact, { ...ciArtifact, id: 12 }] }],
    ["artifact_id_invalid", changed({ id: 0 })],
    ["artifact_digest_invalid", changed({ digest: "e".repeat(64) })],
    ["artifact_digest_invalid", changed({ digest: `sha256:${"z".repeat(64)}` })],
    ["artifact_digest_invalid", changed({ digest: `sha256:${"E".repeat(64)}` })],
    ["artifact_size_invalid", changed({ size_in_bytes: 0 })],
    ["artifact_expired", changed({ expired: true })],
    ["artifact_retention_invalid", changed({ created_at: "invalid" })],
    ["artifact_retention_invalid", changed({ expires_at: "2026-09-21T12:00:00.000Z" })],
    ["artifact_retention_invalid", changed({ expires_at: "2026-12-18T11:59:59.000Z" })],
    ["artifact_run_binding_invalid", changed({ workflow_run: { ...ciArtifact.workflow_run, id: 7 } })],
    ["artifact_run_binding_invalid", changed({ workflow_run: { ...ciArtifact.workflow_run, id: ciRunId } })],
    [
      "artifact_run_binding_invalid",
      changed({ workflow_run: { ...ciArtifact.workflow_run, head_branch: "feature" } }),
    ],
    [
      "artifact_run_binding_invalid",
      changed({ workflow_run: { ...ciArtifact.workflow_run, head_sha: "f".repeat(40) } }),
    ],
    ["artifact_download_url_invalid", changed({ archive_download_url: "https://attacker.invalid/a" })],
  ];
  for (const [violation, overrides] of cases) {
    assert.ok(evaluateCi(overrides).violations.includes(violation), violation);
  }
});
