#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCiProfileNeeds } from "./ci-profile-needs-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1])
    throw new Error(`G12_CI_PROFILE_NEEDS_ARGUMENT_${name.toUpperCase()}_REQUIRED`);
  return process.argv[index + 1];
}

export function main() {
  const report = verifyCiProfileNeeds({
    profile: argument("profile"),
    eventName: argument("event-name"),
    ref: argument("ref"),
    results: {
      "release-plan": argument("release-plan"),
      quality: argument("quality"),
      "package-staging": argument("package-staging"),
      "hotfix-bundle-smoke": argument("hotfix-bundle-smoke"),
      database: argument("database"),
      browser: argument("browser"),
    },
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
