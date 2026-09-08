import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { revisionProvenanceSql } from "./cms-public-bridge-fixture-sql.mjs";

function decodeSqlJson(sql) {
  const match = /^convert_from\(decode\('([A-Za-z0-9+/]+={0,2})','base64'\),'UTF8'\)::jsonb$/.exec(sql);
  assert.ok(match, "expected a base64-backed JSONB SQL literal");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

test("fixture revision SQL serializes the existing non-empty provenance arrays", async () => {
  const provenance = [
    {
      sourceKind: "owner_authored",
      authorizationReference: "QA-CMS-FINAL-20260908-aaaaaaaa",
      rightsConfirmed: true,
    },
  ];

  const decoded = decodeSqlJson(revisionProvenanceSql(provenance));
  assert.ok(Array.isArray(decoded));
  assert.equal(decoded.length, 1);
  assert.deepEqual(decoded, provenance);

  const fixture = await readFile("scripts/qa/cms-public-bridge-fixture.mjs", "utf8");
  assert.match(fixture, /revisionProvenanceSql\(page\.provenance\)/);
  assert.match(fixture, /revisionProvenanceSql\(campaign\.provenance\)/);
});

test("fixture revision SQL rejects an empty or object-shaped provenance value", () => {
  for (const value of [[], {}, null]) {
    assert.throws(() => revisionProvenanceSql(value), /QA_CMS_PUBLIC_BRIDGE_REVISION_PROVENANCE_INVALID/);
  }
});
