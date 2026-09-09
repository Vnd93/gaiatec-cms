import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProductionMutationMarker } from "./production-mutation-marker-lib.mjs";
import {
  PRODUCTION_MUTATION_MARKER_VARIABLE,
  sealProductionMutationMarkerVariable,
} from "./production-mutation-marker-store-lib.mjs";
import {
  recoveryStateVariableName,
  sealRecoveryStateVariable,
  serializeRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";

let importSequence = 0;

function normalizedHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

function variableFetch(variable, serializedValue, calls, { loseFirstDeleteResponse = false } = {}) {
  let getCount = 0;
  let deleteCount = 0;
  return async (url, options = {}) => {
    const method = options.method ?? "GET";
    const headers = normalizedHeaders(options.headers);
    calls.push({ url: String(url), method, headers, body: options.body });
    if (method === "GET") {
      getCount += 1;
      if (getCount === 1)
        return new Response(JSON.stringify({ name: variable, value: serializedValue }), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: 'W/"github-weak-etag"' },
        });
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "DELETE") {
      deleteCount += 1;
      if (headers["if-match"])
        return new Response(JSON.stringify({ message: "Bad Request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      if (loseFirstDeleteResponse && deleteCount === 1) {
        throw new TypeError("simulated transport loss after remote DELETE");
      }
      if (loseFirstDeleteResponse)
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: "Unexpected method" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
}

async function runCli(relativeScript, args, environment, fetchImplementation) {
  const originalArgv = process.argv;
  const originalFetch = globalThis.fetch;
  const originalEnvironment = new Map(Object.keys(environment).map((name) => [name, process.env[name]]));
  const script = new URL(relativeScript, import.meta.url);
  script.searchParams.set("http-contract-test", String((importSequence += 1)));
  process.argv = [process.execPath, script.pathname, ...args];
  for (const [name, value] of Object.entries(environment)) process.env[name] = value;
  globalThis.fetch = fetchImplementation;
  try {
    await import(script.href);
  } finally {
    process.argv = originalArgv;
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function assertDocumentedDelete(calls) {
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET", "DELETE", "GET"],
  );
  const deletion = calls[1];
  assert.equal(deletion.body, undefined);
  assert.equal(deletion.headers["if-match"], undefined);
}

function assertIdempotentDeleteAfterLostResponse(calls) {
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET", "DELETE", "DELETE", "GET"],
  );
  for (const deletion of calls.filter(({ method }) => method === "DELETE")) {
    assert.equal(deletion.body, undefined);
    assert.equal(deletion.headers["if-match"], undefined);
  }
}

function productionMarker() {
  const candidateSha = "a".repeat(40);
  return buildProductionMutationMarker({
    candidateSha,
    baselineDeploymentId: "11111111-1111-4111-8111-111111111111",
    baselineRelease: candidateSha,
    baselineCreatedOn: "2026-09-07T11:00:00.000Z",
    baselineCommitMessage: "g12-production-bridge-run-654321-1",
    bridgeRunId: "654321",
    bridgeRunAttempt: 1,
    bridgeControlSha: "e".repeat(40),
    bridgeEvidenceArtifactId: "991",
    bridgeEvidenceArtifactDigest: `sha256:${"1".repeat(64)}`,
    bridgeDistArtifactId: "992",
    bridgeDistArtifactDigest: `sha256:${"2".repeat(64)}`,
    bridgeDeploymentId: "11111111-1111-4111-8111-111111111111",
    bridgeRelease: candidateSha,
    bridgeCreatedOn: "2026-09-07T11:00:00.000Z",
    bridgeCommitMessage: "g12-production-bridge-run-654321-1",
    bridgePredecessorDeploymentId: "11111111-1111-4111-8111-111111111112",
    bridgePredecessorRelease: "b".repeat(40),
    bridgePredecessorCreatedOn: "2026-09-06T11:00:00.000Z",
    bridgePredecessorCommitMessage: "prior production",
    approvalRecord: `.github/release-controls/approvals/G12_${candidateSha}.json`,
    approvalSha256: "c".repeat(64),
    approvedRollbackRelease: "b".repeat(40),
    changeReference: "CHG-FINAL",
    repository: "Vnd93/gaiatec-cms",
    controlSha: "d".repeat(40),
    runId: "123456",
    runAttempt: 2,
    armedAt: "2026-09-07T12:00:00.000Z",
  });
}

function recoveryGetFixture() {
  const key = "4".repeat(64);
  const runId = "34260253043";
  const controlSha = "f".repeat(40);
  const kind = "staging-deploy";
  const state = {
    schemaVersion: 1,
    event: "g12.staging.deploy.prepared",
    workflow: { runId, runAttempt: 1, controlSha },
    project: "gaiatec-cms-staging",
  };
  const variable = recoveryStateVariableName(kind);
  const stored = serializeRecoveryStateVariable(sealRecoveryStateVariable(kind, state, key));
  return { key, runId, controlSha, kind, state, variable, stored };
}

test("recovery state put verifies an eventually visible GitHub variable without repeating the POST", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-eventual-write-"));
  try {
    const fixture = recoveryGetFixture();
    const statePath = join(directory, "state.json");
    const outputPath = join(directory, "github-output.txt");
    await writeFile(statePath, `${JSON.stringify(fixture.state)}\n`, "utf8");
    const calls = [];
    let variableReads = 0;

    await runCli(
      "./recovery-state-store.mjs",
      ["put", "--kind", fixture.kind, "--file", statePath],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        RECOVERY_STATE_HMAC_KEY: fixture.key,
        GITHUB_RUN_ID: fixture.runId,
        GITHUB_RUN_ATTEMPT: "1",
        CONTROL_SHA: fixture.controlSha,
        GITHUB_OUTPUT: outputPath,
      },
      async (url, options = {}) => {
        const method = options.method ?? "GET";
        calls.push({ url: String(url), method, body: options.body });
        if (method === "POST") return new Response(null, { status: 201 });
        if (method === "GET") {
          variableReads += 1;
          if (variableReads <= 2)
            return new Response(JSON.stringify({ message: "Not Found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          return new Response(JSON.stringify({ name: fixture.variable, value: fixture.stored }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ message: "Unexpected method" }), { status: 500 });
      },
    );

    assert.deepEqual(
      calls.map(({ method }) => method),
      ["GET", "POST", "GET", "GET"],
    );
    assert.deepEqual(JSON.parse(calls[1].body), {
      name: fixture.variable,
      value: fixture.stored,
    });
    assert.equal(await readFile(outputPath, "utf8"), `variable=${fixture.variable}\nsource=variable\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production marker put verifies an eventually visible GitHub variable without repeating the POST", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-production-marker-eventual-write-"));
  try {
    const key = "3".repeat(64);
    const marker = productionMarker();
    const markerPath = join(directory, "marker.json");
    await writeFile(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
    const artifact = {
      id: "998877",
      digest: "e".repeat(64),
      name: "production-mutation-123456-2",
    };
    const stored = sealProductionMutationMarkerVariable(
      {
        marker,
        artifactId: artifact.id,
        artifactDigest: artifact.digest,
        artifactName: artifact.name,
      },
      key,
    );
    const calls = [];
    let variableReads = 0;

    await runCli(
      "./production-mutation-marker-store.mjs",
      [
        "put",
        "--file",
        markerPath,
        "--artifact-id",
        artifact.id,
        "--artifact-digest",
        artifact.digest,
        "--artifact-name",
        artifact.name,
      ],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        PRODUCTION_MARKER_HMAC_KEY: key,
        GITHUB_RUN_ID: "123456",
        GITHUB_RUN_ATTEMPT: "2",
        CONTROL_SHA: "d".repeat(40),
      },
      async (url, options = {}) => {
        const method = options.method ?? "GET";
        calls.push({ url: String(url), method, body: options.body });
        if (method === "POST") return new Response(null, { status: 201 });
        if (method === "GET") {
          variableReads += 1;
          if (variableReads <= 2)
            return new Response(JSON.stringify({ message: "Not Found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          return new Response(
            JSON.stringify({ name: PRODUCTION_MUTATION_MARKER_VARIABLE, value: JSON.stringify(stored) }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ message: "Unexpected method" }), { status: 500 });
      },
    );

    assert.deepEqual(
      calls.map(({ method }) => method),
      ["GET", "POST", "GET", "GET"],
    );
    assert.deepEqual(JSON.parse(calls[1].body), {
      name: PRODUCTION_MUTATION_MARKER_VARIABLE,
      value: JSON.stringify(stored),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state get only treats a confirmed 404 as absent when explicitly allowed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-absent-"));
  try {
    const fixture = recoveryGetFixture();
    const outputPath = join(directory, "github-output.txt");
    const statePath = join(directory, "state.json");
    const calls = [];

    await runCli(
      "./recovery-state-store.mjs",
      [
        "get",
        "--allow-missing",
        "--kind",
        fixture.kind,
        "--file",
        statePath,
        "--run-id",
        fixture.runId,
        "--run-attempt",
        "1",
        "--control-sha",
        fixture.controlSha,
      ],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        RECOVERY_STATE_HMAC_KEY: fixture.key,
        GITHUB_OUTPUT: outputPath,
      },
      async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method ?? "GET" });
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    assert.deepEqual(
      calls.map(({ method }) => method),
      ["GET"],
    );
    assert.equal(
      await readFile(outputPath, "utf8"),
      `variable=${fixture.variable}\nsource=absent\nstate_present=false\n`,
    );
    await assert.rejects(readFile(statePath, "utf8"), { code: "ENOENT" });

    await assert.rejects(
      runCli(
        "./recovery-state-store.mjs",
        [
          "get",
          "--kind",
          fixture.kind,
          "--file",
          statePath,
          "--run-id",
          fixture.runId,
          "--run-attempt",
          "1",
          "--control-sha",
          fixture.controlSha,
        ],
        {
          GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
          RELEASE_GUARD_TOKEN: "t".repeat(40),
          RECOVERY_STATE_HMAC_KEY: fixture.key,
        },
        async () =>
          new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
      ),
      /G12_RECOVERY_STATE_STORE_MISSING/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state get with allow-missing still materializes an exact present state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-present-"));
  try {
    const fixture = recoveryGetFixture();
    const outputPath = join(directory, "github-output.txt");
    const statePath = join(directory, "state.json");
    const calls = [];

    await runCli(
      "./recovery-state-store.mjs",
      [
        "get",
        "--allow-missing",
        "--kind",
        fixture.kind,
        "--file",
        statePath,
        "--run-id",
        fixture.runId,
        "--run-attempt",
        "1",
        "--control-sha",
        fixture.controlSha,
      ],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        RECOVERY_STATE_HMAC_KEY: fixture.key,
        GITHUB_OUTPUT: outputPath,
      },
      variableFetch(fixture.variable, fixture.stored, calls),
    );

    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), fixture.state);
    assert.equal(
      await readFile(outputPath, "utf8"),
      `variable=${fixture.variable}\nsource=variable\nstate_present=true\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state get with allow-missing still refuses auth, transport, parse, and binding failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-refusal-"));
  try {
    const fixture = recoveryGetFixture();
    let caseIndex = 0;
    const invoke = (fetchImplementation) => {
      caseIndex += 1;
      return runCli(
        "./recovery-state-store.mjs",
        [
          "get",
          "--allow-missing",
          "--kind",
          fixture.kind,
          "--file",
          join(directory, `state-${caseIndex}.json`),
          "--run-id",
          fixture.runId,
          "--run-attempt",
          "1",
          "--control-sha",
          fixture.controlSha,
        ],
        {
          GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
          RELEASE_GUARD_TOKEN: "t".repeat(40),
          RECOVERY_STATE_HMAC_KEY: fixture.key,
        },
        fetchImplementation,
      );
    };

    await assert.rejects(
      invoke(
        async () =>
          new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
      /G12_RECOVERY_STATE_STORE_API_REFUSED:401/,
    );

    let transportCalls = 0;
    await assert.rejects(
      invoke(async () => {
        transportCalls += 1;
        if (transportCalls === 1) throw new TypeError("simulated transport failure");
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }),
      /G12_RECOVERY_STATE_STORE_API_REFUSED:403/,
    );
    assert.equal(transportCalls, 2);

    await assert.rejects(
      invoke(
        async () =>
          new Response(JSON.stringify({ name: fixture.variable, value: "not-json" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
      /G12_RECOVERY_STATE_STORE_RESPONSE_REFUSED/,
    );

    const mismatchedState = {
      ...fixture.state,
      workflow: { ...fixture.state.workflow, runId: "999999" },
    };
    const mismatched = serializeRecoveryStateVariable(
      sealRecoveryStateVariable(fixture.kind, mismatchedState, fixture.key),
    );
    await assert.rejects(
      invoke(
        async () =>
          new Response(JSON.stringify({ name: fixture.variable, value: mismatched }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
      /G12_RECOVERY_STATE_STORE_READ_REFUSED/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state clear uses the documented unconditional repository-variable DELETE", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-http-"));
  try {
    const key = "9".repeat(64);
    const runId = "34260253043";
    const controlSha = "a".repeat(40);
    const kind = "staging-deploy";
    const state = {
      schemaVersion: 1,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, runAttempt: 1, controlSha },
      project: "gaiatec-cms-staging",
    };
    const statePath = join(directory, "state.json");
    const outputPath = join(directory, "github-output.txt");
    await writeFile(statePath, `${JSON.stringify(state)}\n`, "utf8");
    const variable = recoveryStateVariableName(kind);
    const stored = serializeRecoveryStateVariable(sealRecoveryStateVariable(kind, state, key));
    const calls = [];

    await runCli(
      "./recovery-state-store.mjs",
      [
        "clear",
        "--kind",
        kind,
        "--file",
        statePath,
        "--run-id",
        runId,
        "--run-attempt",
        "1",
        "--control-sha",
        controlSha,
      ],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        RECOVERY_STATE_HMAC_KEY: key,
        GITHUB_OUTPUT: outputPath,
      },
      variableFetch(variable, stored, calls),
    );

    assertDocumentedDelete(calls);
    assert.equal(await readFile(outputPath, "utf8"), "cleared=true\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state mismatch refuses the DELETE before remote mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-mismatch-"));
  try {
    const key = "8".repeat(64);
    const runId = "34260253043";
    const controlSha = "b".repeat(40);
    const kind = "staging-deploy";
    const storedState = {
      schemaVersion: 1,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, runAttempt: 1, controlSha },
      project: "gaiatec-cms-staging",
      marker: "stored",
    };
    const expectedState = { ...storedState, marker: "different" };
    const statePath = join(directory, "expected-state.json");
    await writeFile(statePath, `${JSON.stringify(expectedState)}\n`, "utf8");
    const variable = recoveryStateVariableName(kind);
    const stored = serializeRecoveryStateVariable(sealRecoveryStateVariable(kind, storedState, key));
    const calls = [];

    await assert.rejects(
      runCli(
        "./recovery-state-store.mjs",
        [
          "clear",
          "--kind",
          kind,
          "--file",
          statePath,
          "--run-id",
          runId,
          "--run-attempt",
          "1",
          "--control-sha",
          controlSha,
        ],
        {
          GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
          RELEASE_GUARD_TOKEN: "t".repeat(40),
          RECOVERY_STATE_HMAC_KEY: key,
        },
        variableFetch(variable, stored, calls),
      ),
      /G12_RECOVERY_STATE_STORE_CLEAR_STATE_MISMATCH/,
    );
    assert.deepEqual(
      calls.map(({ method }) => method),
      ["GET"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovery state clear accepts retry 404 after a remotely applied DELETE loses its response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-recovery-ambiguous-delete-"));
  try {
    const key = "5".repeat(64);
    const runId = "34260253043";
    const controlSha = "c".repeat(40);
    const kind = "staging-deploy";
    const state = {
      schemaVersion: 1,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, runAttempt: 1, controlSha },
      project: "gaiatec-cms-staging",
    };
    const statePath = join(directory, "state.json");
    const outputPath = join(directory, "github-output.txt");
    await writeFile(statePath, `${JSON.stringify(state)}\n`, "utf8");
    const variable = recoveryStateVariableName(kind);
    const stored = serializeRecoveryStateVariable(sealRecoveryStateVariable(kind, state, key));
    const calls = [];

    await runCli(
      "./recovery-state-store.mjs",
      [
        "clear",
        "--kind",
        kind,
        "--file",
        statePath,
        "--run-id",
        runId,
        "--run-attempt",
        "1",
        "--control-sha",
        controlSha,
      ],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        RECOVERY_STATE_HMAC_KEY: key,
        GITHUB_OUTPUT: outputPath,
      },
      variableFetch(variable, stored, calls, { loseFirstDeleteResponse: true }),
    );

    assertIdempotentDeleteAfterLostResponse(calls);
    assert.equal(await readFile(outputPath, "utf8"), "cleared=true\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production marker clear also omits unsupported conditional DELETE headers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-production-marker-http-"));
  try {
    const key = "7".repeat(64);
    const marker = productionMarker();
    const stored = sealProductionMutationMarkerVariable(
      {
        marker,
        artifactId: "998877",
        artifactDigest: "e".repeat(64),
        artifactName: "production-mutation-123456-2",
      },
      key,
    );
    const outputPath = join(directory, "github-output.txt");
    const calls = [];

    await runCli(
      "./production-mutation-marker-store.mjs",
      ["clear", "--run-id", "123456", "--run-attempt", "2", "--control-sha", "d".repeat(40)],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        PRODUCTION_MARKER_HMAC_KEY: key,
        GITHUB_OUTPUT: outputPath,
      },
      variableFetch(PRODUCTION_MUTATION_MARKER_VARIABLE, JSON.stringify(stored), calls),
    );

    assertDocumentedDelete(calls);
    assert.equal(await readFile(outputPath, "utf8"), "cleared=true\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production marker binding mismatch performs no DELETE", async () => {
  const key = "6".repeat(64);
  const stored = sealProductionMutationMarkerVariable(
    {
      marker: productionMarker(),
      artifactId: "998877",
      artifactDigest: "e".repeat(64),
      artifactName: "production-mutation-123456-2",
    },
    key,
  );
  const calls = [];

  await assert.rejects(
    runCli(
      "./production-mutation-marker-store.mjs",
      ["clear", "--run-id", "654321", "--run-attempt", "2", "--control-sha", "d".repeat(40)],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        PRODUCTION_MARKER_HMAC_KEY: key,
      },
      variableFetch(PRODUCTION_MUTATION_MARKER_VARIABLE, JSON.stringify(stored), calls),
    ),
    /G12_PRODUCTION_MARKER_STORE_CLEAR_REFUSED:marker_run_id_mismatch/,
  );
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET"],
  );
});

test("production marker clear accepts retry 404 after a remotely applied DELETE loses its response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-production-marker-ambiguous-delete-"));
  try {
    const key = "4".repeat(64);
    const marker = productionMarker();
    const stored = sealProductionMutationMarkerVariable(
      {
        marker,
        artifactId: "998877",
        artifactDigest: "e".repeat(64),
        artifactName: "production-mutation-123456-2",
      },
      key,
    );
    const outputPath = join(directory, "github-output.txt");
    const calls = [];

    await runCli(
      "./production-mutation-marker-store.mjs",
      ["clear", "--run-id", "123456", "--run-attempt", "2", "--control-sha", "d".repeat(40)],
      {
        GITHUB_REPOSITORY: "Vnd93/gaiatec-cms",
        RELEASE_GUARD_TOKEN: "t".repeat(40),
        PRODUCTION_MARKER_HMAC_KEY: key,
        GITHUB_OUTPUT: outputPath,
      },
      variableFetch(PRODUCTION_MUTATION_MARKER_VARIABLE, JSON.stringify(stored), calls, {
        loseFirstDeleteResponse: true,
      }),
    );

    assertIdempotentDeleteAfterLostResponse(calls);
    assert.equal(await readFile(outputPath, "utf8"), "cleared=true\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
