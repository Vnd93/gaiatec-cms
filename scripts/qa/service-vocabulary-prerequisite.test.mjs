import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildServiceVocabularyPlan,
  provisionServiceVocabulary,
  validateServiceVocabularyPlan,
} from "./service-vocabulary-prerequisite.mjs";

const sha = "a".repeat(40),
  run = "QA-CMS-FINAL-20261013-aaaaaaaa";
const actorId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";
const listId = "33333333-3333-4333-8333-333333333333";
const actor = { actorId, token: "synthetic-test-only" };
const transportSource = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const transportErrorPattern = transportSource.match(
  /!\/(\^QA_CMS_FIXTURE_\[A-Z0-9_\]\+\$)\/\.test\(errorCode\)/,
);
assert.ok(transportErrorPattern, "the actual fixture transport must retain its strict error-code guard");
const transportErrorCode = new RegExp(transportErrorPattern[1]);

test("retains the transport guard that rejected the unbound service error codes before HTTP", () => {
  assert.equal(transportErrorCode.test("QA_CMS_SERVICE_LIST_FAILED"), false);
  assert.equal(transportErrorCode.test("QA_CMS_SERVICE_OPTION_FAILED"), false);
  assert.equal(transportErrorCode.test("QA_CMS_FIXTURE_SERVICE_LIST_FAILED"), true);
  assert.equal(transportErrorCode.test("QA_CMS_FIXTURE_SERVICE_OPTION_FAILED"), true);
});

test("plans the exact actor/run/SHA-owned term before any mutation", () => {
  const plan = buildServiceVocabularyPlan(run, actorId, sha, optionId);
  assert.equal(plan.status, "planned");
  assert.equal(validateServiceVocabularyPlan(plan, actorId, run, sha), true);
  assert.equal(
    validateServiceVocabularyPlan({ ...plan, namespace: "f".repeat(12) }, actorId, run, sha),
    false,
  );
  assert.equal(validateServiceVocabularyPlan(plan, listId, run, sha), false);
  assert.equal(validateServiceVocabularyPlan(plan, actorId, run, "b".repeat(40)), false);
  assert.throws(() => buildServiceVocabularyPlan("QA-CMS-UNBOUND", actorId, sha), /PLAN_INVALID/);
});

function api({ ambiguous = false, foreign = false } = {}) {
  const calls = [];
  let options = [];
  return {
    calls,
    invokeCms: async (_token, name, command, errorCode) => {
      assert.equal(name, "cms-controlled-vocabularies");
      assert.match(errorCode, transportErrorCode);
      calls.push(command);
      if (command.action === "list")
        return { items: [{ id: listId, list_key: "service.category", active: true, options }] };
      const entry = command.option;
      options = [
        {
          id: foreign ? listId : entry.id,
          slug: entry.slug,
          label: entry.label,
          active: true,
          public_visible: false,
        },
      ];
      assert.equal(entry.publicVisible, false);
      assert.equal(entry.listId, listId);
      if (ambiguous) throw new Error("transport-uncertain");
      return { optionId: entry.id };
    },
  };
}

test("provisions one private option through the authenticated API and rereads the exact scope", async () => {
  const fixture = api();
  const result = await provisionServiceVocabulary(
    actor,
    buildServiceVocabularyPlan(run, actorId, sha, optionId),
    {
      environment: "staging",
      invokeCms: fixture.invokeCms,
    },
  );
  assert.equal(result.status, "ready");
  assert.equal(result.controlledOptions, 1);
  assert.equal(result.scopeVerified, true);
  assert.equal(fixture.calls.filter((call) => call.action === "upsert_option").length, 1);
});

test("never retries an uncertain write; only an exact reread can prove completion", async () => {
  const fixture = api({ ambiguous: true });
  await provisionServiceVocabulary(actor, buildServiceVocabularyPlan(run, actorId, sha, optionId), {
    environment: "staging",
    invokeCms: fixture.invokeCms,
  });
  assert.equal(fixture.calls.filter((call) => call.action === "upsert_option").length, 1);
  const wrong = api({ ambiguous: true, foreign: true });
  await assert.rejects(
    provisionServiceVocabulary(actor, buildServiceVocabularyPlan(run, actorId, sha, optionId), {
      environment: "staging",
      invokeCms: wrong.invokeCms,
    }),
    /OPTION_UNPROVEN/,
  );
  assert.equal(wrong.calls.filter((call) => call.action === "upsert_option").length, 1);
});

test("refuses production, an altered plan and a nonempty scope before mutation", async () => {
  const fixture = api();
  const plan = buildServiceVocabularyPlan(run, actorId, sha, optionId);
  await assert.rejects(
    provisionServiceVocabulary(actor, plan, { environment: "production", invokeCms: fixture.invokeCms }),
    /CONTEXT_INVALID/,
  );
  assert.equal(fixture.calls.length, 0);
  await assert.rejects(
    provisionServiceVocabulary(
      actor,
      { ...plan, slug: "other" },
      { environment: "staging", invokeCms: fixture.invokeCms },
    ),
    /CONTEXT_INVALID/,
  );
  assert.equal(fixture.calls.length, 0);
  await assert.rejects(
    provisionServiceVocabulary(actor, plan, {
      environment: "staging",
      invokeCms: async () => ({
        items: [{ id: listId, list_key: "service.category", active: true, options: [{}] }],
      }),
    }),
    /SCOPE_NOT_EMPTY/,
  );
});

test("setup persists the plan before API provisioning and never changes corporate vocabularies", () => {
  const source = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
  assert.match(
    source,
    /state\.serviceVocabularyPrerequisite = buildServiceVocabularyPlan[^;]+;\s*writeState\(state\);\s*state\.serviceVocabularyPrerequisite = await provisionServiceVocabulary/,
  );
  assert.match(source, /if \(target\.environment === "staging"\)/);
  const helper = readFileSync("scripts/qa/service-vocabulary-prerequisite.mjs", "utf8");
  assert.doesNotMatch(helper, /upsert_list|set_active|delete|service_role|production.*invokeCms/);
});
