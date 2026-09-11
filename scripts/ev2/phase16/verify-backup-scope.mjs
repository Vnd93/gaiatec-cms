import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const REQUIRED_AUTH_TABLES = ["auth.identities", "auth.mfa_factors", "auth.users"];
export const REQUIRED_STORAGE_TABLES = ["storage.buckets", "storage.objects"];
export const MANAGED_TABLE_EXCLUSIONS = [
  "auth.schema_migrations",
  "storage.migrations",
  "storage.schema_migrations",
];

const TABLE_PATTERN = /^(auth|storage)\.([a-z_][a-z0-9_$]*)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseBackupInventory(source) {
  const inventory = new Map();
  for (const line of String(source).split(/\r?\n/).filter(Boolean)) {
    const [table, count, fingerprint, ...extra] = line.split("\t");
    if (
      extra.length ||
      !TABLE_PATTERN.test(table ?? "") ||
      MANAGED_TABLE_EXCLUSIONS.includes(table) ||
      !/^\d+$/.test(count ?? "") ||
      !SHA256_PATTERN.test(fingerprint ?? "") ||
      inventory.has(table)
    )
      throw new Error("BACKUP_SCOPE_INVENTORY_INVALID");
    const rows = Number(count);
    if (!Number.isSafeInteger(rows)) throw new Error("BACKUP_SCOPE_INVENTORY_INVALID");
    inventory.set(table, { table, rows, fingerprint });
  }
  for (const table of [...REQUIRED_AUTH_TABLES, ...REQUIRED_STORAGE_TABLES])
    if (!inventory.has(table)) throw new Error(`BACKUP_SCOPE_TABLE_MISSING:${table}`);
  return inventory;
}

