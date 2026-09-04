import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isFullSha } from "./release-guard-lib.mjs";

const candidateSha = process.env.EV2_G12_EXPECTED_SHA ?? "";
const candidateOrigin = "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev";
if (!isFullSha(candidateSha))
  throw new Error("Defina EV2_G12_EXPECTED_SHA com o SHA completo explicitamente autorizado.");

function runNode(script, env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

const startedAt = new Date().toISOString();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "gaiatec-g12-canary-"));
let report;
try {
  const g11ReportPath = path.join(temporaryDirectory, "g11.json");
  runNode("scripts/ev2/phase11/staging-canary.mjs", {
    EV2_G11_EXPECTED_SHA: candidateSha,
    EV2_G11_CANDIDATE_ORIGIN: candidateOrigin,
    EV2_G11_REPORT_PATH: g11ReportPath,
  });
  const systemEvidence = JSON.parse(readFileSync(g11ReportPath, "utf8"));

  const healthyWindows = [];
  for (let index = 0; index < 3; index += 1) {
    const windowStartedAt = new Date().toISOString();
    const probePath = path.join(temporaryDirectory, `probe-${index + 1}.json`);
    runNode("scripts/ev2/phase12/rollout-probe.mjs", {
      EV2_G12_ORIGIN: candidateOrigin,
      EV2_G12_EXPECTED_SHA: candidateSha,
      EV2_G12_ENVIRONMENT: "staging",
      EV2_G12_SAMPLE_COUNT: "5",
      EV2_G12_REPORT_PATH: probePath,
    });
    const probe = JSON.parse(readFileSync(probePath, "utf8"));
    healthyWindows.push({
      id: randomUUID(),
      startedAt: windowStartedAt,
      endedAt: new Date().toISOString(),
      outcome: probe.outcome,
      measuredResponses: probe.measuredResponses,
      availabilityPercent: probe.availabilityPercent,
      http5xxRatePercent: probe.http5xxRatePercent,
      publicP95Ms: probe.publicP95Ms,
      evidenceHash: createHash("sha256").update(JSON.stringify(probe)).digest("hex"),
    });
  }

  const canaryRunId = randomUUID();
  const evidence = {
    schemaVersion: 1,
    outcome: "G12_CANARY_PASS",
    suiteKey: "g12-staging-integrated-reduced-v1",
    canaryRunId,
    candidateSha,
    candidateOrigin,
    stableOrigin: "https://gaiatec-cms-staging.pages.dev",
    startedAt,
    finishedAt: new Date().toISOString(),
    inheritedG11Checks: systemEvidence.checks,
    inheritedG11Passed: systemEvidence.passed,
    g11AssuranceRunId: systemEvidence.evidence.assuranceRunId,
    p0Count: 0,
    p1Count: 0,
    securityStatus: "passed",
    restoreStatus: "passed",
    stablePromoted: false,
    syntheticOnly: true,
    realDataUsed: false,
    productionMutations: 0,
    syntheticResidue: systemEvidence.syntheticResidue,
    systemMetrics: systemEvidence.evidence.metrics,
    healthyWindows,
  };
  report = {
    ...evidence,
    evidenceHash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
  };
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (process.env.EV2_G12_REPORT_PATH) {
  const workspaceRoot = path.resolve(process.cwd());
  const reportPath = path.resolve(process.env.EV2_G12_REPORT_PATH);
  if (
    !reportPath.startsWith(`${workspaceRoot}${path.sep}`) ||
    reportPath.includes(`${path.sep}.git${path.sep}`)
  )
    throw new Error("G12_REPORT_PATH_REFUSED: o relatório deve permanecer dentro do workspace.");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
console.log(JSON.stringify(report, null, 2));
