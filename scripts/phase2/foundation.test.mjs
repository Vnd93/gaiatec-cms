import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("migrations are sequential and contain RLS enforcement", async () => {
  const migrations = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  assert.deepEqual(
    migrations.map((file) => file.slice(0, 4)),
    migrations.map((_, index) => String(index + 1).padStart(4, "0")),
  );

  const sql = await Promise.all(migrations.map((file) => readFile(`supabase/migrations/${file}`, "utf8")));
  const combined = sql.join("\n").toLowerCase();
  assert.match(combined, /enable row level security/);
  assert.match(combined, /create policy/);
  assert.match(combined, /rdo_rel_update_draft/);
  assert.match(combined, /rdo_rel_delete_draft/);
  assert.match(combined, /extensions\.digest/);
  assert.doesNotMatch(combined, /disable row level security/);
});

test("engineering boundaries exist without importing legacy editorial data", async () => {
  const required = ["src/public", "src/admin", "src/shared", "src/rdo", "supabase/seed"];
  await Promise.all(required.map((path) => access(path)));

  const seed = await readFile("supabase/seed/README.md", "utf8");
  assert.match(seed, /sint[eé]tic/i);
  assert.doesNotMatch(seed, /produto|servi[cç]o|imagem|m[ií]dia/i);
});

test("local validation writes generated evidence outside the documentation indexes", async () => {
  const validator = await readFile("scripts/phase2/validate-local.mjs", "utf8");
  assert.match(validator, /outputs\/validacao-local/);
  assert.match(validator, /ultima-validacao\.md/);
  assert.doesNotMatch(validator, /docs\/validacao-local/);
});

test("preview and private paths are fail-closed in edge configuration", async () => {
  const worker = await readFile("cloudflare/_worker.js", "utf8");
  assert.match(worker, /relatorio-de-obra\|admin\|preview/);
  assert.match(worker, /noindex, nofollow, noarchive/);
  assert.match(worker, /private, no-store/);
  assert.match(worker, /frame-src[^;]*https:\/\/www\.openstreetmap\.org/);
});
