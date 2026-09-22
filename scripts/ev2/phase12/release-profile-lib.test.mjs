import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  hashReleaseProfileImplementation,
  selectReleaseProfile,
  validateReleaseGateMatrix,
} from "./release-profile-lib.mjs";

const matrix = JSON.parse(
  await readFile(
    new URL("../../../.github/release-controls/release-gate-matrix.json", import.meta.url),
    "utf8",
  ),
);
const selectorCli = await readFile(new URL("./select-release-profile.mjs", import.meta.url), "utf8");
const librarySource = await readFile(new URL("./release-profile-lib.mjs", import.meta.url), "utf8");
const selectorPath = fileURLToPath(new URL("./select-release-profile.mjs", import.meta.url));
const libraryPath = fileURLToPath(new URL("./release-profile-lib.mjs", import.meta.url));
const matrixPath = fileURLToPath(
  new URL("../../../.github/release-controls/release-gate-matrix.json", import.meta.url),
);
const CONTROL_PATHS = {
  selector: "scripts/ev2/phase12/select-release-profile.mjs",
  library: "scripts/ev2/phase12/release-profile-lib.mjs",
  matrix: ".github/release-controls/release-gate-matrix.json",
  checkpointPolicy: ".github/release-controls/release-checkpoint-policy.json",
};

function git(directory, arguments_, options = {}) {
  return execFileSync("git", arguments_, {
    cwd: directory,
    encoding: options.encoding,
    stdio: options.stdio ?? "ignore",
  });
}

