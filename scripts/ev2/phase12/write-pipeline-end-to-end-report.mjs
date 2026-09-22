import { appendFile, lstat, open } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildPipelineEndToEndReport } from "./pipeline-end-to-end-lib.mjs";

const MAX_INPUT_BYTES = 16 * 1024 * 1024;

function parseArguments(argv) {
  if (argv.length % 2 !== 0) throw new Error("invalid arguments");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error("invalid arguments");
    }
    const name = argv[index].slice(2);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate --${name}`);
    options[name] = argv[index + 1];
  }
  for (const required of [
    "ci-report",
    "bridge-report",
    "staging-report",
    "baseline",
    "chain",
    "captured-at",
    "output",
  ]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  if (
    Object.keys(options).some(
      (name) =>
        ![
          "ci-report",
          "bridge-report",
          "staging-report",
          "baseline",
          "chain",
          "captured-at",
          "output",
        ].includes(name),
    )
  ) {
    throw new Error("unexpected argument");
  }
  return options;
}

function requireCanonicalAbsolutePath(file, label) {
  if (!path.isAbsolute(file) || path.normalize(file) !== file) {
    throw new Error(`${label} path must be canonical and absolute`);
  }
  return file;
}

async function assertNoSymbolicPathSegments(file, label) {
  const parsed = path.parse(file);
  let current = parsed.root;
  for (const segment of file.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} path must not traverse symbolic links`);
    }
  }
}

async function readStableJson(file, label) {
  const canonical = requireCanonicalAbsolutePath(file, label);
  const linkState = await lstat(canonical);
  if (linkState.isSymbolicLink() || !linkState.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  await assertNoSymbolicPathSegments(canonical, label);
  const handle = await open(canonical, "r");
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.dev !== linkState.dev ||
      before.ino !== linkState.ino ||
      before.size !== linkState.size ||
      before.mtimeMs !== linkState.mtimeMs ||
      before.size < 2 ||
      before.size > MAX_INPUT_BYTES
    ) {
      throw new Error(`${label} changed before read`);
    }
    const body = await handle.readFile("utf8");
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new Error(`${label} changed during read`);
    }
    return JSON.parse(body);
  } finally {
    await handle.close();
  }
}

async function writeExclusiveJson(file, value) {
  const canonical = requireCanonicalAbsolutePath(file, "output");
  const parent = path.dirname(canonical);
  const parentState = await lstat(parent);
  if (parentState.isSymbolicLink() || !parentState.isDirectory()) {
    throw new Error("output parent must be a regular directory");
  }
  await assertNoSymbolicPathSegments(parent, "output parent");
  const handle = await open(canonical, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = buildPipelineEndToEndReport({
    ciReport: await readStableJson(options["ci-report"], "CI report"),
    bridgeReport: await readStableJson(options["bridge-report"], "bridge report"),
    stagingReport: await readStableJson(options["staging-report"], "staging report"),
    baseline: await readStableJson(options.baseline, "baseline"),
    chain: await readStableJson(options.chain, "release chain"),
    capturedAt: options["captured-at"],
  });
  await writeExclusiveJson(options.output, report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## Pipeline SLO end-to-end",
        "",
        `- SHA: \`${report.candidateSha}\``,
        `- Perfil: \`${report.profile}\``,
        `- Duração wall-clock: ${report.observedSeconds}s`,
        `- Tempo ativo: ${report.activeSeconds}s`,
        `- Espera entre execuções: ${report.handoffWaitSeconds}s`,
        `- Estado: \`${report.slo.state}\``,
        `- Gargalo: ${report.bottleneck.stage} (${report.bottleneck.stageDurationSeconds}s)`,
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
