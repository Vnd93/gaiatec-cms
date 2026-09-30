import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CmsProductContentSchema } from "../../src/shared/contracts/cms-content.ts";
import { buildPimPrerequisitePlan, provisionPimPrerequisites } from "../qa/cms-browser-fixture.mjs";
import { buildGovernedProductFields, PRODUCT_PREREQUISITE_FLAGS } from "./product-prerequisites-lib.mjs";

const id = (value) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const actor = { actorId: id(1), token: "synthetic-unit-test-not-a-credential" };
const sha = "a".repeat(40);
const runTag = "QA-CMS-FINAL-20260930-aaaaaaaa";
const plan = () => buildPimPrerequisitePlan(runTag, actor.actorId, sha);

function harness(planned) {
  const calls = [];
  const queries = [];
  const lists = planned.dimensions.map((dimension, index) => ({
    id: id(10 + index),
    list_key: dimension.listKey,
    active: true,
    public_visible: true,
    options: [],
  }));
  const invokeCms = async (_token, fn, body) => {
    calls.push({ fn, body: structuredClone(body) });
    if (body.action === "list") return { items: structuredClone(lists) };
    if (body.action === "upsert_option") {
      const option = body.option;
      lists
        .find((list) => list.id === option.listId)
        .options.push({
          id: option.id,
          slug: option.slug,
          label: option.label,
          active: option.active,
          public_visible: option.publicVisible,
        });
      return { optionId: option.id };
    }
    if (body.action === "create_entity") {
      return {
        entityId: id(30 + planned.dimensions.findIndex((item) => item.masterType === body.entityType)),
      };
    }
    if (body.action === "list_catalog") {
      return {
        controlledCategory: { id: planned.dimensions[0].optionId },
        masterCategory: { id: id(30) },
        attributeSet: { id: planned.attributeSetId },
        definitions: [
          {
            id: planned.attributeDefinitionId,
            attributeKey: planned.attributeKey,
            dataType: "boolean",
            required: true,
          },
        ],
      };
    }
    throw new Error("UNEXPECTED_TEST_REQUEST");
  };
  return {
    calls,
    queries,
    lists,
    dependencies: {
      environment: "staging",
      invokeCms,
      query: async (sql) => {
        queries.push(sql);
        return [{ configured: true }];
      },
    },
  };
}

test("G7 uses five exact QA options and the verified governed attribute catalog", async () => {
  const planned = plan();
  const remote = harness(planned);
  const ready = await provisionPimPrerequisites(actor, planned, remote.dependencies);
  const fields = buildGovernedProductFields(ready);
  assert.deepEqual(PRODUCT_PREREQUISITE_FLAGS, ["ev2.master_data", "ev2.pim_v2"]);
  assert.equal(remote.calls.filter(({ body }) => body.action === "upsert_option").length, 5);
  assert.equal(remote.calls.filter(({ body }) => body.action === "create_entity").length, 5);
  assert.equal(remote.queries.length, 1);
  assert.match(remote.queries[0], /begin;[\s\S]+cms\.qa_mutation_actor_id[\s\S]+commit;/);
  assert.match(remote.queries[0], new RegExp(actor.actorId));
  for (const dimension of planned.dimensions) {
    assert.equal(fields.controlledClassification[dimension.field].id, dimension.optionId);
    const command = remote.calls.find(({ body }) => body.option?.id === dimension.optionId);
    assert.equal(command.body.option.publicVisible, false);
    assert.equal(command.body.option.active, true);
    assert.ok(command.body.option.label.includes(runTag));
  }
  const spec = fields.specifications[0];
  assert.equal(spec.definitionId, planned.attributeDefinitionId);
  assert.equal(spec.homologated, true);
  assert.equal(spec.confidence, 1);
  // Exercise the real shared contract, not a test-only imitation.
  const templateSource = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  const payloadFactory = templateSource.slice(
    templateSource.indexOf("function productPayload("),
    templateSource.indexOf("async function publishFlow("),
  );
  let payloadId = 90;
  const buildPayload = new Function(
    "assert",
    "controlledProductClassification",
    "controlledProductSpecifications",
    "uid",
    "shortTag",
    "runTag",
    "provenance",
    `${payloadFactory}; return productPayload;`,
  )(
    assert.ok,
    fields.controlledClassification,
    fields.specifications,
    () => id(payloadId++),
    "qacmsfinal20260930aaaaaaaa",
    runTag,
    () => [
      {
        sourceKind: "owner_authored",
        rightsConfirmed: true,
        commercialOwner: "QA",
        technicalOwner: "QA",
        verifiedAt: "2026-09-30T15:00:00.000Z",
      },
    ],
  );
  const rows = ["produto-a", "produto-b"].map((slug) =>
    CmsProductContentSchema.parse(buildPayload(slug, slug)),
  );
  assert.notEqual(rows[0].models[0].sku, rows[1].models[0].sku);
  assert.equal(rows[0].specifications[0].definitionId, planned.attributeDefinitionId);
});

