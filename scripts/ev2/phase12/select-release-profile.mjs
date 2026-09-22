import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  RELEASE_PLAN_SCHEMA_VERSION,
  RELEASE_PROFILE_CONTROL_PATHS,
  buildBootstrapReleasePlan,
  createBootstrapReleaseCheckpointPolicyBytes,
  createBootstrapReleaseGateMatrixBytes,
} from "./release-profile-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = /^0{40}$/;
const ALLOWED_ARGUMENTS = new Set([
  "matrix",
  "base",
  "head",
  "output",
  "repository",
  "control-selector-output",
  "control-library-output",
  "control-matrix-output",
  "control-checkpoint-policy-output",
  "bootstrap-mode",
]);

function parseArguments(argv) {
  if (argv.length % 2 !== 0) throw new Error("invalid arguments");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    const key = name?.startsWith("--") ? name.slice(2) : "";
    if (!ALLOWED_ARGUMENTS.has(key) || value === undefined || Object.hasOwn(options, key)) {
      throw new Error("invalid arguments");
    }
    options[key] = value;
  }
  for (const required of ["matrix", "base", "head", "output"]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  return options;
}

function runGit(repositoryRoot, arguments_, encoding) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readGitBlob(repositoryRoot, revision, repositoryPath) {
  try {
    const object = `${revision}:${repositoryPath}`;
    if (runGit(repositoryRoot, ["cat-file", "-t", object], "utf8").trim() !== "blob") return null;
    return runGit(repositoryRoot, ["show", object]);
  } catch {
    return null;
  }
}