async function writeRepositoryFile(directory, repositoryPath, bytes) {
  const file = join(directory, repositoryPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function installTrustedControls(directory) {
  await Promise.all([
    writeRepositoryFile(directory, CONTROL_PATHS.selector, await readFile(selectorPath)),
    writeRepositoryFile(directory, CONTROL_PATHS.library, await readFile(libraryPath)),
    writeRepositoryFile(directory, CONTROL_PATHS.matrix, await readFile(matrixPath)),
    writeRepositoryFile(
      directory,
      CONTROL_PATHS.checkpointPolicy,
      await readFile(
        new URL("../../../.github/release-controls/release-checkpoint-policy.json", import.meta.url),
      ),
    ),
  ]);
}

function initializeRepository(directory) {
  git(directory, ["init", "--initial-branch=main"]);
  git(directory, ["config", "user.name", "release-profile-test"]);
  git(directory, ["config", "user.email", "release-profile-test@example.invalid"]);
}

function commitAll(directory, message) {
  git(directory, ["add", "--all"]);
  git(directory, ["commit", "-m", message]);
  return git(directory, ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runSelector(directory, base, head, output, { bootstrap = false, executable = selectorPath } = {}) {
  const arguments_ = [
    executable,
    "--repository",
    directory,
    "--matrix",
    join(directory, CONTROL_PATHS.matrix),
    "--base",
    base,
    "--head",
    head,
    "--output",
    output,
  ];
  if (bootstrap) arguments_.push("--bootstrap-mode", "full-release");
  execFileSync(process.execPath, arguments_, { cwd: directory, stdio: "ignore" });
}

test("versioned matrix defines the four profiles and mandatory safety gates", () => {
  assert.doesNotThrow(() => validateReleaseGateMatrix(matrix));
  assert.deepEqual(Object.keys(matrix.profiles).sort(), [
    "database-auth",
    "edge-only",
    "frontend-only",
    "full-release",
  ]);
  for (const profile of Object.values(matrix.profiles)) {
    for (const gate of [
      "artifact-seal",
      "immutable-provenance",
      "recovery-ready",
      "rollback-compatibility",
      "security-regression",
      "real-chrome-authenticated",
      "audit-terminal",
      "cleanup-zero",
    ]) {
      assert.ok(profile.gates.includes(gate), `${gate} missing from ${profile}`);
    }
  }
});

test("every profile has an exact immutable jobs and gates contract", () => {
  for (const [profileName, profile] of Object.entries(matrix.profiles)) {
    for (const contractKey of ["jobs", "gates"]) {
      for (const member of profile[contractKey]) {
        const missingMember = structuredClone(matrix);
        missingMember.profiles[profileName][contractKey] = profile[contractKey].filter(
          (candidate) => candidate !== member,
        );
        assert.throws(
          () => validateReleaseGateMatrix(missingMember),
          /immutable safety contract/u,
          `${profileName}.${contractKey} accepted removal of ${member}`,
        );
      }

      const additionalMember = structuredClone(matrix);
      additionalMember.profiles[profileName][contractKey].push(
        contractKey === "jobs" ? "unexpected-safe-job" : "unexpected-safe-gate",
      );
      assert.throws(
        () => validateReleaseGateMatrix(additionalMember),
        /immutable safety contract/u,
        `${profileName}.${contractKey} accepted an unapproved addition`,
      );
    }
  }
});

test("full-release remains a strict safety superset of every narrow profile", () => {
  const fullRelease = matrix.profiles["full-release"];
  for (const profileName of ["frontend-only", "edge-only", "database-auth"]) {
    const profile = matrix.profiles[profileName];
    for (const contractKey of ["jobs", "gates"]) {
      const missingFromFullRelease = profile[contractKey].filter(
        (member) => !fullRelease[contractKey].includes(member),
      );
      assert.deepEqual(
        missingFromFullRelease,
        [],
        `full-release.${contractKey} does not cover ${profileName}`,
      );
    }
  }
  assert.ok(
    fullRelease.gates.some(
      (gate) =>
        !matrix.profiles["frontend-only"].gates.includes(gate) &&
        !matrix.profiles["edge-only"].gates.includes(gate) &&
        !matrix.profiles["database-auth"].gates.includes(gate),
    ),
    "full-release must retain at least one exclusive orchestration gate",
  );
});

for (const [profile, changedFiles] of [
  ["frontend-only", ["src/styles/theme.css", "public/favicon.svg"]],
  ["edge-only", ["supabase/functions/cms-public/index.ts"]],
  ["database-auth", ["supabase/migrations/20260922000000_example.sql", "supabase/tests/rls.sql"]],
]) {
  test(`selects ${profile} only when every path belongs unambiguously to that domain`, () => {
    const result = selectReleaseProfile({ matrix, changedFiles });
    assert.equal(result.selectedProfile, profile);
    assert.equal(result.failClosed, false);
    assert.deepEqual(result.violations, []);
  });
}

test("mixed domains select full-release", () => {
  const result = selectReleaseProfile({
    matrix,
    changedFiles: ["src/styles/theme.css", "supabase/functions/cms-public/index.ts"],
  });
  assert.equal(result.selectedProfile, "full-release");
  assert.equal(result.failClosed, true);
  assert.deepEqual(result.violations, ["mixed_release_domains"]);
});

test("control-plane, unmatched, empty and invalid changes all fail closed", () => {
  const cases = [
    [[".github/workflows/ci.yml"], "control_critical_change"],
    [["cloudflare/_worker.js"], "control_critical_change"],
    [["scripts/qa/cms-browser-fixture.mjs"], "control_critical_change"],
    [["tests/e2e/cms-security-boundaries.spec.ts"], "control_critical_change"],
    [["src/admin/auth/AdminAuthContext.tsx"], "unmatched_change"],
    [["src/lib/supabase.ts"], "unmatched_change"],
    [["unexpected-area/file.txt"], "unmatched_change"],
    [[], "changed_paths_empty"],
    [["../escape"], "changed_path_invalid"],
  ];
  for (const [changedFiles, violation] of cases) {
    const result = selectReleaseProfile({ matrix, changedFiles });
    assert.equal(result.selectedProfile, "full-release");
    assert.equal(result.failClosed, true);
    assert.ok(result.violations.includes(violation));
  }
});

test("upstream change-range uncertainty cannot be downgraded by otherwise narrow paths", () => {
  const result = selectReleaseProfile({
    matrix,
    changedFiles: ["src/styles/theme.css"],
    upstreamViolations: ["change_range_untrusted"],
  });
  assert.equal(result.selectedProfile, "full-release");
  assert.deepEqual(result.violations, ["change_range_untrusted"]);
});

test("deleted security-sensitive files remain in mixed change classification", () => {
  assert.match(librarySource, /--no-renames/);
  assert.match(librarySource, /--diff-filter=ACDMRTUXB/);
  assert.match(selectorCli, /buildReleasePlanFromTrustedControls/);
  const result = selectReleaseProfile({
    matrix,
    changedFiles: ["src/styles/theme.css", "supabase/migrations/20260922000000_deleted.sql"],
  });
  assert.equal(result.selectedProfile, "full-release");
  assert.deepEqual(result.violations, ["mixed_release_domains"]);
});

test("a real Git rename cannot hide the critical source path behind a narrow destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-rename-"));
  const source = "supabase/migrations/20260922000000_security.sql";
  const destination = "src/styles/security.css";
  try {
    initializeRepository(directory);
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, source, "select 1;\n"),
    ]);
    const base = commitAll(directory, "critical source with trusted controls");
    await mkdir(dirname(join(directory, destination)), { recursive: true });
    git(directory, ["mv", source, destination]);
    const head = commitAll(directory, "attempt narrow rename");
    const output = join(directory, "evidence", "release-plan.json");
    runSelector(directory, base, head, output);
    const plan = JSON.parse(await readFile(output, "utf8"));
    assert.equal(plan.selectedProfile, "full-release");
    assert.equal(plan.failClosed, true);
    assert.equal(plan.trustMode, "base-controls");
    assert.deepEqual(plan.changedFiles, [destination, source].sort());
    assert.deepEqual(plan.violations, ["mixed_release_domains"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("trusted base controls classify a normal base-to-candidate diff", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-trusted-"));
  try {
    initializeRepository(directory);
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: black; }\n"),
    ]);
    const base = commitAll(directory, "trusted controls");
    await writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: navy; }\n");
    const head = commitAll(directory, "frontend-only candidate");
    const output = join(directory, "evidence", "release-plan.json");
    runSelector(directory, base, head, output);
    const plan = JSON.parse(await readFile(output, "utf8"));
    assert.equal(plan.schemaVersion, 2);
    assert.equal(plan.selectedProfile, "frontend-only");
    assert.equal(plan.failClosed, false);
    assert.equal(plan.controlSha, base);
    assert.equal(plan.trustMode, "base-controls");
    assert.equal(plan.matrixSha256, plan.controlMatrixSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a backend commit not yet deployed cannot be hidden by a later frontend-only commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-cumulative-"));
  try {
    initializeRepository(directory);
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: black; }\n"),
    ]);
    const deployedStagingSha = commitAll(directory, "deployed staging baseline");

    await writeRepositoryFile(
      directory,
      "supabase/functions/cms-public/index.ts",
      'Deno.serve(() => new Response("backend"));\n',
    );
    const backendIntermediateSha = commitAll(directory, "backend not deployed");
    await writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: navy; }\n");
    const candidateSha = commitAll(directory, "frontend follows undeployed backend");

    const eventRangeOutput = join(directory, "event-range", "release-plan.json");
    runSelector(directory, backendIntermediateSha, candidateSha, eventRangeOutput);
    const eventRangePlan = JSON.parse(await readFile(eventRangeOutput, "utf8"));
    assert.equal(eventRangePlan.selectedProfile, "frontend-only");

    const cumulativeOutput = join(directory, "cumulative-range", "release-plan.json");
    runSelector(directory, deployedStagingSha, candidateSha, cumulativeOutput);
    const cumulativePlan = JSON.parse(await readFile(cumulativeOutput, "utf8"));
    assert.equal(cumulativePlan.baseSha, deployedStagingSha);
    assert.equal(cumulativePlan.selectedProfile, "full-release");
    assert.equal(cumulativePlan.failClosed, true);
    assert.deepEqual(cumulativePlan.changedFiles, [
      "src/styles/theme.css",
      "supabase/functions/cms-public/index.ts",
    ]);
    assert.deepEqual(cumulativePlan.violations, ["mixed_release_domains"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a candidate cannot narrow release by replacing selector, library, or matrix", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-adversarial-"));
  try {
    initializeRepository(directory);
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: black; }\n"),
    ]);
    const base = commitAll(directory, "trusted controls");
    const maliciousMatrix = Buffer.from('{"schemaVersion":1,"profiles":{},"lie":true}\n', "utf8");
    await Promise.all([
      writeRepositoryFile(directory, CONTROL_PATHS.selector, 'process.stdout.write("frontend-only\\n");\n'),
      writeRepositoryFile(
        directory,
        CONTROL_PATHS.library,
        'export const selectReleaseProfile = () => ({ selectedProfile: "frontend-only" });\n',
      ),
      writeRepositoryFile(directory, CONTROL_PATHS.matrix, maliciousMatrix),
      writeRepositoryFile(directory, CONTROL_PATHS.checkpointPolicy, '{"schemaVersion":1,"lie":true}\n'),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: red; }\n"),
    ]);
    const head = commitAll(directory, "candidate attempts to replace controls");
    const trustedLauncherDirectory = join(directory, "trusted-launcher");
    const trustedSelectorPath = join(trustedLauncherDirectory, "select-release-profile.mjs");
    await Promise.all([
      writeRepositoryFile(
        trustedLauncherDirectory,
        "select-release-profile.mjs",
        git(directory, ["show", `${base}:${CONTROL_PATHS.selector}`], {
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ),
      writeRepositoryFile(
        trustedLauncherDirectory,
        "release-profile-lib.mjs",
        git(directory, ["show", `${base}:${CONTROL_PATHS.library}`], {
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ),
    ]);
    const evidence = join(directory, "evidence");
    const output = join(evidence, "release-plan.json");
    runSelector(directory, base, head, output, { executable: trustedSelectorPath });
    const [plan, emittedSelector, emittedLibrary, emittedMatrix, emittedPolicy] = await Promise.all([
      readFile(output, "utf8").then(JSON.parse),
      readFile(join(evidence, "release-control-selector.mjs")),
      readFile(join(evidence, "release-control-library.mjs")),
      readFile(join(evidence, "release-gate-matrix.json")),
      readFile(join(evidence, "release-checkpoint-policy.json")),
    ]);
    assert.equal(plan.selectedProfile, "full-release");
    assert.equal(plan.failClosed, true);
    assert.equal(plan.trustMode, "base-controls");
    assert.ok(plan.violations.includes("control_plane_change"));
    assert.equal(
      plan.controlImplementationSha256,
      hashReleaseProfileImplementation(emittedSelector, emittedLibrary),
    );
    assert.deepEqual(
      emittedSelector,
      git(directory, ["show", `${base}:${CONTROL_PATHS.selector}`], {
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.deepEqual(
      emittedLibrary,
      git(directory, ["show", `${base}:${CONTROL_PATHS.library}`], {
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.deepEqual(
      emittedMatrix,
      git(directory, ["show", `${base}:${CONTROL_PATHS.matrix}`], {
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.deepEqual(
      emittedPolicy,
      git(directory, ["show", `${base}:${CONTROL_PATHS.checkpointPolicy}`], {
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.equal(
      plan.controlCheckpointPolicySha256,
      createHash("sha256").update(emittedPolicy).digest("hex"),
    );
    assert.equal(plan.candidateMatrixSha256, createHash("sha256").update(maliciousMatrix).digest("hex"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing base controls use explicit bootstrap-full and never a narrow candidate profile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-bootstrap-"));
  try {
    initializeRepository(directory);
    await writeRepositoryFile(directory, "README.md", "bootstrap base\n");
    const base = commitAll(directory, "base without release controls");
    await Promise.all([
      writeRepositoryFile(directory, CONTROL_PATHS.selector, "// candidate selector\n"),
      writeRepositoryFile(directory, CONTROL_PATHS.library, "// candidate library\n"),
      writeRepositoryFile(directory, CONTROL_PATHS.matrix, await readFile(matrixPath)),
      writeRepositoryFile(
        directory,
        CONTROL_PATHS.checkpointPolicy,
        await readFile(
          new URL("../../../.github/release-controls/release-checkpoint-policy.json", import.meta.url),
        ),
      ),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: red; }\n"),
    ]);
    const head = commitAll(directory, "candidate introduces controls");
    const output = join(directory, "evidence", "release-plan.json");
    assert.throws(() => runSelector(directory, base, head, output));
    runSelector(directory, base, head, output, { bootstrap: true });
    const plan = JSON.parse(await readFile(output, "utf8"));
    assert.equal(plan.selectedProfile, "full-release");
    assert.equal(plan.failClosed, true);
    assert.equal(plan.controlSha, base);
    assert.equal(plan.trustMode, "bootstrap-full");
    assert.ok(plan.violations.includes("control_bootstrap_required"));
    assert.ok(plan.violations.includes("control_bundle_absent"));
    assert.ok(plan.violations.includes("control_plane_change"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an unproved staging baseline sentinel can only produce bootstrap full-release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-unproved-baseline-"));
  try {
    initializeRepository(directory);
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: navy; }\n"),
    ]);
    const candidate = commitAll(directory, "candidate without a proven staging baseline");
    const output = join(directory, "evidence", "release-plan.json");
    runSelector(directory, "0".repeat(40), candidate, output, { bootstrap: true });
    const plan = JSON.parse(await readFile(output, "utf8"));
    assert.equal(plan.baseSha, "0".repeat(40));
    assert.equal(plan.controlSha, "0".repeat(40));
    assert.equal(plan.trustMode, "bootstrap-full");
    assert.equal(plan.selectedProfile, "full-release");
    assert.equal(plan.failClosed, true);
    assert.ok(plan.violations.includes("control_bootstrap_required"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a partial base control bundle is refused instead of being treated as bootstrap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-partial-base-"));
  try {
    initializeRepository(directory);
    await Promise.all([
      writeRepositoryFile(directory, CONTROL_PATHS.selector, await readFile(selectorPath)),
      writeRepositoryFile(directory, "README.md", "partial controls\n"),
    ]);
    const base = commitAll(directory, "partial control bundle");
    await Promise.all([
      installTrustedControls(directory),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: red; }\n"),
    ]);
    const head = commitAll(directory, "candidate fills missing controls");
    assert.throws(() =>
      runSelector(directory, base, head, join(directory, "evidence", "release-plan.json"), {
        bootstrap: true,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an incompatible complete base bundle is refused instead of falling back to bootstrap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-release-profile-invalid-base-"));
  try {
    initializeRepository(directory);
    await installTrustedControls(directory);
    await writeRepositoryFile(directory, CONTROL_PATHS.matrix, '{"schemaVersion":1}\n');
    const base = commitAll(directory, "complete but invalid control bundle");
    await Promise.all([
      writeRepositoryFile(directory, CONTROL_PATHS.matrix, await readFile(matrixPath)),
      writeRepositoryFile(directory, "src/styles/theme.css", ":root { color: red; }\n"),
    ]);
    const head = commitAll(directory, "candidate repairs invalid matrix");
    assert.throws(() =>
      runSelector(directory, base, head, join(directory, "evidence", "release-plan.json"), {
        bootstrap: true,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid matrices cannot relax the full-release fallback", () => {
  const invalid = structuredClone(matrix);
  invalid.ambiguityPolicy = "frontend-only";
  assert.throws(() => validateReleaseGateMatrix(invalid), /fail closed/u);
});
