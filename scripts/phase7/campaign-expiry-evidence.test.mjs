import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  awaitCampaignExpiryEvidence,
  readCampaignExpirySnapshot,
  validateCampaignExpirySnapshot,
} from "./campaign-expiry-evidence.mjs";

const itemId = (index) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const revisionId = (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const fixtures = [
  ["redirect", 301, "/contato"],
  ["not-found", 404, null],
  ["gone", 410, null],
  ["fallback", 302, "/campanhas/qa-active"],
].map(([mode, expectedStatus, destination], index) => ({
  slug: `expira-${mode}-qacmsfinal20261006aaaaaaaa`,
  itemId: itemId(index + 1),
  revisionId: revisionId(index + 1),
  expectedStatus,
  destination,
}));

function snapshot() {
  return {
    items: fixtures.map((fixture) => ({
      id: fixture.itemId,
      workflow_status: "archived",
      archived_at: "2026-10-06T04:05:02Z",
    })),
    publications: [],
    projections: [],
    routes: fixtures.map((fixture) => ({
      item_id: fixture.itemId,
      source_path: `/campanhas/${fixture.slug}`,
      destination_path: fixture.destination,
      active: true,
      status_code: fixture.expectedStatus,
    })),
    outbox: fixtures.map((fixture) => ({
      item_id: fixture.itemId,
      revision_id: fixture.revisionId,
      event_type: "unpublish",
    })),
  };
}

test("the exact four archived campaigns pass independently of which worker won", async () => {
  assert.equal(validateCampaignExpirySnapshot(fixtures, snapshot()).valid, true);
  let reads = 0;
  const result = await awaitCampaignExpiryEvidence(
    fixtures,
    async () => {
      reads += 1;
      return snapshot();
    },
    {
      sleep: () => {
        throw new Error("successful evidence must exit without waiting");
      },
    },
  );
  assert.deepEqual(result, { verifiedCampaigns: 4, observations: 1 });
  assert.equal(reads, 1);
});

for (const [name, mutate, code] of [
  ["missing item", (value) => value.items.pop(), "item_not_archived"],
  ["duplicate item", (value) => value.items.push(value.items[0]), "item_not_archived"],
  [
    "still published",
    (value) => {
      value.items[0].workflow_status = "published";
    },
    "item_not_archived",
  ],
  [
    "archive timestamp absent",
    (value) => {
      value.items[0].archived_at = null;
    },
    "item_not_archived",
  ],
  [
    "invalid archive timestamp",
    (value) => {
      value.items[0].archived_at = "invalid";
    },
    "item_not_archived",
  ],
  [
    "publication remains",
    (value) => value.publications.push({ item_id: itemId(1) }),
    "publication_still_live",
  ],
  ["projection remains", (value) => value.projections.push({ item_id: itemId(1) }), "projection_still_live"],
  ["missing route", (value) => value.routes.pop(), "expiry_route_mismatch"],
  ["duplicate route", (value) => value.routes.push(value.routes[0]), "expiry_route_mismatch"],
  [
    "inactive route",
    (value) => {
      value.routes[0].active = false;
    },
    "expiry_route_mismatch",
  ],
  [
    "wrong status",
    (value) => {
      value.routes[0].status_code = 302;
    },
    "expiry_route_mismatch",
  ],
  [
    "coerced status",
    (value) => {
      value.routes[0].status_code = "301";
    },
    "expiry_route_mismatch",
  ],
  [
    "wrong source",
    (value) => {
      value.routes[0].source_path = "/unrelated";
    },
    "expiry_route_mismatch",
  ],
  [
    "wrong destination",
    (value) => {
      value.routes[0].destination_path = "/";
    },
    "expiry_route_mismatch",
  ],
  [
    "unexpected destination",
    (value) => {
      value.routes[1].destination_path = "/contato";
    },
    "expiry_route_mismatch",
  ],
  ["missing outbox", (value) => value.outbox.pop(), "unpublish_receipt_mismatch"],
  ["duplicate outbox", (value) => value.outbox.push(value.outbox[0]), "unpublish_receipt_mismatch"],
  [
    "wrong revision",
    (value) => {
      value.outbox[0].revision_id = revisionId(9);
    },
    "unpublish_receipt_mismatch",
  ],
  [
    "wrong event",
    (value) => {
      value.outbox[0].event_type = "publish";
    },
    "unpublish_receipt_mismatch",
  ],
  [
    "another campaign",
    (value) => {
      value.outbox[0].item_id = itemId(9);
    },
    "outbox_foreign_item",
  ],
  ["foreign extra route", (value) => value.routes.push({ item_id: itemId(9) }), "routes_foreign_item"],
  [
    "missing collection",
    (value) => {
      delete value.publications;
    },
    "snapshot_shape",
  ],
  [
    "invalid collection",
    (value) => {
      value.outbox = null;
    },
    "snapshot_shape",
  ],
]) {
  test(`fails closed for ${name}`, () => {
    const value = snapshot();
    mutate(value);
    const result = validateCampaignExpirySnapshot(fixtures, value);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes(code));
    assert.ok(!JSON.stringify(result).includes(itemId(1)), "diagnostics must not disclose identity");
  });
}

