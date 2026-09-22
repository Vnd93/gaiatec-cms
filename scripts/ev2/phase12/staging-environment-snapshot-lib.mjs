import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, parse, relative, resolve, sep } from "node:path";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MIGRATION_VERSION = /^\d{8,20}$/;
const MIGRATION_TIME = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z| ?UTC)?)?$/;
const FUNCTION_NAME = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

export const STAGING_ENVIRONMENT_SNAPSHOT = Object.freeze({
  schemaVersion: 1,
  event: "g12.staging.environment.snapshot",
  environment: "staging",
  fileName: "staging-remote-environment-snapshot.json",
  projectRef: "glcqsosxwgmlhzgcsnzv",
  pagesBranch: "ev2-g17-canary",
  supabaseCliVersion: "2.116.0",
  maximumCaptureAgeSeconds: 900,
  migrationCommand: Object.freeze([
    "migration",
    "list",
    "--linked",
    "--project-ref",
    "glcqsosxwgmlhzgcsnzv",
    "--output-format",
    "text",
  ]),
  functionsCommand: Object.freeze([
    "functions",
    "list",
    "--project-ref",
    "glcqsosxwgmlhzgcsnzv",
    "--output",
    "json",
  ]),
});

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "environment",
  "generatedAt",
  "candidateSha",
  "controlSha",
  "coverage",
  "supabase",
  "pages",
]);
const COVERAGE_KEYS = Object.freeze([
  "databaseMigrationIdentities",
  "functionInventoryMetadata",
  "pagesDeploymentIdentity",
  "authConfiguration",
  "configurationValues",
  "functionBundleBytes",
  "stateDependentGateReuseAllowed",
]);
const SNAPSHOT_COVERAGE = Object.freeze({
  databaseMigrationIdentities: true,
  functionInventoryMetadata: true,
  pagesDeploymentIdentity: true,
  authConfiguration: false,
  configurationValues: false,
  functionBundleBytes: false,
  stateDependentGateReuseAllowed: false,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  return JSON.stringify(value);
}

export function canonicalStagingEnvironmentSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function unique(values) {
  return [...new Set(values)];
}

function canonicalIso(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function commandLabel(arguments_) {
  return `supabase ${arguments_.join(" ")}`;
}

function assertBoundedText(value, label) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_INPUT_BYTES)
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${label}_invalid`);
  if (value.includes("\0") || value.includes("\u001b"))
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${label}_unsafe`);
}

function migrationBase(entry) {
  return {
    localVersion: entry.localVersion,
    remoteVersion: entry.remoteVersion,
    timeUtc: entry.timeUtc,
  };
}

function compareMigration(left, right) {
  return canonicalValue(migrationBase(left)).localeCompare(canonicalValue(migrationBase(right)));
}

export function parseLinkedMigrationList(output) {
  assertBoundedText(output, "migration_output");
  const lines = output
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let headerSeen = false;
  const entries = [];

  for (const line of lines) {
    if (/^[-+|─┼\s]+$/.test(line)) continue;
    let parts = line.split(/[|│]/).map((part) => part.trim());
    if (parts.length === 5 && parts[0] === "" && parts.at(-1) === "") parts = parts.slice(1, -1);
    if (parts.length !== 3)
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_output_unrecognized");

    const normalized = parts.map((part) => part.toLowerCase().replaceAll(/\s+/g, " "));
    if (normalized[0] === "local" && normalized[1] === "remote" && normalized[2] === "time (utc)") {
      if (headerSeen) throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_header_duplicate");
      headerSeen = true;
      continue;
    }
    if (!headerSeen) throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_header_missing");

    const [localInput, remoteInput, timeInput] = parts;
    const localVersion = localInput || null;
    const remoteVersion = remoteInput || null;
    const timeUtc = timeInput || null;
    if (
      (!localVersion && !remoteVersion) ||
      (localVersion && !MIGRATION_VERSION.test(localVersion)) ||
      (remoteVersion && !MIGRATION_VERSION.test(remoteVersion)) ||
      (timeUtc && !MIGRATION_TIME.test(timeUtc))
    ) {
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_row_invalid");
    }
    const base = { localVersion, remoteVersion, timeUtc };
    entries.push({ ...base, sha256: sha256(canonicalValue(base)) });
  }

  if (!headerSeen || entries.length === 0)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_inventory_empty");
  entries.sort(compareMigration);
  const identities = entries.map((entry) => canonicalValue(migrationBase(entry)));
  if (new Set(identities).size !== entries.length)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:migration_row_duplicate");
  return entries;
}

