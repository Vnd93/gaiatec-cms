import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildRealBrowserAttestationVariable,
  challengeNonceSha256,
  realBrowserAttestationVariableName,
  serializeRealBrowserAttestationVariable,
} from "./real-browser-attestation-store-lib.mjs";
import { runRealBrowserAttestationStore } from "./real-browser-attestation-store.mjs";

const now = new Date("2026-09-08T15:00:00.000Z");
const evidenceSalt = "http-test-evidence-salt-1234567890abcdef";
const screenshot = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function fixture() {
  const candidateSha = "a".repeat(40);
  const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
  const report = {
    schemaVersion: 1,
    event: "g12.real_browser.attestation",
    repository: "Vnd93/gaiatec-cms",
    environment: "staging",
    candidateSha,
    documentReleaseSha: candidateSha,
    healthReleaseSha: candidateSha,
    deploymentIdentityObserved: true,
    runId: "7654321",
    runAttempt: 2,
    runTag,
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    campaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    emailSha256: createHash("sha256").update("qa-public-deadbeef@example.invalid").digest("hex"),
    reference: "LD-A1B2C3D4E5",
    responseStatus: 201,
    uiSuccessObserved: true,
    visibleSuccessText: "Solicitação recebida. Protocolo LD-A1B2C3D4E5.",
    observedAt: "2026-09-08T14:59:30.000Z",
    challengeNonceSha256: challengeNonceSha256("browser_challenge_nonce_1234567890abcdef"),
    turnstile: {
      provider: "cloudflare-turnstile",
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
    },
  };
  const broker = {
    controlSha: "b".repeat(40),
    runId: "998877",
    runAttempt: 1,
    actor: "Vnd93",
    triggeringActor: "Vnd93",
    sealedAt: now.toISOString(),
  };
  const wrapper = buildRealBrowserAttestationVariable({
    report,
    screenshot,
    broker,
    evidenceSalt,
    now,
  });
  return { report, broker, wrapper };
}

function coreEnvironment(overrides = {}) {
  return {
    GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
    RELEASE_GUARD_TOKEN: "release-guard-token-never-print-123456789",
    EVIDENCE_SALT: evidenceSalt,
    ...overrides,
  };
}

function putEnvironment(overrides = {}) {
  return coreEnvironment({
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "Vnd93/gaiatec-cms/.github/workflows/submit-real-browser-attestation.yml@refs/heads/main",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_ACTOR: "Vnd93",
    GITHUB_TRIGGERING_ACTOR: "Vnd93",
    GITHUB_RUN_ID: "998877",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "b".repeat(40),
    CONTROL_SHA: "b".repeat(40),
    ...overrides,
  });
}

function expectedArguments(report, controlSha, extra = []) {
  return [
    "--environment",
    report.environment,
    "--candidate-sha",
    report.candidateSha,
    "--run-id",
    report.runId,
    "--run-attempt",
    String(report.runAttempt),
    "--run-tag",
    report.runTag,
    "--origin",
    report.origin,
    "--campaign-path",
    report.campaignPath,
    "--email-sha256",
    report.emailSha256,
    "--challenge-nonce-sha256",
    report.challengeNonceSha256,
    "--control-sha",
    controlSha,
    ...extra,
  ];
}

function clearArguments(report, controlSha, extra = []) {
  return [
    "--environment",
    report.environment,
    "--candidate-sha",
    report.candidateSha,
    "--run-id",
    report.runId,
    "--run-attempt",
    String(report.runAttempt),
    "--control-sha",
    controlSha,
    ...extra,
  ];
}

function normalizedHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

