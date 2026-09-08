import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  expectedProductionControlPaths,
  validateProductionControlDelta,
} from "./production-control-delta-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(...arguments_) {
  return execFileSync("git", arguments_, { encoding: "utf8" }).trim();
}

const candidateSha = argument("candidate");
const approvalFile = argument("approval");
if (!candidateSha || !approvalFile) throw new Error("G12_CONTROL_DELTA_INPUT_REQUIRED");

const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(approvalFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`))
  throw new Error("G12_CONTROL_DELTA_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
const expected = expectedProductionControlPaths(record, approvalFile.replaceAll("\\", "/"));
if (!expected.valid) throw new Error(`G12_CONTROL_DELTA_PATHS_REFUSED:${expected.violations.join(",")}`);

const controlSha = git("rev-parse", "HEAD");
const commitLine = git("rev-list", "--parents", "-n", "1", controlSha).split(/\s+/);
const parents = commitLine.slice(1);
const commitsAhead = Number(git("rev-list", "--count", `${candidateSha}..${controlSha}`));
const diffParts = execFileSync(
  "git",
  ["diff", "--name-status", "--no-renames", "-z", candidateSha, controlSha],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
if (diffParts.length % 2 !== 0) throw new Error("G12_CONTROL_DELTA_DIFF_INVALID");
const changes = [];
for (let index = 0; index < diffParts.length; index += 2) {
  const status = diffParts[index];
  const path = diffParts[index + 1];
  const modeLine = git("ls-tree", controlSha, "--", path);
  changes.push({ status, path, mode: modeLine.split(/\s+/)[0] ?? "" });
}

const result = validateProductionControlDelta({
  candidateSha,
  controlSha,
  parents,
  commitsAhead,
  changes,
  expectedPaths: expected.paths,
});
if (!result.valid) throw new Error(`G12_CONTROL_DELTA_REFUSED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.production-control-delta.verified",
    candidateSha,
    controlSha,
    evidenceFiles: expected.paths.length - 1,
    approvalFiles: 1,
  }),
);
