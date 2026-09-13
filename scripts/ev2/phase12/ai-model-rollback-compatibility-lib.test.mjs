import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AI_ACTIVE_RESPONSE_MODEL,
  AI_LEGACY_RESPONSE_MODEL,
  evaluateAiModelRollbackCompatibility,
  fetchAiModelRollbackBundle,
} from "./ai-model-rollback-compatibility-lib.mjs";

async function fixture({ activeInSource = true, activeInBundle = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "g12-ai-model-rollback-"));
  const contracts = join(root, "src", "shared", "contracts");
  const dist = join(root, "dist", "assets");
  await mkdir(contracts, { recursive: true });
  await mkdir(dist, { recursive: true });
  const active = activeInSource ? AI_ACTIVE_RESPONSE_MODEL : AI_LEGACY_RESPONSE_MODEL;
  await writeFile(
    join(contracts, "ev2-ai.ts"),
    [
      `export const EV2_AI_ACTIVE_OPENROUTER_MODEL = "${active}" as const;`,
      AI_LEGACY_RESPONSE_MODEL,
      "z.enum(EV2_AI_COMPATIBLE_RESPONSE_MODELS)",
      "providerModel: Ev2AiCompatibleResponseModelSchema,",
      "allowedModel: Ev2AiCompatibleResponseModelSchema,",
      "Ev2AiCompatibleResponseModelSchema ".repeat(6),
    ].join("\n"),
  );
  await writeFile(
    join(contracts, "ev2-ai-execute.ts"),
    'import { Ev2AiCompatibleResponseModelSchema } from "./ev2-ai";\n' +
      "providerModel: CompatibleResponseModel,\nallowedModel: CompatibleResponseModel.optional(),\n" +
      "CompatibleResponseModel ".repeat(5),
  );
  await writeFile(
    join(dist, "index.js"),
    `${AI_LEGACY_RESPONSE_MODEL}\n${activeInBundle ? AI_ACTIVE_RESPONSE_MODEL : ""}`,
  );
  return { root, dist: join(root, "dist") };
}

test("accepts only a source and built artifact that both carry the two-model bridge", async (t) => {
  const valid = await fixture();
  t.after(() => rm(valid.root, { recursive: true, force: true }));
  const result = evaluateAiModelRollbackCompatibility(valid.root, valid.dist);
  assert.equal(result.outcome, "pass");
  assert.equal(result.sourceBridgeVerified, true);
  assert.equal(result.bundleBridgeVerified, true);
});

test("accepts the exact checked-in source contract with a compatible synthetic bundle", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "g12-ai-model-real-contract-"));
  const dist = join(root, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, "contract.js"), `${AI_LEGACY_RESPONSE_MODEL}\n${AI_ACTIVE_RESPONSE_MODEL}`);
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(evaluateAiModelRollbackCompatibility(process.cwd(), dist).outcome, "pass");
});

test("rejects pre-bridge source or bundle independently", async (t) => {
  const sourceMissing = await fixture({ activeInSource: false });
  const bundleMissing = await fixture({ activeInBundle: false });
  t.after(() =>
    Promise.all([sourceMissing, bundleMissing].map(({ root }) => rm(root, { recursive: true, force: true }))),
  );
  assert.ok(
    evaluateAiModelRollbackCompatibility(sourceMissing.root, sourceMissing.dist).violations.includes(
      "active_model_contract_missing",
    ),
  );
  assert.ok(
    evaluateAiModelRollbackCompatibility(bundleMissing.root, bundleMissing.dist).violations.includes(
      "active_model_bundle_missing",
    ),
  );
});

test("rejects model literals that never coexist in one compiled contract chunk", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await writeFile(join(value.dist, "assets", "index.js"), AI_LEGACY_RESPONSE_MODEL);
  await writeFile(join(value.dist, "assets", "lazy.js"), AI_ACTIVE_RESPONSE_MODEL);
  assert.ok(
    evaluateAiModelRollbackCompatibility(value.root, value.dist).violations.includes(
      "compatible_models_not_colocated_in_bundle",
    ),
  );
});