function functionBase(entry) {
  return {
    name: entry.name,
    status: entry.status,
    verifyJwt: entry.verifyJwt,
    version: entry.version,
  };
}

function functionSourceRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.functions)) return payload.functions;
  throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_inventory_invalid");
}

export function parseSupabaseFunctionList(output) {
  assertBoundedText(output, "function_output");
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_json_invalid");
  }
  const entries = functionSourceRecords(payload).map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_record_invalid");
    const name = String(record.name ?? record.slug ?? "");
    if (record.name && record.slug && record.name !== record.slug)
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_identity_ambiguous");
    const status = String(record.status ?? "").toUpperCase();
    const rawVersion = record.version;
    const version =
      typeof rawVersion === "number" || /^\d+$/.test(String(rawVersion ?? ""))
        ? Number(rawVersion)
        : Number.NaN;
    const verifyJwt = record.verify_jwt ?? record.verifyJwt;
    if (
      !FUNCTION_NAME.test(name) ||
      !["ACTIVE", "INACTIVE"].includes(status) ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      typeof verifyJwt !== "boolean"
    ) {
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_record_invalid");
    }
    const base = { name, status, verifyJwt, version };
    return { ...base, sha256: sha256(canonicalValue(base)) };
  });
  if (entries.length === 0)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_inventory_empty");
  entries.sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:function_name_duplicate");
  return entries;
}

function pagesDeploymentIdentity(value) {
  return {
    id: value.id,
    branch: value.branch,
    commitSha: value.commitSha,
    createdOn: value.createdOn,
  };
}

