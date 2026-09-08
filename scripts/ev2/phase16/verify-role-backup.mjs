import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseRoleFingerprint(source) {
  const lines = String(source).trim().split(/\r?\n/);
  if (lines.length !== 1) throw new Error("BACKUP_ROLE_FINGERPRINT_INVALID");
  const [count, fingerprint, ...extra] = lines[0].split("\t");
  const roleCount = Number(count);
  if (
    extra.length ||
    !/^\d+$/.test(count ?? "") ||
    !Number.isSafeInteger(roleCount) ||
    roleCount < 1 ||
    !SHA256_PATTERN.test(fingerprint ?? "")
  )
    throw new Error("BACKUP_ROLE_FINGERPRINT_INVALID");
  return { roleCount, fingerprint };
}

export function buildRoleSourceReport({ beforeSource, afterSource, roleDump }) {
  const before = parseRoleFingerprint(beforeSource);
  const after = parseRoleFingerprint(afterSource);
  if (before.roleCount !== after.roleCount || before.fingerprint !== after.fingerprint)
    throw new Error("BACKUP_ROLE_CATALOG_RACED");
  if (!Buffer.isBuffer(roleDump) || roleDump.byteLength === 0) throw new Error("BACKUP_ROLE_DUMP_EMPTY");
  return {
    schemaVersion: 1,
    event: "supabase.backup.roles.source-verified",
    phase: "source",
    roleCount: before.roleCount,
    portableCatalogSha256: before.fingerprint,
    roleDumpSha256: sha256(roleDump),
    roleDumpBytes: roleDump.byteLength,
    beforeAfterExact: true,
    raceVerified: true,
    fingerprintScope: "role-attributes-and-memberships-excluding-credentials-and-role-settings",
    credentialsIncludedInFingerprint: false,
    containsRoleNames: false,
  };
}

export function buildRoleRestoreReport({ sourceReport, restoredSource }) {
  const restored = parseRoleFingerprint(restoredSource);
  if (
    sourceReport?.schemaVersion !== 1 ||
    sourceReport?.event !== "supabase.backup.roles.source-verified" ||
    sourceReport?.phase !== "source" ||
    sourceReport?.raceVerified !== true ||
    sourceReport?.beforeAfterExact !== true ||
    sourceReport?.credentialsIncludedInFingerprint !== false ||
    !SHA256_PATTERN.test(sourceReport?.portableCatalogSha256 ?? "") ||
    !SHA256_PATTERN.test(sourceReport?.roleDumpSha256 ?? "") ||
    restored.roleCount !== sourceReport.roleCount ||
    restored.fingerprint !== sourceReport.portableCatalogSha256
  )
    throw new Error("BACKUP_ROLE_RESTORE_FINGERPRINT_MISMATCH");
  return {
    schemaVersion: 1,
    event: "supabase.backup.roles.restore-verified",
    phase: "restore",
    roleCount: restored.roleCount,
    portableCatalogSha256: restored.fingerprint,
    sourceRoleDumpSha256: sourceReport.roleDumpSha256,
    portableRoleCatalogMatched: true,
    rolesRestoredExactly: false,
    credentialsRestored: false,
    platformManagedGucSettingsRestored: false,
    limitation: "role-passwords-and-role-settings-are-not-restored",
    containsRoleNames: false,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? "" : process.argv[index + 1];
}

async function main() {
  const mode = process.argv[2];
  const output = argument("--output");
  if (!output) throw new Error("BACKUP_ROLE_REPORT_OUTPUT_REQUIRED");
  let report;
  if (mode === "source") {
    const before = argument("--before");
    const after = argument("--after");
    const roles = argument("--roles");
    if (!before || !after || !roles) throw new Error("BACKUP_ROLE_SOURCE_PATHS_REQUIRED");
    report = buildRoleSourceReport({
      beforeSource: await readFile(before, "utf8"),
      afterSource: await readFile(after, "utf8"),
      roleDump: await readFile(roles),
    });
  } else if (mode === "restore") {
    const sourceReport = argument("--source-report");
    const restored = argument("--restored");
    if (!sourceReport || !restored) throw new Error("BACKUP_ROLE_RESTORE_PATHS_REQUIRED");
    report = buildRoleRestoreReport({
      sourceReport: JSON.parse(await readFile(sourceReport, "utf8")),
      restoredSource: await readFile(restored, "utf8"),
    });
  } else {
    throw new Error("BACKUP_ROLE_REPORT_MODE_INVALID");
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify({
      event: report.event,
      roleCount: report.roleCount,
      portableCatalogMatched: report.portableRoleCatalogMatched ?? report.beforeAfterExact,
      exactCredentialRestoreClaimed: false,
      identifiersExposed: false,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
