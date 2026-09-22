import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  recoveryStateVariableName,
  STAGING_RECOVERY_KINDS,
  evaluateStagingRecoveryFence,
  sameRecoveryStateVariable,
  sealRecoveryStateVariable,
  serializeRecoveryStateVariable,
  verifyRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const operation = process.argv[2];
const kind = argument("kind") || argument("owner-kind");
const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.RELEASE_GUARD_TOKEN ?? "";
const hmacKey = process.env.RECOVERY_STATE_HMAC_KEY ?? "";
if (
  !["seal", "put", "get", "verify", "clear", "fence"].includes(operation) ||
  repository !== "Vnd93/gaiatec-cms" ||
  (!["seal", "verify"].includes(operation) && token.length < 30) ||
  !/^[a-f0-9]{64}$/.test(hmacKey)
)
  throw new Error("G12_RECOVERY_STATE_STORE_INPUT_REFUSED");

const variable = recoveryStateVariableName(kind);
const variablePath = `/repos/${repository}/actions/variables/${variable}`;

async function github(
  path,
  { method = "GET", body, allowNotFound = false, retryNotFound = false, retryPresent = false } = {},
) {
  if (
    (retryNotFound && retryPresent) ||
    (retryNotFound && (method !== "GET" || allowNotFound)) ||
    (retryPresent && (method !== "GET" || !allowNotFound))
  )
    throw new Error("G12_RECOVERY_STATE_STORE_RETRY_MODE_REFUSED");
  const maximumAttempts = retryNotFound || retryPresent ? 6 : 4;
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (allowNotFound && response.status === 404) return { found: false, payload: null };
      if (response.ok) {
        if (!retryPresent || attempt === maximumAttempts) return { found: true, payload };
        lastFailure = "still-present";
      } else {
        lastFailure = String(response.status);
        if (
          !(retryNotFound && response.status === 404) &&
          ![408, 429].includes(response.status) &&
          response.status < 500
        )
          throw new Error(`G12_RECOVERY_STATE_STORE_API_REFUSED:${response.status}`);
      }
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_RECOVERY_STATE_STORE_API_REFUSED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < maximumAttempts)
      await new Promise((done) => setTimeout(done, Math.min(1_000 * 2 ** (attempt - 1), 8_000)));
  }
  throw new Error(`G12_RECOVERY_STATE_STORE_API_RETRY_EXHAUSTED:${lastFailure}`);
}

function parseStored(payload, expectedVariable = variable) {
  if (payload?.name !== expectedVariable || typeof payload?.value !== "string")
    throw new Error("G12_RECOVERY_STATE_STORE_RESPONSE_REFUSED");
  try {
    return JSON.parse(payload.value);
  } catch (error) {
    throw new Error("G12_RECOVERY_STATE_STORE_RESPONSE_REFUSED", { cause: error });
  }
}

function expectedBinding() {
  return {
    kind,
    runId: argument("run-id") || process.env.GITHUB_RUN_ID,
    runAttempt: argument("run-attempt") || process.env.GITHUB_RUN_ATTEMPT,
    controlSha: argument("control-sha") || process.env.CONTROL_SHA,
  };
}

function workflowAttempt(state) {
  return Number(state?.workflow?.attempt ?? state?.workflow?.runAttempt);
}

function stagingFenceOwner(name) {
  return [
    "staging-cms-public-hotfix",
    "staging-cms-public-hotfix-candidate-intent",
    "staging-cms-public-hotfix-rollback-intent",
  ].includes(name)
    ? "staging-cms-public-hotfix"
    : STAGING_RECOVERY_KINDS.includes(name)
      ? name
      : "";
}

