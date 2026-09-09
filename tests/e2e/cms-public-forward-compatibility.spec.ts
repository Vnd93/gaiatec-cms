import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCmsUiCreatedState, type CmsUiCreatedState } from "./cms-ui-created-state";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FULL_SHA = /^[a-f0-9]{40}$/;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const STAGING_ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const OBSERVED_HERE = [
  "candidate-health-release-and-environment",
  "legacy-envelope-without-captcha-token-403",
  "hybrid-envelope-400",
] as const;
const NOT_OBSERVED_HERE = [
  "baseline-f48-browser-execution",
  "browser-reload",
  "positive-form-submission",
  "turnstile-action-evaluation",
  "turnstile-hostname-evaluation",
  "turnstile-cdata-evaluation",
] as const;

type RecordValue = Record<string, unknown>;

function exactKeys(value: unknown, expected: readonly string[]): value is RecordValue {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value as RecordValue).sort()) === JSON.stringify([...expected].sort())
  );
}

function configuration(baseURL: string | undefined) {
  test.skip(process.env.QA_CMS_PUBLIC_FORWARD_REQUIRED !== "true", "gate forward não exigido");
  const candidateSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
  const origin = new URL(baseURL ?? "https://invalid.invalid");
  const supabase = new URL(process.env.QA_CMS_BRIDGE_SUPABASE_URL ?? "https://invalid.invalid");
  const anonKey = process.env.QA_CMS_BRIDGE_SUPABASE_ANON_KEY ?? "";
  const deploymentId = process.env.QA_CMS_FORWARD_DEPLOYMENT_ID ?? "";
  const statePath = process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json";
  const stateFile = resolve(root, statePath);
  const stateFromRoot = relative(root, stateFile);
  const reportFile = resolve(
    root,
    process.env.QA_CMS_BRIDGE_REPORT_PATH ?? "outputs/cms-public-forward-compatibility.json",
  );
  const reportFromRoot = relative(root, reportFile);
  const runTag = (() => {
    try {
      return String(JSON.parse(readFileSync(stateFile, "utf8"))?.runTag ?? "");
    } catch {
      throw new Error("QA_CMS_FORWARD_STATE_UNREADABLE");
    }
  })();
  if (
    !FULL_SHA.test(candidateSha) ||
    origin.origin !== STAGING_ORIGIN ||
    origin.pathname !== "/" ||
    supabase.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co" ||
    supabase.pathname !== "/" ||
    !anonKey ||
    !CANONICAL_UUID.test(deploymentId) ||
    !stateFromRoot ||
    stateFromRoot === ".." ||
    stateFromRoot.startsWith("../") ||
    !reportFromRoot ||
    reportFromRoot === ".." ||
    reportFromRoot.startsWith("../")
  )
    throw new Error("QA_CMS_FORWARD_CONFIGURATION_REFUSED");
  return {
    candidateSha,
    deploymentId,
    origin: origin.origin,
    supabaseOrigin: supabase.origin,
    anonKey,
    reportFile,
    state: loadCmsUiCreatedState({
      repositoryRoot: root,
      expectedEnvironment: "staging",
      expectedSha: candidateSha,
      expectedRunTag: runTag,
      path: statePath,
    }),
  };
}

function staleF48CampaignBody(state: CmsUiCreatedState) {
  const body = {
    formId: state.form.id,
    formVersionId: state.form.versionId,
    idempotencyKey: randomUUID(),
    fields: { email: `qa-forward-stale-${randomUUID()}@example.invalid` },
    origin: {
      path: state.lead.campaignPath,
      source: "campaign",
      campaignId: state.ids.campaignId,
      utm: {},
    },
    consent: {
      accepted: true,
      text: `${state.runTag} consentimento sintético exclusivo de homologação.`,
      version: "qa-v2",
    },
    honeypot: "",
  };
  if (
    !exactKeys(body, [
      "formId",
      "formVersionId",
      "idempotencyKey",
      "fields",
      "origin",
      "consent",
      "honeypot",
    ]) ||
    "captchaToken" in body
  ) {
    throw new Error("QA_CMS_FORWARD_STALE_F48_ENVELOPE_REFUSED");
  }
  return body;
}

