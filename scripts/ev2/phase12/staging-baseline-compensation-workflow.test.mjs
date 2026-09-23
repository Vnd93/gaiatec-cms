import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
const resolver = await readFile("scripts/ev2/phase12/resolve-staging-baseline-compensation.mjs", "utf8");

function position(label) {
  const value = workflow.indexOf(`- name: ${label}`);
  assert.notEqual(value, -1, label);
  return value;
}

function step(label) {
  const start = position(label);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

test("compensation marker remains untrusted until exact run and artifact resolution", () => {
  const classify = position("Classify the exact live baseline provenance");
  const remote = position("Resolve the exact failed run and immutable compensation artifacts");
  const download = position("Download the immutable compensation recovery bytes by exact artifact ID");
  const materialize = position(
    "Validate compensation state, seal, snapshot, and bytes before materialization",
  );
  const mutation = position("Persist redundant HMAC bridge state only after remote recovery proof");
  assert.ok(classify < remote && remote < download && download < materialize && materialize < mutation);
  assert.match(
    step("Resolve the exact failed run and immutable compensation artifacts"),
    /resolve-staging-baseline-compensation\.mjs[\s\S]*--run-id[\s\S]*--run-attempt[\s\S]*--record[\s\S]*--expected-release/,
  );
  assert.match(
    step("Download the immutable compensation recovery bytes by exact artifact ID"),
    /artifact-ids: \$\{\{ steps\.baseline_compensation\.outputs\.recovery_artifact_id \}\}[\s\S]*digest-mismatch: error[\s\S]*run-id:/,
  );
  assert.match(resolver, /actions\/runs\/\$\{runId\}\/attempts\/\$\{runAttempt\}/);
});

test("GitHub rerun artifact loss uses only a remotely proven compensation and pinned bootstrap", () => {
  const remote = position("Resolve the exact failed run and immutable compensation artifacts");
  const fallback = position("Verify pinned bootstrap after GitHub rerun artifact loss");
  const bootstrapDownload = position("Download the immutable bootstrap baseline bytes");
  const mutation = position("Persist redundant HMAC bridge state only after remote recovery proof");
  assert.ok(remote < fallback && fallback < bootstrapDownload && bootstrapDownload < mutation);
  assert.match(step("Verify pinned bootstrap after GitHub rerun artifact loss"), /bootstrap-rerun-loss/);
  assert.match(
    step("Download the immutable compensation state by exact artifact ID"),
    /recovery_source == 'compensation-artifacts'/,
  );
  assert.match(
    step("Download the immutable compensation recovery bytes by exact artifact ID"),
    /recovery_source == 'compensation-artifacts'/,
  );
  assert.match(
    step("Preserve exact recovery bytes for future bridge compensation"),
    /recovery_source == 'compensation-artifacts'/,
  );
  for (const label of [
    "Download the immutable bootstrap bridge evidence",
    "Download the immutable bootstrap baseline bytes",
    "Materialize the exact one-time bootstrap baseline",
  ])
    assert.match(step(label), /bootstrap-rerun-loss/);
  assert.match(
    step("Verify exact mode-bound recovery topology before upload"),
    /bootstrap-rerun-loss[\s\S]*pinned-bootstrap-absent/,
  );
  assert.doesNotMatch(workflow.slice(fallback, mutation), /npm run build|seal-production-dist|vite build/);
});

test("deploy compensation resolves and compares the original CI package without rebuild or reseal", () => {
  const resolve = position("Resolve the original CI package attested inside deploy recovery");
  const download = position("Download the exact original CI package after deploy compensation");
  const materialize = position("Materialize the exact original CI package after deploy compensation");
  const bind = position("Bind the original CI bytes to the deploy recovery snapshot");
  assert.ok(resolve < download && download < materialize && materialize < bind);
  const region = workflow.slice(
    resolve,
    bind + step("Bind the original CI bytes to the deploy recovery snapshot").length,
  );
  assert.match(region, /resolve-ci-staging-frontend-artifact\.mjs/);
  assert.match(region, /verify-staging-frontend-package\.mjs/);
  assert.match(region, /RECOVERED_ID[\s\S]*RESOLVED_ID/);
  assert.match(region, /RECOVERED_DIGEST[\s\S]*RESOLVED_DIGEST/);
  assert.match(region, /RECOVERY_ARCHIVE[\s\S]*CI_ARCHIVE/);
  assert.doesNotMatch(region, /npm run build|seal-production-dist|vite build/);
});

test("bridge compensation preserves the exact recovery archive including bootstrap without provenance", () => {
  const stateDownload = step("Download the immutable compensation state by exact artifact ID");
  const validate = step("Validate compensation state, seal, snapshot, and bytes before materialization");
  const preserve = step("Preserve exact recovery bytes for future bridge compensation");
  assert.match(stateDownload, /bridge-compensation/);
  assert.match(stateDownload, /state_artifact_id/);
  assert.match(validate, /materialize-staging-baseline-compensation\.mjs/);
  assert.match(validate, /--state-dir/);
  assert.match(validate, /staging-baseline-bootstrap\.json/);
  assert.match(preserve, /recovery_source == 'compensation-artifacts'/);
  assert.match(preserve, /cp "\$ARCHIVE_PATH"/);
  assert.match(preserve, /if \[ -n "\$PROVENANCE_PATH" \]/);
  assert.doesNotMatch(`${validate}\n${preserve}`, /npm run build|seal-production-dist|vite build/);
});

test("bridge recovery is materialized only in a new dedicated exact artifact root", () => {
  const initialize = step("Initialize dedicated exact bridge recovery payload root");
  assert.match(initialize, /root="\$GITHUB_WORKSPACE\/staging-bridge-recovery-payload"/);
  assert.match(initialize, /\[ -e "\$root" \] \|\| \[ -L "\$root" \]/);
  assert.match(initialize, /install -d -m 0700 -- "\$root"/);
  assert.match(initialize, /install -d -m 0700 -- "\$root\/outputs"/);
  assert.doesNotMatch(initialize, /root\/dist|rm -rf/);
  assert.match(initialize, /git -C \.\.\/baseline status --porcelain=v1/);

  for (const label of [
    "Validate compensation state, seal, snapshot, and bytes before materialization",
    "Materialize the exact original CI package after deploy compensation",
    "Preserve exact recovery bytes for future bridge compensation",
    "Materialize the exact one-time bootstrap baseline",
    "Materialize and verify the exact bridge-v5 baseline bytes",
  ]) {
    assert.ok(position("Initialize dedicated exact bridge recovery payload root") < position(label));
    assert.match(step(label), /staging-bridge-recovery-payload/);
  }
  assert.match(
    step("Validate compensation state, seal, snapshot, and bytes before materialization"),
    /output=\.\.\/staging-bridge-recovery-payload\/dist/,
  );
  for (const label of [
    "Materialize the exact original CI package after deploy compensation",
    "Materialize and verify the exact bridge-v5 baseline bytes",
  ]) {
    const materializer = step(label);
    assert.match(materializer, /--output \.\.\/staging-bridge-recovery-payload\/dist/);
    for (const file of [
      "staging-frontend-dist.tar",
      "staging-baseline-dist-seal.json",
      "staging-frontend-dist-seal.json",
      "staging-frontend-provenance.json",
    ])
      assert.ok(materializer.includes(`staging-bridge-recovery-payload/outputs/${file}`));
  }
  const bootstrap = step("Materialize the exact one-time bootstrap baseline");
  assert.match(bootstrap, /--output-dist \.\.\/staging-bridge-recovery-payload\/dist/);
  for (const file of [
    "staging-candidate-dist.tar",
    "staging-baseline-dist-seal.json",
    "staging-candidate-dist-seal.json",
  ])
    assert.ok(bootstrap.includes(`staging-bridge-recovery-payload/outputs/${file}`));
  assert.doesNotMatch(bootstrap, /staging-frontend-(?:dist|provenance)/);
  assert.doesNotMatch(workflow, /\.\.\/baseline\/(?:dist|outputs)/);

  const upload = step("Upload mandatory exact bridge recovery bytes before state or mutation");
  assert.match(
    upload,
    /path: \|\r?\n\s+\$\{\{ github\.workspace \}\}\/staging-bridge-recovery-payload\/dist\r?\n\s+\$\{\{ github\.workspace \}\}\/staging-bridge-recovery-payload\/outputs\r?\n/,
  );
  assert.doesNotMatch(upload, /baseline\/|[?*]/);
  assert.match(upload, /include-hidden-files: true/);
  assert.match(
    step("Bind durable staging bridge recovery state to immutable baseline bytes"),
    /\.\.\/staging-bridge-recovery-payload\/outputs\/staging-baseline-dist-seal\.json/,
  );
  assert.match(
    step("Verify the exact recovery baseline before arming mutation"),
    /git -C \.\.\/baseline status --porcelain=v1/,
  );
});

test("mode-bound recovery topology is proven before upload and after immutable download", () => {
  const initialize = position("Initialize dedicated exact bridge recovery payload root");
  const materialize = position("Materialize the exact one-time bootstrap baseline");
  const localTopology = position("Verify exact mode-bound recovery topology before upload");
  const upload = position("Upload mandatory exact bridge recovery bytes before state or mutation");
  const stateDownload = position("Download just-uploaded bridge recovery state by immutable artifact ID");
  const recoveryDownload = position(
    "Download just-uploaded exact bridge recovery bytes by immutable artifact ID",
  );
  const remoteTopology = position("Reverify remote bridge state and exact recovery bytes before mutation");
  const mutation = position("Persist redundant HMAC bridge state only after remote recovery proof");
  assert.ok(
    initialize < materialize &&
      materialize < localTopology &&
      localTopology < upload &&
      upload < stateDownload &&
      stateDownload < recoveryDownload &&
      recoveryDownload < remoteTopology &&
      remoteTopology < mutation,
  );
  const verifier = /verify-staging-bridge-recovery-artifact\.mjs/g;
  assert.equal((workflow.match(verifier) ?? []).length, 2);
  assert.match(
    step("Verify exact mode-bound recovery topology before upload"),
    /--root \.\.\/staging-bridge-recovery-payload[\s\S]*--baseline-mode/,
  );
  assert.match(
    step("Reverify remote bridge state and exact recovery bytes before mutation"),
    /--root \.\.\/staging-bridge-recovery-payload[\s\S]*--peer-root "\$RUNNER_TEMP\/g12-staging-bridge-recovery-pre-mutation"[\s\S]*--baseline-mode/,
  );
  assert.doesNotMatch(
    step("Reverify remote bridge state and exact recovery bytes before mutation"),
    /readFileSync\([^\n]*staging-frontend-provenance\.json/,
  );
});

test("legacy bootstrap compensation is double-attested and never enters the modern materializer", () => {
  const bootstrapRemote = position("Verify the one-time baseline bootstrap against live GitHub metadata");
  const compensationRemote = position("Resolve the exact failed run and immutable compensation artifacts");
  const stateDownload = position("Download the immutable compensation state by exact artifact ID");
  const recoveryDownload = position(
    "Download the immutable compensation recovery bytes by exact artifact ID",
  );
  const legacyVerify = position(
    "Verify the pinned legacy bootstrap compensation without relaxing modern recovery",
  );
  const bootstrapBridgeDownload = position("Download the immutable bootstrap bridge evidence");
  const bootstrapSourceDownload = position("Download the immutable bootstrap baseline bytes");
  const bootstrapMaterialize = position("Materialize the exact one-time bootstrap baseline");
  const mutation = position("Persist redundant HMAC bridge state only after remote recovery proof");
  assert.ok(
    bootstrapRemote < compensationRemote &&
      compensationRemote < stateDownload &&
      stateDownload < recoveryDownload &&
      recoveryDownload < legacyVerify &&
      legacyVerify < bootstrapBridgeDownload &&
      bootstrapBridgeDownload < bootstrapSourceDownload &&
      bootstrapSourceDownload < bootstrapMaterialize &&
      bootstrapMaterialize < mutation,
  );

  const remote = step("Resolve the exact failed run and immutable compensation artifacts");
  assert.match(remote, /legacy-bootstrap-compensation/);
  assert.match(remote, /legacy-bootstrap-compensation' && 'deploy-compensation'/);
  for (const label of [
    "Download the immutable compensation state by exact artifact ID",
    "Download the immutable compensation recovery bytes by exact artifact ID",
  ]) {
    const value = step(label);
    assert.match(value, /legacy-bootstrap-compensation/);
    assert.match(value, /artifact-ids:/);
    assert.match(value, /digest-mismatch: error/);
  }
  const modern = step("Validate compensation state, seal, snapshot, and bytes before materialization");
  assert.doesNotMatch(modern, /legacy-bootstrap-compensation/);
  assert.match(modern, /materialize-staging-baseline-compensation\.mjs/);

  const legacy = step("Verify the pinned legacy bootstrap compensation without relaxing modern recovery");
  assert.match(legacy, /verify-staging-legacy-bootstrap-compensation\.mjs/);
  assert.match(legacy, /--state-artifact-id[\s\S]*--state-artifact-digest[\s\S]*--state-artifact-name/);
  assert.match(
    legacy,
    /--recovery-artifact-id[\s\S]*--recovery-artifact-digest[\s\S]*--recovery-artifact-name/,
  );
  for (const label of [
    "Verify the one-time baseline bootstrap against live GitHub metadata",
    "Download the immutable bootstrap bridge evidence",
    "Download the immutable bootstrap baseline bytes",
    "Materialize the exact one-time bootstrap baseline",
  ])
    assert.match(step(label), /legacy-bootstrap-compensation/);

  const region = workflow.slice(
    legacyVerify,
    bootstrapMaterialize + step("Materialize the exact one-time bootstrap baseline").length,
  );
  assert.doesNotMatch(region, /npm run build|seal-production-dist|vite build/);
});
