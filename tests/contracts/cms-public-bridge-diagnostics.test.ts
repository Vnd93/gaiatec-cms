import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicBridgeDiagnostics } from "../e2e/cms-public-bridge-diagnostics";

const request = (error = "net::ERR_ABORTED", suffix = "?secret=must-not-persist") => ({
  url: () => "https://glcqsosxwgmlhzgcsnzv.supabase.co/functions/v1/cms-public" + suffix,
  method: () => "GET",
  failure: () => ({ errorText: error }),
});

describe("diagnóstico sanitizado do transporte na ponte pública", () => {
  it("correlaciona início, resposta e falha entre documentos sem aceitar cancelamentos", () => {
    let clock = 100;
    const diagnostic = createPublicBridgeDiagnostics(() => clock);
    diagnostic.phase("page");
    const entry = request();
    diagnostic.start(entry);
    clock += 20;
    diagnostic.response(entry, 200);
    diagnostic.phase("campaign");
    diagnostic.finish(entry, true);
    expect(diagnostic.snapshot().observations).toEqual([
      {
        endpoint: "cms-public",
        method: "GET",
        startedPhase: "page",
        endedPhase: "campaign",
        responseStatus: 200,
        outcome: "failed",
        failureClass: "net::ERR_ABORTED",
        startedMs: 0,
        elapsedMs: 20,
      },
    ]);
    expect(diagnostic.snapshot().releaseEligible).toBe(false);
    expect(JSON.stringify(diagnostic.snapshot())).not.toContain("secret");
  });

  it("não registra destinos externos, mensagens, queries ou detalhes não permitidos", () => {
    const diagnostic = createPublicBridgeDiagnostics();
    diagnostic.start({ ...request(), url: () => "https://foreign.invalid/functions/v1/cms-public" });
    diagnostic.start({ ...request(), url: () => "https://glcqsosxwgmlhzgcsnzv.supabase.co/auth/v1/token" });
    const entry = request("error with private-token-and-identity");
    diagnostic.start(entry);
    diagnostic.response(entry, 503);
    diagnostic.finish(entry, true);
    const value = diagnostic.snapshot();
    expect(value.observations).toHaveLength(1);
    expect(value.observations[0]?.failureClass).toBe("other");
    expect(value.observations[0]?.responseStatus).toBe(503);
    expect(JSON.stringify(value)).not.toMatch(/private-token|identity|foreign|auth\/v1|secret/);
  });

  it("limita volume e sinaliza diagnóstico incompleto sem registrar payloads", () => {
    const diagnostic = createPublicBridgeDiagnostics();
    for (let i = 0; i < 70; i++) diagnostic.start(request());
    expect(diagnostic.snapshot().observations).toHaveLength(64);
    expect(diagnostic.snapshot().overflow).toBe(6);
    expect(diagnostic.snapshot().diagnosticOnly).toBe(true);
  });

  it("preserva as asserções, ausência de retries e upload após recuperação", () => {
    const source = readFileSync("tests/e2e/cms-public-bridge-canary.spec.ts", "utf8");
    expect(source).toContain("expect(requestFailures).toEqual([])");
    expect(source).toContain("throw error;");
    expect(source).toContain("test.setTimeout(3 * 60_000)");
    const workflow = readFileSync(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
    expect(workflow).toContain("--workers=1 --retries=0");
    expect(workflow).toContain(
      "candidate/outputs/staging-bridge-preview-headless.json.transport-failure.json",
    );
    expect(workflow).toContain(
      "candidate/outputs/staging-bridge-canonical-headless.json.transport-failure.json",
    );
    expect(workflow.indexOf("Release the legacy backend lease only after a proven restore")).toBeLessThan(
      workflow.indexOf("Upload legacy public backend bridge reports"),
    );
  });
});
