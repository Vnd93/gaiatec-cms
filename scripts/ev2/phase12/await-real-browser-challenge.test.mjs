import assert from "node:assert/strict";
import test from "node:test";

import { awaitRealBrowserChallenge } from "./await-real-browser-challenge.mjs";

const BASE = {
  environment: "staging",
  runId: "34616647563",
  runAttempt: 1,
  outputDirectory: "outputs/real-browser-challenge",
  intervalMs: 5_000,
};

function clock(start = 0) {
  let current = start;
  return {
    now: () => current,
    sleep: async (ms) => {
      current += ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

test("it keeps asking until the challenge exists and hands back its path", async () => {
  const time = clock();
  const seen = [];
  const result = await awaitRealBrowserChallenge(BASE, {
    now: time.now,
    sleep: time.sleep,
    log: () => {},
    fetch: (request) => {
      seen.push(request.output);
      return seen.length < 4
        ? { ready: false, reason: "G12_REAL_BROWSER_FETCH_RESPONSE" }
        : { ready: true, stdout: "{}" };
    },
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempt, 4);
  // Caminho novo a cada tentativa: o fetch grava com `wx` e recusaria reescrever o anterior, o que
  // transformaria a segunda tentativa numa falha permanente.
  assert.equal(new Set(seen).size, 4);
  assert.ok(result.challengePath.endsWith("challenge-34616647563-1-4.json"));
});

test("the ready line states the operator deadline, not the wait's own", async () => {
  const time = clock(Date.parse("2026-09-13T03:00:00.000Z"));
  const lines = [];
  await awaitRealBrowserChallenge(BASE, {
    now: time.now,
    sleep: time.sleep,
    log: (line) => lines.push(JSON.parse(line)),
    fetch: () => ({ ready: true, stdout: "{}" }),
  });

  const ready = lines.find((line) => line.event === "g12.real_browser.challenge.ready");
  // O que vincula e a janela de 15 minutos do desafio. Quem le a linha precisa saber, ali, quanto
  // resta — nao descobrir depois que o relatorio foi recusado por idade.
  assert.equal(ready.operatorWindowMs, 15 * 60_000);
  assert.equal(ready.operatorDeadlineHint, "2026-09-13T03:15:00.000Z");
});

test("a wait that runs out says what the last refusal was", async () => {
  const time = clock();
  await assert.rejects(
    awaitRealBrowserChallenge(
      { ...BASE, timeoutMs: 30_000 },
      {
        now: time.now,
        sleep: time.sleep,
        log: () => {},
        fetch: () => ({ ready: false, reason: "G12_REAL_BROWSER_FETCH_BINDING_REFUSED" }),
      },
    ),
    /CHALLENGE_WAIT_TIMED_OUT:G12_REAL_BROWSER_FETCH_BINDING_REFUSED/,
  );
});

test("it refuses a binding it cannot stand behind before spending the window", async () => {
  const refusals = [
    [{ ...BASE, environment: "local" }, /CHALLENGE_WAIT_ENVIRONMENT_INVALID/],
    [{ ...BASE, runId: "42" }, /CHALLENGE_WAIT_RUN_ID_INVALID/],
    [{ ...BASE, runAttempt: 0 }, /CHALLENGE_WAIT_RUN_ATTEMPT_INVALID/],
    [{ ...BASE, outputDirectory: "" }, /CHALLENGE_WAIT_OUTPUT_REQUIRED/],
    [{ ...BASE, intervalMs: 10 }, /CHALLENGE_WAIT_INTERVAL_INVALID/],
  ];
  for (const [input, expected] of refusals)
    await assert.rejects(
      awaitRealBrowserChallenge(input, { fetch: () => ({ ready: true }), log: () => {} }),
      expected,
    );
});
