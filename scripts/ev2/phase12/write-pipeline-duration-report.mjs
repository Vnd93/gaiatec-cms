import { appendFile, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildPipelineDurationReport } from "./pipeline-duration-lib.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error("invalid arguments");
    }
    options[argv[index].slice(2)] = argv[index + 1];
  }
  for (const required of [
    "run",
    "jobs",
    "baseline",
    "profile",
    "scope",
    "expected-stages",
    "captured-at",
    "output",
  ]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  return options;
}

async function readJson(file, label) {
  const resolved = path.resolve(file);
  const metadata = await lstat(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return JSON.parse(await readFile(resolved, "utf8"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = buildPipelineDurationReport({
    run: await readJson(options.run, "run"),
    jobsPayload: await readJson(options.jobs, "jobs"),
    baseline: await readJson(options.baseline, "baseline"),
    profile: options.profile,
    scope: options.scope,
    expectedStages: options["expected-stages"].split(",").filter(Boolean),
    capturedAt: options["captured-at"],
    candidateSha: options["candidate-sha"] || undefined,
  });
  await writeFile(path.resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const bottleneck = report.bottleneck
      ? `${report.bottleneck.stage} (${report.bottleneck.stageDurationSeconds}s)`
      : "indisponível";
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## Pipeline SLO",
        "",
        `- Perfil: \`${report.profile}\``,
        `- Escopo: \`${report.scope}\``,
        `- Duração observada: ${report.observedSeconds}s`,
        `- Estado: \`${report.slo.state}\``,
        `- Gargalo: ${bottleneck}`,
        "- Gates relaxados: não",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