async function importTrustedLibrary(libraryBytes) {
  const directory = await mkdtemp(path.join(tmpdir(), "g12-release-profile-control-"));
  try {
    const libraryPath = path.join(directory, "release-profile-lib.mjs");
    await writeFile(libraryPath, libraryBytes, { flag: "wx", mode: 0o600 });
    return await import(`${pathToFileURL(libraryPath).href}?control=${Date.now()}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeExclusive(file, bytes) {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
}

function defaultControlOutput(planOutput, filename) {
  return path.join(path.dirname(planOutput), filename);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(options.repository || process.cwd());
  const baseSha = options.base.toLowerCase();
  const candidateSha = options.head.toLowerCase();
  if (!FULL_SHA.test(baseSha) || !FULL_SHA.test(candidateSha)) {
    throw new Error("--base and --head must be lowercase full Git SHAs");
  }

  const canonicalMatrixPath = path.resolve(repositoryRoot, RELEASE_PROFILE_CONTROL_PATHS.matrix);
  const suppliedMatrixPath = path.resolve(repositoryRoot, options.matrix);
  if (suppliedMatrixPath !== canonicalMatrixPath) {
    throw new Error("--matrix must identify the canonical repository release gate matrix");
  }

  const planOutput = path.resolve(options.output);
  const selectorOutput = path.resolve(
    options["control-selector-output"] || defaultControlOutput(planOutput, "release-control-selector.mjs"),
  );
  const libraryOutput = path.resolve(
    options["control-library-output"] || defaultControlOutput(planOutput, "release-control-library.mjs"),
  );
  const matrixOutput = path.resolve(
    options["control-matrix-output"] || defaultControlOutput(planOutput, "release-gate-matrix.json"),
  );
  const checkpointPolicyOutput = path.resolve(
    options["control-checkpoint-policy-output"] ||
      defaultControlOutput(planOutput, "release-checkpoint-policy.json"),
  );
  if (new Set([planOutput, selectorOutput, libraryOutput, matrixOutput, checkpointPolicyOutput]).size !== 5) {
    throw new Error("release plan and control outputs must be distinct");
  }

  runGit(repositoryRoot, ["rev-parse", "--is-inside-work-tree"], "utf8");
  runGit(repositoryRoot, ["cat-file", "-e", `${candidateSha}^{commit}`]);
  if (!ZERO_SHA.test(baseSha)) runGit(repositoryRoot, ["cat-file", "-e", `${baseSha}^{commit}`]);
  const candidateMatrixBytes = readGitBlob(
    repositoryRoot,
    candidateSha,
    RELEASE_PROFILE_CONTROL_PATHS.matrix,
  );
  const candidateCheckpointPolicyBytes = readGitBlob(
    repositoryRoot,
    candidateSha,
    RELEASE_PROFILE_CONTROL_PATHS.checkpointPolicy,
  );
  const baseSelectorBytes = readGitBlob(repositoryRoot, baseSha, RELEASE_PROFILE_CONTROL_PATHS.selector);
  const baseLibraryBytes = readGitBlob(repositoryRoot, baseSha, RELEASE_PROFILE_CONTROL_PATHS.library);
  const baseMatrixBytes = readGitBlob(repositoryRoot, baseSha, RELEASE_PROFILE_CONTROL_PATHS.matrix);
  const baseCheckpointPolicyBytes = readGitBlob(
    repositoryRoot,
    baseSha,
    RELEASE_PROFILE_CONTROL_PATHS.checkpointPolicy,
  );

  let plan;
  let controlSelectorBytes;
  let controlLibraryBytes;
  let controlMatrixBytes;
  let controlCheckpointPolicyBytes;
  const baseControls = [baseSelectorBytes, baseLibraryBytes, baseMatrixBytes, baseCheckpointPolicyBytes];
  const baseControlCount = baseControls.filter(Boolean).length;
  if (baseControlCount > 0 && baseControlCount < baseControls.length) {
    throw new Error("base release control bundle is incomplete");
  }
  if (baseControlCount === baseControls.length) {
    const trustedLibrary = await importTrustedLibrary(baseLibraryBytes);
    if (
      trustedLibrary.RELEASE_PLAN_SCHEMA_VERSION !== RELEASE_PLAN_SCHEMA_VERSION ||
      typeof trustedLibrary.buildReleasePlanFromTrustedControls !== "function"
    ) {
      throw new Error("base release controls are incompatible");
    }
    plan = trustedLibrary.buildReleasePlanFromTrustedControls({
      repositoryRoot,
      baseSha,
      candidateSha,
      controlSelectorBytes: baseSelectorBytes,
      controlLibraryBytes: baseLibraryBytes,
      controlMatrixBytes: baseMatrixBytes,
      controlCheckpointPolicyBytes: baseCheckpointPolicyBytes,
      candidateMatrixBytes,
      candidateCheckpointPolicyBytes,
    });
    controlSelectorBytes = baseSelectorBytes;
    controlLibraryBytes = baseLibraryBytes;
    controlMatrixBytes = baseMatrixBytes;
    controlCheckpointPolicyBytes = baseCheckpointPolicyBytes;
  } else {
    if (options["bootstrap-mode"] !== "full-release") {
      throw new Error("base release controls are absent; explicit --bootstrap-mode full-release is required");
    }
    const currentSelectorBytes = await readFile(fileURLToPath(import.meta.url));
    const currentLibraryBytes = await readFile(
      fileURLToPath(new URL("./release-profile-lib.mjs", import.meta.url)),
    );
    controlMatrixBytes = createBootstrapReleaseGateMatrixBytes();
    controlCheckpointPolicyBytes = createBootstrapReleaseCheckpointPolicyBytes();
    plan = buildBootstrapReleasePlan({
      repositoryRoot,
      baseSha,
      candidateSha,
      controlSelectorBytes: currentSelectorBytes,
      controlLibraryBytes: currentLibraryBytes,
      candidateMatrixBytes,
      candidateCheckpointPolicyBytes,
      upstreamViolations: ["control_bundle_absent"],
    });
    controlSelectorBytes = currentSelectorBytes;
    controlLibraryBytes = currentLibraryBytes;
  }

  const serialized = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const planSha256 = createHash("sha256").update(serialized).digest("hex");
  await writeExclusive(selectorOutput, controlSelectorBytes);
  await writeExclusive(libraryOutput, controlLibraryBytes);
  await writeExclusive(matrixOutput, controlMatrixBytes);
  await writeExclusive(checkpointPolicyOutput, controlCheckpointPolicyBytes);
  await writeExclusive(planOutput, serialized);

  if (process.env.GITHUB_OUTPUT) {
    const hasJob = (name) => String(plan.jobs.includes(name));
    const lines = [
      `profile=${plan.selectedProfile}`,
      `fail_closed=${String(plan.failClosed)}`,
      `control_sha=${plan.controlSha}`,
      `trust_mode=${plan.trustMode}`,
      `control_implementation_sha256=${plan.controlImplementationSha256}`,
      `control_matrix_sha256=${plan.controlMatrixSha256}`,
      `candidate_matrix_sha256=${plan.candidateMatrixSha256 ?? ""}`,
      `control_checkpoint_policy_sha256=${plan.controlCheckpointPolicySha256}`,
      `candidate_checkpoint_policy_sha256=${plan.candidateCheckpointPolicySha256 ?? ""}`,
      `checkpoint_policy_sha256=${plan.checkpointPolicySha256}`,
      `matrix_sha256=${plan.matrixSha256}`,
      `plan_sha256=${planSha256}`,
      `control_selector_path=${selectorOutput}`,
      `control_library_path=${libraryOutput}`,
      `control_matrix_path=${matrixOutput}`,
      `control_checkpoint_policy_path=${checkpointPolicyOutput}`,
      `run_quality=${hasJob("quality")}`,
      `run_package_staging=${hasJob("package-staging")}`,
      `run_edge=${hasJob("hotfix-bundle-smoke")}`,
      `run_database_auth=${hasJob("database")}`,
      `run_browser=${hasJob("browser")}`,
    ];
    await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({ event: "release.profile.selected", ...plan, planSha256 })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
