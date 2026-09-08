import assert from "node:assert/strict";
import test from "node:test";
import { candidateTestIsCiExecuted, candidateTestRunner } from "./backend-test-execution-lib.mjs";

const workflow = `
jobs:
  quality:
    steps:
      - run: npm run check
  database:
    steps:
      - run: supabase test db
`;
const manifest = {
  scripts: {
    check:
      "npm run test && npm run test:qa && npm run test:ev2:phase12 && npm run test:phase1 && npm run test:integration",
    test: "vitest run",
    "test:qa": "node --test scripts/qa/*.test.mjs",
    "test:ev2:phase12": "node --test scripts/ev2/phase12/*.test.mjs",
    "test:phase1": "node --test scripts/phase1/*.test.mjs",
    "test:integration": "node --test scripts/phase2/*.test.mjs",
  },
};

test("candidate compatibility evidence maps only to known CI runners", () => {
  assert.equal(candidateTestRunner("supabase/tests/example.test.sql"), "supabase-test-db");
  assert.equal(candidateTestRunner("tests/contracts/example.test.ts"), "test");
  assert.equal(candidateTestRunner("scripts/qa/example.test.mjs"), "test:qa");
  assert.equal(candidateTestRunner("scripts/ev2/phase12/example.test.mjs"), "test:ev2:phase12");
  assert.equal(candidateTestRunner("scripts/phase1/example.test.mjs"), "test:phase1");
  assert.equal(candidateTestRunner("scripts/phase2/example.test.mjs"), "test:integration");
  assert.equal(candidateTestRunner("docs/example.test.mjs"), "");
});

test("candidate compatibility evidence must actually execute in candidate CI", () => {
  for (const path of [
    "supabase/tests/example.test.sql",
    "tests/contracts/example.test.ts",
    "scripts/qa/example.test.mjs",
    "scripts/ev2/phase12/example.test.mjs",
    "scripts/phase1/example.test.mjs",
    "scripts/phase2/example.test.mjs",
  ])
    assert.equal(candidateTestIsCiExecuted(path, manifest, workflow), true, path);

  assert.equal(candidateTestIsCiExecuted("scripts/ev2/phase17/example.test.mjs", manifest, workflow), false);
  assert.equal(
    candidateTestIsCiExecuted(
      "tests/contracts/example.test.ts",
      manifest,
      workflow.replace("npm run check", "npm run lint"),
    ),
    false,
  );
  assert.equal(
    candidateTestIsCiExecuted(
      "supabase/tests/example.test.sql",
      manifest,
      workflow.replace("supabase test db", "supabase db lint"),
    ),
    false,
  );
});
