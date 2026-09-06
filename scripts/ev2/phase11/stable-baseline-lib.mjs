import { createHash } from "node:crypto";
import { validateHealthContract, validateReleaseManifest } from "../phase12/release-guard-lib.mjs";

function contentType(response) {
  return response?.headers?.get?.("content-type") ?? "";
}

function validJsonContract(response, validation) {
  return response?.status === 200 && contentType(response).includes("application/json") && validation.valid;
}

export function resolveStableBaseline({ health, manifest, root }) {
  const healthValidation = validateHealthContract(health?.json, { expectedEnvironment: "staging" });
  const manifestValidation = validateReleaseManifest(manifest?.json);
  const healthValid = validJsonContract(health, healthValidation);
  const manifestValid = validJsonContract(manifest, manifestValidation);

  if (healthValid || manifestValid) {
    if (!healthValid || !manifestValid) throw new Error("stable_release_contract_partial");
    if (health.json.release !== manifest.json.release) throw new Error("stable_release_contract_mismatch");
    return { stableRelease: manifest.json.release, stableContractMode: "release-contracts-v1" };
  }

  if (
    root?.status !== 200 ||
    !contentType(root).includes("text/html") ||
    typeof root?.json !== "string" ||
    root.json.length === 0
  )
    throw new Error("stable_legacy_root_invalid");

  const digest = createHash("sha256").update(root.json).digest("hex");
  return {
    stableRelease: `legacy-root-sha256:${digest}`,
    stableContractMode: "legacy-root-fingerprint",
  };
}
