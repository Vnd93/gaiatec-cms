import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateStagingEdgePublicSecretTransition,
  expectedStagingEdgePublicSecrets,
  STAGING_EDGE_PUBLIC_SECRET_NAMES,
  validateStagingEdgeSecretInventory,
} from "./staging-edge-public-secrets-lib.mjs";

const STAGING_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";
const candidateSha = process.env.STAGING_CANDIDATE_SHA ?? "";
if (
  process.env.STAGING_SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF ||
  !process.env.SUPABASE_ACCESS_TOKEN ||
  !/^[a-f0-9]{40}$/.test(candidateSha)
) {
  throw new Error("G12_STAGING_EDGE_PUBLIC_SECRET_CONFIGURATION_BLOCKED");
}

function supabase(args, capture = false) {
  const result = spawnSync("supabase", args, {
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "ignore"] : ["ignore", "ignore", "ignore"],
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`G12_STAGING_EDGE_PUBLIC_SECRET_CLI_FAILED:${args[0] ?? "unknown"}`);
  return result.stdout ?? "";
}

function listSecrets() {
  try {
    return JSON.parse(
      supabase(["secrets", "list", "--project-ref", STAGING_PROJECT_REF, "--output", "json"], true),
    );
  } catch (error) {
    throw new Error("G12_STAGING_EDGE_PUBLIC_SECRET_INVENTORY_REFUSED", { cause: error });
  }
}

const expected = expectedStagingEdgePublicSecrets(candidateSha);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "g12-staging-edge-public-"));
const envFile = join(temporaryDirectory, "public.env");
try {
  const before = listSecrets();
  const beforeValidation = validateStagingEdgeSecretInventory(before);
  if (!beforeValidation.valid)
    throw new Error(
      `G12_STAGING_EDGE_PUBLIC_SECRET_INVENTORY_REFUSED:${beforeValidation.violations.join(",")}`,
    );
  await writeFile(
    envFile,
    `${STAGING_EDGE_PUBLIC_SECRET_NAMES.map((name) => `${name}=${JSON.stringify(expected[name])}`).join(
      "\n",
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  supabase(["secrets", "set", "--project-ref", STAGING_PROJECT_REF, "--env-file", envFile]);
  const result = evaluateStagingEdgePublicSecretTransition(before, listSecrets(), candidateSha);
  if (!result.valid)
    throw new Error(`G12_STAGING_EDGE_PUBLIC_SECRET_VERIFICATION_FAILED:${result.violations.join(",")}`);
  console.log(
    JSON.stringify({
      event: "g12.staging.edge_public_secrets.verified",
      candidateSha,
      configuredNames: result.configuredNames,
      expectedDigests: result.expectedDigests,
      unmanagedSecretCount: result.unmanagedSecretCount,
      unmanagedSecretsPreserved: result.unmanagedSecretsPreserved,
      valuesDisclosed: 0,
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