test("G7 refuses unverified, incomplete, foreign or mixed prerequisite evidence", async () => {
  const planned = plan();
  const remote = harness(planned);
  const ready = await provisionPimPrerequisites(actor, planned, remote.dependencies);
  for (const mutate of [
    (value) => {
      value.status = "planned";
    },
    (value) => {
      value.catalogVerified = false;
    },
    (value) => {
      value.dimensions.pop();
    },
    (value) => {
      value.dimensions[1].optionId = value.dimensions[0].optionId;
    },
    (value) => {
      value.dimensions[1].field = value.dimensions[0].field;
    },
    (value) => {
      value.dimensions[0].listKey = "service.category";
    },
    (value) => {
      value.dimensions[0].slug = "corporate-option";
    },
    (value) => {
      value.dimensions[0].label = "Corporate option";
    },
    (value) => {
      value.attributeKey = "qa-bbbbbbbb-other-run";
    },
    (value) => {
      value.masterEntityIds[1] = value.masterEntityIds[0];
    },
  ]) {
    const changed = structuredClone(ready);
    mutate(changed);
    assert.throws(() => buildGovernedProductFields(changed), /G7_PIM_VERIFIED_PREREQUISITES_REQUIRED/);
  }
});

test("shared provisioning fails before mutation on missing containers or actor mismatch", async () => {
  const planned = plan();
  const remote = harness(planned);
  remote.lists.pop();
  await assert.rejects(
    provisionPimPrerequisites(actor, planned, remote.dependencies),
    /CONTAINERS_UNAVAILABLE/,
  );
  assert.deepEqual(
    remote.calls.map(({ body }) => body.action),
    ["list"],
  );
  assert.equal(remote.queries.length, 0);
  await assert.rejects(
    provisionPimPrerequisites(
      { ...actor, actorId: "20000000-0000-4000-8000-000000000001" },
      planned,
      remote.dependencies,
    ),
    /CONTEXT_INVALID/,
  );
  assert.equal(remote.calls.length, 1);
});

test("ambiguous option writes are never retried or replaced by a corporate option", async () => {
  const planned = plan();
  const remote = harness(planned);
  const realInvoke = remote.dependencies.invokeCms;
  let writes = 0;
  remote.lists[0].options.push({
    id: id(99),
    slug: "corporate",
    label: "Corporate",
    active: true,
    public_visible: true,
  });
  remote.dependencies.invokeCms = async (...args) => {
    if (args[2].action === "upsert_option") {
      writes += 1;
      throw new Error("AMBIGUOUS_WRITE");
    }
    return realInvoke(...args);
  };
  await assert.rejects(provisionPimPrerequisites(actor, planned, remote.dependencies), /AMBIGUOUS_WRITE/);
  assert.equal(writes, 1);
  assert.equal(remote.queries.length, 0);
});

test("G7 retains durable cleanup and never changes a global flag or adopts corporate options", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  const prep = source.slice(
    source.indexOf("async function prepareGovernedProductPrerequisites"),
    source.indexOf("async function run()"),
  );
  assert.ok(
    prep.indexOf("await assertQaActorLease") < prep.indexOf('.from("cms_feature_flag_overrides").insert'),
  );
  assert.match(prep, /aal === "aal2"/);
  assert.match(prep, /scope_type: "user"/);
  assert.match(prep, /expires_at: new Date\(now \+ 30 \* 60_000\)/);
  assert.match(prep, /environment: "staging"/);
  assert.doesNotMatch(source, /\.from\("cms_controlled_options"\)/);
  assert.doesNotMatch(prep, /default_enabled|ev2\.catalog_v1/);
  assert.match(source, /finally \{\s*const cleanupEvidence = await cleanup\(\)/);
  assert.match(source, /completeQaActorLease\(durableLeaseRpc, actor.identity\)/);
  const sql = readFileSync(
    new URL("../../supabase/migrations/0078_cms_product_pim_consolidation.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /private\.cms_cleanup_terminal_product_shared_options_0078/);
  assert.match(sql, /option.created_by = old.actor_id/);
  assert.match(sql, /option.updated_by = old.actor_id/);
});
