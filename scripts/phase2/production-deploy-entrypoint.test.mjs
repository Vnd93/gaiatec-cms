import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("the npm production entrypoint cannot publish a local environment", async () => {
  const [packageSource, guard] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("scripts/phase2/block-local-production-deploy.mjs", "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(
    packageJson.scripts["deploy:production"],
    "node scripts/phase2/block-local-production-deploy.mjs",
  );
  assert.match(guard, /LOCAL_PRODUCTION_DEPLOY_BLOCKED/);
  assert.match(guard, /.github\/workflows\/deploy-production.yml/);
  assert.match(guard, /.env.local/);
  assert.doesNotMatch(packageJson.scripts["deploy:production"], /wrangler|pages deploy|npm run build/);
});
