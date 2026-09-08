import { readFile, writeFile } from "node:fs/promises";

import {
  buildProductionTerminalEvidence,
  productionOutboxTerminalPassed,
  productionResidueTerminalPassed,
} from "./production-terminal-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const pages = await json(argument("pages"));
const functionInventory = await json(argument("functions"));
const functionReceipt = await json(argument("function-receipt"));
const secrets = await json(argument("secrets"));
const auth = await json(argument("auth"));
const vault = await json(argument("vault"));
const database = await json(argument("database"));
const boundary = await json(argument("boundary"));
const residue = await json(argument("residue"));
const outbox = await json(argument("outbox"));
const candidateSha = argument("candidate");
const outcome = argument("outcome");
const checks = [
  { name: "pages", passed: pages?.event === "g12.production.baseline.captured" },
  {
    name: "functions",
    passed:
      Array.isArray(functionInventory) &&
      functionReceipt?.event === "g12.production.functions.deployment_verified" &&
      functionReceipt?.candidateSha === candidateSha,
  },
  {
    name: "function-secrets",
    passed:
      secrets?.event === "g12.production.function_secrets.verified" &&
      secrets?.exactDigestBindingsVerified > 0 &&
      secrets?.valuesDisclosed === 0,
  },
  {
    name: "auth",
    passed: auth?.event === "g12.production.auth_config.verified" && auth?.publicSignupDisabled === true,
  },
  {
    name: "vault",
    passed: vault?.event === "g12.production.vault.verified" && vault?.configuredSecrets === 2,
  },
  {
    name: "database",
    passed: database?.event === "g12.production.database.verified" && database?.checks > 0,
  },
  {
    name: "boundary",
    passed: boundary?.event === "g12.supabase.boundary.probe" && boundary?.outcome === "pass",
  },
  {
    name: "residue",
    passed: productionResidueTerminalPassed(residue, candidateSha, outcome),
  },
  {
    name: "outbox-cache",
    passed: productionOutboxTerminalPassed(outbox, candidateSha, outcome),
  },
];
const evidence = buildProductionTerminalEvidence({
  outcome,
  candidateSha,
  controlSha: argument("control-sha"),
  runId: argument("run-id"),
  runAttempt: argument("run-attempt"),
  pagesRelease: pages?.release,
  baselineRelease: argument("baseline-release"),
  markerArtifactId: process.env.MARKER_ARTIFACT_ID,
  markerArtifactDigest: process.env.MARKER_ARTIFACT_DIGEST,
  releaseArtifactId: process.env.RELEASE_ARTIFACT_ID,
  releaseArtifactDigest: process.env.RELEASE_ARTIFACT_DIGEST,
  backendArtifactId: process.env.BACKEND_ARTIFACT_ID,
  backendArtifactDigest: process.env.BACKEND_ARTIFACT_DIGEST,
  checks,
});
await writeFile(argument("output"), `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
});
console.log(
  JSON.stringify({
    event: "g12.production.terminal_evidence.written",
    outcome: evidence.outcome,
    candidateSha,
    checks: evidence.checks.length,
    secretsDisclosed: false,
  }),
);
