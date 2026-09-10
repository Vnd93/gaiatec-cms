import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// percentile(values, p) returns sorted[ceil(p/100 * n) - 1]. At n = 5 that is sorted[4], the largest
// sample, so a five sample probe does not measure a p95 at all: it publishes the worst response of
// the window as the tail and lets a single cold start decide a release gate. Correcting this one
// probe at a time left 25 of 33 invocations still measuring a maximum, which is why the corrected
// value belongs in the default rather than in each caller.
const MINIMUM_SAMPLES = 20;
const MINIMUM_WARMUP = 20;

test("the probe defaults measure a percentile and warm the routes first", async () => {
  const probe = await readFile("scripts/ev2/phase12/rollout-probe.mjs", "utf8");
  assert.match(probe, /EV2_G12_SAMPLE_COUNT \?\? 20\)/);
  // Aquecer menos do que se mede deixa parte da janela medida caindo em isolate frio, que foi
  // exatamente o que reprovou /produtos com p50 de 417 ms e p95 de 1934 ms.
  assert.match(probe, /EV2_G12_WARMUP_SAMPLES_PER_ROUTE \?\? sampleCount\)/);

  // The default must not depend on the environment: staging gates block production just as hard.
  assert.doesNotMatch(probe, /EV2_G12_SAMPLE_COUNT \?\? \(environment/);

  // Readiness keeps its short default on purpose, so a genuinely broken target still fails fast and
  // only the callers that just deployed something wait longer.
  assert.match(probe, /EV2_G12_READINESS_ATTEMPTS \?\? 10\)/);
  assert.match(probe, /EV2_G12_READINESS_INTERVAL_MS \?\? 1_500\)/);
});

test("no workflow or script downgrades the probe below the corrected sampling", async () => {
  const workflows = (await readdir(".github/workflows")).filter((file) => file.endsWith(".yml"));
  const scripts = (await readdir("scripts/ev2/phase12")).filter(
    (file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"),
  );
  const sources = [
    ...workflows.map((file) => `.github/workflows/${file}`),
    ...scripts.map((file) => `scripts/ev2/phase12/${file}`),
  ];

  let overrides = 0;
  for (const path of sources) {
    const source = await readFile(path, "utf8");
    for (const [, value] of source.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)) {
      overrides += 1;
      assert.ok(
        Number(value) >= MINIMUM_SAMPLES,
        `${path} samples ${value} times, which reports a maximum instead of a p95`,
      );
    }
    const samples = [...source.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)].map((m) => Number(m[1]));
    const warmups = [...source.matchAll(/EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    for (const value of warmups)
      assert.ok(value >= MINIMUM_WARMUP, `${path} warms only ${value} times per route`);
    // Nenhum ponto pode medir mais do que aquece, senao a primeira amostra medida e a fria.
    for (const [index, warmup] of warmups.entries())
      assert.ok(
        warmup >= (samples[index] ?? MINIMUM_WARMUP),
        `${path} measures ${samples[index]} but warms only ${warmup}`,
      );
  }
  // A refactor that removed every explicit override would make this test pass vacuously.
  assert.ok(overrides >= 20, `only ${overrides} explicit sample counts were inspected`);
});

test("raising the sampling did not relax any budget", async () => {
  const guard = await readFile("scripts/ev2/phase12/release-guard-lib.mjs", "utf8");
  assert.match(guard, /availabilityPercent: 99\.9/);
  assert.match(guard, /http5xxRatePercent: 0\.1/);
  assert.match(guard, /publicP95Ms: 1500/);
});
