import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  evaluateAiModelRollbackCompatibility,
  evaluateAiModelRollbackCompatibilityBundle,
  fetchAiModelRollbackBundle,
} from "./ai-model-rollback-compatibility-lib.mjs";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const sourceArgument = argument("--source");
const distArgument = argument("--dist");
const originArgument = argument("--origin");
if (!sourceArgument || Boolean(distArgument) === Boolean(originArgument))
  throw new Error("G12_AI_MODEL_ROLLBACK_INPUT_REQUIRED");

let report;
if (distArgument)
  report = evaluateAiModelRollbackCompatibility(resolve(sourceArgument), resolve(distArgument));
else {
  const remote = await fetchAiModelRollbackBundle(originArgument);
  report = evaluateAiModelRollbackCompatibilityBundle(resolve(sourceArgument), remote);
}
const reportPath = argument("--report");
if (reportPath) await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report));
if (report.violations.length) process.exitCode = 1;
