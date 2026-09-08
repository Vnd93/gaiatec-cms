import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  recoveryStateVariableName,
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
const kind = argument("kind");
const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.RELEASE_GUARD_TOKEN ?? "";
const hmacKey = process.env.RECOVERY_STATE_HMAC_KEY ?? "";
if (
  !["put", "get", "verify", "clear"].includes(operation) ||
  repository !== "Vnd93/gaiatec-cms" ||
  (operation !== "verify" && token.length < 30) ||
  !/^[a-f0-9]{64}$/.test(hmacKey)
)
  throw new Error("G12_RECOVERY_STATE_STORE_INPUT_REFUSED");

const variable = recoveryStateVariableName(kind);
const variablePath = `/repos/${repository}/actions/variables/${variable}`;

async function github(path, { method = "GET", body, allowNotFound = false, etag } = {}) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(etag ? { "If-Match": etag } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (allowNotFound && response.status === 404) return { found: false, etag: "", payload: null };
      if (response.ok) return { found: true, etag: response.headers.get("etag") ?? "", payload };
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_RECOVERY_STATE_STORE_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_RECOVERY_STATE_STORE_API_REFUSED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_RECOVERY_STATE_STORE_API_RETRY_EXHAUSTED:${lastFailure}`);
}

function parseStored(payload) {
  if (payload?.name !== variable || typeof payload?.value !== "string")
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

async function put() {
  const file = resolve(argument("file"));
  const state = JSON.parse(await readFile(file, "utf8"));
  const expected = expectedBinding();
  const wrapper = sealRecoveryStateVariable(kind, state, hmacKey);
  const serializedWrapper = serializeRecoveryStateVariable(wrapper);
  const result = verifyRecoveryStateVariable(wrapper, hmacKey, expected);
  if (!result.valid) throw new Error(`G12_RECOVERY_STATE_STORE_REFUSED:${result.violations.join(",")}`);

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

  const verified = await github(variablePath);
  const stored = parseStored(verified.payload);
  const storedResult = verifyRecoveryStateVariable(stored, hmacKey, expected);
  if (!storedResult.valid || !sameRecoveryStateVariable(stored, wrapper))
    throw new Error("G12_RECOVERY_STATE_STORE_WRITE_VERIFICATION_FAILED");
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `variable=${variable}\nsource=variable\n`, "utf8");
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.redundancy_verified",
      kind,
      runId: state.workflow.runId,
      runAttempt: state.workflow.runAttempt,
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
      runAttempt: result.state.workflow.runAttempt,
      secretsDisclosed: false,
    }),
  );
}

async function get() {
  const output = resolve(argument("file"));
  const current = await github(variablePath, { allowNotFound: true });
  if (!current.found) throw new Error("G12_RECOVERY_STATE_STORE_MISSING");
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
    await appendFile(process.env.GITHUB_OUTPUT, `variable=${variable}\nsource=variable\n`, "utf8");
  console.log(
    JSON.stringify({
      event: "g12.recovery_state.recovered",
      kind,
      runId: result.state.workflow.runId,
      runAttempt: result.state.workflow.runAttempt,
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
  if (expectedFile) {
    const state = JSON.parse(await readFile(resolve(expectedFile), "utf8"));
    const expectedWrapper = sealRecoveryStateVariable(kind, state, hmacKey);
    if (!sameRecoveryStateVariable(stored, expectedWrapper))
      throw new Error("G12_RECOVERY_STATE_STORE_CLEAR_STATE_MISMATCH");
  }
  await github(variablePath, { method: "DELETE", etag: current.etag });
  const terminal = await github(variablePath, { allowNotFound: true });
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

if (operation === "put") await put();
else if (operation === "get") await get();
else if (operation === "verify") await verify();
else await clear();
