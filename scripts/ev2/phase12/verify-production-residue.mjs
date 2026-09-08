import { readFile, writeFile } from "node:fs/promises";

import { managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";
import {
  assertProductionTerminalObservation,
  buildProductionTerminalResidueQuery,
  createProductionTerminalResidueReport,
  validateProductionTerminalInputs,
} from "./production-terminal-residue-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const cleanupFile = argument("cleanup");
const stateFile = argument("state");
const reportFile = argument("report");
const candidateSha = argument("candidate");
const recoveryNoTombstone = process.argv.includes("--recovery-no-tombstone");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (
  !stateFile ||
  !cleanupFile ||
  !reportFile ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  process.env.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
  !token
)
  throw new Error("G12_PRODUCTION_RESIDUE_INPUT_REFUSED");
const [state, cleanup] = await Promise.all([
  readFile(stateFile, "utf8").then(JSON.parse),
  readFile(cleanupFile, "utf8").then(JSON.parse),
]);
const binding = validateProductionTerminalInputs({
  state,
  cleanup,
  candidateSha,
  recoveryNoTombstone,
});

const [result] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
  method: "POST",
  token,
  body: {
    query: buildProductionTerminalResidueQuery(binding, candidateSha),
  },
});
assertProductionTerminalObservation(result, { recoveryNoTombstone });
const report = createProductionTerminalResidueReport({
  candidateSha,
  runTag: binding.runTag,
  observation: result,
  recoveryNoTombstone,
});
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report));