function inputIdentity({ candidateSha, controlSha, projectRef, pagesDeployment }) {
  const violations = [];
  if (!FULL_SHA.test(String(candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (!FULL_SHA.test(String(controlSha ?? ""))) violations.push("control_sha_invalid");
  if (projectRef !== STAGING_ENVIRONMENT_SNAPSHOT.projectRef) violations.push("project_ref_invalid");
  if (!UUID.test(String(pagesDeployment?.id ?? ""))) violations.push("pages_deployment_id_invalid");
  if (pagesDeployment?.branch !== STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch)
    violations.push("pages_branch_invalid");
  if (!FULL_SHA.test(String(pagesDeployment?.commitSha ?? ""))) violations.push("pages_commit_sha_invalid");
  if (!canonicalIso(pagesDeployment?.createdOn)) violations.push("pages_created_on_invalid");
  return violations;
}

function buildSnapshot({
  candidateSha,
  controlSha,
  projectRef,
  pagesDeployment,
  generatedAt,
  migrationEntries,
  functionEntries,
}) {
  const migrationBases = migrationEntries.map(migrationBase);
  const functionBases = functionEntries.map(functionBase);
  const deployment = pagesDeploymentIdentity(pagesDeployment);
  return {
    schemaVersion: STAGING_ENVIRONMENT_SNAPSHOT.schemaVersion,
    event: STAGING_ENVIRONMENT_SNAPSHOT.event,
    environment: STAGING_ENVIRONMENT_SNAPSHOT.environment,
    generatedAt,
    candidateSha,
    controlSha,
    coverage: SNAPSHOT_COVERAGE,
    supabase: {
      cliVersion: STAGING_ENVIRONMENT_SNAPSHOT.supabaseCliVersion,
      projectRef,
      migrations: {
        command: commandLabel(STAGING_ENVIRONMENT_SNAPSHOT.migrationCommand),
        sha256: sha256(canonicalValue(migrationBases)),
        entries: migrationEntries,
      },
      functions: {
        command: commandLabel(STAGING_ENVIRONMENT_SNAPSHOT.functionsCommand),
        sha256: sha256(canonicalValue(functionBases)),
        entries: functionEntries,
      },
    },
    pages: {
      deployment,
      sha256: sha256(canonicalValue(deployment)),
    },
  };
}

function evaluateMigrationInventory(value, violations) {
  if (!exactKeys(value, ["command", "sha256", "entries"])) {
    violations.push("migration_inventory_keys_invalid");
    return;
  }
  if (value.command !== commandLabel(STAGING_ENVIRONMENT_SNAPSHOT.migrationCommand))
    violations.push("migration_command_invalid");
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    violations.push("migration_entries_invalid");
    return;
  }
  const bases = [];
  for (const entry of value.entries) {
    if (!exactKeys(entry, ["localVersion", "remoteVersion", "timeUtc", "sha256"])) {
      violations.push("migration_entry_keys_invalid");
      continue;
    }
    const base = migrationBase(entry);
    if (
      (!base.localVersion && !base.remoteVersion) ||
      (base.localVersion !== null &&
        (typeof base.localVersion !== "string" || !MIGRATION_VERSION.test(base.localVersion))) ||
      (base.remoteVersion !== null &&
        (typeof base.remoteVersion !== "string" || !MIGRATION_VERSION.test(base.remoteVersion))) ||
      (base.timeUtc !== null && (typeof base.timeUtc !== "string" || !MIGRATION_TIME.test(base.timeUtc)))
    ) {
      violations.push("migration_entry_invalid");
    }
    if (entry.sha256 !== sha256(canonicalValue(base))) violations.push("migration_entry_hash_invalid");
    bases.push(base);
  }
  if (bases.length === value.entries.length) {
    const sorted = [...bases].sort(compareMigration);
    if (canonicalValue(sorted) !== canonicalValue(bases)) violations.push("migration_order_invalid");
    if (new Set(bases.map(canonicalValue)).size !== bases.length)
      violations.push("migration_entry_duplicate");
  }
  if (!SHA256.test(String(value.sha256 ?? "")) || value.sha256 !== sha256(canonicalValue(bases)))
    violations.push("migration_inventory_hash_invalid");
}

function evaluateFunctionInventory(value, violations) {
  if (!exactKeys(value, ["command", "sha256", "entries"])) {
    violations.push("function_inventory_keys_invalid");
    return;
  }
  if (value.command !== commandLabel(STAGING_ENVIRONMENT_SNAPSHOT.functionsCommand))
    violations.push("function_command_invalid");
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    violations.push("function_entries_invalid");
    return;
  }
  const bases = [];
  for (const entry of value.entries) {
    if (!exactKeys(entry, ["name", "status", "verifyJwt", "version", "sha256"])) {
      violations.push("function_entry_keys_invalid");
      continue;
    }
    const base = functionBase(entry);
    if (
      typeof base.name !== "string" ||
      !FUNCTION_NAME.test(base.name) ||
      typeof base.status !== "string" ||
      !["ACTIVE", "INACTIVE"].includes(base.status) ||
      typeof base.verifyJwt !== "boolean" ||
      !Number.isSafeInteger(base.version) ||
      base.version < 1
    ) {
      violations.push("function_entry_invalid");
    }
    if (entry.sha256 !== sha256(canonicalValue(base))) violations.push("function_entry_hash_invalid");
    bases.push(base);
  }
  if (bases.length === value.entries.length) {
    const sorted = [...bases].sort((left, right) => left.name.localeCompare(right.name));
    if (canonicalValue(sorted) !== canonicalValue(bases)) violations.push("function_order_invalid");
    if (new Set(bases.map((entry) => entry.name)).size !== bases.length)
      violations.push("function_entry_duplicate");
  }
  if (!SHA256.test(String(value.sha256 ?? "")) || value.sha256 !== sha256(canonicalValue(bases)))
    violations.push("function_inventory_hash_invalid");
}

export function evaluateStagingEnvironmentSnapshot(snapshot, expected) {
  const violations = inputIdentity(expected ?? {});
  if (!exactKeys(snapshot, TOP_LEVEL_KEYS)) violations.push("snapshot_keys_invalid");
  if (snapshot?.schemaVersion !== STAGING_ENVIRONMENT_SNAPSHOT.schemaVersion)
    violations.push("snapshot_schema_invalid");
  if (snapshot?.event !== STAGING_ENVIRONMENT_SNAPSHOT.event) violations.push("snapshot_event_invalid");
  if (snapshot?.environment !== STAGING_ENVIRONMENT_SNAPSHOT.environment)
    violations.push("snapshot_environment_invalid");
  if (!canonicalIso(snapshot?.generatedAt)) violations.push("snapshot_generated_at_invalid");
  if (expected?.observedAt !== undefined) {
    if (!canonicalIso(expected.observedAt)) {
      violations.push("snapshot_observed_at_invalid");
    } else if (canonicalIso(snapshot?.generatedAt)) {
      const ageMilliseconds = Date.parse(expected.observedAt) - Date.parse(snapshot.generatedAt);
      if (ageMilliseconds < 0) violations.push("snapshot_generated_in_future");
      if (ageMilliseconds > STAGING_ENVIRONMENT_SNAPSHOT.maximumCaptureAgeSeconds * 1000)
        violations.push("snapshot_stale");
    }
  }
  if (snapshot?.candidateSha !== expected?.candidateSha) violations.push("candidate_sha_mismatch");
  if (snapshot?.controlSha !== expected?.controlSha) violations.push("control_sha_mismatch");

  if (
    !exactKeys(snapshot?.coverage, COVERAGE_KEYS) ||
    canonicalValue(snapshot.coverage) !== canonicalValue(SNAPSHOT_COVERAGE)
  ) {
    violations.push("snapshot_coverage_invalid");
  }

  if (!exactKeys(snapshot?.supabase, ["cliVersion", "projectRef", "migrations", "functions"])) {
    violations.push("supabase_keys_invalid");
  } else {
    if (snapshot.supabase.cliVersion !== STAGING_ENVIRONMENT_SNAPSHOT.supabaseCliVersion)
      violations.push("supabase_cli_version_invalid");
    if (
      snapshot.supabase.projectRef !== STAGING_ENVIRONMENT_SNAPSHOT.projectRef ||
      snapshot.supabase.projectRef !== expected?.projectRef
    ) {
      violations.push("project_ref_mismatch");
    }
    evaluateMigrationInventory(snapshot.supabase.migrations, violations);
    evaluateFunctionInventory(snapshot.supabase.functions, violations);
  }

  if (!exactKeys(snapshot?.pages, ["deployment", "sha256"])) {
    violations.push("pages_keys_invalid");
  } else {
    const deployment = snapshot.pages.deployment;
    if (!exactKeys(deployment, ["id", "branch", "commitSha", "createdOn"])) {
      violations.push("pages_deployment_keys_invalid");
    } else {
      if (!UUID.test(String(deployment.id ?? ""))) violations.push("pages_deployment_id_invalid");
      if (deployment.branch !== STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch)
        violations.push("pages_branch_invalid");
      if (!FULL_SHA.test(String(deployment.commitSha ?? ""))) violations.push("pages_commit_sha_invalid");
      if (!canonicalIso(deployment.createdOn)) violations.push("pages_created_on_invalid");
      if (
        canonicalValue(deployment) !==
        canonicalValue(pagesDeploymentIdentity(expected?.pagesDeployment ?? {}))
      )
        violations.push("pages_deployment_mismatch");
      if (
        !SHA256.test(String(snapshot.pages.sha256 ?? "")) ||
        snapshot.pages.sha256 !== sha256(canonicalValue(deployment))
      ) {
        violations.push("pages_deployment_hash_invalid");
      }
    }
  }

  const serialized = canonicalStagingEnvironmentSnapshot(snapshot ?? null);
  if (
    /(?:https?:\/\/|postgres(?:ql)?:\/\/|bearer\s+|service[_-]?role|supabase_access_token|password)/i.test(
      serialized,
    )
  ) {
    violations.push("credential_material_detected");
  }
  return { valid: unique(violations).length === 0, violations: unique(violations) };
}

async function assertNoSymlinkParents(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const segments = relative(root, dirname(absolute)).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:path_parent_invalid");
  }
}

