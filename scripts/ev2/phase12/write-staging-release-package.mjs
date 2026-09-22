import { appendFile } from "node:fs/promises";
import process from "node:process";

import {
  STAGING_RELEASE_PROFILE_COMPONENTS,
  writeStagingReleasePackage,
} from "./staging-release-package-lib.mjs";

const ALLOWED_ARGUMENTS = new Set([
  "candidate",
  "controls",
  "database",
  "edge",
  "frontend",
  "output",
  "profile",
  "run-attempt",
  "run-id",
]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z0-9-]*$/u.test(key ?? "") || value === undefined || value.startsWith("--"))
      throw new Error("invalid arguments");
    const name = key.slice(2);
    if (!ALLOWED_ARGUMENTS.has(name)) throw new Error(`unknown argument --${name}`);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate argument --${name}`);
    options[name] = value;
  }
  for (const required of ["frontend", "controls", "output", "candidate", "profile", "run-id", "run-attempt"])
    if (!options[required]) throw new Error(`--${required} is required`);
  return options;
}

const options = parseArguments(process.argv.slice(2));
const required = STAGING_RELEASE_PROFILE_COMPONENTS[options.profile] ?? [];
const componentDirectories = Object.fromEntries(
  required.map((label) => {
    const value = options[label];
    if (!value) throw new Error(`--${label} is required for ${options.profile}`);
    return [label, value];
  }),
);
for (const optional of ["edge", "database"])
  if (!required.includes(optional) && options[optional])
    throw new Error(`--${optional} is forbidden for ${options.profile}`);

const result = await writeStagingReleasePackage({
  componentDirectories,
  outputDirectory: options.output,
  candidateSha: options.candidate,
  releaseProfile: options.profile,
  runId: options["run-id"],
  runAttempt: Number(options["run-attempt"]),
});

if (process.env.GITHUB_OUTPUT) {
  const lines = [
    `manifest_sha256=${result.manifestSha256}`,
    `manifest_bytes=${result.manifestBytes}`,
    `artifact_name=${result.artifactName}`,
    ...Object.entries(result.components).flatMap(([label, component]) => [
      `${label}_tree_sha256=${component.treeSha256}`,
      `${label}_file_count=${component.fileCount}`,
      `${label}_byte_count=${component.byteCount}`,
    ]),
  ];
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}
process.stdout.write(
  `${JSON.stringify({ event: "staging.release_package.written", ...result, manifest: undefined })}\n`,
);
