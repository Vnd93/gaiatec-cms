import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fixture = readFileSync("scripts/qa/cms-public-bridge-fixture.mjs", "utf8");

describe("public bridge failure identity", () => {
  it("carries what the database answered when the lease cannot be closed", () => {
    // A refusal that names none of the possible causes forces the whole run to be repeated to find
    // out which one it was, which is what happened twice in a row.
    expect(fixture).toContain("ACTOR_LEASE_COMPLETION_FAILED:${");
    expect(fixture).toContain("databaseFailureIdentity(completed.error)");
  });

  it("lets only closed identifiers travel", () => {
    // A SQLSTATE is five characters, and this project's own exceptions are closed slugs. Anything
    // else collapses to unknown: no free text, no address, no payload.
    expect(fixture).toContain("const SAFE_DB_CODE = /^[0-9A-Z]{5}$/;");
    expect(fixture).toContain("const SAFE_DB_MESSAGE = /^CMS_[A-Z0-9_]{3,60}$/;");
    const helper = fixture.slice(fixture.indexOf("function databaseFailureIdentity"));
    const body = helper.slice(0, helper.indexOf("}\n") + 2);
    expect(body).toContain('"unknown"');
    expect(body).not.toMatch(/details|hint|stack/);
  });
});
