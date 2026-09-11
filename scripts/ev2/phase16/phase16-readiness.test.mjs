import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import worker, { contentSecurityPolicy } from "../../../cloudflare/_worker.js";
import { prepareRoleRestore } from "./prepare-role-restore.mjs";
import {
  buildProductionBackupEvidence,
  createBackupArchiveSeal,
  validateProductionBackupManifest,
  verifyBackupArchiveSeal,
} from "./production-backup-evidence-lib.mjs";
import {
  exportStorageObjects,
  restoreStorageObjects,
  verifyRestoredStorageObjects,
  verifyStorageSnapshotStability,
} from "./storage-object-backup.mjs";
import { evaluateBackupScope } from "./verify-backup-scope.mjs";
import {
  buildRoleRestoreReport,
  buildRoleSourceReport,
  describeRoleDivergence,
  parseRoleDetail,
} from "./verify-role-backup.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  classifySupabaseServiceKey,
  classifyResendDeliveryStatus,
  supabaseServiceKeyHeaders,
  validateBackupConfig,
  validateEmailProviderConfig,
  validatePostgresBackupRuntime,
  validateProductionReadinessControls,
  validateResendDomainResponse,
} from "./readiness-lib.mjs";
import {
  emailEvidenceSha256,
  productionEmailIdempotencyKey,
  serializeEmailEvidence,
  verifyEmailProvider,
} from "./verify-email-provider.mjs";

const sha = "a".repeat(40);
const read = (path) => readFile(path, "utf8");
const execFileAsync = promisify(execFile);

function legacyServiceRoleKey({ expiresAt = 4_102_444_800, role = "service_role" } = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: "supabase-demo",
    role,
    iat: 1_700_000_000,
    exp: expiresAt,
  })}.${"s".repeat(43)}`;
}

test("role restore omits only platform-managed GUC assignments", () => {
  const source = `ALTER ROLE postgres WITH SUPERUSER;
ALTER ROLE postgres SET
  "log_min_messages" TO 'fatal';
ALTER ROLE authenticator SET "statement_timeout" TO '8s';
ALTER ROLE authenticated RESET statement_timeout;
ALTER DATABASE postgres SET "log_min_messages" TO 'fatal';
ALTER DATABASE postgres SET statement_timeout TO '10s';
SET log_min_messages = warning;
SET SESSION "log_min_messages" TO warning;
SELECT pg_catalog.set_config('log_min_messages', 'warning', false);
ALTER SYSTEM SET log_min_messages = warning;
SET search_path = '';
GRANT anon TO authenticator;
`;
  const result = prepareRoleRestore(source);

  assert.equal(result.removedRoleSettings, 2);
  assert.equal(result.removedDatabaseSettings, 1);
  assert.equal(result.removedSessionSettings, 3);
  assert.equal(result.removedManagedGucStatements, 1);
  assert.doesNotMatch(result.sql, /log_min_messages|ALTER ROLE authenticator SET/);
  assert.match(result.sql, /ALTER ROLE postgres WITH SUPERUSER/);
  assert.match(result.sql, /ALTER ROLE authenticated RESET statement_timeout/);
  assert.match(result.sql, /ALTER DATABASE postgres SET statement_timeout/);
  assert.match(result.sql, /SET search_path = ''/);
  assert.match(result.sql, /GRANT anon TO authenticator/);
});

function readiness() {
  return {
    githubProtection: {
      status: "verified",
      candidateSha: sha,
      governanceMode: "sole-maintainer",
      maintainerLogin: "Vnd93",
      requiredPullRequestApprovals: 0,
      codeOwnersCount: 1,
      branchProtected: true,
      requiredChecksPassed: true,
      soleMaintainerRiskAccepted: true,
      evidenceReference: "actions/github-controls-123",
      verifiedAt: "2026-09-05T10:00:00.000Z",
    },
    backupRestore: {
      status: "passed",
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      externalTarget: "github-actions-encrypted-artifact",
      encryptedArchiveSha256: "b".repeat(64),
      backupRunId: "34000214134",
      backupRunAttempt: 1,
      restoreDrillRunId: "34000214134",
      backupWorkflow: ".github/workflows/backup-supabase-production.yml",
      backupWorkflowName: "Backup Supabase production",
      backupEvent: "workflow_dispatch",
      backupRef: "refs/heads/main",
      backupSourceSha: sha,
      artifactName: "supabase-production-backup-34000214134-1",
      artifactId: "900000001",
      artifactDigest: `sha256:${"1".repeat(64)}`,
      manifestSha256: "a".repeat(64),
      rpoMinutes: 1440,
      rtoMinutes: 30,
      evidenceReference: ".github/release-controls/evidence/BACKUP_RESTORE_34000214134_1.json",
      evidenceSha256: "e".repeat(64),
      completedAt: "2026-09-05T10:10:00.000Z",
      runCompletedAt: "2026-09-05T10:11:00.000Z",
    },
    dpoLegal: {
      status: "approved",
      approverId: "Vnd93",
      scopeSha256: "c".repeat(64),
      evidenceReference: "legal/DPO-EV2-G12",
      approvedAt: "2026-09-05T10:20:00.000Z",
    },
    emailProvider: {
      status: "verified",
      provider: "resend",
      sendingDomain: "gaiatecsistemas.com",
      from: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
      notificationTo: "comercial@gaiatecsistemas.com.br",
      syntheticDeliveryStatus: "passed",
      syntheticDeliveryIdSha256: "f".repeat(64),
      candidateSha: sha,
      emailRunId: "34000214200",
      emailRunAttempt: 1,
      emailWorkflow: ".github/workflows/verify-production-email.yml",
      emailWorkflowName: "Verify production email provider",
      emailEvent: "workflow_dispatch",
      emailRef: "refs/heads/main",
      emailSourceSha: sha,
      artifactName: `production-email-evidence-${sha}`,
      artifactId: "900000002",
      artifactDigest: `sha256:${"2".repeat(64)}`,
      evidenceSha256: "3".repeat(64),
      realDataUsed: false,
      evidenceReference: "https://github.com/Vnd93/gaiatec-cms/actions/runs/34000214200",
      verifiedAt: "2026-09-05T10:30:00.000Z",
      runCompletedAt: "2026-09-05T10:31:00.000Z",
    },
    csp: {
      status: "passed",
      mode: "enforce",
      candidateSha: sha,
      policySha256: createHash("sha256").update(contentSecurityPolicy()).digest("hex"),
      adminPolicySha256: createHash("sha256").update(contentSecurityPolicy("/admin")).digest("hex"),
      criticalViolations: 0,
      evidenceReference: "actions/csp-123",
      verifiedAt: "2026-09-05T10:40:00.000Z",
    },
  };
}

test("backup configuration binds encrypted off-platform copy to the exact production project", () => {
  const base = {
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    databaseUrl: `postgresql://postgres:${"x".repeat(24)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    serviceRoleKey: `sb_secret_${"x".repeat(32)}`,
    encryptionPassphrase: "correct-horse-battery-staple-archive-key",
    target: "github-actions-encrypted-artifact",
    gitRef: "refs/heads/main",
  };
  assert.equal(validateBackupConfig(base).valid, true);
  assert.match(
    validateBackupConfig({ ...base, projectRef: "glcqsosxwgmlhzgcsnzv" }).violations.join(","),
    /production_project_ref_mismatch/,
  );
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: base.databaseUrl.replace("sslmode=require", ""),
    }).violations.join(","),
    /database_tls_required/,
  );
  assert.match(
    validateBackupConfig({ ...base, encryptionPassphrase: "short" }).violations.join(","),
    /backup_encryption_passphrase_invalid/,
  );
  assert.match(
    validateBackupConfig({ ...base, serviceRoleKey: "" }).violations.join(","),
    /backup_service_role_key_invalid/,
  );
  // `pg_dump` exige conexao capaz de SESSAO. Duas satisfazem: o endpoint direto e o Supavisor em
  // session mode. Quem separa session de transaction e a PORTA, nao o host nem o usuario.
  const poolerHost = "aws-0-sa-east-1.pooler.supabase.com";
  const poolerUser = `postgres.${PRODUCTION_SUPABASE_PROJECT_REF}`;
  const poolerUrl = (port) =>
    `postgresql://${poolerUser}:${"x".repeat(24)}@${poolerHost}:${port}/postgres?sslmode=require`;

  // Session mode e aceito: era esta a configuracao que vinha produzindo backup com sucesso, e exigir
  // o endpoint direto e impossivel neste ambiente, porque ele resolve so em IPv6.
  assert.equal(validateBackupConfig({ ...base, databaseUrl: poolerUrl(5432) }).valid, true);

  // Transaction mode continua recusado: ele nao sustenta pg_dump.
  assert.match(
    validateBackupConfig({ ...base, databaseUrl: poolerUrl(6543) }).violations.join(","),
    /database_url_session_port_invalid/,
  );

  // Host que nao e nem o direto nem o Supavisor continua recusado.
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: `postgresql://postgres:${"x".repeat(24)}@db.exemplo.invalid:5432/postgres?sslmode=require`,
    }).violations.join(","),
    /database_url_must_be_session_capable_endpoint/,
  );

  // O usuario acompanha o endpoint: `postgres` no direto, `postgres.<ref>` no Supavisor. Trocar um
  // pelo outro e recusado nos dois sentidos.
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: `postgresql://postgres:${"x".repeat(24)}@${poolerHost}:5432/postgres?sslmode=require`,
    }).violations.join(","),
    /database_user_invalid/,
  );
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: base.databaseUrl.replace("postgres:", `${poolerUser}:`),
    }).violations.join(","),
    /database_user_invalid/,
  );

  // E o resto do contrato nao foi afrouxado junto.
  for (const [broken, expected] of [
    [poolerUrl(5432).replace("?sslmode=require", ""), /database_tls_required/],
    [poolerUrl(5432).replace("/postgres?", "/outro?"), /database_name_invalid/],
    [poolerUrl(5432).replace("x".repeat(24), "curta"), /database_password_missing_or_short/],
  ])
    assert.match(validateBackupConfig({ ...base, databaseUrl: broken }).violations.join(","), expected);
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: base.databaseUrl.replace(":5432/", ":6543/"),
    }).violations.join(","),
    /database_url_session_port_invalid/,
  );
  assert.equal(
    validatePostgresBackupRuntime({ clientVersion: "pg_dump (PostgreSQL) 17.6", serverVersion: "170005" })
      .valid,
    true,
  );
  assert.match(
    validatePostgresBackupRuntime({
      clientVersion: "pg_dump (PostgreSQL) 16.9",
      serverVersion: "170005",
    }).violations.join(","),
    /backup_pg_dump_major_too_old/,
  );
  assert.match(
    validatePostgresBackupRuntime({
      clientVersion: "pg_dump (PostgreSQL) 18.1",
      serverVersion: "180001",
    }).violations.join(","),
    /backup_server_postgres_major_invalid/,
  );
});

