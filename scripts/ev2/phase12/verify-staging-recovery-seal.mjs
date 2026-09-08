import { readFile } from "node:fs/promises";

import { verifyStagingSealIdentity } from "./staging-recovery-seal-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const stateFile = argument("state");
const sealFile = argument("seal");
const role = argument("role");
if (!stateFile || !sealFile || !["recovery", "target"].includes(role))
  throw new Error("G12_STAGING_RECOVERY_SEAL_ARGUMENTS_REQUIRED");
const [state, seal] = await Promise.all([
  readFile(stateFile, "utf8").then(JSON.parse),
  readFile(sealFile, "utf8").then(JSON.parse),
]);
const section = state?.[role];
const expectedRelease = role === "recovery" ? state?.original?.release : state?.target?.release;
const result = verifyStagingSealIdentity(seal, section?.seal, expectedRelease);
if (!result.valid) throw new Error(`G12_STAGING_RECOVERY_SEAL_REFUSED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.staging.recovery_seal.verified",
    role,
    release: expectedRelease,
    treeSha256: result.identity.treeSha256,
    archiveSha256: result.identity.archiveSha256,
  }),
);
