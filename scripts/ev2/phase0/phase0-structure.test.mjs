import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const foundationFlags = [
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
];

test("EV2 foundation flags are registered additively and disabled by default", async () => {
  const migration = await read("supabase/migrations/0037_ev2_foundation_flags_release.sql");
  for (const flag of foundationFlags) assert.match(migration, new RegExp(`'${flag.replace(".", "\\.")}'`));
  assert.match(
    migration,
    /default_enabled boolean not null default false check \(default_enabled is false\)/,
  );
  assert.match(migration, /kill_switch boolean not null default false/);
  assert.doesNotMatch(migration, /drop table|drop column|truncate/i);
});

test("EV2 command and capability contracts are strict and server-scoped", async () => {
  const contract = await read("src/shared/contracts/ev2-foundation.ts");
  for (const flag of foundationFlags) assert.match(contract, new RegExp(`"${flag.replace(".", "\\.")}"`));
  assert.match(contract, /Ev2CommandEnvelopeSchema/);
  assert.match(contract, /siteKey: z\.string\(\)\.regex/);
  assert.match(contract, /expectedVersion: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(contract, /source: z\.enum\(\["default", "override", "kill_switch", "unavailable"\]\)/);
  assert.match(contract, /\.strict\(\)/);
});

test("production build keeps every deployable EV2 candidate disabled", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");
  for (const variable of [
    "VITE_EV2_DRAFT_V2_CANDIDATE",
    "VITE_EV2_MASTER_DATA_CANDIDATE",
    "VITE_EV2_PIM_CANDIDATE",
    "VITE_EV2_DAM_CANDIDATE",
    "VITE_EV2_SEARCH_QUALITY_CANDIDATE",
    "VITE_EV2_COLLABORATION_BULK_CANDIDATE",
    "VITE_EV2_RBAC_SCOPED_CANDIDATE",
    "VITE_EV2_VISUAL_STUDIO_CANDIDATE",
    "VITE_EV2_MULTISITE_CANDIDATE",
    "VITE_EV2_AI_ASSIST_CANDIDATE",
    "VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE",
  ]) {
    assert.match(workflow, new RegExp(`${variable}: ["']false["']`));
  }
});

test("EV2.0 verification remains part of local and CI quality gates", async () => {
  const [packageJson, ci] = await Promise.all([read("package.json"), read(".github/workflows/ci.yml")]);
  assert.match(packageJson, /"test:ev2:phase0": "node --test scripts\/ev2\/phase0\/\*\.test\.mjs"/);
  assert.match(packageJson, /"check"[^\n]+npm run test:ev2:phase0/);
  assert.match(ci, /"ev2\/\*\*"/);
  assert.match(ci, /npm run check/);
});
