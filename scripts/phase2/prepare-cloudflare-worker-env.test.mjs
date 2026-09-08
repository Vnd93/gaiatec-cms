import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCloudflareWorkerBindings,
  resolveCloudflareWorkerEnvironment,
} from "../prepare-cloudflare-worker-env.mjs";

const production = {
  VITE_CMS_ENVIRONMENT: "production",
  VITE_SUPABASE_URL: "https://chfuhctnhqgyjowkvllv.supabase.co",
  VITE_SUPABASE_ANON_KEY: "masked-production-anon-key",
};

test("production Worker preparation never invokes Vite's local-file env loader", () => {
  let loaderCalls = 0;
  const resolved = resolveCloudflareWorkerEnvironment(production, {
    cwd: "ignored",
    loadEnvironment() {
      loaderCalls += 1;
      return {
        VITE_SUPABASE_URL: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
        VITE_SUPABASE_ANON_KEY: "staging-from-env-production-local",
      };
    },
  });

  assert.equal(loaderCalls, 0);
  assert.equal(resolved.VITE_SUPABASE_URL, production.VITE_SUPABASE_URL);
  assert.deepEqual(resolveCloudflareWorkerBindings(resolved), {
    publicApi: "https://chfuhctnhqgyjowkvllv.supabase.co/functions/v1/cms-public",
    anonKey: "masked-production-anon-key",
  });
});

test("production Worker preparation fails closed for absent or non-production bindings", () => {
  assert.throws(
    () => resolveCloudflareWorkerBindings({ VITE_CMS_ENVIRONMENT: "production" }),
    /CLOUDFLARE_WORKER_PRODUCTION_BINDINGS_REQUIRED/,
  );
  assert.throws(
    () =>
      resolveCloudflareWorkerBindings({
        ...production,
        VITE_SUPABASE_URL: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
      }),
    /CLOUDFLARE_WORKER_PRODUCTION_TARGET_REFUSED/,
  );
  assert.throws(
    () =>
      resolveCloudflareWorkerBindings({
        ...production,
        VITE_SUPABASE_URL: "https://chfuhctnhqgyjowkvllv.supabase.co/from-local-file",
      }),
    /CLOUDFLARE_WORKER_PRODUCTION_TARGET_REFUSED/,
  );
});

test("non-production preparation keeps the existing Vite development env behavior", () => {
  let loaderCalls = 0;
  const loaded = resolveCloudflareWorkerEnvironment(
    { VITE_CMS_ENVIRONMENT: "staging" },
    {
      cwd: "workspace",
      loadEnvironment(mode, cwd, prefix) {
        loaderCalls += 1;
        assert.deepEqual([mode, cwd, prefix], ["production", "workspace", ""]);
        return { VITE_SUPABASE_URL: "http://127.0.0.1:54321" };
      },
    },
  );
  assert.equal(loaderCalls, 1);
  assert.equal(loaded.VITE_SUPABASE_URL, "http://127.0.0.1:54321");
});