test("opaque Supabase secret keys are apikey-only while validated legacy service JWTs use Bearer", () => {
  const opaque = `sb_secret_${"x".repeat(32)}`;
  const legacy = legacyServiceRoleKey();
  assert.equal(classifySupabaseServiceKey(opaque), "opaque");
  assert.deepEqual(supabaseServiceKeyHeaders(opaque), { apikey: opaque });
  assert.equal(classifySupabaseServiceKey(legacy), "legacy-jwt");
  assert.deepEqual(supabaseServiceKeyHeaders(legacy), {
    apikey: legacy,
    Authorization: `Bearer ${legacy}`,
  });
  for (const invalid of ["service-role-arbitrary", "sb_secret_short", legacyServiceRoleKey({ role: "anon" })])
    assert.equal(classifySupabaseServiceKey(invalid), null);
});

test("backup scope fingerprints every portable Auth and Storage table without exposing row values", () => {
  const authDump = [
    "COPY auth.users (id) FROM stdin;",
    'COPY "auth"."identities" (id) FROM stdin;',
    "COPY auth.mfa_factors (id) FROM stdin;",
    "COPY auth.refresh_tokens (id) FROM stdin;",
    "COPY auth.sessions (id) FROM stdin;",
  ].join("\n");
  const storageDump = [
    "COPY storage.buckets (id) FROM stdin;",
    "COPY storage.buckets_vectors (id) FROM stdin;",
    'COPY "storage"."objects" (id) FROM stdin;',
    "COPY storage.prefixes (bucket_id) FROM stdin;",
    "COPY storage.vector_indexes (id) FROM stdin;",
  ].join("\n");
  const inventory = [
    `auth.identities\t3\t${"1".repeat(64)}`,
    `auth.mfa_factors\t1\t${"2".repeat(64)}`,
    `auth.refresh_tokens\t2\t${"3".repeat(64)}`,
    `auth.sessions\t2\t${"4".repeat(64)}`,
    `auth.users\t2\t${"5".repeat(64)}`,
    `storage.buckets\t4\t${"6".repeat(64)}`,
    `storage.buckets_vectors\t1\t${"9".repeat(64)}`,
    `storage.objects\t9\t${"7".repeat(64)}`,
    `storage.prefixes\t5\t${"8".repeat(64)}`,
    `storage.vector_indexes\t2\t${"a".repeat(64)}`,
  ].join("\n");
  const backedUp = evaluateBackupScope({
    authDataDump: authDump,
    storageDataDump: storageDump,
    sourceInventory: inventory,
  });
  assert.equal(backedUp.schemaVersion, 2);
  assert.equal(backedUp.phase, "source");
  assert.equal(backedUp.auth.tableCount, 5);
  assert.equal(backedUp.auth.rows, 10);
  assert.equal(backedUp.storage.tableCount, 5);
  assert.equal(backedUp.storage.rows, 21);
  assert.equal(backedUp.storage.bucketRows, 4);
  assert.equal(backedUp.storage.objectRows, 9);
  assert.equal(backedUp.auth.restoreVerified, false);
  assert.equal(backedUp.storage.fullRowMetadataFingerprint, true);
  assert.equal(backedUp.containsRawIdentifiers, false);

  const restored = evaluateBackupScope({
    authDataDump: authDump,
    storageDataDump: storageDump,
    sourceInventory: inventory,
    restoredInventory: inventory,
  });
  assert.equal(restored.phase, "restore");
  assert.equal(restored.auth.restoreVerified, true);
  assert.equal(restored.storage.restoreVerified, true);
  assert.equal(restored.sessionReplicationRestoreVerified, true);
  assert.throws(
    () =>
      evaluateBackupScope({
        authDataDump: authDump,
        storageDataDump: storageDump,
        sourceInventory: inventory,
        restoredInventory: inventory.replace("7".repeat(64), "9".repeat(64)),
      }),
    /BACKUP_SCOPE_RESTORE_FINGERPRINT_MISMATCH/,
  );
  assert.throws(
    () =>
      evaluateBackupScope({
        authDataDump: authDump.replace(/^COPY auth\.sessions.*$/m, ""),
        storageDataDump: storageDump,
        sourceInventory: inventory,
      }),
    /BACKUP_SCOPE_DUMP_INVENTORY_MISMATCH/,
  );
});

