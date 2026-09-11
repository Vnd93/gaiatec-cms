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
    const [nameHash, fingerprint, attributes, ...extra] = line.split("\t");
    if (extra.length || !SHA256_PATTERN.test(nameHash ?? "") || !SHA256_PATTERN.test(fingerprint ?? ""))
      throw new Error("BACKUP_ROLE_DETAIL_INVALID");
    let profile;
    try {
      profile = JSON.parse(attributes ?? "");
    } catch {
      throw new Error("BACKUP_ROLE_DETAIL_INVALID");
    }
    // O perfil e obrigatorio e nao pode conter nome: e ele que diz O QUE divergiu, e a ausencia
    // da chave `name` e o que garante que dizer isso nao vira dizer QUEM.
    if (!profile || typeof profile !== "object" || Array.isArray(profile) || "name" in profile)
      throw new Error("BACKUP_ROLE_DETAIL_PROFILE_INVALID");
    return { nameHash, fingerprint, profile };
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
// Quantos papeis divergentes descrever antes de truncar. Uma divergencia estrutural produziria
// dezenas de perfis e a mensagem deixaria de caber num log; as contagens acima continuam exatas.
const DESCRIBED_ROLE_LIMIT = 5;

function driftedFields(source, restored) {
  const keys = [...new Set([...Object.keys(source), ...Object.keys(restored)])].sort();
  return keys
    .filter((key) => JSON.stringify(source[key]) !== JSON.stringify(restored[key]))
    .map((key) =>
      key === "memberOf"
        ? {
            field: key,
            sourceCount: source[key]?.length ?? 0,
            restoredCount: restored[key]?.length ?? 0,
          }
        : { field: key, source: source[key] ?? null, restored: restored[key] ?? null },
    );
}

