import { readFile, writeFile } from "node:fs/promises";

import { escapeSqlLiteral, managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const stateFile = argument("state");
const reportFile = argument("report");
const candidateSha = argument("candidate");
const token = process.env.SUPABASE_ACCESS_TOKEN;
const readinessOnly = process.argv.includes("--readiness-only");
const recoveryNoTombstone = process.argv.includes("--recovery-no-tombstone");
if (
  (!stateFile && !readinessOnly) ||
  (recoveryNoTombstone && (!stateFile || readinessOnly)) ||
  !reportFile ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  process.env.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
  !token
)
  throw new Error("G12_PRODUCTION_OUTBOX_CANARY_INPUT_REFUSED");

async function writeReadinessReport({ recovery = false } = {}) {
  const [readiness] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: "POST",
    token,
    body: {
      query: `select
        (select count(*) = 1 from cron.job where jobname = 'cms-outbox-worker-every-5m' and active) as cron_ready,
        (select count(*) = 1 from vault.secrets where name = 'cms_outbox_worker_url') as url_ready,
        (select count(*) = 1 from vault.secrets where name = 'cms_outbox_worker_secret') as secret_ready`,
    },
  });
  if (readiness?.cron_ready !== true || readiness?.url_ready !== true || readiness?.secret_ready !== true)
    throw new Error("G12_PRODUCTION_OUTBOX_READINESS_FAILED");
  const report = {
    schemaVersion: 1,
    event: "g12.production.outbox_cache_readiness.verified",
    environment: "production",
    candidateSha,
    cacheInvalidationCredentialReady: true,
    realCanaryNotApplicable: true,
    ...(recovery
      ? {
          terminalNoSyntheticRoute: {
            classification: "terminalNoSyntheticRoute",
            count: 0,
            activeRouteRules: 0,
            identifiersOrPathsPersisted: false,
          },
        }
      : {}),
    secretsDisclosed: false,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
}

if (readinessOnly) {
  await writeReadinessReport();
  process.exit(0);
}

const state = JSON.parse(await readFile(stateFile, "utf8"));
const validItemIds =
  Array.isArray(state?.itemIds) &&
  state.itemIds.length <= 64 &&
  new Set(state.itemIds).size === state.itemIds.length &&
  state.itemIds.every((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  );
if (
  state?.schemaVersion !== 1 ||
  state?.status !== "cleaned" ||
  state?.environment !== "production" ||
  state?.expectedSha !== candidateSha ||
  !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(state?.runTag ?? "") ||
  !state.runTag.endsWith(`-${candidateSha.slice(0, 8)}`) ||
  !validItemIds ||
  (recoveryNoTombstone
    ? state.terminalArchivedTombstone !== null
    : state.itemIds.length === 0 ||
      !state?.terminalArchivedTombstone ||
      Object.keys(state.terminalArchivedTombstone).join(",") !== "itemId" ||
      !state.itemIds.includes(state.terminalArchivedTombstone.itemId))
)
  throw new Error("G12_PRODUCTION_OUTBOX_CANARY_STATE_REFUSED");
if (recoveryNoTombstone && state.itemIds.length === 0) {
  await writeReadinessReport({ recovery: true });
  process.exit(0);
}
const ids = state.itemIds.map(escapeSqlLiteral).join(",");
const deadline = Date.now() + 7 * 60 * 1000;
let observation;
do {
  [observation] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: "POST",
    token,
    body: {
      query: `select
        count(*)::integer as total,
        count(*) filter (where status = 'completed')::integer as completed,
        count(*) filter (where status in ('pending','processing','failed'))::integer as unresolved,
        count(*) filter (where status = 'failed')::integer as failed,
        count(*) filter (where event_type in ('publish','restore','unpublish'))::integer as invalidation_events
      from public.cms_publication_outbox
      where item_id = any(array[${ids}]::uuid[])`,
    },
  });
  if (
    Number(observation?.total) > 0 &&
    Number(observation?.completed) === Number(observation?.total) &&
    Number(observation?.unresolved) === 0 &&
    Number(observation?.failed) === 0 &&
    Number(observation?.invalidation_events) > 0
  )
    break;
  if (recoveryNoTombstone && Number(observation?.total) === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 10_000));
} while (Date.now() < deadline);

if (recoveryNoTombstone && Number(observation?.total) === 0) {
  await writeReadinessReport({ recovery: true });
  process.exit(0);
}
if (
  Number(observation?.total) <= 0 ||
  Number(observation?.completed) !== Number(observation?.total) ||
  Number(observation?.unresolved) !== 0 ||
  Number(observation?.failed) !== 0 ||
  Number(observation?.invalidation_events) <= 0
)
  throw new Error("G12_PRODUCTION_OUTBOX_CANARY_NOT_CONVERGED");

const report = {
  schemaVersion: 1,
  event: "g12.production.outbox_cache_canary.verified",
  environment: "production",
  candidateSha,
  syntheticOnly: true,
  eventCount: Number(observation.total),
  completedCount: Number(observation.completed),
  failedCount: 0,
  cacheInvalidationProvenByWorkerCompletion: true,
  ...(recoveryNoTombstone
    ? {
        terminalNoSyntheticRoute: {
          classification: "terminalNoSyntheticRoute",
          count: 0,
          activeRouteRules: 0,
          identifiersOrPathsPersisted: false,
        },
      }
    : {}),
  secretsDisclosed: false,
  verifiedAt: new Date().toISOString(),
};
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report));