function githubServer({
  initial = {},
  userLogin = "Vnd93",
  userStatus = 200,
  variableGetFailures = new Map(),
  variableStatus = null,
  deleteStatus = null,
  loseFirstDeleteResponse = false,
  staleReadsAfterDelete = 0,
  beforeDelete = null,
  beforeVariableGet = null,
} = {}) {
  const variables = new Map(Object.entries(initial));
  const calls = [];
  let lostDelete = false;
  const getCounts = new Map();
  const deletedSnapshots = new Map();
  const postDeleteReads = new Map();
  const fetchImplementation = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? "GET";
    const headers = normalizedHeaders(options.headers);
    calls.push({ url: url.href, path: url.pathname, method, headers, body: options.body });
    if (url.pathname === "/user") {
      return new Response(
        JSON.stringify(userStatus === 200 ? { login: userLogin } : { message: "refused" }),
        {
          status: userStatus,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const collection = "/repos/Vnd93/gaiatec-cms/actions/variables";
    if (url.pathname === collection && method === "POST") {
      if (variableStatus) {
        return new Response(JSON.stringify({ message: "refused" }), {
          status: variableStatus,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(options.body);
      if (variables.has(body.name)) {
        return new Response(JSON.stringify({ message: "exists" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }
      variables.set(body.name, {
        name: body.name,
        value: body.value,
        created_at: "2026-09-08T14:59:59.000Z",
        updated_at: "2026-09-08T14:59:59.000Z",
      });
      return new Response(JSON.stringify({ name: body.name }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.startsWith(`${collection}/`)) {
      const variable = decodeURIComponent(url.pathname.slice(collection.length + 1));
      if (method === "GET") {
        const count = (getCounts.get(variable) ?? 0) + 1;
        getCounts.set(variable, count);
        if (beforeVariableGet) await beforeVariableGet({ variable, count, variables });
        const hiddenFor = variableGetFailures.get(variable) ?? 0;
        if (!variables.has(variable) && deletedSnapshots.has(variable)) {
          const staleReadCount = (postDeleteReads.get(variable) ?? 0) + 1;
          postDeleteReads.set(variable, staleReadCount);
          if (staleReadCount <= staleReadsAfterDelete) {
            return new Response(JSON.stringify(deletedSnapshots.get(variable)), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        if (count <= hiddenFor || !variables.has(variable)) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (variableStatus) {
          return new Response(JSON.stringify({ message: "refused" }), {
            status: variableStatus,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(variables.get(variable)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE") {
        if (beforeDelete) await beforeDelete();
        if (deleteStatus) {
          return new Response(JSON.stringify({ message: "delete refused" }), {
            status: deleteStatus,
            headers: { "Content-Type": "application/json" },
          });
        }
        const deletedSnapshot = variables.get(variable);
        const existed = variables.delete(variable);
        if (existed && staleReadsAfterDelete > 0) deletedSnapshots.set(variable, deletedSnapshot);
        if (loseFirstDeleteResponse && !lostDelete) {
          lostDelete = true;
          throw new TypeError("simulated lost DELETE response");
        }
        return new Response(existed ? null : JSON.stringify({ message: "Not Found" }), {
          status: existed ? 204 : 404,
          headers: existed ? undefined : { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ message: "unexpected" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { variables, calls, fetchImplementation };
}

async function runQuiet(options) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...values) => logs.push(values.join(" "));
  try {
    await runRealBrowserAttestationStore({
      ...options,
      sleep: options.sleep ?? (async () => undefined),
      now: options.now ?? (() => new Date(now)),
    });
  } finally {
    console.log = originalLog;
  }
  return logs;
}

async function writeInputFiles(directory, report, png = screenshot) {
  const reportPath = join(directory, "report.json");
  const screenshotPath = join(directory, "proof.png");
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 });
  await writeFile(screenshotPath, png, { mode: 0o600 });
  return { reportPath, screenshotPath };
}

test("put authenticates Vnd93, creates only when absent, and rejects every occupied name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-put-"));
  try {
    const input = fixture();
    const files = await writeInputFiles(directory, input.report);
    const server = githubServer();
    const argv = [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "put",
      "--file",
      files.reportPath,
      "--screenshot",
      files.screenshotPath,
    ];
    const logs = await runQuiet({
      argv,
      environment: putEnvironment(),
      fetchImplementation: server.fetchImplementation,
    });
    const variable = realBrowserAttestationVariableName(input.report);
    assert.equal(server.variables.has(variable), true);
    assert.deepEqual(
      server.calls.map(({ method, path }) => [method, path]),
      [
        ["GET", "/user"],
        ["GET", `/repos/Vnd93/gaiatec-cms/actions/variables/${variable}`],
        ["POST", "/repos/Vnd93/gaiatec-cms/actions/variables"],
        ["GET", `/repos/Vnd93/gaiatec-cms/actions/variables/${variable}`],
      ],
    );
    assert.doesNotMatch(logs.join("\n"), /release-guard-token|evidence-salt|example\.invalid/i);

    server.calls.length = 0;
    await assert.rejects(
      runQuiet({ argv, environment: putEnvironment(), fetchImplementation: server.fetchImplementation }),
      /STORE_OCCUPIED/,
    );
    assert.deepEqual(
      server.calls.map(({ method }) => method),
      ["GET", "GET"],
    );

    const occupiedReport = {
      ...input.report,
      reference: "LD-0000000000",
      visibleSuccessText: "Solicitação recebida. Protocolo LD-0000000000.",
    };
    await mkdir(join(directory, "occupied"));
    const occupiedFiles = await writeInputFiles(join(directory, "occupied"), occupiedReport);
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "put",
          "--file",
          occupiedFiles.reportPath,
          "--screenshot",
          occupiedFiles.screenshotPath,
        ],
        environment: putEnvironment(),
        fetchImplementation: server.fetchImplementation,
      }),
      /STORE_OCCUPIED/,
    );
    assert.equal(server.calls.filter(({ method }) => method === "POST").length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("put tolerates a transient 404 only while verifying its exact newly created attestation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-put-eventual-write-"));
  try {
    const input = fixture();
    const files = await writeInputFiles(directory, input.report);
    const variable = realBrowserAttestationVariableName(input.report);
    const server = githubServer({ variableGetFailures: new Map([[variable, 2]]) });
    const sleeps = [];
    await runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "put",
        "--file",
        files.reportPath,
        "--screenshot",
        files.screenshotPath,
      ],
      environment: putEnvironment(),
      fetchImplementation: server.fetchImplementation,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    });

    assert.equal(server.variables.has(variable), true);
    assert.deepEqual(
      server.calls.map(({ method }) => method),
      ["GET", "GET", "POST", "GET", "GET"],
    );
    assert.equal(server.calls.filter(({ method }) => method === "POST").length, 1);
    assert.deepEqual(sleeps, [1_000]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("put refuses non-broker execution, wrong GitHub identity, auth errors, and transport exhaustion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-auth-"));
  try {
    const input = fixture();
    const files = await writeInputFiles(directory, input.report);
    const argv = [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "put",
      "--file",
      files.reportPath,
      "--screenshot",
      files.screenshotPath,
    ];
    let calls = 0;
    await assert.rejects(
      runQuiet({
        argv,
        environment: putEnvironment({ GITHUB_ACTIONS: "false" }),
        fetchImplementation: async () => {
          calls += 1;
          throw new Error("must not call");
        },
      }),
      /BROKER_ENVIRONMENT_REFUSED/,
    );
    assert.equal(calls, 0);

    const wrongUser = githubServer({ userLogin: "someone-else" });
    await assert.rejects(
      runQuiet({ argv, environment: putEnvironment(), fetchImplementation: wrongUser.fetchImplementation }),
      /GITHUB_IDENTITY_REFUSED/,
    );
    assert.deepEqual(
      wrongUser.calls.map(({ path }) => path),
      ["/user"],
    );

    for (const status of [401, 403]) {
      const refused = githubServer({ userStatus: status });
      await assert.rejects(
        runQuiet({ argv, environment: putEnvironment(), fetchImplementation: refused.fetchImplementation }),
        new RegExp(`API_REFUSED:${status}`),
      );
      assert.equal(refused.calls.length, 1);
    }

    let transportCalls = 0;
    await assert.rejects(
      runQuiet({
        argv,
        environment: putEnvironment(),
        fetchImplementation: async () => {
          transportCalls += 1;
          throw new TypeError("network unavailable");
        },
      }),
      /API_RETRY_EXHAUSTED:transport/,
    );
    assert.equal(transportCalls, 4);

    const occupiedRace = githubServer({ variableStatus: 422 });
    await assert.rejects(
      runQuiet({
        argv,
        environment: putEnvironment(),
        fetchImplementation: occupiedRace.fetchImplementation,
      }),
      /API_REFUSED:422/,
    );
    assert.deepEqual(
      occupiedRace.calls.map(({ method }) => method),
      ["GET", "GET", "POST"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume polls only confirmed 404, verifies all bindings, deletes, then materializes sanitized outputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-consume-"));
  try {
    const input = fixture();
    const variable = input.wrapper.variable;
    const outputJson = join(directory, "outputs", "attestation.json");
    const outputPng = join(directory, "outputs", "proof.png");
    const githubOutput = join(directory, "github-output.txt");
    const server = githubServer({
      initial: {
        [variable]: {
          name: variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      variableGetFailures: new Map([[variable, 2]]),
    });
    let liveClock = new Date("2026-09-08T14:45:00.000Z");
    const logs = await runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "consume",
        ...expectedArguments(input.report, input.broker.controlSha),
        "--output-json",
        outputJson,
        "--output-png",
        outputPng,
        "--poll-seconds",
        "2",
        "--poll-interval-ms",
        "1000",
      ],
      environment: coreEnvironment({ GITHUB_OUTPUT: githubOutput }),
      fetchImplementation: server.fetchImplementation,
      sleep: async () => {
        liveClock = new Date(now);
      },
      now: () => new Date(liveClock),
    });

    assert.deepEqual(
      server.calls.map(({ method }) => method),
      ["GET", "GET", "GET", "GET", "GET", "DELETE", "GET"],
    );
    assert.equal(server.variables.has(variable), false);
    const materialized = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(materialized.variableCleared, true);
    assert.equal(materialized.candidateSha, input.report.candidateSha);
    assert.equal(materialized.screenshot.sha256, input.wrapper.screenshot.sha256);
    assert.equal(materialized.screenshot.bytes, screenshot.length);
    assert.equal("base64" in materialized.screenshot, false);
    assert.deepEqual(await readFile(outputPng), screenshot);
    const actionOutput = await readFile(githubOutput, "utf8");
    assert.match(actionOutput, /variable_cleared=true/);
    assert.match(actionOutput, new RegExp(`screenshot_sha256=${input.wrapper.screenshot.sha256}`));
    assert.equal(actionOutput.includes(`screenshot_bytes=${screenshot.length}`), true);
    assert.doesNotMatch(actionOutput, /base64|example\.invalid/i);
    assert.doesNotMatch(logs.join("\n"), /example\.invalid|release-guard-token|evidence-salt/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume refuses SHA, runTag, reference, cData, freshness, auth, and response mismatches before DELETE", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-mismatch-"));
  try {
    const input = fixture();
    const variableRecord = {
      name: input.wrapper.variable,
      value: serializeRealBrowserAttestationVariable(input.wrapper),
      created_at: "2026-09-08T14:59:00.000Z",
      updated_at: "2026-09-08T14:59:30.000Z",
    };
    const cases = [
      [
        expectedArguments(input.report, input.broker.controlSha, ["--reference", "LD-0000000000"]),
        /reference_mismatch/,
      ],
      [
        expectedArguments(
          {
            ...input.report,
            challengeNonceSha256: "e".repeat(64),
          },
          input.broker.controlSha,
        ),
        /challenge_nonce_sha256_mismatch/,
      ],
      [expectedArguments(input.report, "c".repeat(40)), /control_sha_mismatch/],
    ];
    let index = 0;
    for (const [expected, pattern] of cases) {
      index += 1;
      const server = githubServer({ initial: { [input.wrapper.variable]: variableRecord } });
      await assert.rejects(
        runQuiet({
          argv: [
            process.execPath,
            "real-browser-attestation-store.mjs",
            "consume",
            ...expected,
            "--output-json",
            join(directory, `out-${index}.json`),
            "--output-png",
            join(directory, `out-${index}.png`),
            "--poll-seconds",
            "0",
          ],
          environment: coreEnvironment(),
          fetchImplementation: server.fetchImplementation,
        }),
        pattern,
      );
      assert.equal(
        server.calls.some(({ method }) => method === "DELETE"),
        false,
      );
    }

    const staleServer = githubServer({
      initial: {
        [input.wrapper.variable]: {
          ...variableRecord,
          created_at: "2026-09-08T14:40:00.000Z",
        },
      },
    });
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          join(directory, "stale.json"),
          "--output-png",
          join(directory, "stale.png"),
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: staleServer.fetchImplementation,
      }),
      /METADATA_REFUSED:github_variable_ttl_invalid/,
    );
    assert.equal(
      staleServer.calls.some(({ method }) => method === "DELETE"),
      false,
    );

    for (const status of [401, 403]) {
      const authServer = githubServer({ userStatus: status });
      await assert.rejects(
        runQuiet({
          argv: [
            process.execPath,
            "real-browser-attestation-store.mjs",
            "consume",
            ...expectedArguments(input.report, input.broker.controlSha),
            "--output-json",
            join(directory, `auth-${status}.json`),
            "--output-png",
            join(directory, `auth-${status}.png`),
            "--poll-seconds",
            "0",
          ],
          environment: coreEnvironment(),
          fetchImplementation: authServer.fetchImplementation,
        }),
        new RegExp(`API_REFUSED:${status}`),
      );
      assert.deepEqual(
        authServer.calls.map(({ path }) => path),
        ["/user"],
      );
    }

    const mutated = structuredClone(input.wrapper);
    mutated.report.responseStatus = 200;
    const responseServer = githubServer({
      initial: {
        [input.wrapper.variable]: { ...variableRecord, value: JSON.stringify(mutated) },
      },
    });
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          join(directory, "bad-response.json"),
          "--output-png",
          join(directory, "bad-response.png"),
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: responseServer.fetchImplementation,
      }),
      /response_status_invalid/,
    );
    assert.equal(
      responseServer.calls.some(({ method }) => method === "DELETE"),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume uses documented unconditional DELETE and recovers a lost successful DELETE response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-delete-"));
  try {
    const input = fixture();
    const server = githubServer({
      initial: {
        [input.wrapper.variable]: {
          name: input.wrapper.variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      loseFirstDeleteResponse: true,
    });
    await runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "consume",
        ...expectedArguments(input.report, input.broker.controlSha),
        "--output-json",
        join(directory, "attestation.json"),
        "--output-png",
        join(directory, "proof.png"),
        "--poll-seconds",
        "0",
      ],
      environment: coreEnvironment(),
      fetchImplementation: server.fetchImplementation,
    });
    const deletions = server.calls.filter(({ method }) => method === "DELETE");
    assert.equal(deletions.length, 2);
    for (const deletion of deletions) {
      assert.equal(deletion.headers["if-match"], undefined);
      assert.equal(deletion.body, undefined);
    }
    assert.deepEqual(
      server.calls.slice(-3).map(({ method }) => method),
      ["DELETE", "DELETE", "GET"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume waits for eventual DELETE visibility before materializing evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-eventual-delete-"));
  try {
    const input = fixture();
    const server = githubServer({
      initial: {
        [input.wrapper.variable]: {
          name: input.wrapper.variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      staleReadsAfterDelete: 1,
    });
    const outputJson = join(directory, "attestation.json");
    await runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "consume",
        ...expectedArguments(input.report, input.broker.controlSha),
        "--output-json",
        outputJson,
        "--output-png",
        join(directory, "proof.png"),
        "--poll-seconds",
        "0",
      ],
      environment: coreEnvironment(),
      fetchImplementation: server.fetchImplementation,
    });

    assert.deepEqual(
      server.calls.slice(-3).map(({ method }) => method),
      ["DELETE", "GET", "GET"],
    );
    assert.equal(JSON.parse(await readFile(outputJson, "utf8")).variableCleared, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume stays fail-closed and materializes nothing while a deleted variable remains visible", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-persistent-delete-"));
  try {
    const input = fixture();
    const server = githubServer({
      initial: {
        [input.wrapper.variable]: {
          name: input.wrapper.variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      staleReadsAfterDelete: 99,
    });
    const outputJson = join(directory, "attestation.json");
    const outputPng = join(directory, "proof.png");
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          outputJson,
          "--output-png",
          outputPng,
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: server.fetchImplementation,
      }),
      /G12_REAL_BROWSER_STORE_CLEAR_VERIFICATION_FAILED/,
    );

    assert.equal(
      server.calls.slice(-6).every(({ method }) => method === "GET"),
      true,
    );
    await assert.rejects(readFile(outputJson), { code: "ENOENT" });
    await assert.rejects(readFile(outputPng), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume leaves no evidence or temporary residue when DELETE cannot be confirmed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-residue-"));
  try {
    const input = fixture();
    const outputDirectory = join(directory, "outputs");
    const server = githubServer({
      initial: {
        [input.wrapper.variable]: {
          name: input.wrapper.variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      deleteStatus: 503,
    });
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          join(outputDirectory, "attestation.json"),
          "--output-png",
          join(outputDirectory, "proof.png"),
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: server.fetchImplementation,
      }),
      /API_RETRY_EXHAUSTED/,
    );
    assert.deepEqual(await readdir(outputDirectory), []);
    assert.equal(server.variables.has(input.wrapper.variable), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume never overwrites an output introduced during the finalization race", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-output-race-"));
  try {
    const input = fixture();
    const outputDirectory = join(directory, "outputs");
    const outputJson = join(outputDirectory, "attestation.json");
    const outputPng = join(outputDirectory, "proof.png");
    let injected = false;
    const server = githubServer({
      initial: {
        [input.wrapper.variable]: {
          name: input.wrapper.variable,
          value: serializeRealBrowserAttestationVariable(input.wrapper),
          created_at: "2026-09-08T14:59:00.000Z",
          updated_at: "2026-09-08T14:59:30.000Z",
        },
      },
      beforeDelete: async () => {
        if (injected) return;
        injected = true;
        await writeFile(outputJson, "preexisting-proof-must-survive\n", { flag: "wx" });
      },
    });
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          outputJson,
          "--output-png",
          outputPng,
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: server.fetchImplementation,
      }),
      /EEXIST/,
    );
    assert.equal(await readFile(outputJson, "utf8"), "preexisting-proof-must-survive\n");
    await assert.rejects(readFile(outputPng), { code: "ENOENT" });
    assert.deepEqual(await readdir(outputDirectory), ["attestation.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consume refuses a repository variable replacement immediately before DELETE", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-variable-race-"));
  try {
    const input = fixture();
    const outputDirectory = join(directory, "outputs");
    const record = {
      name: input.wrapper.variable,
      value: serializeRealBrowserAttestationVariable(input.wrapper),
      created_at: "2026-09-08T14:59:00.000Z",
      updated_at: "2026-09-08T14:59:30.000Z",
    };
    const server = githubServer({
      initial: { [input.wrapper.variable]: record },
      beforeVariableGet: async ({ variable, count, variables }) => {
        if (count === 2) {
          variables.set(variable, {
            ...variables.get(variable),
            updated_at: "2026-09-08T14:59:45.000Z",
          });
        }
      },
    });
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "consume",
          ...expectedArguments(input.report, input.broker.controlSha),
          "--output-json",
          join(outputDirectory, "attestation.json"),
          "--output-png",
          join(outputDirectory, "proof.png"),
          "--poll-seconds",
          "0",
        ],
        environment: coreEnvironment(),
        fetchImplementation: server.fetchImplementation,
      }),
      /PREDELETE_SNAPSHOT_MISMATCH/,
    );
    assert.equal(
      server.calls.some(({ method }) => method === "DELETE"),
      false,
    );
    assert.equal(server.variables.has(input.wrapper.variable), true);
    assert.deepEqual(await readdir(outputDirectory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("clear validates minimum binding even with allow-missing and never deletes a mismatch", async () => {
  const input = fixture();
  let calls = 0;
  await assert.rejects(
    runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "clear",
        ...clearArguments({ ...input.report, candidateSha: "invalid" }, input.broker.controlSha),
        "--allow-missing",
      ],
      environment: coreEnvironment(),
      fetchImplementation: async () => {
        calls += 1;
        throw new Error("must not call");
      },
    }),
    /candidate_sha_invalid/,
  );
  assert.equal(calls, 0);

  const absent = githubServer();
  await runQuiet({
    argv: [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "clear",
      ...clearArguments(input.report, input.broker.controlSha),
      "--allow-missing",
    ],
    environment: coreEnvironment(),
    fetchImplementation: absent.fetchImplementation,
  });
  assert.deepEqual(
    absent.calls.map(({ method }) => method),
    ["GET", "GET"],
  );
  assert.deepEqual(
    absent.calls.map(({ path }) => path),
    ["/user", `/repos/Vnd93/gaiatec-cms/actions/variables/${input.wrapper.variable}`],
  );

  const record = {
    name: input.wrapper.variable,
    value: serializeRealBrowserAttestationVariable(input.wrapper),
    created_at: "2026-09-08T14:59:00.000Z",
    updated_at: "2026-09-08T14:59:30.000Z",
  };
  const mismatch = githubServer({ initial: { [input.wrapper.variable]: record } });
  await assert.rejects(
    runQuiet({
      argv: [
        process.execPath,
        "real-browser-attestation-store.mjs",
        "clear",
        ...clearArguments(input.report, "c".repeat(40)),
        "--allow-missing",
      ],
      environment: coreEnvironment(),
      fetchImplementation: mismatch.fetchImplementation,
    }),
    /control_sha_mismatch/,
  );
  assert.deepEqual(
    mismatch.calls.map(({ method }) => method),
    ["GET", "GET"],
  );

  const valid = githubServer({ initial: { [input.wrapper.variable]: record } });
  await runQuiet({
    argv: [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "clear",
      ...clearArguments(input.report, input.broker.controlSha),
    ],
    environment: coreEnvironment(),
    fetchImplementation: valid.fetchImplementation,
  });
  assert.deepEqual(
    valid.calls.map(({ method }) => method),
    ["GET", "GET", "GET", "DELETE", "GET"],
  );
  assert.equal(valid.calls[3].headers["if-match"], undefined);

  const stale = githubServer({
    initial: {
      [input.wrapper.variable]: {
        ...record,
        created_at: "2026-09-08T14:30:00.000Z",
        updated_at: "2026-09-08T14:30:00.000Z",
      },
    },
  });
  await runQuiet({
    argv: [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "clear",
      ...clearArguments(input.report, input.broker.controlSha),
      "--allow-missing",
    ],
    environment: coreEnvironment(),
    fetchImplementation: stale.fetchImplementation,
    now: () => new Date("2026-09-08T15:30:00.000Z"),
  });
  assert.equal(stale.variables.has(input.wrapper.variable), false);

  const corrupted = structuredClone(input.wrapper);
  corrupted.hmacSha256 = "0".repeat(64);
  const poisoned = githubServer({
    initial: {
      [input.wrapper.variable]: { ...record, value: JSON.stringify(corrupted) },
    },
  });
  await runQuiet({
    argv: [
      process.execPath,
      "real-browser-attestation-store.mjs",
      "clear",
      ...clearArguments(input.report, input.broker.controlSha),
      "--allow-missing",
    ],
    environment: coreEnvironment(),
    fetchImplementation: poisoned.fetchImplementation,
  });
  assert.equal(poisoned.variables.has(input.wrapper.variable), false);
});

test("put rejects malformed, oversized, and sensitive inputs before GitHub access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-browser-input-"));
  try {
    const input = fixture();
    const reports = [
      { ...input.report, visibleSuccessText: "Protocolo LD-A1B2C3D4E5 para person@example.com." },
      { ...input.report, turnstile: { ...input.report.turnstile, cDataBound: false } },
    ];
    let calls = 0;
    for (let index = 0; index < reports.length; index += 1) {
      const caseDirectory = join(directory, String(index));
      await (await import("node:fs/promises")).mkdir(caseDirectory);
      const files = await writeInputFiles(caseDirectory, reports[index]);
      await assert.rejects(
        runQuiet({
          argv: [
            process.execPath,
            "real-browser-attestation-store.mjs",
            "put",
            "--file",
            files.reportPath,
            "--screenshot",
            files.screenshotPath,
          ],
          environment: putEnvironment(),
          fetchImplementation: async () => {
            calls += 1;
            throw new Error("must not call");
          },
        }),
        /REPORT_REFUSED/,
      );
    }
    const malformedDirectory = join(directory, "malformed");
    await (await import("node:fs/promises")).mkdir(malformedDirectory);
    const malformedFiles = await writeInputFiles(malformedDirectory, input.report, Buffer.from("not-png"));
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "put",
          "--file",
          malformedFiles.reportPath,
          "--screenshot",
          malformedFiles.screenshotPath,
        ],
        environment: putEnvironment(),
        fetchImplementation: async () => {
          calls += 1;
          throw new Error("must not call");
        },
      }),
      /SCREENSHOT_REFUSED/,
    );
    const oversized = join(directory, "oversized.png");
    await writeFile(oversized, Buffer.alloc(30 * 1024 + 1));
    await assert.rejects(
      runQuiet({
        argv: [
          process.execPath,
          "real-browser-attestation-store.mjs",
          "put",
          "--file",
          malformedFiles.reportPath,
          "--screenshot",
          oversized,
        ],
        environment: putEnvironment(),
        fetchImplementation: async () => {
          calls += 1;
          throw new Error("must not call");
        },
      }),
      /SCREENSHOT_FILE_REFUSED/,
    );
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
