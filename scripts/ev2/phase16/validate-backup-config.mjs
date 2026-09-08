import { spawnSync } from "node:child_process";

import { validateBackupConfig, validatePostgresBackupRuntime } from "./readiness-lib.mjs";

const databaseUrl = process.env.PRODUCTION_SUPABASE_DB_URL;

const result = validateBackupConfig({
  projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
  databaseUrl,
  serviceRoleKey: process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY,
  encryptionPassphrase: process.env.BACKUP_ENCRYPTION_PASSPHRASE,
  target: process.env.BACKUP_EXTERNAL_TARGET,
  gitRef: process.env.GITHUB_REF,
});

if (!result.valid) throw new Error(`PRODUCTION_BACKUP_CONFIG_REFUSED:${result.violations.join(",")}`);

const connection = new URL(databaseUrl);
const pgEnvironment = {
  ...process.env,
  PGHOST: connection.hostname,
  PGPORT: connection.port,
  PGDATABASE: connection.pathname.slice(1),
  PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password),
  PGSSLMODE: "require",
  PGCONNECT_TIMEOUT: "10",
};
const client = spawnSync("pg_dump", ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  timeout: 10_000,
});
const server = spawnSync(
  "psql",
  ["--no-psqlrc", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", "show server_version_num"],
  {
    encoding: "utf8",
    env: pgEnvironment,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 15_000,
  },
);
if (client.error || client.status !== 0 || server.error || server.status !== 0)
  throw new Error("PRODUCTION_BACKUP_POSTGRES_RUNTIME_UNAVAILABLE");
const runtime = validatePostgresBackupRuntime({
  clientVersion: client.stdout,
  serverVersion: server.stdout,
});
if (!runtime.valid)
  throw new Error(`PRODUCTION_BACKUP_POSTGRES_RUNTIME_REFUSED:${runtime.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "production.backup.config.verified",
    pgDumpMajor: runtime.clientMajor,
    serverMajor: runtime.serverMajor,
    directSessionEndpoint: true,
    secretsExposed: false,
  }),
);
