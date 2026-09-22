import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

import { writeDatabaseReleasePayload } from "./database-release-payload-lib.mjs";

const ARGUMENTS = ["source", "output", "candidate", "environment", "profile"];

function parseArguments() {
  const values = {};
  const tokens = process.argv.slice(2);
  if (tokens.length !== ARGUMENTS.length * 2) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_WRITE_ARGUMENTS_REQUIRED");
  }
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index];
    const value = tokens[index + 1];
    const name = token?.startsWith("--") ? token.slice(2) : "";
    if (!ARGUMENTS.includes(name) || Object.hasOwn(values, name) || !value || /[\0\r\n]/.test(value)) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_WRITE_ARGUMENTS_REFUSED");
    }
    values[name] = value;
  }
  if (ARGUMENTS.some((name) => !Object.hasOwn(values, name))) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_WRITE_ARGUMENTS_REQUIRED");
  }
  return values;
}

const argumentsByName = parseArguments();
const result = await writeDatabaseReleasePayload({
  sourceRoot: argumentsByName.source,
  outputPath: argumentsByName.output,
  candidateSha: argumentsByName.candidate,
  environment: argumentsByName.environment,
  profile: argumentsByName.profile,
});

if (process.env.GITHUB_OUTPUT) {
  const output = result.required
    ? {
        required: "true",
        omitted: "false",
        artifact_name: result.artifactName,
        payload_path: resolve(argumentsByName.output),
        payload_sha256: result.payloadSha256,
        manifest_sha256: result.manifestSha256,
        tree_sha256: result.manifest.treeSha256,
        payload_bytes: String(result.payloadBytes),
        file_count: String(result.manifest.fileCount),
        byte_count: String(result.manifest.byteCount),
      }
    : {
        required: "false",
        omitted: "true",
        artifact_name: "",
        payload_path: "",
        payload_sha256: "",
        manifest_sha256: "",
        tree_sha256: "",
        payload_bytes: "0",
        file_count: "0",
        byte_count: "0",
      };
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(output)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: result.required ? "g12.database.release_payload.written" : "g12.database.release_payload.omitted",
    candidateSha: argumentsByName.candidate,
    environment: argumentsByName.environment,
    releaseProfile: argumentsByName.profile,
    required: result.required,
    omitted: result.omitted,
    artifactName: result.artifactName ?? null,
    payloadSha256: result.payloadSha256 ?? null,
    manifestSha256: result.manifestSha256 ?? null,
    treeSha256: result.manifest?.treeSha256 ?? null,
    payloadBytes: result.payloadBytes ?? 0,
    fileCount: result.manifest?.fileCount ?? 0,
    byteCount: result.manifest?.byteCount ?? 0,
    secretsExposed: false,
  }),
);
