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

// Linhas de fingerprint-roles-detail.sql: `<hash do nome>	<hash canonico>`, ordenadas pelo hash
// canonico. Servem apenas para nomear uma divergencia; nenhum hash entra em relatorio, so contagens.
export function parseRoleDetail(source) {
  const lines = String(source).trim().split(/\r?\n/);
  if (!lines.length || lines[0] === "") throw new Error("BACKUP_ROLE_DETAIL_INVALID");
  const roles = lines.map((line) => {
    const [nameHash, fingerprint, ...extra] = line.split("\t");
    if (extra.length || !SHA256_PATTERN.test(nameHash ?? "") || !SHA256_PATTERN.test(fingerprint ?? ""))
      throw new Error("BACKUP_ROLE_DETAIL_INVALID");
    return { nameHash, fingerprint };
  });
  const fingerprints = roles.map((role) => role.fingerprint);
  // A ordenacao e o que torna o agregado reproduzivel; fora de ordem o detalhe nao prova nada.
  if (fingerprints.some((value, index) => index > 0 && value < fingerprints[index - 1]))
    throw new Error("BACKUP_ROLE_DETAIL_UNORDERED");
  if (new Set(fingerprints).size !== fingerprints.length) throw new Error("BACKUP_ROLE_DETAIL_DUPLICATED");
  return roles;
}

// O detalhe nao e aceito por confianca: reconstroi count(*) e o sha256 da concatenacao ordenada e
// tem de reproduzir exatamente o agregado que a SQL de fingerprint produziu no mesmo catalogo.
// Divergencia aqui e defeito real (as duas SQLs derivaram, ou o catalogo mudou entre elas).
export function assertRoleDetailMatchesAggregate({ roleCount, fingerprint }, roles, code) {
  const rebuilt = sha256(roles.map((role) => role.fingerprint).join(""));
  if (roles.length !== roleCount || rebuilt !== fingerprint) throw new Error(code);
}

// Descricao sem nomes: o hash do nome separa "papel que o dump nao levou" de "papel presente cujo
// atributo ou vinculo derivou". Sem essa separacao o agregado so sabe dizer "diferente".
export function describeRoleDivergence(sourceRoles, restoredRoles) {
  const restoredByName = new Map(restoredRoles.map((role) => [role.nameHash, role.fingerprint]));
  const sourceNames = new Set(sourceRoles.map((role) => role.nameHash));
  let identical = 0;
  let drifted = 0;
  for (const role of sourceRoles) {
    if (!restoredByName.has(role.nameHash)) continue;
    if (restoredByName.get(role.nameHash) === role.fingerprint) identical += 1;
    else drifted += 1;
  }
  return {
    sourceRoleCount: sourceRoles.length,
    restoredRoleCount: restoredRoles.length,
    identicalRoles: identical,
    rolesDriftedInRestore: drifted,
    rolesMissingFromRestore: sourceRoles.length - identical - drifted,
    rolesOnlyInRestore: restoredRoles.filter((role) => !sourceNames.has(role.nameHash)).length,
    containsRoleNames: false,
  };
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

export function buildRoleRestoreReport({
  sourceReport,
  restoredSource,
  sourceDetail,
  restoredDetail,
}) {
  const restored = parseRoleFingerprint(restoredSource);
  // Um relatorio de origem malformado nao e uma divergencia de restauracao. Antes as duas falhas
  // saiam com o mesmo codigo, e a leitura do log nao conseguia separa-las.
  if (
    sourceReport?.schemaVersion !== 1 ||
    sourceReport?.event !== "supabase.backup.roles.source-verified" ||
    sourceReport?.phase !== "source" ||
    sourceReport?.raceVerified !== true ||
    sourceReport?.beforeAfterExact !== true ||
    sourceReport?.credentialsIncludedInFingerprint !== false ||
    !SHA256_PATTERN.test(sourceReport?.portableCatalogSha256 ?? "") ||
    !SHA256_PATTERN.test(sourceReport?.roleDumpSha256 ?? "") ||
    !Number.isSafeInteger(sourceReport?.roleCount) ||
    sourceReport.roleCount < 1
  )
    throw new Error("BACKUP_ROLE_SOURCE_REPORT_INVALID");

  // O detalhe por papel e obrigatorio: sem ele uma divergencia so sabe dizer "diferente", que foi
  // exatamente o que esta porta produziu ate aqui.
  if (sourceDetail === undefined || restoredDetail === undefined)
    throw new Error("BACKUP_ROLE_DETAIL_REQUIRED");
  const sourceRoles = parseRoleDetail(sourceDetail);
  const restoredRoles = parseRoleDetail(restoredDetail);
  assertRoleDetailMatchesAggregate(
    { roleCount: sourceReport.roleCount, fingerprint: sourceReport.portableCatalogSha256 },
    sourceRoles,
    "BACKUP_ROLE_SOURCE_DETAIL_INCONSISTENT",
  );
  assertRoleDetailMatchesAggregate(restored, restoredRoles, "BACKUP_ROLE_RESTORED_DETAIL_INCONSISTENT");

  if (
    restored.roleCount !== sourceReport.roleCount ||
    restored.fingerprint !== sourceReport.portableCatalogSha256
  ) {
    const divergence = describeRoleDivergence(sourceRoles, restoredRoles);
    const error = new Error(
      `BACKUP_ROLE_RESTORE_FINGERPRINT_MISMATCH: ${JSON.stringify(divergence)}`,
    );
    error.roleRestoreDivergence = divergence;
    throw error;
  }
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
    const sourceDetail = argument("--source-detail");
    const restoredDetail = argument("--restored-detail");
    if (!sourceReport || !restored || !sourceDetail || !restoredDetail)
      throw new Error("BACKUP_ROLE_RESTORE_PATHS_REQUIRED");
    report = buildRoleRestoreReport({
      sourceReport: JSON.parse(await readFile(sourceReport, "utf8")),
      restoredSource: await readFile(restored, "utf8"),
      sourceDetail: await readFile(sourceDetail, "utf8"),
      restoredDetail: await readFile(restoredDetail, "utf8"),
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
