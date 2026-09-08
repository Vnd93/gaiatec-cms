import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const capture = readFileSync(resolve(process.cwd(), "supabase/functions/lead-capture/index.ts"), "utf8");
const administration = readFileSync(resolve(process.cwd(), "supabase/functions/cms-leads/index.ts"), "utf8");

describe("CMS form availability and cost controls", () => {
  it("bounds anonymous capture before form and version reads", () => {
    const limiter = capture.indexOf('"lead_capture_preflight"');
    const formReads = capture.indexOf('admin.rpc("cms_public_form_scoped"');

    expect(limiter).toBeGreaterThanOrEqual(0);
    expect(formReads).toBeGreaterThan(limiter);
    expect(capture).toContain('"lead_capture_preflight",ip,60,60');
    expect(capture).toContain("if(formResult.error)");
    expect(capture).not.toContain('from("cms_form_definitions")');
    expect(capture).not.toContain('from("cms_form_versions")');
    expect(capture).toContain('"Formulário temporariamente indisponível."},503');
  });

  it("maps unexpected capture and administrative failures to a controlled 503", () => {
    for (const source of [capture, administration]) {
      expect(source).toContain("const handleRequest = async");
      expect(source).toMatch(/Deno\.serve\(async\(req\)=>\{[\s\S]*return await handleRequest\(req\);/);
      expect(source).toContain('"Serviço temporariamente indisponível."},503');
    }
    expect(administration).not.toMatch(/invalid\?422:500/);
    expect(administration).toMatch(/invalid\?422:503/);
  });
});
