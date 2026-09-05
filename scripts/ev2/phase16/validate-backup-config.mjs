import { validateBackupConfig } from "./readiness-lib.mjs";

const result = validateBackupConfig({
  projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
  databaseUrl: process.env.PRODUCTION_SUPABASE_DB_URL,
  encryptionPassphrase: process.env.BACKUP_ENCRYPTION_PASSPHRASE,
  target: process.env.BACKUP_EXTERNAL_TARGET,
  gitRef: process.env.GITHUB_REF,
});

if (!result.valid) throw new Error(`PRODUCTION_BACKUP_CONFIG_REFUSED:${result.violations.join(",")}`);
console.log(JSON.stringify({ event: "production.backup.config.verified", secretsExposed: false }));
