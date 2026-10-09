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
  assert.deepEqual(await awaitScheduledPublicationEvidence(fixture, async () => valid()), {
    verifiedScheduledPublications: 1,
    observations: 1,
  });
});

test("pending scheduler uses bounded backoff and returns early only on exact evidence", async () => {
  let time = 0;
  const delays = [];
  let reads = 0;
  const result = await awaitScheduledPublicationEvidence(
    fixture,
    async (remaining) => {
      assert.equal(remaining, 7500 - time);
      reads += 1;
      const snapshot = valid();
      if (reads < 4) snapshot.items[0].workflow_status = "scheduled";
      return snapshot;
    },
    {
      now: () => time,
      sleep: async (ms) => {
        delays.push(ms);
        time += ms;
      },
    },
  );
  assert.equal(result.observations, 4);
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
        now: () => time,
        sleep: async (ms) => {
          time += ms;
        },
      },
    ),
    /G7_SCHEDULED_PUBLICATION_STATE_REFUSED/,
  );
  assert.equal(time, 7500);
});

test("valid result arriving after deadline is refused", async () => {
  let time = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(
      fixture,
      async () => {
        time = 7501;
        return valid();
      },
      { now: () => time },
    ),
    /G7_SCHEDULED_PUBLICATION_STATE_REFUSED/,
  );
});

test("read failure is propagated without retry or error-as-success", async () => {
  let reads = 0;
  await assert.rejects(
    awaitScheduledPublicationEvidence(fixture, async () => {
      reads += 1;
      throw Error("read refused");
    }),
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

test("integration observes scheduler instead of issuing a duplicate mutation", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  assert.match(source, /await awaitScheduledPublicationEvidence\(/);
  assert.doesNotMatch(source, /admin\.rpc\("cms_publish_due_schedule"/);
  assert.doesNotMatch(source, /setTimeout\(resolve, 7500\)/);
  assert.match(source, /blogPage\.status === 200/);
  assert.match(source, /await cleanup\(\)/);
});
