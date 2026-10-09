import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  awaitScheduledPublicationEvidence,
  readScheduledPublicationSnapshot,
  validateScheduledPublicationSnapshot,
} from "./scheduled-publication-evidence.mjs";

const fixture = {
  itemId: "10000000-0000-4000-8000-000000000001",
  revisionId: "20000000-0000-4000-8000-000000000001",
};
const scheduledFor = "2026-10-09T17:40:07Z";
const dueAt = Date.parse(scheduledFor);
const driver = () => ({
  scheduledFor,
  readServerNow: async () => dueAt,
  publishOnce: async () => {
    throw Error("unexpected mutation");
  },
});
const pending = () => ({
  items: [{ id: fixture.itemId, workflow_status: "scheduled", scheduled_for: scheduledFor }],
  publications: [],
  projections: [],
  audit: [],
});
const valid = () => ({
  items: [{ id: fixture.itemId, workflow_status: "published", scheduled_for: null }],
  publications: [{ item_id: fixture.itemId, revision_id: fixture.revisionId }],
  projections: [{ item_id: fixture.itemId, revision_id: fixture.revisionId }],
  audit: [
    {
      target_id: fixture.itemId,
      action: "cms:content.publish",
      event_data: { scheduled: true, revisionId: fixture.revisionId },
    },
  ],
});

test("real scheduler winning the former manual-RPC race is verified read-only", async () => {
  assert.deepEqual(await awaitScheduledPublicationEvidence(fixture, async () => valid(), driver()), {
    verifiedScheduledPublications: 1,
    publicationAttempts: 0,
  });
});

test("pending scheduler uses bounded backoff and returns early only on exact evidence", async () => {
  let time = 0;
  const delays = [];
  let reads = 0;
  const result = await awaitScheduledPublicationEvidence(
    fixture,
    async (remaining) => {
      assert.equal(remaining, 5000);
      return valid();
    },
    {
      ...driver(),
      readServerNow: async (remaining) => {
        assert.equal(remaining, 7500 - time);
        reads += 1;
        return reads < 4 ? dueAt - 1 : dueAt;
      },
      now: () => time,
      sleep: async (ms) => {
        delays.push(ms);
        time += ms;
      },
    },
  );
  assert.equal(result.publicationAttempts, 0);
  assert.deepEqual(delays, [100, 200, 400]);
});

for (const [name, mutate] of [
  [
    "wrong item",
    (s) => {
      s.items[0].id = fixture.revisionId;
    },
  ],
  [
    "still scheduled",
    (s) => {
      s.items[0].workflow_status = "scheduled";
    },
  ],
  [
    "schedule remains",
    (s) => {
      s.items[0].scheduled_for = "2026-10-09T16:35:01Z";
    },
  ],
  [
    "wrong publication revision",
    (s) => {
      s.publications[0].revision_id = fixture.itemId;
    },
  ],
  [
    "wrong projection revision",
    (s) => {
      s.projections[0].revision_id = fixture.itemId;
    },
  ],
  [
    "missing publication",
    (s) => {
      s.publications = [];
    },
  ],
  [
    "missing projection",
    (s) => {
      s.projections = [];
    },
  ],
  [
    "manual rather than scheduled audit",
    (s) => {
      s.audit[0].event_data.scheduled = false;
    },
  ],
  [
    "wrong audit revision",
    (s) => {
      s.audit[0].event_data.revisionId = fixture.itemId;
    },
  ],
  [
    "missing audit",
    (s) => {
      s.audit = [];
    },
  ],
  [
    "duplicate publication",
    (s) => {
      s.publications.push({ ...s.publications[0] });
    },
  ],
]) {
  test(`refuses ${name}`, () => {
    const snapshot = valid();
    mutate(snapshot);
    assert.equal(validateScheduledPublicationSnapshot(fixture, snapshot).valid, false);
  });
}

test("deadline stays at 7.5 seconds and never accepts unproven publication", async () => {
  let time = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(
      fixture,
      async () => ({ items: [], publications: [], projections: [], audit: [] }),
      {
        ...driver(),
        readServerNow: async () => dueAt - 1,
        now: () => time,
        sleep: async (ms) => {
          time += ms;
        },
      },
    ),
    /G7_SCHEDULED_PUBLICATION_DUE_DEADLINE/,
  );
  assert.equal(time, 7500);
});