async function evaluateRemoteStagingFence(ownerKind, expected, { proposedKind, proposedState } = {}) {
  const states = Object.fromEntries(STAGING_RECOVERY_KINDS.map((name) => [name, null]));
  for (const name of STAGING_RECOVERY_KINDS) {
    const expectedVariable = recoveryStateVariableName(name);
    const current = await github(`/repos/${repository}/actions/variables/${expectedVariable}`, {
      allowNotFound: true,
    });
    if (!current.found) continue;
    const wrapper = parseStored(current.payload, expectedVariable);
    const result = verifyRecoveryStateVariable(wrapper, hmacKey, { kind: name });
    if (!result.valid)
      throw new Error(`G12_RECOVERY_STATE_FENCE_WRAPPER_REFUSED:${name}:${result.violations.join(",")}`);
    states[name] = result.state;
  }
  if (proposedKind) states[proposedKind] = proposedState;
  const result = evaluateStagingRecoveryFence({ ownerKind, expected, states });
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_FENCE_CLOSED:${result.violations.join(",")}`);
  return result;
}

async function put() {
  const file = resolve(argument("file"));
  const state = JSON.parse(await readFile(file, "utf8"));
  const expected = expectedBinding();
  const wrapper = sealRecoveryStateVariable(kind, state, hmacKey);
  const serializedWrapper = serializeRecoveryStateVariable(wrapper);
  const result = verifyRecoveryStateVariable(wrapper, hmacKey, expected);
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_STORE_REFUSED:${result.violations.join(",")}`);

  const ownerKind = stagingFenceOwner(kind);
  if (ownerKind)
    await evaluateRemoteStagingFence(ownerKind, expected, {
      proposedKind: kind,
      proposedState: state,
    });

  const wrapperFile = argument("wrapper-file");
  if (wrapperFile) {
    const wrapperPath = resolve(wrapperFile);
    await mkdir(dirname(wrapperPath), { recursive: true });
    await writeFile(wrapperPath, `${JSON.stringify(wrapper, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  }

  const current = await github(variablePath, { allowNotFound: true });
  if (current.found) {
    const existing = parseStored(current.payload);
    const existingResult = verifyRecoveryStateVariable(existing, hmacKey, expected);
    if (!existingResult.valid || !sameRecoveryStateVariable(existing, wrapper))
      throw new Error("G12_RECOVERY_STATE_STORE_OCCUPIED");
  } else {
    await github(`/repos/${repository}/actions/variables`, {
      method: "POST",
      body: { name: variable, value: serializedWrapper },
    });
  }

  const verified = await github(variablePath, { retryNotFound: true });
  const stored = parseStored(verified.payload);
  const storedResult = verifyRecoveryStateVariable(stored, hmacKey, expected);
  if (!storedResult.valid || !sameRecoveryStateVariable(stored, wrapper))
    throw new Error("G12_RECOVERY_STATE_STORE_WRITE_VERIFICATION_FAILED");
  if (ownerKind) await evaluateRemoteStagingFence(ownerKind, expected);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `variable=${variable}\nsource=variable\n`, "utf8");
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.redundancy_verified",
      kind,
      runId: state.workflow.runId,
      runAttempt: workflowAttempt(state),
      secretsDisclosed: false,
    }),
  );
}

async function seal() {
  const file = resolve(argument("file"));
  const wrapperPath = resolve(argument("wrapper-file"));
  if (!argument("file") || !argument("wrapper-file"))
    throw new Error("G12_RECOVERY_STATE_SEAL_INPUT_REQUIRED");
  const state = JSON.parse(await readFile(file, "utf8"));
  const wrapper = sealRecoveryStateVariable(kind, state, hmacKey);
  const result = verifyRecoveryStateVariable(wrapper, hmacKey, expectedBinding());
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_SEAL_REFUSED:${result.violations.join(",")}`);
  await mkdir(dirname(wrapperPath), { recursive: true });
  await writeFile(wrapperPath, `${JSON.stringify(wrapper, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.artifact_wrapper_sealed",
      kind,
      runId: state.workflow.runId,
      runAttempt: workflowAttempt(state),
      secretsDisclosed: false,
    }),
  );
}

async function verify() {
  const wrapperFile = resolve(argument("wrapper-file"));
  const output = resolve(argument("file"));
  if (!argument("wrapper-file") || !argument("file"))
    throw new Error("G12_RECOVERY_STATE_WRAPPER_INPUT_REQUIRED");
  const wrapper = JSON.parse(await readFile(wrapperFile, "utf8"));
  const result = verifyRecoveryStateVariable(wrapper, hmacKey, expectedBinding());
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_WRAPPER_REFUSED:${result.violations.join(",")}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `variable=${variable}\nsource=artifact-wrapper\n`, "utf8");
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.wrapper_verified",
      kind,
      runId: result.state.workflow.runId,
      runAttempt: workflowAttempt(result.state),
      secretsDisclosed: false,
    }),
  );
}

async function get() {
  const output = resolve(argument("file"));
  const current = await github(variablePath, { allowNotFound: true });
  if (!current.found) {
    if (!process.argv.includes("--allow-missing")) throw new Error("G12_RECOVERY_STATE_STORE_MISSING");
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `variable=${variable}\nsource=absent\nstate_present=false\n`,
        "utf8",
      );
    console.log(
      JSON.stringify({
        event: "g12.recovery_state.confirmed_absent",
        kind,
        secretsDisclosed: false,
      }),
    );
    return;
  }
  const stored = parseStored(current.payload);
  const result = verifyRecoveryStateVariable(stored, hmacKey, expectedBinding());
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_STORE_READ_REFUSED:${result.violations.join(",")}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `variable=${variable}\nsource=variable\nstate_present=true\n`,
      "utf8",
    );
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.recovered",
      kind,
      runId: result.state.workflow.runId,
      runAttempt: workflowAttempt(result.state),
      secretsDisclosed: false,
    }),
  );
}

async function clear() {
  const expected = expectedBinding();
  const current = await github(variablePath, { allowNotFound: true });
  if (!current.found) {
    console.log(JSON.stringify({ event: "g12.recovery_state.already_cleared", kind }));
    return;
  }
  const stored = parseStored(current.payload);
  const result = verifyRecoveryStateVariable(stored, hmacKey, expected);
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_STORE_CLEAR_REFUSED:${result.violations.join(",")}`);
  const expectedFile = argument("file");
  if (!expectedFile) throw new Error("G12_RECOVERY_STATE_STORE_CLEAR_FILE_REQUIRED");
  const state = JSON.parse(await readFile(resolve(expectedFile), "utf8"));
  const expectedWrapper = sealRecoveryStateVariable(kind, state, hmacKey);
  if (!sameRecoveryStateVariable(stored, expectedWrapper))
    throw new Error("G12_RECOVERY_STATE_STORE_CLEAR_STATE_MISMATCH");
  await github(variablePath, { method: "DELETE", allowNotFound: true });
  const terminal = await github(variablePath, { allowNotFound: true, retryPresent: true });
  if (terminal.found) throw new Error("G12_RECOVERY_STATE_STORE_CLEAR_VERIFICATION_FAILED");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "cleared=true\n", "utf8");
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.compare_and_clear_verified",
      kind,
      runId: expected.runId,
      runAttempt: Number(expected.runAttempt),
      secretsDisclosed: false,
    }),
  );
}

