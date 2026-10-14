import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import policy from "../../supabase/functions/_shared/ai-delivery-policy.json";

it("seals a manual-only policy without changing historical migrations or provider privacy controls", () => {
  expect(policy).toEqual({
    schemaVersion: 1,
    policyKey: "cms-manual-only-v1",
    mode: "manual-only",
    externalProviderEnabled: false,
    assistedExecutionEnabled: false,
    automaticPublishAllowed: false,
  });
  const adapter = readFileSync("supabase/functions/_shared/openrouter.ts", "utf8");
  expect(adapter.indexOf('throw new Error("CMS_AI_MANUAL_ONLY")')).toBeLessThan(
    adapter.indexOf("const apiKey ="),
  );
  expect(adapter).toContain('data_collection: "deny"');
  expect(adapter).toContain("zdr: true");
  for (const name of ["cms-ai", "cms-ai-execute"]) {
    const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
    expect(source).toContain('code: "CMS_AI_MANUAL_ONLY"');
    expect(source.indexOf("await authenticateCms(req)")).toBeLessThan(
      source.indexOf('code: "CMS_AI_MANUAL_ONLY"'),
    );
    expect(source.indexOf("await consumeRateLimit(")).toBeLessThan(
      source.indexOf('code: "CMS_AI_MANUAL_ONLY"'),
    );
    expect(source).toContain('source: "manual_only"');
  }
});
