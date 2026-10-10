import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const environment of ["staging", "production"]) {
  test(`collection 503 stays fatal with one request and sanitized ${environment} diagnostics`, () => {
    const script = `
      let requests = 0;
      globalThis.fetch = async (_url, options) => {
        requests++;
        const trace = options.headers['x-cms-document-trace'];
        if (${JSON.stringify(environment)} === 'staging' && !/^[a-f0-9-]{36}\\.1$/.test(trace)) throw new Error('missing_trace');
        if (${JSON.stringify(environment)} === 'production' && trace !== undefined) throw new Error('production_trace');
        return new Response('private-payload', { status: 503 });
      };
      try { await import('./scripts/ev2/phase12/probe-supabase-boundary.mjs'); }
      catch (error) { console.log(JSON.stringify({ failure: error.message, requests })); }
    `;
    const ref = environment === "staging" ? "glcqsosxwgmlhzgcsnzv" : "chfuhctnhqgyjowkvllv";
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        CMS_BACKEND_ENVIRONMENT: environment,
        CMS_BACKEND_URL: `https://${ref}.supabase.co`,
        CMS_BACKEND_ANON_KEY: "private-test-key".repeat(3),
        CMS_BACKEND_ORIGIN:
          environment === "staging"
            ? "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev"
            : "https://gaiatecsistemas.com.br",
      },
    });
    assert.equal(result.status, 0);
    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(events.at(-1), { failure: "public_collection_available:503", requests: 1 });
    assert.equal(events.length, environment === "staging" ? 3 : 1);
    if (environment === "staging") {
      assert.equal(events[0].event, "g12.supabase.boundary.collection.start");
      assert.equal(events[0].trace, events[1].trace);
      assert.equal(events[1].event, "g12.supabase.boundary.collection");
      assert.equal(events[1].status, 503);
      assert.equal(typeof events[1].durationMs, "number");
      assert.deepEqual(Object.keys(events[1]).sort(), [
        "durationMs",
        "event",
        "observedAt",
        "status",
        "trace",
      ]);
    }
    assert.doesNotMatch(result.stdout + result.stderr, /private-|supabase\.co|apikey|payload/);
  });
}