async function fence() {
  const ownerKind = argument("owner-kind") || kind;
  const expected = expectedBinding();
  const result = await evaluateRemoteStagingFence(ownerKind, expected);
  if (process.argv.includes("--require-empty") && result.presentKinds.length > 0)
    throw new Error(`G12_RECOVERY_STATE_FENCE_NOT_EMPTY:${result.presentKinds.join(",")}`);
  const evidence = {
    schemaVersion: 1,
    event: "g12.staging.recovery_fence.open",
    ownerKind,
    expected: {
      runId: String(expected.runId),
      runAttempt: Number(expected.runAttempt),
      controlSha: expected.controlSha,
    },
    presentKinds: result.presentKinds,
    checkedKinds: STAGING_RECOVERY_KINDS,
    checkedAt: new Date().toISOString(),
    secretsDisclosed: false,
  };
  const output = argument("file");
  if (output) {
    const outputPath = resolve(output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  }
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `fence_open=true\nstate_present=${result.presentKinds.length > 0 ? "true" : "false"}\n`,
      "utf8",
    );
  console.log(JSON.stringify(evidence));
}

if (operation === "seal") await seal();
else if (operation === "put") await put();
else if (operation === "get") await get();
else if (operation === "verify") await verify();
else if (operation === "clear") await clear();
else await fence();
