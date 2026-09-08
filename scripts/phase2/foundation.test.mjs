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
  assert.doesNotMatch(
    worker,
    /export\s+(?:const|let|var)\s+/,
    "Cloudflare module workers reject named exports that are not callable entrypoints",
  );
  assert.match(worker, /telemetryRoute\(url\.pathname\)/);
  assert.doesNotMatch(worker, /route:\s*url\.pathname/);
  assert.doesNotMatch(worker, /headers\.set\("X-Correlation-ID"/);
});

test("edge telemetry redacts capability tokens and internal identifiers", async () => {
  const { default: worker, telemetryRoute } = await import("../../cloudflare/_worker.js");
  assert.equal(telemetryRoute(`/preview/${"s".repeat(43)}`), "/preview/:token");
  assert.equal(telemetryRoute("/relatorio-de-obra/assinar/capability-secret"), "/relatorio-de-obra/:route");
  assert.equal(telemetryRoute("/relatorio-de-obra/relatorio/private-reference"), "/relatorio-de-obra/:route");
  assert.equal(telemetryRoute("/admin/conteudo/81000000-0000-4000-8000-000000000001"), "/admin/:route");
  const sensitivePaths = [
    "/foo/cliente%40empresa.com",
    "/admin/paginas/018f7777-7777-7777-8777-777777777777",
    `/arquivo/${"a".repeat(64)}`,
    `/assets/chunk-${"b".repeat(40)}.wasm`,
    "/sitemap-clienteconfidencial.xml",
    "/página/Cliente-Confidencial-☎",
  ];
  for (const path of sensitivePaths) {
    const safe = telemetryRoute(path);
    assert.doesNotMatch(safe, /cliente|018f|a{16}|b{16}|confidencial|☎/i);
  }

  const captured = [];
  const originalLog = console.log;
  console.log = (message) => captured.push(String(message));
  const token = "customer-private-capability-token";
  const release = "c".repeat(40);
  try {
    await worker.fetch(
      new Request(`https://gaiatecsistemas.com.br/relatorio-de-obra/assinar/${token}`, {
        headers: { "x-correlation-id": "incoming-private-reference" },
      }),
      {
        CF_PAGES_BRANCH: "main",
        CF_PAGES_COMMIT_SHA: release,
        ASSETS: { fetch: async () => new Response("<!doctype html><title>GAIATEC</title>") },
      },
    );
  } finally {
    console.log = originalLog;
  }
  const serialized = captured.join("\n");
  assert.doesNotMatch(serialized, new RegExp(token));
  assert.doesNotMatch(serialized, /incoming-private-reference/);
  assert.doesNotMatch(serialized, new RegExp(release));
});