function dumpTables(source, expectedSchema) {
  const tables = new Set();
  const pattern = /^COPY\s+(?:"(auth|storage)"|(auth|storage))\.(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s*\(/gim;
  for (const match of String(source).matchAll(pattern)) {
    const schema = match[1] ?? match[2];
    const table = match[3] ?? match[4];
    if (schema !== expectedSchema || !TABLE_PATTERN.test(`${schema}.${table}`))
      throw new Error("BACKUP_SCOPE_DUMP_TABLE_INVALID");
    const qualified = `${schema}.${table}`;
    if (tables.has(qualified)) throw new Error("BACKUP_SCOPE_DUMP_TABLE_DUPLICATED");
    tables.add(qualified);
  }
  return tables;
}

function canonicalRecords(inventory, schema) {
  return [...inventory.values()]
    .filter(({ table }) => table.startsWith(`${schema}.`))
    .sort((left, right) => left.table.localeCompare(right.table));
}

function summarize(inventory, schema, restored) {
  const records = canonicalRecords(inventory, schema);
  return {
    tables: records.map(({ table }) => table),
    tableCount: records.length,
    rows: records.reduce((total, record) => total + record.rows, 0),
    aggregateSha256: sha256(JSON.stringify(records)),
    tableInventoryComplete: true,
    dumpContainsAllTables: true,
    restoreVerified: restored,
  };
}

// Quantas tabelas divergentes descrever antes de truncar. As contagens continuam exatas.
const SCOPE_DIVERGENCE_LIMIT = 20;

// Uma divergencia de escopo tem tres formas distintas, e a correcao de cada uma e outra: tabela
// que o restore nao trouxe, tabela que apareceu sem estar na origem, e tabela presente nos dois
// lados cujas linhas ou cujo conteudo nao batem.
export function describeScopeDivergence(source, restored) {
  const tables = [...new Set([...source.keys(), ...restored.keys()])].sort();
  const divergences = [];
  for (const table of tables) {
    const left = source.get(table);
    const right = restored.get(table);
    if (!left) divergences.push({ table, reason: "absent_from_source", restoredRows: right.rows });
    else if (!right) divergences.push({ table, reason: "absent_from_restore", sourceRows: left.rows });
    else if (left.rows !== right.rows)
      divergences.push({
        table,
        reason: "row_count_differs",
        sourceRows: left.rows,
        restoredRows: right.rows,
      });
    else if (left.fingerprint !== right.fingerprint)
      divergences.push({
        table,
        reason: "content_differs",
        rows: left.rows,
      });
  }
  return divergences;
}

export function evaluateBackupScope({ authDataDump, storageDataDump, sourceInventory, restoredInventory }) {
  const source = parseBackupInventory(sourceInventory);
  const restored = restoredInventory === undefined ? null : parseBackupInventory(restoredInventory);
  const dumped = new Set([...dumpTables(authDataDump, "auth"), ...dumpTables(storageDataDump, "storage")]);
  const sourceTables = new Set(source.keys());
  const missingFromDump = [...sourceTables].filter((table) => !dumped.has(table));
  const missingFromInventory = [...dumped].filter((table) => !sourceTables.has(table));
  if (missingFromDump.length || missingFromInventory.length)
    throw new Error("BACKUP_SCOPE_DUMP_INVENTORY_MISMATCH");

  let runtimeOnlyTables = [];
  if (restored) {
    const divergences = describeScopeDivergence(source, restored);
    // Uma tabela que existe no alvo, nao existe na origem e esta VAZIA e o runtime gerenciado do
    // alvo sendo mais novo do que o da origem: o stack local subiu uma versao de storage-api que
    // acrescenta tabelas que a producao ainda nao tem. Isso nao e restauracao incompleta.
    //
    // A tolerancia nao abre buraco: uma tabela que a producao tem e o restore nao trouxe aparece
    // como `absent_from_restore`, e qualquer tabela extra COM linhas e dado surgindo do nada.
    // As duas continuam reprovando.
    const runtimeOnly = divergences.filter(
      (divergence) => divergence.reason === "absent_from_source" && divergence.restoredRows === 0,
    );
    runtimeOnlyTables = runtimeOnly.map((divergence) => divergence.table).sort();
    const blocking = divergences.filter((divergence) => !runtimeOnly.includes(divergence));
    if (blocking.length) {
      // Nome de tabela e contagem de linhas ja viajam na cobertura do manifesto selado, entao
      // dize-los aqui nao alarga exposicao nenhuma — e a diferenca entre saber QUAL tabela nao
      // voltou e ter apenas um codigo que obriga a reexecutar o drill para adivinhar.
      const error = new Error(
        `BACKUP_SCOPE_RESTORE_FINGERPRINT_MISMATCH: ${JSON.stringify({
          divergentTables: blocking.length,
          runtimeOnlyTables,
          divergences: blocking.slice(0, SCOPE_DIVERGENCE_LIMIT),
          truncated: blocking.length > SCOPE_DIVERGENCE_LIMIT,
        })}`,
      );
      error.scopeDivergences = blocking;
      throw error;
    }
  }

  const phase = restored ? "restore" : "source";
  const auth = summarize(source, "auth", Boolean(restored));
  const storage = summarize(source, "storage", Boolean(restored));
  return {
    schemaVersion: 2,
    event: `supabase.backup.scope.${phase}-verified`,
    phase,
    fingerprintMode: "sha256-canonical-full-row-json-multiset",
    tableInventoryComplete: true,
    auth: {
      ...auth,
      scope: "all-portable-auth-table-rows",
      runtimeCredentialChallengeVerified: false,
    },
    storage: {
      ...storage,
      scope: "all-portable-storage-table-rows",
      bucketRows: source.get("storage.buckets").rows,
      objectRows: source.get("storage.objects").rows,
      objectPayloadsIncluded: false,
      objectPayloadRestoreVerified: false,
      fullRowMetadataFingerprint: true,
    },
    excludedPlatformTables: MANAGED_TABLE_EXCLUSIONS,
    // Declarado, nao silenciado: e a diferenca de versao entre o runtime do alvo efemero e o da
    // producao, e quem le a evidencia precisa poder ver que ela existe.
    runtimeOnlyTables,
    sessionReplicationRestoreVerified: Boolean(restored),
    containsRawIdentifiers: false,
    containsObjectNames: false,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const authDumpPath = argument("--auth-dump");
  const storageDumpPath = argument("--storage-dump");
  const sourceInventoryPath = argument("--source-inventory");
  const restoredInventoryPath = argument("--restored-inventory");
  const outputPath = argument("--output");
  if (!authDumpPath || !storageDumpPath || !sourceInventoryPath || !outputPath)
    throw new Error("BACKUP_SCOPE_PATHS_REQUIRED");

  const report = evaluateBackupScope({
    authDataDump: await readFile(authDumpPath, "utf8"),
    storageDataDump: await readFile(storageDumpPath, "utf8"),
    sourceInventory: await readFile(sourceInventoryPath, "utf8"),
    restoredInventory: restoredInventoryPath ? await readFile(restoredInventoryPath, "utf8") : undefined,
  });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify({
      event: report.event,
      authTables: report.auth.tableCount,
      authRows: report.auth.rows,
      storageTables: report.storage.tableCount,
      storageMetadataRows: report.storage.rows,
      restoreVerified: report.auth.restoreVerified && report.storage.restoreVerified,
      identifiersExposed: false,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