test("Storage payload backup exports opaque blobs and proves byte-identical local restore", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "gaiatec-storage-backup-test-"));
  const objectsDirectory = join(temporaryDirectory, "objects");
  const indexPath = join(temporaryDirectory, "storage-object-index.json");
  const sourceReportPath = join(temporaryDirectory, "storage-source-report.json");
  const uploadReportPath = join(temporaryDirectory, "storage-upload-report.json");
  const restoreReportPath = join(temporaryDirectory, "storage-restore-report.json");
  const sourceOrigin = "https://abcdefghijklmnopqrst.supabase.co";
  const sourceKey = `sb_secret_${"s".repeat(48)}`;
  const targetKey = legacyServiceRoleKey();
  const fixtures = [
    {
      bucketId: "cms-documents-private",
      name: "nested/relatório final.pdf",
      contentType: "application/pdf",
      cacheControl: "120",
      body: Buffer.from("synthetic-pdf-payload"),
    },
    {
      bucketId: "cms-media-private",
      name: "images/image one.png",
      contentType: "image/png",
      cacheControl: "3600",
      body: Buffer.from([0, 1, 2, 3, 255]),
    },
  ].map((fixture, index) => ({
    ...fixture,
    version: `storage-version-${index + 1}`,
    updatedAt: `2026-09-05T09:5${index}:00.000Z`,
    eTag: createHash("md5").update(fixture.body).digest("hex"),
    checksum: `sha256:${createHash("sha256").update(fixture.body).digest("hex")}`,
  }));
  const downloadByUrl = new Map(
    fixtures.map((fixture) => [
      `${sourceOrigin}/storage/v1/object/authenticated/${encodeURIComponent(fixture.bucketId)}/${fixture.name
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      fixture.body,
    ]),
  );
  const inventorySource = fixtures
    .map((fixture) =>
      JSON.stringify({
        bucketId: fixture.bucketId,
        name: fixture.name,
        size: fixture.body.byteLength,
        contentType: fixture.contentType,
        cacheControl: fixture.cacheControl,
        version: fixture.version,
        updatedAt: fixture.updatedAt,
        eTag: fixture.eTag,
        checksum: fixture.checksum,
      }),
    )
    .join("\n");

  try {
    const exported = await exportStorageObjects({
      inventorySource,
      outputDirectory: objectsDirectory,
      indexPath,
      reportPath: sourceReportPath,
      sourceUrl: sourceOrigin,
      serviceKey: sourceKey,
      fetchImpl: async (url, options) => {
        assert.equal(options.headers.apikey, sourceKey);
        assert.equal(options.headers.Authorization, undefined);
        const body = downloadByUrl.get(String(url));
        return body
          ? new Response(body, { headers: { etag: `"${createHash("md5").update(body).digest("hex")}"` } })
          : new Response(null, { status: 404 });
      },
    });
    assert.equal(exported.objects, fixtures.length);
    assert.equal(
      exported.bytes,
      fixtures.reduce((total, fixture) => total + fixture.body.byteLength, 0),
    );
    assert.equal(exported.exportVerified, true);
    assert.equal(exported.restoreVerified, false);
    assert.equal(exported.snapshotStabilityVerified, false);
    await assert.rejects(
      exportStorageObjects({
        inventorySource: inventorySource.split("\n")[0],
        outputDirectory: join(temporaryDirectory, "etag-mismatch"),
        indexPath: join(temporaryDirectory, "etag-mismatch-index.json"),
        reportPath: join(temporaryDirectory, "etag-mismatch-report.json"),
        sourceUrl: sourceOrigin,
        serviceKey: sourceKey,
        concurrency: 1,
        fetchImpl: async () => new Response(fixtures[0].body, { headers: { etag: `"${"f".repeat(32)}"` } }),
      }),
      (error) => {
        assert.match(error.message, /STORAGE_OBJECT_ETAG_MISMATCH:0/);
        assert.doesNotMatch(error.message, /cms-documents-private|relatório final/);
        return true;
      },
    );
    await assert.rejects(
      exportStorageObjects({
        inventorySource,
        outputDirectory: join(temporaryDirectory, "invalid-key"),
        indexPath: join(temporaryDirectory, "invalid-key-index.json"),
        reportPath: join(temporaryDirectory, "invalid-key-report.json"),
        sourceUrl: sourceOrigin,
        serviceKey: "arbitrary-service-key",
        fetchImpl: () => {
          throw new Error("fetch must not run for an invalid credential");
        },
      }),
      /STORAGE_SOURCE_SERVICE_KEY_REQUIRED/,
    );
    const publicReport = await readFile(sourceReportPath, "utf8");
    for (const fixture of fixtures) {
      assert.doesNotMatch(publicReport, new RegExp(fixture.bucketId));
      assert.doesNotMatch(publicReport, new RegExp(fixture.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const unverifiedIndex = await readFile(indexPath, "utf8");
    assert.match(unverifiedIndex, /relatório final\.pdf/);
    assert.match(unverifiedIndex, /^\{"schemaVersion":2,"sourceSnapshot":null,"entries":\[/);
    assert.doesNotMatch(unverifiedIndex, /service-role-/);

    const snapshotAt = "2026-09-05T09:49:00.000Z";
    const snapshotLsn = "16/B374D848";
    const stability = verifyStorageSnapshotStability({
      beforeInventorySource: inventorySource,
      afterInventorySource: inventorySource,
      indexSource: unverifiedIndex,
      snapshotAt,
      snapshotLsn,
    });
    assert.equal(stability.report.snapshotStabilityVerified, true);
    assert.equal(stability.report.metadataSignals.updatedAt, fixtures.length);
    assert.equal(stability.report.metadataSignals.strongFingerprint, fixtures.length);
    assert.equal(stability.report.metadataSignals.contentFingerprint, fixtures.length);
    assert.equal(stability.index.sourceSnapshot.snapshotAt, snapshotAt);
    assert.equal(stability.index.sourceSnapshot.walLsn, snapshotLsn);
    assert.equal(stability.report.snapshotAt, snapshotAt);
    assert.equal(stability.report.snapshotWalLsn, snapshotLsn);
    assert.ok(Date.parse(stability.report.snapshotVerifiedAt) >= Date.parse(snapshotAt));
    const stabilityReport = JSON.stringify(stability.stabilityReport);
    for (const fixture of fixtures) {
      assert.doesNotMatch(stabilityReport, new RegExp(fixture.bucketId));
      assert.doesNotMatch(stabilityReport, new RegExp(fixture.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const verifiedIndex = JSON.stringify(stability.index);

    const restoredObjects = new Map();
    const targetOrigin = "http://127.0.0.1:54321";
    const restoreFetch = async (url, options = {}) => {
      assert.equal(options.headers.apikey, targetKey);
      assert.equal(options.headers.Authorization, `Bearer ${targetKey}`);
      const canonicalUrl = String(url).replace("/object/authenticated/", "/object/");
      if (options.method === "POST") {
        const chunks = [];
        for await (const chunk of options.body) chunks.push(Buffer.from(chunk));
        restoredObjects.set(canonicalUrl, Buffer.concat(chunks));
        return new Response(null, { status: 200 });
      }
      const body = restoredObjects.get(canonicalUrl);
      return body ? new Response(body) : new Response(null, { status: 404 });
    };
    await assert.rejects(
      restoreStorageObjects({
        indexSource: unverifiedIndex,
        objectsDirectory,
        reportPath: uploadReportPath,
        targetUrl: targetOrigin,
        serviceKey: targetKey,
        fetchImpl: () => {
          throw new Error("fetch must not run for an unverified snapshot");
        },
      }),
      /STORAGE_BACKUP_INDEX_INVALID/,
    );
    const restored = await restoreStorageObjects({
      indexSource: verifiedIndex,
      objectsDirectory,
      reportPath: uploadReportPath,
      targetUrl: targetOrigin,
      serviceKey: targetKey,
      fetchImpl: restoreFetch,
    });
    assert.equal(restored.phase, "upload");
    assert.equal(restored.payloadUploadVerified, true);
    assert.equal(restored.restoreVerified, false);
    assert.equal(restored.metadataReappliedAfterUpload, false);
    assert.equal(restored.aggregateSha256, exported.aggregateSha256);
    assert.equal(restoredObjects.size, fixtures.length);
    const uploadReport = await readFile(uploadReportPath, "utf8");
    assert.doesNotMatch(uploadReport, /cms-documents-private|relatório final\.pdf/);

    const metadataRestoreReport = {
      schemaVersion: 2,
      phase: "restore",
      storage: { restoreVerified: true, aggregateSha256: "a".repeat(64) },
    };
    const finalRestored = await verifyRestoredStorageObjects({
      indexSource: verifiedIndex,
      reportPath: restoreReportPath,
      metadataRestoreReport,
      targetUrl: targetOrigin,
      serviceKey: targetKey,
      fetchImpl: restoreFetch,
    });
    assert.equal(finalRestored.phase, "restored");
    assert.equal(finalRestored.restoreVerified, true);
    assert.equal(finalRestored.metadataReappliedAfterUpload, true);
    assert.equal(finalRestored.metadataAggregateSha256, "a".repeat(64));
    assert.equal(finalRestored.aggregateSha256, exported.aggregateSha256);
    const restoredReport = await readFile(restoreReportPath, "utf8");
    assert.doesNotMatch(restoredReport, /cms-documents-private|relatório final\.pdf/);
    const parsedIndex = JSON.parse(verifiedIndex);
    await assert.rejects(
      restoreStorageObjects({
        indexSource: JSON.stringify({
          ...parsedIndex,
          entries: [parsedIndex.entries[0], parsedIndex.entries[0]],
        }),
        objectsDirectory,
        reportPath: uploadReportPath,
        targetUrl: targetOrigin,
        serviceKey: targetKey,
        fetchImpl: () => {
          throw new Error("fetch must not run for an invalid index");
        },
      }),
      /STORAGE_BACKUP_INDEX_DUPLICATED/,
    );
    const firstBlob = (await readdir(objectsDirectory)).find((name) => name.startsWith("00000000-"));
    assert.ok(firstBlob);
    await writeFile(join(objectsDirectory, firstBlob), "tampered");
    await assert.rejects(
      restoreStorageObjects({
        indexSource: verifiedIndex,
        objectsDirectory,
        reportPath: uploadReportPath,
        targetUrl: targetOrigin,
        serviceKey: targetKey,
        fetchImpl: restoreFetch,
        concurrency: 1,
      }),
      (error) => {
        assert.match(error.message, /STORAGE_BACKUP_BLOB_MISMATCH:0/);
        assert.doesNotMatch(error.message, /cms-documents-private|relatório final\.pdf/);
        return true;
      },
    );
    await assert.rejects(
      restoreStorageObjects({
        indexSource: verifiedIndex,
        objectsDirectory,
        reportPath: uploadReportPath,
        targetUrl: "https://remote-project.supabase.co",
        serviceKey: targetKey,
        fetchImpl: restoreFetch,
      }),
      /STORAGE_TARGET_MUST_BE_LOCAL/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Storage snapshot proof fails closed on every pre/post race and download binding mismatch", () => {
  const body = Buffer.from("synthetic-stable-object");
  const md5 = createHash("md5").update(body).digest("hex");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const before = {
    bucketId: "private-synthetic-bucket",
    name: "qa/synthetic-object.bin",
    size: body.byteLength,
    contentType: "application/octet-stream",
    cacheControl: "3600",
    version: "version-7",
    updatedAt: "2026-09-05T09:49:00.000Z",
    eTag: md5,
    checksum: `sha256:${sha256}`,
  };
  const index = {
    schemaVersion: 2,
    sourceSnapshot: null,
    entries: [
      {
        bucketId: before.bucketId,
        name: before.name,
        contentType: before.contentType,
        cacheControl: before.cacheControl,
        backupFile: `00000000-${"a".repeat(64)}.blob`,
        sourceVersion: before.version,
        sourceUpdatedAt: before.updatedAt,
        sourceEtag: before.eTag,
        sourceChecksum: before.checksum,
        responseEtag: md5,
        bytes: body.byteLength,
        sha256,
        md5,
      },
    ],
  };
  const verify = (after = before, candidateIndex = index) =>
    verifyStorageSnapshotStability({
      beforeInventorySource: JSON.stringify(before),
      afterInventorySource: JSON.stringify(after),
      indexSource: JSON.stringify(candidateIndex),
      snapshotAt: "2026-09-05T09:49:00.000Z",
      snapshotLsn: "16/B374D848",
    });

  assert.equal(verify().stabilityReport.beforeAfterExact, true);
  for (const [field, value] of [
    ["version", "version-8"],
    ["updatedAt", "2026-09-05T09:50:00.000Z"],
    ["eTag", "b".repeat(32)],
    ["checksum", `sha256:${"c".repeat(64)}`],
  ]) {
    assert.throws(
      () => verify({ ...before, [field]: value }),
      (error) => {
        assert.match(error.message, /STORAGE_SNAPSHOT_METADATA_CHANGED:0/);
        assert.doesNotMatch(error.message, /private-synthetic-bucket|synthetic-object/);
        return true;
      },
    );
  }
  assert.throws(
    () =>
      verifyStorageSnapshotStability({
        beforeInventorySource: JSON.stringify(before),
        afterInventorySource: [before, { ...before, name: "qa/added.bin" }]
          .map((entry) => JSON.stringify(entry))
          .join("\n"),
        indexSource: JSON.stringify(index),
        snapshotAt: "2026-09-05T09:49:00.000Z",
        snapshotLsn: "16/B374D848",
      }),
    /STORAGE_SNAPSHOT_CARDINALITY_CHANGED/,
  );
  assert.throws(() => verify({ ...before, name: "qa/replaced.bin" }), /STORAGE_SNAPSHOT_IDENTITY_CHANGED:0/);
  assert.throws(
    () =>
      verify(before, {
        ...index,
        entries: [{ ...index.entries[0], responseEtag: "d".repeat(32) }],
      }),
    /STORAGE_SNAPSHOT_DOWNLOAD_BINDING_INVALID:0/,
  );
  assert.throws(
    () =>
      verifyStorageSnapshotStability({
        beforeInventorySource: JSON.stringify({
          ...before,
          version: null,
          eTag: null,
          checksum: null,
        }),
        afterInventorySource: JSON.stringify(before),
        indexSource: JSON.stringify(index),
        snapshotAt: "2026-09-05T09:49:00.000Z",
        snapshotLsn: "16/B374D848",
      }),
    /STORAGE_INVENTORY_INVALID/,
  );
});


// Catalogo sintetico de papeis coerente com fingerprint-roles.sql e fingerprint-roles-detail.sql: o
// agregado e, por construcao, o sha256 da concatenacao dos hashes por papel em ordem. Um fixture que
// nao respeitasse isso passaria a testar um acordo que a producao nao tem.
function roleCatalog(roles) {
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const detail = roles
    .map((role) => ({
      nameHash: digest(`name:${role.name}`),
      fingerprint: digest(`role:${role.name}:${role.attributes ?? "base"}`),
      profile: {
        superuser: role.superuser ?? false,
        canLogin: role.canLogin ?? true,
        connectionLimit: role.connectionLimit ?? -1,
        memberOf: (role.memberOf ?? []).map((parent) => ({
          role: digest(`name:${parent}`),
          adminOption: false,
        })),
      },
    }))
    .sort((left, right) => (left.fingerprint < right.fingerprint ? -1 : 1));
  return {
    aggregate: `${detail.length}\t${digest(detail.map((role) => role.fingerprint).join(""))}\n`,
    detailSource: `${detail
      .map((role) => `${role.nameHash}\t${role.fingerprint}\t${JSON.stringify(role.profile)}`)
      .join("\n")}\n`,
  };
}

const PRODUCTION_ROLES = [
  { name: "postgres" },
  { name: "authenticator" },
  { name: "anon" },
  { name: "authenticated" },
  { name: "service_role" },
  { name: "supabase_admin" },
  { name: "supabase_auth_admin" },
  { name: "supabase_storage_admin" },
];

test("role evidence detects source races and states the portable restore limitation honestly", () => {
  const catalog = roleCatalog(PRODUCTION_ROLES);
  const fingerprint = catalog.aggregate;
  const source = buildRoleSourceReport({
    beforeSource: fingerprint,
    afterSource: fingerprint,
    roleDump: Buffer.from("synthetic role dump"),
  });
  const restored = buildRoleRestoreReport({
    sourceReport: source,
    restoredSource: fingerprint,
    sourceDetail: catalog.detailSource,
    restoredDetail: catalog.detailSource,
  });
  assert.equal(source.raceVerified, true);
  assert.equal(source.credentialsIncludedInFingerprint, false);
  assert.equal(restored.portableRoleCatalogMatched, true);
  assert.equal(restored.rolesRestoredExactly, false);
  assert.equal(restored.credentialsRestored, false);
  assert.equal(restored.platformManagedGucSettingsRestored, false);
  assert.equal(restored.limitation, "role-passwords-and-role-settings-are-not-restored");
  assert.throws(
    () =>
      buildRoleSourceReport({
        beforeSource: fingerprint,
        afterSource: `8\t${"8".repeat(64)}\n`,
        roleDump: Buffer.from("synthetic role dump"),
      }),
    /BACKUP_ROLE_CATALOG_RACED/,
  );
});


test("a role restore divergence names what diverged without naming a role", () => {
  const catalog = roleCatalog(PRODUCTION_ROLES);
  const source = buildRoleSourceReport({
    beforeSource: catalog.aggregate,
    afterSource: catalog.aggregate,
    roleDump: Buffer.from("synthetic role dump"),
  });

  // O alvo efemero perde um papel, tem outro com atributo derivado e ganha um que a origem nao tem:
  // as tres causas produziam antes a mesma mensagem, sem numero nenhum.
  const restoredRoles = [
    ...PRODUCTION_ROLES.slice(1, 7),
    {
      name: "supabase_storage_admin",
      attributes: "connectionLimit=60",
      connectionLimit: 60,
      memberOf: ["authenticator"],
    },
    { name: "pgbouncer" },
    { name: "supabase_read_only_user" },
  ];
  const restoredCatalog = roleCatalog(restoredRoles);

  let thrown;
  try {
    buildRoleRestoreReport({
      sourceReport: source,
      restoredSource: restoredCatalog.aggregate,
      sourceDetail: catalog.detailSource,
      restoredDetail: restoredCatalog.detailSource,
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "uma divergencia de catalogo tem de reprovar o drill");
  assert.match(thrown.message, /^BACKUP_ROLE_RESTORE_FINGERPRINT_MISMATCH: /);

  const divergence = thrown.roleRestoreDivergence;
  assert.equal(divergence.sourceRoleCount, 8);
  assert.equal(divergence.restoredRoleCount, 9);
  assert.equal(divergence.identicalRoles, 6);
  assert.equal(divergence.rolesDriftedInRestore, 1);
  assert.equal(divergence.rolesMissingFromRestore, 1);
  assert.equal(divergence.rolesOnlyInRestore, 2);
  assert.equal(divergence.containsRoleNames, false);
  assert.equal(divergence.described, true);

  // Contagem sozinha nao diz se o dump deixou de levar um papel da aplicacao ou um papel que a
  // plataforma recria: o perfil sem nome e o que separa os dois casos.
  assert.equal(divergence.missingProfiles.length, 1);
  assert.equal(divergence.missingProfiles[0].canLogin, true);
  assert.ok(!("name" in divergence.missingProfiles[0]));
  assert.equal(divergence.extraProfiles.length, 2);
  assert.deepEqual(
    divergence.driftedFields[0].map((entry) => entry.field).sort(),
    ["connectionLimit", "memberOf"],
  );
  const connectionLimit = divergence.driftedFields[0].find(
    (entry) => entry.field === "connectionLimit",
  );
  assert.equal(connectionLimit.source, -1);
  assert.equal(connectionLimit.restored, 60);
  const memberOf = divergence.driftedFields[0].find((entry) => entry.field === "memberOf");
  assert.equal(memberOf.sourceCount, 0);
  assert.equal(memberOf.restoredCount, 1);

  // A mensagem viaja em log de workflow: nenhum nome de papel e nenhum hash podem sair nela.
  for (const name of [...PRODUCTION_ROLES, ...restoredRoles].map((role) => role.name))
    assert.ok(!thrown.message.includes(name), `nome ${name} vazou na mensagem`);
  assert.doesNotMatch(thrown.message, /[a-f0-9]{64}/);
});

test("the per-role detail is not taken on trust: it has to rebuild the aggregate", () => {
  const catalog = roleCatalog(PRODUCTION_ROLES);
  const source = buildRoleSourceReport({
    beforeSource: catalog.aggregate,
    afterSource: catalog.aggregate,
    roleDump: Buffer.from("synthetic role dump"),
  });
  const foreign = roleCatalog([...PRODUCTION_ROLES.slice(0, 7), { name: "dashboard_user" }]);

  // Detalhe de um catalogo, agregado de outro: sem esta verificacao a comparacao descreveria uma
  // divergencia que nao e a que reprovou, e a leitura do log apontaria para o lugar errado.
  assert.throws(
    () =>
      buildRoleRestoreReport({
        sourceReport: source,
        restoredSource: catalog.aggregate,
        sourceDetail: foreign.detailSource,
        restoredDetail: catalog.detailSource,
      }),
    /BACKUP_ROLE_SOURCE_DETAIL_INCONSISTENT/,
  );
  assert.throws(
    () =>
      buildRoleRestoreReport({
        sourceReport: source,
        restoredSource: catalog.aggregate,
        sourceDetail: catalog.detailSource,
        restoredDetail: foreign.detailSource,
      }),
    /BACKUP_ROLE_RESTORED_DETAIL_INCONSISTENT/,
  );
  assert.throws(
    () =>
      buildRoleRestoreReport({
        sourceReport: source,
        restoredSource: catalog.aggregate,
      }),
    /BACKUP_ROLE_DETAIL_REQUIRED/,
  );
});

test("a malformed source report no longer reads as a restore divergence", () => {
  const catalog = roleCatalog(PRODUCTION_ROLES);
  const source = buildRoleSourceReport({
    beforeSource: catalog.aggregate,
    afterSource: catalog.aggregate,
    roleDump: Buffer.from("synthetic role dump"),
  });
  assert.throws(
    () =>
      buildRoleRestoreReport({
        sourceReport: { ...source, raceVerified: false },
        restoredSource: catalog.aggregate,
        sourceDetail: catalog.detailSource,
        restoredDetail: catalog.detailSource,
      }),
    /BACKUP_ROLE_SOURCE_REPORT_INVALID/,
  );
});

test("the detail refuses shapes that would make the rebuild meaningless", () => {
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const line = (name, attributes) =>
    `${digest(name)}\t${digest(attributes)}\t${JSON.stringify({ canLogin: true })}`;
  assert.throws(() => parseRoleDetail(""), /BACKUP_ROLE_DETAIL_INVALID/);
  assert.throws(() => parseRoleDetail(`${digest("a")}\n`), /BACKUP_ROLE_DETAIL_INVALID/);
  // Sem perfil a divergencia volta a ser indescritivel; com nome dentro dele, descreve-la passaria
  // a expor o catalogo de papeis da producao.
  assert.throws(
    () => parseRoleDetail(`${digest("a")}\t${digest("b")}\n`),
    /BACKUP_ROLE_DETAIL_INVALID/,
  );
  assert.throws(
    () => parseRoleDetail(`${digest("a")}\t${digest("b")}\t{"name":"postgres"}\n`),
    /BACKUP_ROLE_DETAIL_PROFILE_INVALID/,
  );
  assert.throws(
    () => parseRoleDetail(`${digest("a")}\t${digest("b")}\t[]\n`),
    /BACKUP_ROLE_DETAIL_PROFILE_INVALID/,
  );
  // A ordem tem de vir do valor do hash, nao do rotulo: montar o par ja ordenado e emiti-lo ao
  // contrario e a unica forma estavel de exercitar a recusa.
  const ordered = [line("a", "first"), line("b", "second")].sort();
  assert.throws(
    () => parseRoleDetail(`${ordered[1]}\n${ordered[0]}\n`),
    /BACKUP_ROLE_DETAIL_UNORDERED/,
  );
  assert.throws(
    () => parseRoleDetail(`${line("a", "same")}\n${line("b", "same")}\n`),
    /BACKUP_ROLE_DETAIL_DUPLICATED/,
  );
});

test("an identical catalog reports every role as identical", () => {
  const catalog = roleCatalog(PRODUCTION_ROLES);
  const roles = parseRoleDetail(catalog.detailSource);
  assert.deepEqual(describeRoleDivergence(roles, roles), {
    sourceRoleCount: 8,
    restoredRoleCount: 8,
    identicalRoles: 8,
    rolesDriftedInRestore: 0,
    rolesMissingFromRestore: 0,
    rolesOnlyInRestore: 0,
    missingProfiles: [],
    extraProfiles: [],
    driftedFields: [],
    described: true,
    containsRoleNames: false,
  });
});

test("both role fingerprint queries derive from one canonical role shape", async () => {
  const [aggregate, detail] = await Promise.all([
    read(new URL("./fingerprint-roles.sql", import.meta.url)),
    read(new URL("./fingerprint-roles-detail.sql", import.meta.url)),
  ]);
  // Se as duas SQLs derivarem, o detalhe deixa de descrever o agregado que reprovou. A verificacao em
  // tempo de execucao ja recusa isso; aqui a divergencia morre antes de custar um drill.
  const canonical = (source) =>
    source.slice(source.indexOf("with role_records as ("), source.indexOf("), role_hashes as ("));
  assert.equal(canonical(aggregate), canonical(detail));
  assert.ok(canonical(aggregate).includes("rolbypassrls"));
  assert.match(detail, /select name_hash \|\| chr\(9\) \|\| fingerprint \|\| chr\(9\) \|\| attributes/);
  assert.match(detail, /order by fingerprint;/);
  // O perfil so pode sair sem o nome e com os vinculos ja em hash.
  assert.match(detail, /\(canonical - 'name'\)/);
  assert.match(detail, /'role', encode\(extensions\.digest\(convert_to\(entry ->> 'role'/);
});

test("backup manifest seals the archive and binds distinct source and restore evidence", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "gaiatec-backup-manifest-test-"));
  const runId = "34000214134";
  const runAttempt = 2;
  const archivePath = join(
    temporaryDirectory,
    `supabase-production-backup-${runId}-${runAttempt}.tar.gz.gpg`,
  );
  const archiveSealPath = join(temporaryDirectory, "archive-seal.json");
  const sourceScopePath = join(temporaryDirectory, "backup-source-scope.json");
  const restoreScopePath = join(temporaryDirectory, "backup-restore-scope.json");
  const sourceStoragePath = join(temporaryDirectory, "storage-source-report.json");
  const restoreStoragePath = join(temporaryDirectory, "storage-restore-report.json");
  const storageStabilityPath = join(temporaryDirectory, "storage-snapshot-stability.json");
  const sourceRolesPath = join(temporaryDirectory, "role-source-report.json");
  const restoreRolesPath = join(temporaryDirectory, "role-restore-report.json");
  const manifestPath = join(temporaryDirectory, "manifest.json");
  const manifestScript = fileURLToPath(new URL("./write-backup-manifest.mjs", import.meta.url));
  const snapshotAt = "2026-09-05T09:55:00.000Z";
  const snapshotWalLsn = "16/B374D848";
  const snapshotVerifiedAt = "2026-09-05T09:56:00.000Z";
  const metadataSignals = {
    version: 2,
    etag: 2,
    checksum: 2,
    updatedAt: 2,
    strongFingerprint: 2,
    contentFingerprint: 2,
  };
  const authDump = [
    "COPY auth.users (id) FROM stdin;",
    "COPY auth.identities (id) FROM stdin;",
    "COPY auth.mfa_factors (id) FROM stdin;",
  ].join("\n");
  const storageDump = ["COPY storage.buckets (id) FROM stdin;", "COPY storage.objects (id) FROM stdin;"].join(
    "\n",
  );
  const inventory = [
    `auth.identities\t2\t${"1".repeat(64)}`,
    `auth.mfa_factors\t1\t${"2".repeat(64)}`,
    `auth.users\t3\t${"3".repeat(64)}`,
    `storage.buckets\t2\t${"4".repeat(64)}`,
    `storage.objects\t2\t${"5".repeat(64)}`,
  ].join("\n");
  const sourceScope = evaluateBackupScope({
    authDataDump: authDump,
    storageDataDump: storageDump,
    sourceInventory: inventory,
  });
  const restoreScope = evaluateBackupScope({
    authDataDump: authDump,
    storageDataDump: storageDump,
    sourceInventory: inventory,
    restoredInventory: inventory,
  });
  const sourceStorage = {
    schemaVersion: 1,
    event: "supabase.storage.payloads.source-verified",
    phase: "source",
    objects: 2,
    bytes: 42,
    aggregateSha256: "d".repeat(64),
    exportVerified: true,
    payloadUploadVerified: false,
    restoreVerified: false,
    metadataReappliedAfterUpload: false,
    metadataAggregateSha256: null,
    snapshotStabilityVerified: true,
    snapshotAt,
    snapshotWalLsn,
    snapshotVerifiedAt,
    snapshotMetadataAggregateSha256: "e".repeat(64),
    metadataSignals,
    restoreTarget: null,
    containsObjectNames: false,
    containsBucketIdentifiers: false,
  };
  const restoreStorage = {
    ...sourceStorage,
    event: "supabase.storage.payloads.restored-verified",
    phase: "restored",
    payloadUploadVerified: true,
    restoreVerified: true,
    metadataReappliedAfterUpload: true,
    metadataAggregateSha256: restoreScope.storage.aggregateSha256,
    restoreTarget: "ephemeral-local-supabase",
  };
  const storageStability = {
    schemaVersion: 1,
    event: "supabase.storage.snapshot-stability.verified",
    snapshotAt,
    walLsn: snapshotWalLsn,
    verifiedAt: snapshotVerifiedAt,
    objects: 2,
    metadataSignals,
    metadataAggregateSha256: sourceStorage.snapshotMetadataAggregateSha256,
    beforeAfterExact: true,
    downloadsBoundToSnapshot: true,
    containsObjectNames: false,
    containsBucketIdentifiers: false,
  };
  const roleCatalogFixture = roleCatalog(PRODUCTION_ROLES);
  const roleFingerprint = roleCatalogFixture.aggregate;
  const sourceRoles = buildRoleSourceReport({
    beforeSource: roleFingerprint,
    afterSource: roleFingerprint,
    roleDump: Buffer.from("synthetic role dump"),
  });
  const restoreRoles = buildRoleRestoreReport({
    sourceReport: sourceRoles,
    restoredSource: roleFingerprint,
    sourceDetail: roleCatalogFixture.detailSource,
    restoredDetail: roleCatalogFixture.detailSource,
  });
  const environment = {
    ...process.env,
    BACKUP_ARCHIVE_PATH: archivePath,
    BACKUP_ARCHIVE_SEAL_PATH: archiveSealPath,
    BACKUP_MANIFEST_PATH: manifestPath,
    BACKUP_SOURCE_SCOPE_REPORT_PATH: sourceScopePath,
    BACKUP_RESTORE_SCOPE_REPORT_PATH: restoreScopePath,
    STORAGE_SOURCE_REPORT_PATH: sourceStoragePath,
    STORAGE_RESTORE_REPORT_PATH: restoreStoragePath,
    STORAGE_STABILITY_REPORT_PATH: storageStabilityPath,
    ROLE_SOURCE_REPORT_PATH: sourceRolesPath,
    ROLE_RESTORE_REPORT_PATH: restoreRolesPath,
    RESTORE_DRILL_PERFORMED: "true",
    RESTORE_DRILL_PASSED: "true",
    RESTORE_DRILL_STARTED_AT: "2026-09-05T10:00:00.000Z",
    RESTORE_DRILL_COMPLETED_AT: "2026-09-05T10:02:00.000Z",
    RESTORE_DRILL_DURATION_SECONDS: "120",
    BACKUP_SNAPSHOT_AT: snapshotAt,
    BACKUP_SNAPSHOT_LSN: snapshotWalLsn,
    GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: String(runAttempt),
    GITHUB_WORKFLOW: "Backup Supabase production",
    GITHUB_WORKFLOW_REF: "Vnd93/gaiatec-cms/.github/workflows/backup-supabase-production.yml@refs/heads/main",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: sha,
  };
  const archiveBytes = Buffer.from("encrypted-synthetic-archive");
  try {
    await writeFile(archivePath, archiveBytes);
    const archiveSeal = await createBackupArchiveSeal(archivePath, {
      now: new Date("2026-09-05T09:59:00.000Z"),
    });
    await Promise.all([
      writeFile(archiveSealPath, JSON.stringify(archiveSeal)),
      writeFile(sourceScopePath, JSON.stringify(sourceScope)),
      writeFile(restoreScopePath, JSON.stringify(restoreScope)),
      writeFile(sourceStoragePath, JSON.stringify(sourceStorage)),
      writeFile(restoreStoragePath, JSON.stringify(restoreStorage)),
      writeFile(storageStabilityPath, JSON.stringify(storageStability)),
      writeFile(sourceRolesPath, JSON.stringify(sourceRoles)),
      writeFile(restoreRolesPath, JSON.stringify(restoreRoles)),
    ]);
    assert.equal((await verifyBackupArchiveSeal(archivePath, archiveSeal)).valid, true);
    const completed = await execFileAsync(process.execPath, [manifestScript], { env: environment });
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(manifest.schemaVersion, 3);
    assert.equal(manifest.workflow.runId, runId);
    assert.equal(manifest.workflow.runAttempt, runAttempt);
    assert.equal(manifest.restoreDrill.durationSeconds, 120);
    assert.equal(manifest.snapshotAt, snapshotAt);
    assert.equal(manifest.snapshotWalLsn, snapshotWalLsn);
    assert.equal(manifest.archiveHashedAt, archiveSeal.hashedAt);
    assert.equal(manifest.encryptedArchive.sha256, archiveSeal.sha256);
    assert.match(manifest.encryptedArchive.sealSha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.createdAt, manifest.sealedAt);
    assert.equal(manifest.completeDataRestoreDrill, true);
    assert.equal(manifest.completeDisasterRecovery, false);
    assert.equal(manifest.coverage.storage.objectPayloads.metadataReappliedAfterUpload, true);
    assert.equal(
      manifest.coverage.storage.objectPayloads.metadataAggregateSha256,
      manifest.coverage.storage.metadata.aggregateSha256,
    );
    for (const binding of [
      ...Object.values(manifest.reports.source),
      ...Object.values(manifest.reports.restore),
    ]) {
      assert.match(binding.sha256, /^[a-f0-9]{64}$/);
      assert.ok(binding.bytes > 0);
    }
    const evidence = buildProductionBackupEvidence(manifest, {
      manifestBytes,
      now: new Date(Date.parse(manifest.sealedAt) + 1_000),
    });
    assert.equal(evidence.backup.snapshotAt, manifest.snapshotAt);
    assert.equal(evidence.backup.snapshotVerifiedAt, sourceStorage.snapshotVerifiedAt);
    assert.equal(evidence.artifact.encryptedArchiveSealSha256, manifest.encryptedArchive.sealSha256);
    assert.deepEqual(evidence.reportDigests, manifest.reports);
    assert.equal(evidence.roleRestore.rolesRestoredExactly, false);
    assert.doesNotMatch(completed.stdout, /bucket|objectName|service-role/i);

    await writeFile(restoreStoragePath, JSON.stringify({ ...restoreStorage, objects: 1 }));
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], { env: environment }),
      /STORAGE_RESTORE_REPORT_INVALID/,
    );
    await writeFile(restoreStoragePath, JSON.stringify(restoreStorage));
    await writeFile(archivePath, Buffer.concat([archiveBytes, Buffer.from("tampered")]));
    assert.equal((await verifyBackupArchiveSeal(archivePath, archiveSeal)).valid, false);
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], { env: environment }),
      /BACKUP_ARCHIVE_SEAL_MISMATCH/,
    );
    await writeFile(archivePath, archiveBytes);
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], {
        env: { ...environment, GITHUB_REF: "refs/heads/not-main" },
      }),
      /BACKUP_GITHUB_ACTIONS_CONTEXT_INVALID/,
    );
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], {
        env: { ...environment, RESTORE_DRILL_DURATION_SECONDS: "1" },
      }),
      /RESTORE_DRILL_TIMING_INVALID/,
    );
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], {
        env: { ...environment, BACKUP_SNAPSHOT_AT: "" },
      }),
      /BACKUP_SNAPSHOT_IDENTITY_INVALID/,
    );
    await writeFile(
      storageStabilityPath,
      JSON.stringify({ ...storageStability, metadataAggregateSha256: "f".repeat(64) }),
    );
    await assert.rejects(
      execFileAsync(process.execPath, [manifestScript], { env: environment }),
      /STORAGE_STABILITY_REPORT_INVALID/,
    );
    await writeFile(storageStabilityPath, JSON.stringify(storageStability));

    const rpoFixture = structuredClone(manifest);
    rpoFixture.snapshotAt = "2026-09-05T09:40:00.000Z";
    rpoFixture.archiveHashedAt = "2026-09-05T09:40:45.000Z";
    rpoFixture.coverage.storage.objectPayloads.snapshotAt = rpoFixture.snapshotAt;
    rpoFixture.coverage.storage.objectPayloads.snapshotVerifiedAt = "2026-09-05T09:40:30.000Z";
    rpoFixture.restoreDrill.startedAt = "2026-09-05T09:41:00.000Z";
    rpoFixture.restoreDrill.completedAt = "2026-09-05T09:43:00.000Z";
    rpoFixture.createdAt = "2026-09-05T09:59:00.000Z";
    rpoFixture.sealedAt = rpoFixture.createdAt;
    assert.equal(
      validateProductionBackupManifest(rpoFixture, {
        now: new Date("2026-09-05T10:00:00.000Z"),
        maxAgeMinutes: 30,
        rtoMinutes: 3,
      }).valid,
      true,
    );
    assert.match(
      validateProductionBackupManifest(rpoFixture, {
        now: new Date("2026-09-05T10:00:00.000Z"),
        maxAgeMinutes: 15,
        rtoMinutes: 3,
      }).violations.join(","),
      /backup_manifest_rpo_expired/,
    );
    assert.match(
      validateProductionBackupManifest(rpoFixture, {
        now: new Date("2026-09-05T10:00:00.000Z"),
        maxAgeMinutes: 30,
        rtoMinutes: 1,
      }).violations.join(","),
      /backup_manifest_rto_exceeded/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("real email provider is Resend with verified sending and corporate recipient boundaries", () => {
  const config = {
    provider: "resend",
    from: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
    sendingDomain: "gaiatecsistemas.com",
    siteOrigin: "https://gaiatecsistemas.com.br",
    notificationTo: "comercial@gaiatecsistemas.com.br",
    apiKey: `re_${"x".repeat(32)}`,
  };
  assert.equal(validateEmailProviderConfig(config).valid, true);
  assert.equal(
    validateResendDomainResponse({
      data: [{ id: "domain-1", name: "gaiatecsistemas.com", status: "verified" }],
    }).valid,
    true,
  );
  assert.match(
    validateEmailProviderConfig({ ...config, notificationTo: "external@example.net" }).violations.join(","),
    /notification_recipient_invalid/,
  );
  assert.match(
    validateResendDomainResponse({
      data: [{ name: "gaiatecsistemas.com", status: "pending" }],
    }).violations.join(","),
    /resend_domain_not_verified/,
  );
});

test("production email evidence hashes approval bindings and persists no raw recipient or delivery id", async () => {
  const from = "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>";
  const notificationTo = "operador-qa@gaiatecsistemas.com.br";
  const syntheticTo = "caixa-sintetica-qa@gaiatecsistemas.com.br";
  const deliveryId = "resend-private-delivery-123456";
  const apiKey = `re_${"p".repeat(32)}`;
  const verificationAt = "2026-09-07T12:00:00.000Z";
  const subject = `GAIATEC CMS — verificação sintética ${sha.slice(0, 12)}`;
  const emailEnvironment = {
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM: from,
    EMAIL_SENDING_DOMAIN: "gaiatecsistemas.com",
    PRODUCTION_SITE_ORIGIN: "https://gaiatecsistemas.com.br",
    LEAD_NOTIFICATION_TO: notificationTo,
    EMAIL_SYNTHETIC_TO: syntheticTo,
    RESEND_API_KEY: apiKey,
    CANDIDATE_SHA: sha,
    GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
    GITHUB_WORKFLOW: "Verify production email provider",
    GITHUB_WORKFLOW_REF: "Vnd93/gaiatec-cms/.github/workflows/verify-production-email.yml@refs/heads/main",
    GITHUB_RUN_ID: "34000214200",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: sha,
  };
  let requests = 0;
  let idempotencyKey = "";
  const report = await verifyEmailProvider({
    environment: emailEnvironment,
    fetchImpl: async (_url, options) => {
      requests += 1;
      if (requests === 1) {
        idempotencyKey = options.headers["Idempotency-Key"];
        return new Response(JSON.stringify({ id: deliveryId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id: deliveryId,
          to: [syntheticTo],
          from,
          subject,
          created_at: verificationAt,
          last_event: "delivered",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
    wait: async () => {
      throw new Error("unexpected retry");
    },
    now: () => new Date(verificationAt),
  });
  const artifactAndLog = serializeEmailEvidence(report);

  assert.equal(requests, 2);
  assert.equal(report.schemaVersion, 3);
  assert.deepEqual(report.approvalBindings, {
    fromSha256: emailEvidenceSha256(from),
    notificationToSha256: emailEvidenceSha256(notificationTo),
    syntheticDeliveryIdSha256: emailEvidenceSha256(deliveryId),
  });
  assert.equal(idempotencyKey, productionEmailIdempotencyKey(sha, emailEnvironment.GITHUB_RUN_ID, 1));
  assert.equal(report.idempotencyKeySha256, emailEvidenceSha256(idempotencyKey));
  assert.equal(report.syntheticRecipientSha256, emailEvidenceSha256(syntheticTo));
  assert.equal(report.verificationStartedAt, verificationAt);
  assert.equal(report.syntheticDeliveryCreatedAt, verificationAt);
  assert.equal(report.deliveryFreshnessProven, true);
  assert.equal(report.rawIdentifiersPersisted, false);
  for (const rawValue of [from, notificationTo, syntheticTo, deliveryId, apiKey])
    assert.equal(artifactAndLog.includes(rawValue), false);
  for (const forbiddenField of ['"from"', '"notificationTo"', '"syntheticTo"', '"syntheticDeliveryId"'])
    assert.equal(artifactAndLog.includes(forbiddenField), false);

  let pendingRequests = 0;
  await assert.rejects(
    verifyEmailProvider({
      environment: emailEnvironment,
      fetchImpl: async () => {
        pendingRequests += 1;
        return pendingRequests === 1
          ? new Response(JSON.stringify({ id: deliveryId }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          : new Response(
              JSON.stringify({
                id: deliveryId,
                to: [syntheticTo],
                from,
                subject,
                created_at: verificationAt,
                last_event: syntheticTo,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
      },
      wait: async () => undefined,
      now: () => new Date(verificationAt),
    }),
    (error) => {
      assert.match(error.message, /PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_TIMEOUT:unknown/);
      assert.equal(error.message.includes(syntheticTo), false);
      assert.equal(error.message.includes(deliveryId), false);
      return true;
    },
  );

  let unreadableRequests = 0;
  await assert.rejects(
    verifyEmailProvider({
      environment: emailEnvironment,
      fetchImpl: async () => {
        unreadableRequests += 1;
        return unreadableRequests === 1
          ? new Response(JSON.stringify({ id: deliveryId }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          : new Response(null, { status: 401 });
      },
      wait: async () => undefined,
    }),
    /PRODUCTION_EMAIL_SYNTHETIC_STATUS_UNREADABLE:401/,
  );
});

test("production email reruns use distinct idempotency and reject stale provider evidence", async () => {
  const from = "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>";
  const syntheticTo = "caixa-sintetica-qa@gaiatecsistemas.com.br";
  const deliveryId = "resend-private-delivery-rerun-123456";
  const verificationAt = "2026-09-07T12:00:00.000Z";
  const subject = `GAIATEC CMS — verificação sintética ${sha.slice(0, 12)}`;
  const baseEnvironment = {
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM: from,
    EMAIL_SENDING_DOMAIN: "gaiatecsistemas.com",
    PRODUCTION_SITE_ORIGIN: "https://gaiatecsistemas.com.br",
    LEAD_NOTIFICATION_TO: "operador-qa@gaiatecsistemas.com.br",
    EMAIL_SYNTHETIC_TO: syntheticTo,
    RESEND_API_KEY: `re_${"r".repeat(32)}`,
    CANDIDATE_SHA: sha,
    GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
    GITHUB_WORKFLOW: "Verify production email provider",
    GITHUB_WORKFLOW_REF: "Vnd93/gaiatec-cms/.github/workflows/verify-production-email.yml@refs/heads/main",
    GITHUB_RUN_ID: "34000214200",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: sha,
  };
  const keys = [];
  for (const runAttempt of ["1", "2"]) {
    let requests = 0;
    await verifyEmailProvider({
      environment: { ...baseEnvironment, GITHUB_RUN_ATTEMPT: runAttempt },
      fetchImpl: async (_url, options) => {
        requests += 1;
        if (requests === 1) {
          keys.push(options.headers["Idempotency-Key"]);
          return new Response(JSON.stringify({ id: deliveryId }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: deliveryId,
            to: [syntheticTo],
            from,
            subject,
            created_at: verificationAt,
            last_event: "delivered",
          }),
          { status: 200 },
        );
      },
      now: () => new Date(verificationAt),
    });
  }
  assert.deepEqual(keys, [
    productionEmailIdempotencyKey(sha, baseEnvironment.GITHUB_RUN_ID, 1),
    productionEmailIdempotencyKey(sha, baseEnvironment.GITHUB_RUN_ID, 2),
  ]);

  let staleRequests = 0;
  await assert.rejects(
    verifyEmailProvider({
      environment: { ...baseEnvironment, GITHUB_RUN_ATTEMPT: "3" },
      fetchImpl: async () => {
        staleRequests += 1;
        return staleRequests === 1
          ? new Response(JSON.stringify({ id: deliveryId }), { status: 200 })
          : new Response(
              JSON.stringify({
                id: deliveryId,
                to: [syntheticTo],
                from,
                subject,
                created_at: "2026-09-07T11:50:00.000Z",
                last_event: "delivered",
              }),
              { status: 200 },
            );
      },
      now: () => new Date(verificationAt),
    }),
    /PRODUCTION_EMAIL_SYNTHETIC_REMOTE_TIMESTAMP_REFUSED/,
  );
});

test("production email dispatch rejects invalid ref, SHA or literal before checkout and external send", async () => {
  const workflow = await read(".github/workflows/verify-production-email.yml");
  const jobStart = workflow.indexOf("  verify:");
  const stepsStart = workflow.indexOf("    steps:", jobStart);
  const validation = workflow.indexOf(
    "Validate production email dispatch authorization before any external request",
  );
  const checkout = workflow.indexOf("actions/checkout@", stepsStart);
  const providerRequest = workflow.indexOf("verify-email-provider.mjs", stepsStart);

  assert.ok(jobStart >= 0 && stepsStart > jobStart);
  assert.doesNotMatch(workflow.slice(jobStart, stepsStart), /\n\s+if:/);
  assert.ok(validation > stepsStart && validation < checkout && checkout < providerRequest);
  assert.match(workflow, /DISPATCH_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(workflow, /VERIFY-RESEND-PRODUCTION:\$CANDIDATE_SHA/);
  assert.match(workflow, /if \[ "\$DISPATCH_REF" != "refs\/heads\/main" \]/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$CANDIDATE_SHA"/);
  assert.match(workflow, /Prove synthetic email delivery without customer data/);
  assert.doesNotMatch(workflow, /send acceptance/);
  assert.ok((workflow.match(/exit 1/g) ?? []).length >= 3);
});

test("production backup dispatch and schedules fail closed before checkout", async () => {
  const workflow = await read(".github/workflows/backup-supabase-production.yml");
  const jobStart = workflow.indexOf("  backup:");
  const stepsStart = workflow.indexOf("    steps:", jobStart);
  const validation = workflow.indexOf("Validate production backup trigger before any external request");
  const checkout = workflow.indexOf("actions/checkout@", stepsStart);

  assert.ok(jobStart >= 0 && stepsStart > jobStart);
  assert.doesNotMatch(workflow.slice(jobStart, stepsStart), /\n\s+if:/);
  assert.ok(validation > stepsStart && validation < checkout);
  assert.match(workflow, /DISPATCH_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /\[ "\$DISPATCH_REF" != "refs\/heads\/main" \]/);
  assert.match(workflow, /workflow_dispatch\)/);
  assert.match(workflow, /17 3 \* \* \*/);
  assert.match(workflow, /47 3 \* \* 0/);
  assert.match(workflow, /Production backup trigger is not approved/);
});

test("sending-only Resend credentials fail closed because delivery cannot be proven", () => {
  assert.deepEqual(classifyResendDeliveryStatus({ httpStatus: 401 }), {
    outcome: "unreadable",
    terminal: true,
    event: "unreadable-by-sending-only-token",
  });
  assert.equal(
    classifyResendDeliveryStatus({ httpStatus: 200, lastEvent: "delivered" }).outcome,
    "delivered",
  );
  assert.equal(classifyResendDeliveryStatus({ httpStatus: 200, lastEvent: "bounced" }).outcome, "failed");
  assert.equal(classifyResendDeliveryStatus({ httpStatus: 503 }).outcome, "unreadable");
});

test("production readiness requires sole-maintainer, legal and operational controls", () => {
  const controls = readiness();
  assert.equal(validateProductionReadinessControls(controls, { candidateSha: sha }).valid, true);
  const repeatedGap = structuredClone(controls);
  repeatedGap.githubProtection.maintainerLogin = "another-user";
  repeatedGap.githubProtection.soleMaintainerRiskAccepted = false;
  repeatedGap.backupRestore.rtoMinutes = 61;
  repeatedGap.backupRestore.backupSourceSha = "f".repeat(40);
  repeatedGap.dpoLegal.status = "pending";
  repeatedGap.dpoLegal.approverId = "another-user";
  repeatedGap.emailProvider.syntheticDeliveryStatus = "accepted";
  repeatedGap.csp.criticalViolations = 1;
  const violations = validateProductionReadinessControls(repeatedGap, { candidateSha: sha }).violations.join(
    ",",
  );
  assert.match(violations, /github_sole_maintainer_invalid/);
  assert.match(violations, /github_sole_maintainer_risk_not_accepted/);
  assert.match(violations, /restore_rto_invalid/);
  assert.match(violations, /backup_source_sha_candidate_mismatch/);
  assert.match(violations, /dpo_legal_not_approved/);
  assert.match(violations, /dpo_legal_approver_must_match_sole_maintainer/);
  assert.match(violations, /email_synthetic_delivery_not_verified/);
  assert.match(violations, /csp_critical_violation_present/);
});

test("legal scope is hash-bound and the public privacy notice covers production email", async () => {
  const [scope, templateText, privacyNotice] = await Promise.all([
    read(".github/release-controls/evidence/escopo-dpo-legal-39fd74f2.md"),
    read(".github/release-controls/templates/g12-approval.template.json"),
    read("src/app/pages/PoliticaPrivacidadePage.tsx"),
  ]);
  const template = JSON.parse(templateText);
  const canonicalScope = scope.replaceAll("\r\n", "\n");
  const scopeSha256 = createHash("sha256").update(canonicalScope).digest("hex");
  assert.equal(template.productionReadiness.dpoLegal.scopeSha256, scopeSha256);
  assert.equal(template.productionReadiness.dpoLegal.status, "approved");
  assert.equal(template.productionReadiness.dpoLegal.approvedAt, "2026-09-05T19:13:23.900Z");
  assert.match(privacyNotice, /Marcelo Diaz/);
  assert.match(privacyNotice, /<strong>Resend<\/strong>/);
  assert.match(privacyNotice, /até 365 dias/);
  assert.match(privacyNotice, /até 730 dias/);
});

test("CSP is enforced only on production targets and contains the audited browser origins", async () => {
  const env = {
    CF_PAGES_COMMIT_SHA: sha,
    CF_PAGES_BRANCH: "main",
    ASSETS: { fetch: async () => new Response("unexpected", { status: 500 }) },
  };
  const preview = await worker.fetch(
    new Request("https://ev2-g12-preflight.gaiatec-website.pages.dev/healthz"),
    env,
  );
  const staging = await worker.fetch(
    new Request("https://ev2-g16-csp.gaiatec-cms-staging.pages.dev/healthz"),
    env,
  );
  const stagingEnforcementCanary = await worker.fetch(
    new Request("https://ev2-g16-csp-canary.gaiatec-cms-staging.pages.dev/healthz"),
    { ...env, CF_PAGES_BRANCH: "ev2-g16-csp-canary" },
  );
  const admin = await worker.fetch(
    new Request("https://ev2-g12-preflight.gaiatec-website.pages.dev/admin"),
    env,
  );
  const avifWorker = await worker.fetch(
    new Request("https://ev2-g12-preflight.gaiatec-website.pages.dev/assets/avif-encoder.worker-test.js"),
    env,
  );
  const stagingAvifWorker = await worker.fetch(
    new Request("https://ev2-g16-csp.gaiatec-cms-staging.pages.dev/assets/avif-encoder.worker-test.js"),
    env,
  );
  const enforced = preview.headers.get("content-security-policy") ?? "";
  const reportOnly = staging.headers.get("content-security-policy-report-only") ?? "";
  const expectedReportOnly = contentSecurityPolicy()
    .split("; ")
    .filter((directive) => directive !== "upgrade-insecure-requests")
    .join("; ");
  assert.equal(enforced, contentSecurityPolicy());
  assert.match(enforced, /(?:^|; )upgrade-insecure-requests$/);
  assert.equal(preview.headers.has("content-security-policy-report-only"), false);
  assert.equal(reportOnly, expectedReportOnly);
  assert.doesNotMatch(reportOnly, /(?:^|; )upgrade-insecure-requests(?:;|$)/);
  assert.equal(`${reportOnly}; upgrade-insecure-requests`, enforced);
  assert.equal(staging.headers.has("content-security-policy"), false);
  assert.equal(stagingEnforcementCanary.headers.get("content-security-policy"), contentSecurityPolicy());
  assert.match(
    stagingEnforcementCanary.headers.get("content-security-policy") ?? "",
    /(?:^|; )upgrade-insecure-requests$/,
  );
  assert.equal(stagingEnforcementCanary.headers.has("content-security-policy-report-only"), false);
  const adminPolicy = admin.headers.get("content-security-policy") ?? "";
  assert.equal(adminPolicy, contentSecurityPolicy("/admin"));
  assert.equal(adminPolicy, enforced);
  assert.doesNotMatch(adminPolicy, /wasm-unsafe-eval|unsafe-eval/);
  const avifWorkerPolicy = avifWorker.headers.get("content-security-policy") ?? "";
  assert.equal(avifWorkerPolicy, contentSecurityPolicy("/assets/avif-encoder.worker-test.js"));
  assert.match(avifWorkerPolicy, /default-src 'none'/);
  assert.match(avifWorkerPolicy, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.equal(avifWorker.headers.has("content-security-policy-report-only"), false);
  assert.equal(
    stagingAvifWorker.headers.get("content-security-policy-report-only"),
    contentSecurityPolicy("/assets/avif-encoder.worker-test.js"),
  );
  assert.equal(stagingAvifWorker.headers.has("content-security-policy"), false);
  assert.doesNotMatch(contentSecurityPolicy(), /wasm-unsafe-eval|unsafe-eval/);
  for (const origin of ["https://brasilapi.com.br", "https://nominatim.openstreetmap.org"])
    assert.match(enforced, new RegExp(origin.replaceAll(".", "\\.")));
  assert.doesNotMatch(enforced, /api\.resend\.com/);
});

test("production and canary workflows retain evidence and stay behind their boundaries", async () => {
  const [backup, email, deploy, cspCanary, cspCanaryScript] = await Promise.all([
    read(".github/workflows/backup-supabase-production.yml"),
    read(".github/workflows/verify-production-email.yml"),
    read(".github/workflows/deploy-production.yml"),
    read(".github/workflows/preview-ev2-phase16.yml"),
    read("scripts/ev2/phase16/csp-browser-canary.mjs"),
  ]);
  const cspCanaryHeader = cspCanary.slice(cspCanary.indexOf("  preview:"), cspCanary.indexOf("    steps:"));
  const cspDispatchGate = cspCanary.indexOf("Validate G16 CSP canary dispatch authorization before checkout");
  const cspCheckout = cspCanary.indexOf("actions/checkout@");
  assert.doesNotMatch(cspCanaryHeader, /\n {4}if:/);
  assert.ok(cspDispatchGate >= 0 && cspDispatchGate < cspCheckout);
  assert.match(cspCanary, /\[ "\$CONFIRMATION" != "CANARY-CSP-G16-STAGING:\$EXPECTED_SHA" \]/);
  assert.match(backup, /environment: production-backup/);
  assert.match(backup, /concurrency:\s*\n\s*group: production/);
  assert.match(backup, /--symmetric --cipher-algo AES256/);
  assert.match(backup, /supabase start/);
  assert.match(backup, /prepare-role-restore\.mjs/);
  assert.match(backup, /roles\.restore\.sql/);
  assert.match(backup, /postgresql-client-17/);
  assert.match(backup, /validate-backup-config\.mjs/);
  assert.doesNotMatch(backup, /--exclude-table=storage\.buckets_vectors/);
  assert.doesNotMatch(backup, /--exclude-table=storage\.vector_indexes/);
  assert.match(backup, /pg_export_snapshot\(\)/);
  assert.match(backup, /--snapshot="\$snapshot_id"/);
  assert.match(backup, /set transaction snapshot :'SNAPSHOT_ID'/);
  assert.match(backup, /-F \$'\\t'/);
  assert.match(backup, /transaction_timestamp\(\)/);
  assert.match(backup, /application-data\.sql/);
  assert.match(backup, /fingerprint-application\.sql/);
  assert.match(backup, /source-application-fingerprints\.tsv/);
  assert.match(backup, /restored-application-fingerprints\.tsv/);
  assert.doesNotMatch(backup, /application-row-counts\.tsv/);
  assert.match(backup, /auth-data\.sql/);
  assert.match(backup, /storage-data\.sql/);
  assert.match(backup, /fingerprint-auth-storage\.sql/);
  assert.match(backup, /source-auth-storage-inventory\.tsv/);
  assert.match(backup, /fingerprint-roles\.sql/);
  assert.match(backup, /verify-role-backup\.mjs/);
  assert.match(backup, /verify-backup-scope\.mjs/);
  assert.match(backup, /storage-object-backup\.mjs export/);
  assert.match(backup, /storage-object-backup\.mjs verify-snapshot/);
  assert.match(backup, /storage-object-backup\.mjs restore/);
  assert.match(backup, /storage-object-backup\.mjs verify-restore/);
  assert.match(backup, /storage-object-source\.jsonl/);
  assert.match(backup, /storage-object-after\.jsonl/);
  // Esta assercao fixava o texto literal `to_jsonb(storage.objects)`, que nao e SQL valido dentro de
  // um `from storage.objects` sem alias. Ela foi escrita no mesmo commit que o defeito e o prendeu no
  // lugar: o dump so reprovou quando a validacao, que falhava antes dele, parou de esconde-lo.
  assert.match(backup, /'version', to_jsonb\(object\) ->> 'version'/);
  assert.match(backup, /'updatedAt', to_jsonb\(object\) ->> 'updated_at'/);
  assert.match(backup, /'eTag', coalesce\(metadata ->> 'eTag', metadata ->> 'etag'\)/);
  assert.match(backup, /'checksum', coalesce\(metadata ->> 'checksum', metadata ->> 'sha256'\)/);
  assert.match(backup, /storage-object-index\.json/);
  assert.match(backup, /storage-source-report\.json/);
  assert.match(backup, /storage-restore-report\.json/);
  assert.match(backup, /backup-source-scope\.json/);
  assert.match(backup, /backup-restore-scope\.json/);
  assert.match(backup, /role-source-report\.json/);
  assert.match(backup, /role-restore-report\.json/);
  assert.match(backup, /storage-objects/);
  assert.match(backup, /GITHUB_RUN_ATTEMPT/);
  assert.match(backup, /restore_duration_seconds/);
  assert.match(backup, /RESTORE_DRILL_DURATION_SECONDS/);
  assert.match(backup, /BACKUP_SNAPSHOT_AT/);
  assert.match(backup, /BACKUP_SNAPSHOT_LSN/);
  assert.match(
    backup,
    /supabase-production-backup-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(backup, /secrets\.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(backup, /projects api-keys.*--reveal/);
  assert.match(backup, /SOURCE_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(backup, /TARGET_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(backup, /BACKUP_SOURCE_SCOPE_REPORT_PATH/);
  assert.match(backup, /BACKUP_RESTORE_SCOPE_REPORT_PATH/);
  assert.match(backup, /STORAGE_SOURCE_REPORT_PATH/);
  assert.match(backup, /STORAGE_RESTORE_REPORT_PATH/);
  assert.match(backup, /ROLE_SOURCE_REPORT_PATH/);
  assert.match(backup, /ROLE_RESTORE_REPORT_PATH/);
  assert.match(backup, /schemaname in \('auth', 'storage'\)/);
  assert.match(backup, /truncate table.*restart identity cascade/);
  assert.doesNotMatch(backup, /ON_ERROR_STOP=0/);
  assert.match(backup, /install -m 0600 \/dev\/null "\$restore_dir\/psql-restore\.log"/);
  assert.match(backup, />>"\$restore_dir\/psql-restore\.log" 2>&1/);
  for (const code of [
    "BACKUP_RESTORE_SCHEMA_RESET_FAILED",
    "BACKUP_RESTORE_PORTABLE_ROLES_FAILED",
    "BACKUP_RESTORE_APPLICATION_SCHEMA_FAILED",
    "BACKUP_RESTORE_MANAGED_TABLE_RESET_FAILED",
    "BACKUP_RESTORE_DATA_REPLAY_FAILED",
    "BACKUP_RESTORE_STORAGE_METADATA_REAPPLY_FAILED",
  ])
    assert.match(backup, new RegExp(code));
  assert.match(backup, /begin;/);
  assert.match(backup, /set local session_replication_role = replica;/);
  assert.match(backup, /\\i :APPLICATION_DATA/);
  assert.match(backup, /\\i :AUTH_DATA/);
  assert.match(backup, /\\i :STORAGE_DATA/);
  assert.match(backup, /commit;/);
  const snapshotExport = backup.indexOf("pg_export_snapshot()");
  const schemaDump = backup.indexOf("--schema-only", snapshotExport);
  const applicationDump = backup.indexOf("application-data.sql", schemaDump);
  const authDump = backup.indexOf("auth-data.sql", applicationDump);
  const storageDump = backup.indexOf("storage-data.sql", authDump);
  const snapshotFingerprints = backup.indexOf("source-auth-storage-inventory.tsv", storageDump);
  const snapshotInventory = backup.indexOf("storage-object-source.jsonl", snapshotFingerprints);
  const snapshotClose = backup.indexOf("close_snapshot", snapshotInventory);
  const storageDownload = backup.indexOf("storage-object-backup.mjs export", snapshotClose);
  const afterInventory = backup.indexOf("storage-object-after.jsonl", storageDownload);
  const stabilityProof = backup.indexOf("storage-object-backup.mjs verify-snapshot", afterInventory);
  assert.ok(
    snapshotExport < schemaDump &&
      schemaDump < applicationDump &&
      applicationDump < authDump &&
      authDump < storageDump &&
      storageDump < snapshotFingerprints &&
      snapshotFingerprints < snapshotInventory &&
      snapshotInventory < snapshotClose &&
      snapshotClose < storageDownload &&
      storageDownload < afterInventory &&
      afterInventory < stabilityProof,
    "one exported snapshot must bind DB dumps/counts/inventory before Storage pre/post verification",
  );
  assert.ok(
    backup.indexOf("set local session_replication_role = replica") < backup.indexOf("\\i :APPLICATION_DATA"),
    "the restore must disable user triggers before replaying catalog rows",
  );
  const payloadUpload = backup.indexOf("storage-object-backup.mjs restore");
  const metadataReapply = backup.indexOf("BACKUP_RESTORE_STORAGE_METADATA_REAPPLY_FAILED");
  const restoredMetadataFingerprint = backup.indexOf("restored-auth-storage-inventory.tsv");
  const finalPayloadVerification = backup.indexOf("storage-object-backup.mjs verify-restore");
  assert.ok(
    payloadUpload < metadataReapply &&
      metadataReapply < restoredMetadataFingerprint &&
      restoredMetadataFingerprint < finalPayloadVerification,
    "Storage metadata must be reapplied and fully fingerprinted before the final payload download",
  );
  const archiveSealCreate = backup.indexOf("backup-archive-seal.mjs create");
  const archiveSealVerifyBefore = backup.indexOf("backup-archive-seal.mjs verify", archiveSealCreate);
  const archiveDecrypt = backup.indexOf("--decrypt", archiveSealVerifyBefore);
  const archiveSealVerifyAfter = backup.indexOf("backup-archive-seal.mjs verify", archiveDecrypt);
  const manifestSeal = backup.indexOf("write-backup-manifest.mjs", archiveSealVerifyAfter);
  assert.ok(
    archiveSealCreate < archiveSealVerifyBefore &&
      archiveSealVerifyBefore < archiveDecrypt &&
      archiveDecrypt < archiveSealVerifyAfter &&
      archiveSealVerifyAfter < manifestSeal,
    "the encrypted archive digest must be sealed and rechecked before and after the drill",
  );
  assert.match(backup, /diff -u/);
  const applicationFingerprint = await read("scripts/ev2/phase16/fingerprint-application.sql");
  assert.match(applicationFingerprint, /to_jsonb\(source_row\)::text/);
  assert.match(applicationFingerprint, /string_agg/);
  assert.match(applicationFingerprint, /extensions\.digest/);
  assert.match(applicationFingerprint, /schemaname in \('public', 'private'\)/);
  assert.doesNotMatch(applicationFingerprint, /select \*/i);
  for (const artifactFile of [
    "archive-seal.json",
    "manifest.json",
    "backup-restore-scope.json",
    "storage-restore-report.json",
    "role-restore-report.json",
  ])
    assert.match(
      backup,
      new RegExp(`steps\\.backup\\.outputs\\.artifact_dir \\}\\}/${artifactFile.replaceAll(".", "\\.")}`),
    );
  assert.match(backup, /\$\{\{ steps\.backup\.outputs\.archive \}\}/);
  assert.doesNotMatch(backup, /^\s+path: \$\{\{ steps\.backup\.outputs\.artifact_dir \}\}\s*$/m);
  assert.match(backup, /retention-days: 30/);
  assert.doesNotMatch(backup, /path:.*plain_dir/);
  const manifestWriter = await read("scripts/ev2/phase16/write-backup-manifest.mjs");
  assert.match(manifestWriter, /schemaVersion: 3/);
  assert.match(manifestWriter, /PRODUCTION_BACKUP_WORKFLOW/);
  assert.match(manifestWriter, /durationSeconds/);
  assert.match(manifestWriter, /snapshotAt/);
  assert.match(manifestWriter, /snapshotWalLsn/);
  assert.match(manifestWriter, /archiveHashedAt/);
  assert.match(manifestWriter, /sealedAt/);
  assert.match(manifestWriter, /metadataReappliedAfterUpload/);
  assert.match(manifestWriter, /metadataAggregateSha256/);
  assert.match(manifestWriter, /reports:/);
  assert.match(manifestWriter, /storageSnapshotStability/);
  assert.match(manifestWriter, /portableRoleCatalogMatched/);
  assert.match(manifestWriter, /rolesRestored: false/);
  assert.match(manifestWriter, /completeDataRestoreDrill/);
  assert.match(manifestWriter, /completeDisasterRecovery: false/);
  assert.match(manifestWriter, /role-passwords-and-role-settings-are-not-restored/);
  assert.match(email, /VERIFY-RESEND-PRODUCTION:\$CANDIDATE_SHA/);
  assert.match(email, /environment: production/);
  assert.match(email, /retention-days: 30/);
  assert.match(deploy, /AUTORIZO-G12-PRODUCAO:\$CANDIDATE_SHA/);
  assert.match(deploy, /CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(cspCanary, /for attempt in 1 2/);
  assert.match(cspCanary, /EV2_G12_CSP_MODE: enforce/);
  assert.match(cspCanary, /DISPATCH_REF_NAME: \$\{\{ github\.ref_name \}\}/);
  assert.match(cspCanary, /\[ "\$DISPATCH_REF_NAME" != "main" \]/);
  assert.match(cspCanary, /test "\$EXPECTED_SHA" = "\$\(git rev-parse origin\/main\)"/);
  assert.match(cspCanary, /--project-name gaiatec-cms-staging/);
  assert.match(cspCanary, /retention-days: 30/);
  assert.doesNotMatch(cspCanary, /--project-name gaiatec-website/);
  assert.match(cspCanaryScript, /policySha256/);
  assert.match(cspCanaryScript, /observedPublicPolicies\.size !== 1/);
  assert.match(cspCanaryScript, /observedAdminPolicies\.size !== 1/);
  assert.match(cspCanaryScript, /adminPolicySha256/);
  assert.match(cspCanaryScript, /createHash\("sha256"\)\.update\(policy\)/);
  assert.match(cspCanaryScript, /release-manifest\.json/);
  assert.match(cspCanaryScript, /assets\\\/avif-encoder\\\.worker-/);
  assert.match(cspCanaryScript, /new Worker\(workerPath/);
  assert.match(cspCanaryScript, /workerPolicySha256/);
  assert.match(cspCanaryScript, /adminAvifProbe\.brand !== "ftypavif"/);
});

test("the storage inventory query names the table it reads from", async () => {
  const workflow = await readFile(".github/workflows/backup-supabase-production.yml", "utf8");

  // O alias implicito de `storage.objects` e `objects`, nao `storage.objects`. Sem nomear a tabela,
  // `to_jsonb(storage.objects)` faz o parser ler `storage` como tabela, e o dump inteiro morre com
  // "missing FROM-clause entry for table storage" — foi assim que o run 34607986457 reprovou, no
  // primeiro backup que chegou a passar da validacao desde 8 de setembro.
  // A assercao mira o USO, nao a mencao: o comentario que explica o defeito no proprio workflow cita
  // a forma quebrada de proposito, e proibir a string nua tornaria a explicacao impossivel de manter.
  assert.doesNotMatch(workflow, /to_jsonb\(storage\.objects\) ->>/);

  // As duas consultas de inventario leem a mesma tabela e as duas precisam do alias.
  const aliased = workflow.match(/from storage\.objects as object/g) ?? [];
  assert.equal(aliased.length, 2);
  const referenced = workflow.match(/to_jsonb\(object\)/g) ?? [];
  assert.equal(referenced.length, 4);
});
