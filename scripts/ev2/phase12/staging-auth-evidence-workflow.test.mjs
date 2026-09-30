import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const candidateSha = "a".repeat(40);

function step(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - ", start + marker.length);
  return workflow.slice(start, next < 0 ? undefined : next);
}

const configure = step("Configure and verify the exact staging Auth redirect boundary");
const materialize = step("Materialize fail-closed evidence for the selected release profile");
const materializerCode = materialize
  .match(/node <<'NODE'\n([\s\S]+?)\n {10}NODE/)[1]
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");

function fixture(t, profile) {
  const root = mkdtempSync(join(tmpdir(), "gaiatec-auth-evidence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace with spaces");
  const runnerTemp = join(root, "runner temp");
  mkdirSync(join(workspace, "candidate", "outputs"), { recursive: true });
  mkdirSync(runnerTemp);
  const env = {
    ...process.env,
    GITHUB_WORKSPACE: workspace,
    RUNNER_TEMP: runnerTemp,
    CANDIDATE_SHA: candidateSha,
    RELEASE_PROFILE: profile,
  };
  function write(relative, content = '{"status":"passed"}\n') {
    const path = join(workspace, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  if (["edge-only", "full-release"].includes(profile)) {
    write("candidate/outputs/g12-staging-function-deployment.json");
    write("g12-staging-functions.json");
  }
  if (["database-auth", "full-release"].includes(profile)) {
    write("g12-staging-migrations-canary.json");
  }
  return {
    workspace,
    env,
    write,
    produceAuth() {
      // Resolve the actual tee destination, not a duplicate expected-path constant. The producer
      // runs in a sealed database payload outside the checkout; the consumer runs in the workspace.
      const destination = configure.match(/\| tee "(\$(?:GITHUB_WORKSPACE|RUNNER_TEMP)\/[^"\n]+)"/);
      assert.ok(destination, "Auth evidence must use a quoted, absolute runner path");
      const path = destination[1].replace(/\$(GITHUB_WORKSPACE|RUNNER_TEMP)/g, (_, key) => env[key]);
      writeFileSync(path, '{"event":"g12.staging.auth_config.verified","publicSignupDisabled":true}\n');
    },
    run() {
      return spawnSync(process.execPath, ["-e", materializerCode], {
        cwd: workspace,
        env,
        encoding: "utf8",
        windowsHide: true,
      });
    },
  };
}

test("staging Auth producer reaches the exact required evidence consumer for both database profiles", (t) => {
  for (const profile of ["database-auth", "full-release"]) {
    const input = fixture(t, profile);
    input.produceAuth();
    const result = input.run();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(
      readFileSync(join(input.workspace, "candidate/outputs/staging-release-profile-evidence.json"), "utf8"),
    );
    assert.equal(report.candidateSha, candidateSha);
    assert.equal(report.releaseProfile, profile);
    assert.deepEqual(report.gates.databaseAuth.evidenceFiles, [
      "g12-staging-auth.json",
      "g12-staging-migrations-canary.json",
    ]);
    assert.equal(report.gates.databaseAuth.status, "passed");
  }
});

test("missing, empty or directory Auth evidence cannot approve a required profile", (t) => {
  for (const defect of ["missing", "empty", "directory"]) {
    const input = fixture(t, "full-release");
    if (defect === "empty") input.write("g12-staging-auth.json", "");
    if (defect === "directory") mkdirSync(join(input.workspace, "g12-staging-auth.json"));
    const result = input.run();
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /G12_STAGING_REQUIRED_PROFILE_EVIDENCE_MISSING:databaseAuth:g12-staging-auth.json/,
    );
  }
});

test("non-database profiles reject stale Auth proof instead of reporting an unexecuted gate", (t) => {
  for (const profile of ["frontend-only", "edge-only"]) {
    const input = fixture(t, profile);
    assert.equal(input.run().status, 0);
    input.write("g12-staging-auth.json");
    const result = input.run();
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /G12_STAGING_STALE_PROFILE_EVIDENCE_REFUSED:databaseAuth:g12-staging-auth.json/,
    );
  }
});

test("Auth handoff preserves the sealed mutation source, failure propagation and every downstream reader", () => {
  assert.match(
    configure,
    /working-directory: \$\{\{ steps\.database_payload\.outputs\.project_directory \}\}/,
  );
  assert.match(configure, /shell: bash/);
  assert.match(configure, /release_profile == 'database-auth'[\s\S]*release_profile == 'full-release'/);
  assert.match(configure, /node scripts\/ev2\/phase12\/configure-staging-auth\.mjs \| tee/);
  assert.doesNotMatch(configure, /continue-on-error|\|\| true|--verify-only/);
  assert.match(
    step("Require every successful staging evidence file before upload"),
    /g12-staging-auth\.json/,
  );
  assert.match(workflow, /name: staging-preliminary-[\s\S]*path: \|[\s\S]*\n {12}g12-staging-auth\.json\n/);
  assert.match(
    step("Revalidate backend evidence content read-only"),
    /staging-evidence\/g12-staging-auth\.json/,
  );
});
