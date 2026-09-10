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

describe("lease completion convergence", () => {
  const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");

  it("lets the revocation become visible before deciding it failed", () => {
    // Read from the database seconds after a refusal, every condition the completion requires was
    // satisfied: the actor banned, no session, the profile suspended and no residue. That is a race,
    // not residue, and both surfaces called the completion immediately after revoking.
    for (const source of [fixture, canary]) {
      expect(source).toContain("for (let attempt = 0; attempt < 6; attempt += 1)");
      expect(source).toContain("setTimeout(resolve, 2_000)");
    }
  });

  it("relaxes nothing about what a closed lease means", () => {
    // The same conditions are still required on the last attempt as on the first.
    expect(canary).toContain('result.data?.status !== "cleaned"');
    expect(canary).toContain("result.data?.schemaVersion !== 1");
    expect(canary).toContain('typeof result.data?.replayed !== "boolean"');
    expect(fixture).toContain('completed.data?.status !== "cleaned"');
  });

  it("names the cause when the window closes without it", () => {
    expect(canary).toContain("G12_STAGING_SYNTHETIC_LEASE_COMPLETION_FAILED:${leaseFailureIdentity(result)}");
    expect(canary).toContain("function leaseFailureIdentity(result)");
    const helper = canary.slice(canary.indexOf("function leaseFailureIdentity"));
    expect(helper.slice(0, 700)).toContain('"unknown"');
    expect(helper.slice(0, 700)).not.toMatch(/details|hint|stack/);
  });
});
