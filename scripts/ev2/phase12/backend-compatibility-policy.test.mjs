import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { candidateTestIsCiExecuted } from "./backend-test-execution-lib.mjs";

test("every post-baseline migration has executable RLS and application compatibility evidence", () => {
  const policySource = readFileSync("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs", "utf8");
  const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
  const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const versions = readdirSync("supabase/migrations")
    .map((file) => file.match(/^(\d{4})_.+\.sql$/)?.[1])
    .filter((version) => version && version >= "0057");

  for (const version of versions) {
    const entry = policySource.match(new RegExp(`"${version}": \\[(?<paths>[\\s\\S]*?)\\],`))?.groups?.paths;
    assert.ok(entry, `migration ${version} is absent from the rollback policy`);
    const paths = [...entry.matchAll(/"([^"]+\.test\.(?:sql|tsx?|mjs))"/g)].map((match) => match[1]);
    assert.equal(new Set(paths).size, paths.length, `${version}: duplicate compatibility evidence`);
    assert.ok(
      paths.some((path) => path.endsWith(".test.sql")),
      `${version}: at least one database compatibility test required`,
    );
    assert.ok(
      paths.some((path) => !path.endsWith(".test.sql")),
      `${version}: at least one application compatibility test required`,
    );
    for (const path of paths) {
      assert.equal(existsSync(path), true, `${version}:${path}`);
      assert.equal(candidateTestIsCiExecuted(path, packageManifest, ciWorkflow), true, `${version}:${path}`);
    }
  }
});