async function readStableRegularFile(path, label) {
  await assertNoSymlinkParents(path);
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${label}_not_regular`);
  if (metadata.size > MAX_INPUT_BYTES)
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${label}_too_large`);
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const buffer = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      BigInt(buffer.length) !== before.size
    ) {
      throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${label}_changed_while_reading`);
    }
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function writeNewRegularFile(path, content) {
  await assertNoSymlinkParents(path);
  const absolute = resolve(path);
  const handle = await open(
    absolute,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o400,
  );
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeStagingEnvironmentSnapshot({
  outputPath,
  migrationOutput,
  functionsOutput,
  candidateSha,
  controlSha,
  projectRef,
  pagesDeployment,
  generatedAt = new Date().toISOString(),
}) {
  const inputViolations = inputIdentity({ candidateSha, controlSha, projectRef, pagesDeployment });
  if (!canonicalIso(generatedAt)) inputViolations.push("generated_at_invalid");
  if (inputViolations.length > 0)
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${unique(inputViolations).join(",")}`);
  const migrationEntries = parseLinkedMigrationList(migrationOutput);
  const functionEntries = parseSupabaseFunctionList(functionsOutput);
  const snapshot = buildSnapshot({
    candidateSha,
    controlSha,
    projectRef,
    pagesDeployment,
    generatedAt,
    migrationEntries,
    functionEntries,
  });
  const evaluation = evaluateStagingEnvironmentSnapshot(snapshot, {
    candidateSha,
    controlSha,
    projectRef,
    pagesDeployment,
    observedAt: generatedAt,
  });
  if (!evaluation.valid)
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${evaluation.violations.join(",")}`);
  const content = canonicalStagingEnvironmentSnapshot(snapshot);
  await writeNewRegularFile(outputPath, content);
  return { snapshot, snapshotSha256: sha256(content) };
}

export async function verifyStagingEnvironmentSnapshot({ snapshotPath, expected }) {
  const content = await readStableRegularFile(snapshotPath, "snapshot");
  let snapshot;
  try {
    snapshot = JSON.parse(content);
  } catch {
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:snapshot_json_invalid");
  }
  const evaluation = evaluateStagingEnvironmentSnapshot(snapshot, expected);
  if (!evaluation.valid)
    throw new Error(`G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:${evaluation.violations.join(",")}`);
  if (content !== canonicalStagingEnvironmentSnapshot(snapshot))
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:snapshot_not_canonical");
  return { snapshot, snapshotSha256: sha256(content) };
}

function defaultSupabaseCommand(arguments_) {
  const result = spawnSync("supabase", arguments_, {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: MAX_INPUT_BYTES,
    shell: false,
  });
  if (result.status !== 0 || result.error)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:supabase_command_failed");
  return result.stdout;
}

export async function captureStagingEnvironmentSnapshot(options, runCommand = defaultSupabaseCommand) {
  const version = String(runCommand(["--version"])).trim();
  if (version !== STAGING_ENVIRONMENT_SNAPSHOT.supabaseCliVersion)
    throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_REFUSED:supabase_cli_version_invalid");
  const migrationOutput = runCommand([...STAGING_ENVIRONMENT_SNAPSHOT.migrationCommand]);
  const functionsOutput = runCommand([...STAGING_ENVIRONMENT_SNAPSHOT.functionsCommand]);
  return writeStagingEnvironmentSnapshot({ ...options, migrationOutput, functionsOutput });
}