// `baselineRoles` e o catalogo do alvo efemero ANTES de aplicar o dump. Sem ele so da para dizer
// que houve divergencia; com ele da para dizer de quem e a culpa, que e a pergunta que decide a
// correcao: um papel que o dump nao carrega e limite do backup a declarar; um papel que o dump
// carrega e ainda assim nao chega igual e defeito de restauracao.
export function describeRoleDivergence(sourceRoles, restoredRoles, baselineRoles = []) {
  const restoredByName = new Map(restoredRoles.map((role) => [role.nameHash, role]));
  const baselineByName = new Map(baselineRoles.map((role) => [role.nameHash, role]));
  const sourceNames = new Set(sourceRoles.map((role) => role.nameHash));
  const identical = [];
  const drifted = [];
  const missing = [];
  for (const role of sourceRoles) {
    const counterpart = restoredByName.get(role.nameHash);
    if (!counterpart) missing.push(role);
    else if (counterpart.fingerprint === role.fingerprint) identical.push(role);
    else drifted.push([role, counterpart]);
  }
  const extra = restoredRoles.filter((role) => !sourceNames.has(role.nameHash));
  const untouchedByRestore = drifted.filter(
    ([, restored]) => baselineByName.get(restored.nameHash)?.fingerprint === restored.fingerprint,
  ).length;
  return {
    sourceRoleCount: sourceRoles.length,
    restoredRoleCount: restoredRoles.length,
    identicalRoles: identical.length,
    rolesDriftedInRestore: drifted.length,
    rolesMissingFromRestore: missing.length,
    rolesOnlyInRestore: extra.length,
    // Perfis sem nome: o suficiente para decidir se o dump deixou de levar um papel da aplicacao
    // (defeito de backup) ou um papel que a plataforma recria sozinha (limite a declarar).
    missingProfiles: missing.slice(0, DESCRIBED_ROLE_LIMIT).map((role) => role.profile),
    extraProfiles: extra.slice(0, DESCRIBED_ROLE_LIMIT).map((role) => role.profile),
    driftedFields: drifted
      .slice(0, DESCRIBED_ROLE_LIMIT)
      .map(([source, restored]) => driftedFields(source.profile, restored.profile)),
    // Quantos papeis ausentes o alvo tambem nao tinha antes do dump: esses o dump simplesmente
    // nao carrega. E quantos papeis divergentes o dump nao tocou, tendo ficado no valor de
    // fabrica do alvo efemero.
    missingRolesAbsentFromBaseline: missing.filter((role) => !baselineByName.has(role.nameHash)).length,
    driftedRolesUntouchedByRestore: untouchedByRestore,
    driftedRolesChangedButNotConverged: drifted.length - untouchedByRestore,
    baselineRoleCount: baselineRoles.length,
    described:
      missing.length <= DESCRIBED_ROLE_LIMIT &&
      extra.length <= DESCRIBED_ROLE_LIMIT &&
      drifted.length <= DESCRIBED_ROLE_LIMIT,
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
  baselineDetail,
  dumpShape,
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
  if (sourceDetail === undefined || restoredDetail === undefined || baselineDetail === undefined)
    throw new Error("BACKUP_ROLE_DETAIL_REQUIRED");
  const sourceRoles = parseRoleDetail(sourceDetail);
  const restoredRoles = parseRoleDetail(restoredDetail);
  const baselineRoles = parseRoleDetail(baselineDetail);
  assertRoleDetailMatchesAggregate(
    { roleCount: sourceReport.roleCount, fingerprint: sourceReport.portableCatalogSha256 },
    sourceRoles,
    "BACKUP_ROLE_SOURCE_DETAIL_INCONSISTENT",
  );
  assertRoleDetailMatchesAggregate(restored, restoredRoles, "BACKUP_ROLE_RESTORED_DETAIL_INCONSISTENT");

  if (!Number.isSafeInteger(dumpShape?.createRoleStatements) || dumpShape.createRoleStatements < 0)
    throw new Error("BACKUP_ROLE_DUMP_SHAPE_REQUIRED");

  const divergence = describeRoleDivergence(sourceRoles, restoredRoles, baselineRoles);
  const catalogMatched =
    restored.roleCount === sourceReport.roleCount &&
    restored.fingerprint === sourceReport.portableCatalogSha256;

  // Um papel ausente do alvo que tambem nao estava na linha de base so e limite legitimo enquanto
  // o dump nao emite `CREATE ROLE`. No dia em que emitir, o mesmo papel ausente volta a ser
  // falha de restauracao — a excecao morre sozinha em vez de virar permissao permanente.
  const rolesNotReconstructableFromDump =
    dumpShape.createRoleStatements === 0 ? divergence.missingRolesAbsentFromBaseline : 0;
  const rolesMissingDespiteTarget = divergence.rolesMissingFromRestore - rolesNotReconstructableFromDump;

  // O que o backup consegue provar: nada que o dump governou deixou de convergir, o alvo nao
  // perdeu papel que ja tinha e nao ganhou papel que a origem nao tem.
  const dumpGovernedRolesRestored =
    divergence.driftedRolesChangedButNotConverged === 0 &&
    divergence.rolesOnlyInRestore === 0 &&
    rolesMissingDespiteTarget === 0;
  if (!dumpGovernedRolesRestored) {
    const error = new Error(`BACKUP_ROLE_RESTORE_FINGERPRINT_MISMATCH: ${JSON.stringify(divergence)}`);
    error.roleRestoreDivergence = divergence;
    throw error;
  }
  return {
    schemaVersion: 1,
    event: "supabase.backup.roles.restore-verified",
    phase: "restore",
    roleCount: restored.roleCount,
    sourceRoleCount: sourceReport.roleCount,
    baselineRoleCount: baselineRoles.length,
    portableCatalogSha256: restored.fingerprint,
    sourceCatalogSha256: sourceReport.portableCatalogSha256,
    sourceRoleDumpSha256: sourceReport.roleDumpSha256,
    // Fato relatado, nao condicao de aprovacao: contra um alvo gerenciado e pre-semeado a
    // igualdade de catalogo nao e alcancavel, e afirmar o contrario seria inventar cobertura.
    portableRoleCatalogMatched: catalogMatched,
    // Condicao de aprovacao: o que o dump governa foi restaurado.
    dumpGovernedRolesRestored: true,
    rolesRestoredIdentically: divergence.identicalRoles,
    rolesNotReconstructableFromDump,
    rolesDivergingFromTargetBaseline: divergence.driftedRolesUntouchedByRestore,
    rolesChangedButNotConverged: 0,
    dumpCreateRoleStatements: dumpShape.createRoleStatements,
    rolesRestoredExactly: false,
    credentialsRestored: false,
    platformManagedGucSettingsRestored: false,
    limitation: "role-passwords-and-role-settings-are-not-restored",
    limitations: [
      "role-passwords-and-role-settings-are-not-restored",
      ...(dumpShape.createRoleStatements === 0 ? ["role-existence-is-not-restored-by-the-role-dump"] : []),
    ],
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
    const baselineDetail = argument("--baseline-detail");
    const dumpShapePath = argument("--dump-shape");
    if (!sourceReport || !restored || !sourceDetail || !restoredDetail || !baselineDetail || !dumpShapePath)
      throw new Error("BACKUP_ROLE_RESTORE_PATHS_REQUIRED");
    report = buildRoleRestoreReport({
      sourceReport: JSON.parse(await readFile(sourceReport, "utf8")),
      restoredSource: await readFile(restored, "utf8"),
      sourceDetail: await readFile(sourceDetail, "utf8"),
      restoredDetail: await readFile(restoredDetail, "utf8"),
      baselineDetail: await readFile(baselineDetail, "utf8"),
      dumpShape: JSON.parse(await readFile(dumpShapePath, "utf8")),
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
      dumpGovernedRolesRestored: report.dumpGovernedRolesRestored ?? null,
      rolesNotReconstructableFromDump: report.rolesNotReconstructableFromDump ?? null,
      exactCredentialRestoreClaimed: false,
      identifiersExposed: false,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
