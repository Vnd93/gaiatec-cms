import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isCanonicalDocumentWriteFence } from "../../supabase/functions/_shared/cms-document-confirmation.ts";

const source = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const body = source.slice(
  source.indexOf("async function neutralizeSyntheticDocuments("),
  source.indexOf("export function buildRecoveredFormRetirementSql("),
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const cleanup = new AsyncFunction(
  "context",
  "writeState",
  "randomUUID",
  "isCanonicalDocumentWriteFence",
  "state",
  "actorIds",
  `${body}\nreturn neutralizeSyntheticDocuments(state, actorIds);`,
);

function fixture(error) {
  const calls = [];
  const document = { id: "synthetic-document", storage_path: "synthetic/manual.pdf" };
  const query = {
    select: () => query,
    in: () => query,
    eq: (key) => (key === "source_reference" ? Promise.resolve({ data: [document] }) : query),
  };
  const context = {
    admin: {
      from: () => query,
      storage: { from: () => ({ list: async () => ({ data: [] }) }) },
      rpc: async (name, input) => {
        calls.push({ name, input });
        return input.p_blob_removed
          ? { error }
          : { data: { status: "neutralized", blobDisposition: "access_revoked" } };
      },
    },
  };
  return {
    calls,
    run: () =>
      cleanup(
        context,
        () => {},
        () => "synthetic-correlation",
        isCanonicalDocumentWriteFence,
        {
          actorId: "synthetic-actor",
          runTag: "synthetic-run",
          expectedSha: "a".repeat(40),
          environment: "staging",
        },
        ["synthetic-actor"],
      ),
  };
}

test("fixture cleanup accepts only the exact canonical fence without retrying the confirmation", async () => {
  for (const code of ["PT409", "40001"]) {
    const { calls, run } = fixture({ code, message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" });
    assert.equal(await run(), 1);
    assert.equal(calls.length, 2); // One durable prepare, one confirmation, no blind retry.
    assert.deepEqual(
      calls.map(({ input }) => input.p_blob_removed),
      [false, true],
    );
  }
});

test("fixture cleanup fails closed on real serialization failures and unrelated refusals", async () => {
  for (const error of [
    { code: "40001", message: "could not serialize" },
    { code: "PT409", message: "CMS_DOCUMENT_LOCK_CONFLICT" },
    { code: "42501", message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" },
    { code: "PT409", message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE_OTHER" },
  ]) {
    const { calls, run } = fixture(error);
    await assert.rejects(run(), /QA_CMS_FIXTURE_DOCUMENT_NEUTRALIZATION_FAILED/);
    assert.equal(calls.length, 2);
  }
});