test("@public-forward prova por requisições remotas que envelopes obsoletos falham fechados", async ({
  request,
  baseURL,
}) => {
  const config = configuration(baseURL);
  test.setTimeout(90_000);
  const endpoint = `${config.supabaseOrigin}/functions/v1/lead-capture`;
  const headers = {
    apikey: config.anonKey,
    Origin: config.origin,
    "Content-Type": "application/json",
  };
  const staleF48Body = staleF48CampaignBody(config.state);

  const health = await request.get(`${config.origin}/healthz`, {
    headers: { "cache-control": "no-store" },
  });
  const healthPayload = (await health.json()) as RecordValue;
  expect(health.status()).toBe(200);
  expect(healthPayload).toMatchObject({
    environment: "staging",
    release: config.candidateSha,
  });
  expect(health.headers()["x-release"]).toBe(config.candidateSha);

  const legacy = await request.post(endpoint, { headers, data: staleF48Body });
  expect(legacy.status()).toBe(403);
  const legacyPayload = (await legacy.json()) as RecordValue;
  expect(legacyPayload).toEqual({
    error: "Confirme a verificação de segurança.",
    challengeRequired: true,
  });

  const hybrid = await request.post(endpoint, {
    headers,
    data: { ...staleF48Body, formKey: config.state.form.key, formVersion: 1 },
  });
  expect(hybrid.status()).toBe(400);
  const hybridPayload = (await hybrid.json()) as RecordValue;
  expect(hybridPayload).toEqual({ error: "Revise os campos do formulário." });

  const report = {
    schemaVersion: 3,
    event: "g12.public_bridge.forward_compatibility",
    status: "passed",
    environment: "staging",
    candidateSha: config.candidateSha,
    deploymentIdentitySha256: createHash("sha256").update(config.deploymentId).digest("hex"),
    proofMode: "direct-remote-negative-contract",
    backendContract: "candidate-a-strict-turnstile",
    origin: config.origin,
    fixtureBindingSha256: createHash("sha256")
      .update(`${config.state.runTag}:${config.state.form.key}:${config.candidateSha}:${config.deploymentId}`)
      .digest("hex"),
    requestShapes: {
      legacyEnvelope: "form-id-version-without-captcha-token",
      hybridEnvelope: "legacy-plus-form-key-version-without-captcha-token",
    },
    remoteObservations: {
      health: {
        status: health.status(),
        environment: String(healthPayload.environment ?? ""),
        releaseSha: String(healthPayload.release ?? ""),
        releaseHeaderSha: health.headers()["x-release"] ?? "",
      },
      legacyEnvelope: {
        status: legacy.status(),
        error: String(legacyPayload.error ?? ""),
        challengeRequired: legacyPayload.challengeRequired,
      },
      hybridEnvelope: {
        status: hybrid.status(),
        error: String(hybridPayload.error ?? ""),
      },
    },
    evidenceScope: {
      observedHere: OBSERVED_HERE,
      notObservedHere: NOT_OBSERVED_HERE,
      complementaryEvidence: {
        adversarialTurnstilePolicy: "tests/unit/security-origin.test.ts",
        successfulCandidateBrowser: "cms-real-browser-attestation.json",
      },
    },
    boundary: {
      responseIdentifiersPersisted: 0,
      secretsPersisted: false,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (UUID_ANYWHERE.test(serialized) || serialized.includes(config.anonKey)) {
    throw new Error("QA_CMS_FORWARD_EVIDENCE_SENSITIVE");
  }
  mkdirSync(dirname(config.reportFile), { recursive: true });
  writeFileSync(config.reportFile, serialized, { mode: 0o600 });
});
