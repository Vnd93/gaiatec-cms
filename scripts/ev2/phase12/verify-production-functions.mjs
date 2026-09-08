import { readFile } from "node:fs/promises";
import {
  evaluateFunctionInventory,
  PRODUCTION_FUNCTIONS,
  PUBLIC_FUNCTIONS,
} from "./production-backend-lib.mjs";
import {
  evaluateFunctionDeploymentReceipt,
  sourceDigestInventory,
} from "./production-function-deployment-lib.mjs";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
const receiptIndex = process.argv.indexOf("--receipt");
const sourceIndex = process.argv.indexOf("--source");
const candidateIndex = process.argv.indexOf("--candidate");
const environmentIndex = process.argv.indexOf("--environment");
const projectRefIndex = process.argv.indexOf("--project-ref");
const receiptFile = receiptIndex >= 0 ? process.argv[receiptIndex + 1] : "";
const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "";
const candidateSha = candidateIndex >= 0 ? process.argv[candidateIndex + 1] : "";
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1] : "production";
const projectRef = projectRefIndex >= 0 ? process.argv[projectRefIndex + 1] : undefined;
if (!file) throw new Error("G12_PRODUCTION_FUNCTION_VERIFICATION_FILE_REQUIRED");
if (!["production", "staging"].includes(environment))
  throw new Error("G12_PRODUCTION_FUNCTION_VERIFICATION_ENVIRONMENT_INVALID");
const expectedProjectRef = environment === "staging" ? "glcqsosxwgmlhzgcsnzv" : "chfuhctnhqgyjowkvllv";

const payload = JSON.parse(await readFile(file, "utf8"));
const result = evaluateFunctionInventory(payload);
if (!result.valid)
  throw new Error(`G12_PRODUCTION_FUNCTION_VERIFICATION_FAILED:${result.violations.join(",")}`);
const receiptBindingRequested = receiptIndex >= 0 || sourceIndex >= 0 || candidateIndex >= 0;
if (receiptBindingRequested) {
  if (!receiptFile || !source || !/^[a-f0-9]{40}$/.test(candidateSha) || projectRef !== expectedProjectRef)
    throw new Error("G12_PRODUCTION_FUNCTION_RECEIPT_BINDING_REQUIRED");
  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  const binding = evaluateFunctionDeploymentReceipt({
    receipt,
    livePayload: payload,
    sourceDigests: sourceDigestInventory(source, PRODUCTION_FUNCTIONS),
    release: candidateSha,
    environment,
    projectRef,
  });
  if (!binding.valid)
    throw new Error(`G12_PRODUCTION_FUNCTION_RECEIPT_REFUSED:${binding.violations.join(",")}`);
}

console.log(
  JSON.stringify({
    event: `g12.${environment}.functions.verified`,
    total: result.records.length,
    publicFunctions: [...PUBLIC_FUNCTIONS].sort(),
    ...(receiptBindingRequested ? { candidateSha, exactRemoteDigestsBound: true } : {}),
  }),
);