test("crawls only bounded same-origin JavaScript from an immutable production deployment", async () => {
  const origin = "https://abc123.gaiatec-website.pages.dev/";
  const responses = new Map([
    [origin, '<script type="module" src="/assets/main.js"></script>'],
    [
      `${origin}assets/main.js`,
      [
        'import("./dynamic.js");',
        'import{a}from"./admin.js";',
        'export{b}from"./catalog.js";',
        'import"./side-effect.js";',
        'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/preload.js","assets/styles.css"])))=>i.map(i=>d[i]);',
        'const decoys=["Node.js","../lib/_stream_readable.js"];',
      ].join(""),
    ],
    [`${origin}assets/dynamic.js`, "export default 'dynamic';"],
    [`${origin}assets/admin.js`, `${AI_LEGACY_RESPONSE_MODEL}\n${AI_ACTIVE_RESPONSE_MODEL}`],
    [`${origin}assets/catalog.js`, "export default 'catalog';"],
    [`${origin}assets/side-effect.js`, "globalThis.sideEffect = true;"],
    [`${origin}assets/preload.js`, "export default 'preload';"],
  ]);
  const requested = [];
  const fetchImplementation = async (url, init) => {
    requested.push([url, init.redirect]);
    return new Response(responses.get(url) ?? "missing", { status: responses.has(url) ? 200 : 404 });
  };
  const assets = await fetchAiModelRollbackBundle(origin, fetchImplementation);
  assert.equal(assets.length, 6);
  assert.deepEqual(requested, [
    [origin, "error"],
    [`${origin}assets/main.js`, "error"],
    [`${origin}assets/dynamic.js`, "error"],
    [`${origin}assets/admin.js`, "error"],
    [`${origin}assets/catalog.js`, "error"],
    [`${origin}assets/side-effect.js`, "error"],
    [`${origin}assets/preload.js`, "error"],
  ]);
  await assert.rejects(
    fetchAiModelRollbackBundle("https://gaiatecsistemas.com.br/", fetchImplementation),
    /G12_AI_MODEL_ROLLBACK_ORIGIN_REFUSED/,
  );
});

test("accepts the real Vite graph size while keeping the remote crawl bounded", async () => {
  const origin = "https://abc123.gaiatec-website.pages.dev/";
  const graph = (count) => {
    const responses = new Map([[origin, '<script type="module" src="/assets/chunk-0.js"></script>']]);
    for (let index = 0; index < count; index += 1) {
      const next = index + 1 < count ? `import("./chunk-${index + 1}.js");` : "";
      responses.set(`${origin}assets/chunk-${index}.js`, next);
    }
    return async (url) =>
      new Response(responses.get(url) ?? "missing", { status: responses.has(url) ? 200 : 404 });
  };

  assert.equal((await fetchAiModelRollbackBundle(origin, graph(130))).length, 130);
  await assert.rejects(
    fetchAiModelRollbackBundle(origin, graph(257)),
    /G12_AI_MODEL_ROLLBACK_ASSET_SET_INVALID/,
  );
});

test("rejects structural cross-origin imports instead of silently skipping them", async () => {
  const origin = "https://abc123.gaiatec-website.pages.dev/";
  const responses = new Map([
    [origin, '<script type="module" src="/assets/main.js"></script>'],
    [`${origin}assets/main.js`, 'import("https://cdn.example.test/external.js");'],
  ]);
  await assert.rejects(
    fetchAiModelRollbackBundle(
      origin,
      async (url) =>
        new Response(responses.get(url) ?? "missing", { status: responses.has(url) ? 200 : 404 }),
    ),
    /G12_AI_MODEL_ROLLBACK_ASSET_REFUSED/,
  );
});