test("all four modes and exact distinct item/revision/run bindings are mandatory", () => {
  const changed = (change) => {
    const value = structuredClone(fixtures);
    change(value);
    return value;
  };
  for (const value of [
    [],
    fixtures.slice(0, 3),
    [...fixtures, fixtures[0]],
    null,
    changed((rows) => {
      rows[0].itemId = rows[1].itemId;
    }),
    changed((rows) => {
      rows[0].revisionId = rows[1].revisionId;
    }),
    changed((rows) => {
      rows[0].revisionId = "missing";
    }),
    changed((rows) => {
      rows[0].slug = rows[1].slug;
    }),
    changed((rows) => {
      rows[0].slug = rows[0].slug.replace("aaaaaaaa", "bbbbbbbb");
    }),
    changed((rows) => {
      rows[0].slug = "unrelated-campaign";
    }),
    changed((rows) => {
      rows[0].expectedStatus = 200;
    }),
    changed((rows) => {
      rows[0].destination = "//external.invalid";
    }),
    changed((rows) => {
      rows[1].destination = "/unexpected";
    }),
  ]) {
    assert.throws(() => validateCampaignExpirySnapshot(value, snapshot()), /FIXTURES_REFUSED/);
  }
});

test("a concurrent worker may finish during bounded read-only backoff", async () => {
  let clock = 0;
  let observations = 0;
  const delays = [];
  const result = await awaitCampaignExpiryEvidence(
    fixtures,
    async (remainingMs) => {
      assert.ok(remainingMs > 0 && remainingMs <= 10_000);
      observations += 1;
      const value = snapshot();
      if (observations < 3) value.outbox.pop();
      return value;
    },
    {
      now: () => clock,
      sleep: async (delay) => {
        delays.push(delay);
        clock += delay;
      },
    },
  );
  assert.deepEqual(delays, [100, 200]);
  assert.deepEqual(result, { verifiedCampaigns: 4, observations: 3 });
});

test("missing evidence fails at the deadline; no indefinite polling or mutation retry", async () => {
  let clock = 0;
  let reads = 0;
  await assert.rejects(
    awaitCampaignExpiryEvidence(
      fixtures,
      async () => {
        reads += 1;
        const value = snapshot();
        value.outbox.pop();
        return value;
      },
      {
        now: () => clock,
        sleep: async (delay) => {
          clock += delay;
        },
      },
    ),
    /STATE_REFUSED:unpublish_receipt_mismatch/,
  );
  assert.equal(clock, 10_000);
  assert.ok(reads <= 16);
});

test("a valid response arriving after the deadline is not accepted", async () => {
  let clock = 0;
  await assert.rejects(
    awaitCampaignExpiryEvidence(
      fixtures,
      async () => {
        clock = 10_001;
        return snapshot();
      },
      { now: () => clock },
    ),
    /STATE_REFUSED:deadline/,
  );
});

test("read errors fail immediately instead of retrying an unknown state", async () => {
  let reads = 0;
  await assert.rejects(
    awaitCampaignExpiryEvidence(fixtures, async () => {
      reads += 1;
      throw new Error("G7_CAMPAIGN_EXPIRY_READ_FAILED:outbox");
    }),
    /READ_FAILED:outbox/,
  );
  assert.equal(reads, 1);
});

function clientFor(value, errorTable = null) {
  const calls = [];
  const keys = {
    cms_content_items: "items",
    cms_publications: "publications",
    cms_published_projection: "projections",
    cms_route_rules: "routes",
    cms_publication_outbox: "outbox",
  };
  return {
    calls,
    from(table) {
      const call = { table };
      calls.push(call);
      return {
        select(columns) {
          call.columns = columns;
          return this;
        },
        in(column, ids) {
          call.idColumn = column;
          call.ids = ids;
          return this;
        },
        eq(column, expected) {
          call.filter = [column, expected];
          return this;
        },
        async abortSignal(signal) {
          call.signal = signal;
          return {
            data: value[keys[table]],
            error: table === errorTable ? { message: "sensitive raw error" } : null,
          };
        },
      };
    },
  };
}

test("every backend read is restricted to the exact fixtures and shares the deadline signal", async () => {
  const admin = clientFor(snapshot());
  assert.deepEqual(await readCampaignExpirySnapshot(admin, fixtures, 10_000), snapshot());
  assert.equal(admin.calls.length, 5);
  for (const call of admin.calls) {
    assert.deepEqual(
      call.ids,
      fixtures.map((fixture) => fixture.itemId),
    );
    assert.equal(call.idColumn, call.table === "cms_content_items" ? "id" : "item_id");
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(call.signal, admin.calls[0].signal);
    assert.ok(!call.columns.includes("*"));
  }
  assert.deepEqual(admin.calls.find((call) => call.table === "cms_publication_outbox").filter, [
    "event_type",
    "unpublish",
  ]);
});

test("backend error payloads are never included in gate diagnostics", async () => {
  await assert.rejects(
    readCampaignExpirySnapshot(clientFor(snapshot(), "cms_publication_outbox"), fixtures, 10_000),
    {
      message: "G7_CAMPAIGN_EXPIRY_READ_FAILED:outbox",
    },
  );
});

test("roundtrip retains one expiry mutation and all four actual HTTP route assertions", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/admin\.rpc\("cms_expire_campaigns"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /expired\.data\s*>=\s*4/);
  assert.match(source, /revisionId: item\.revisionId/);
  assert.match(source, /await awaitCampaignExpiryEvidence\(expiryRoutes/);
  assert.match(source, /readCampaignExpirySnapshot\(admin, expiryRoutes, remainingMs\)/);
  assert.match(source, /response\.status === route\.expectedStatus/);
  assert.match(source, /get\("location"\).*endsWith\(route\.destination\)/s);
  assert.match(source, /statuses: \[301, 404, 410, 302\]/);
  assert.doesNotMatch(source, /cron\.unschedule|cron\.schedule|alter role|disable trigger/i);
});
