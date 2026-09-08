import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePublicBridgeForwardCanary } from "./public-bridge-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const file = argument("file");
const candidateSha = argument("candidate");
if (!file || !candidateSha) throw new Error("G12_PUBLIC_FORWARD_CANARY_INPUT_REQUIRED");
const report = JSON.parse(await readFile(resolve(file), "utf8"));
const result = validatePublicBridgeForwardCanary(report, { candidateSha });
if (!result.valid) {
  throw new Error(`G12_PUBLIC_FORWARD_CANARY_REFUSED:${result.violations.join(",")}`);
}
console.log(JSON.stringify({ event: report.event, candidateSha, status: "verified" }));
