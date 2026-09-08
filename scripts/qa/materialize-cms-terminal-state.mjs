import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_PROJECT_REF = "chfuhctnhqgyjowkvllv";
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_TAG_PATTERN = /^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/;
const OUTPUT_KEYS = Object.freeze([
  "actorId",
  "environment",
  "expectedSha",
  "itemIds",
  "projectRef",
  "runTag",
  "schemaVersion",
  "status",
  "terminalArchivedTombstone",
]);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function assertWorkspaceFile(file, { mustExist }) {
  const workspace = realpathSync(process.cwd());
  const resolved = path.resolve(file);
  const relative = path.relative(workspace, resolved);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    relative.startsWith(`.git${path.sep}`)
  ) {
    throw new Error("QA_CMS_TERMINAL_STATE_PATH_REFUSED");
  }
  if (mustExist) {
    const stat = lstatSync(resolved);
    const realRelative = path.relative(workspace, realpathSync(resolved));
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 2 ||
      stat.size > 128 * 1024 ||
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    ) {
      throw new Error("QA_CMS_TERMINAL_STATE_INPUT_REFUSED");
    }
  } else {
    mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
    const parentRelative = path.relative(workspace, realpathSync(path.dirname(resolved)));
    if (parentRelative === ".." || parentRelative.startsWith(`..${path.sep}`)) {
      throw new Error("QA_CMS_TERMINAL_STATE_PATH_REFUSED");
    }
  }
  return resolved;
}

export function materializeCmsTerminalState(value, candidateSha) {
  const itemIds = value?.itemIds;
  const tombstone = value?.terminalArchivedTombstone;
  if (
    !SHA_PATTERN.test(candidateSha) ||
    value?.schemaVersion !== 1 ||
    value?.status !== "cleaned" ||
    value?.environment !== "production" ||
    value?.projectRef !== PRODUCTION_PROJECT_REF ||
    value?.expectedSha !== candidateSha ||
    !RUN_TAG_PATTERN.test(value?.runTag ?? "") ||
    !value.runTag.endsWith(`-${candidateSha.slice(0, 8)}`) ||
    !UUID_PATTERN.test(value?.actorId ?? "") ||
    !Array.isArray(itemIds) ||
    itemIds.length < 1 ||
    itemIds.length > 64 ||
    new Set(itemIds).size !== itemIds.length ||
    itemIds.some((itemId) => !UUID_PATTERN.test(itemId)) ||
    !tombstone ||
    typeof tombstone !== "object" ||
    Array.isArray(tombstone) ||
    JSON.stringify(Object.keys(tombstone).sort()) !== JSON.stringify(["itemId"]) ||
    !UUID_PATTERN.test(tombstone.itemId ?? "") ||
    !itemIds.includes(tombstone.itemId)
  ) {
    throw new Error("QA_CMS_TERMINAL_STATE_BINDING_REFUSED");
  }
  const result = {
    schemaVersion: 1,
    status: "cleaned",
    environment: "production",
    projectRef: PRODUCTION_PROJECT_REF,
    expectedSha: candidateSha,
    runTag: value.runTag,
    actorId: value.actorId,
    itemIds: [...itemIds],
    terminalArchivedTombstone: { itemId: tombstone.itemId },
  };
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(OUTPUT_KEYS)) {
    throw new Error("QA_CMS_TERMINAL_STATE_ALLOWLIST_REFUSED");
  }
  return result;
}

export function main() {
  const input = assertWorkspaceFile(argument("input"), { mustExist: true });
  const output = assertWorkspaceFile(argument("output"), { mustExist: false });
  let source;
  try {
    source = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    throw new Error("QA_CMS_TERMINAL_STATE_INPUT_REFUSED", { cause: error });
  }
  const terminalState = materializeCmsTerminalState(source, argument("candidate"));
  writeFileSync(output, `${JSON.stringify(terminalState, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      event: "qa.cms.production_terminal_state.materialized",
      candidateSha: terminalState.expectedSha,
      itemCount: terminalState.itemIds.length,
      identifiersOrPathsLogged: false,
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { OUTPUT_KEYS, PRODUCTION_PROJECT_REF };
