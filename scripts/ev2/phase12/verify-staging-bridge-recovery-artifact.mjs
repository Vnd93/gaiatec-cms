import { appendFile } from "node:fs/promises";

import { verifyStagingBridgeRecoveryOutputs } from "./staging-bridge-recovery-artifact-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const outputsDirectory = argument("outputs");
const peerOutputsDirectory = argument("peer-outputs");
const baselineMode = argument("baseline-mode");
const compensationProvenanceMode = argument("compensation-provenance-mode");
const expectedProvenanceMode = argument("expected-provenance-mode");
if (!outputsDirectory || (!baselineMode && !expectedProvenanceMode))
  throw new Error("G12_STAGING_BRIDGE_RECOVERY_TOPOLOGY_INPUT_REFUSED");

const result = await verifyStagingBridgeRecoveryOutputs({
  outputsDirectory,
  peerOutputsDirectory,
  baselineMode,
  compensationProvenanceMode,
  expectedProvenanceMode,
});
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `provenance_mode=${result.provenanceMode}`,
      `archive_file=${result.archiveFile}`,
      `companion_seal_file=${result.companionSealFile}`,
      `provenance_file=${result.provenanceFile}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.frontend_bridge.recovery_topology_verified",
    provenanceMode: result.provenanceMode,
    archiveFile: result.archiveFile,
    remoteBytesVerified: Boolean(peerOutputsDirectory),
  }),
);