test("valid result arriving after deadline is refused", async () => {
  let time = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => valid(), {
      ...driver(),
      readServerNow: async () => {
        time = 7501;
        return dueAt;
      },
      now: () => time,
    }),
    /G7_SCHEDULED_PUBLICATION_DUE_DEADLINE/,
  );
});

test("read failure is propagated without retry or error-as-success", async () => {
  let reads = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(
      fixture,
      async () => {
        reads += 1;
        throw Error("read refused");
      },
      driver(),
    ),
    /read refused/,
  );
  assert.equal(reads, 1);
});

test("snapshot reader restricts all reads to the exact fixture and abort deadline", async () => {
  const calls = [];
  const admin = {
    from: (table) => {
      const call = { table, filters: [] };
      calls.push(call);
      return {
        select(columns) {
          call.columns = columns;
          return this;
        },
        eq(key, value) {
          call.filters.push([key, value]);
          return this;
        },
        async abortSignal(signal) {
          assert.equal(signal.aborted, false);
          return { data: [], error: null };
        },
      };
    },
  };
  assert.deepEqual(await readScheduledPublicationSnapshot(admin, fixture, 1000), {
    items: [],
    publications: [],
    projections: [],
    audit: [],
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.filters[0][1] === fixture.itemId));
  assert.deepEqual(calls[3].filters[1], ["action", "cms:content.publish"]);
});

test("integration uses only one bounded row-locked RPC and preserves end-to-end gates", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  assert.match(source, /await awaitScheduledPublicationEvidence\(/);
  assert.equal(source.match(/\badmin\s*\.rpc\("cms_publish_due_schedule"/g)?.length, 1);
  assert.doesNotMatch(source, /setTimeout\(resolve, 7500\)/);
  assert.match(source, /blogPage\.status === 200/);
  assert.match(source, /await cleanup\(\)/);
});

test("five-minute cron is not required to execute within the 7.5-second due wait", async () => {
  let calls = 0;
  let published = false;
  const result = await awaitScheduledPublicationEvidence(
    fixture,
    async () => (published ? valid() : pending()),
    {
      ...driver(),
      publishOnce: async (timeout) => {
        assert.equal(timeout, 5000);
        calls += 1;
        published = true;
        return { error: null };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.verifiedScheduledPublications, 1);
});

test("scheduler winning after the pending read requires exact final proof", async () => {
  let reads = 0;
  const result = await awaitScheduledPublicationEvidence(
    fixture,
    async () => (++reads === 1 ? pending() : valid()),
    {
      ...driver(),
      publishOnce: async () => ({ error: { code: "23514", message: "CMS_SCHEDULE_NOT_DUE" } }),
    },
  );
  assert.equal(result.schedulerWonRace, true);
});

test("not-due error without scheduled publication proof never passes", async () => {
  let calls = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => pending(), {
      ...driver(),
      publishOnce: async () => {
        calls += 1;
        return { error: { code: "23514", message: "CMS_SCHEDULE_NOT_DUE" } };
      },
    }),
    /G7_SCHEDULED_PUBLICATION_STATE_REFUSED/,
  );
  assert.equal(calls, 1);
});

test("unexpected RPC errors fail without retry or success masking", async () => {
  let calls = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => pending(), {
      ...driver(),
      publishOnce: async () => {
        calls += 1;
        return { error: { code: "23514", message: "CMS_OTHER_ERROR" } };
      },
    }),
    /G7_SCHEDULED_PUBLICATION_RPC_REFUSED/,
  );
  assert.equal(calls, 1);
});

test("wrong pending fixture is refused before any mutation", async () => {
  const state = pending();
  state.items[0].id = fixture.revisionId;
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => state, driver()),
    /G7_SCHEDULED_PUBLICATION_PENDING_REFUSED/,
  );
});

test("invalid server clock is refused before any mutation", async () => {
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => valid(), {
      ...driver(),
      readServerNow: async () => NaN,
    }),
    /G7_SCHEDULED_PUBLICATION_CLOCK_REFUSED/,
  );
});
