import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const publicApi = readFileSync(resolve(process.cwd(), "supabase/functions/cms-public/index.ts"), "utf8");
const documentResolver = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/cms-document-resolution.ts"),
  "utf8",
);

function section(start: string, end: string): string {
  const startIndex = publicApi.indexOf(start);
  const endIndex = publicApi.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return publicApi.slice(startIndex, endIndex);
}

describe("cms-public availability contract", () => {
  it("distinguishes route absence from route storage failures", () => {
    const redirect = section('if (type === "redirect")', "const campaignIsActive");
    const page = section('if (type === "page-by-path")', 'if (type === "posts")');
    const campaign = section('if (type === "campaign-by-path")', 'if (type === "campaign-placements")');

    expect(redirect).toContain("error: routeError");
    expect(redirect).toContain("error: legacyError");
    expect(page).toContain("error: managedRuleError");
    expect(page).toContain("error: legacyRuleError");
    expect(campaign).toContain("error: routeRuleError");
    for (const handler of [redirect, page, campaign]) {
      expect(handler).toContain("503");
      expect(handler).toContain('"Cache-Control": "no-store"');
    }
    expect(redirect).toContain("publicPathPattern.test(path)");
    expect(redirect).toContain("path.length > 300");
  });

  it("propagates form definition and version failures without returning a false 204 or partial campaign", () => {
    const loader = section("const loadPublishedForm", 'if (type === "site-shell")');
    const form = section('if (type === "form")', 'if (type === "campaign-by-path")');
    const campaign = section('if (type === "campaign-by-path")', 'if (type === "campaign-placements")');

    expect(loader).toContain('client.rpc("cms_public_form_scoped"');
    expect(loader).toContain("if (error) return { data: null, error }");
    expect(loader).not.toContain('from("cms_form_definitions")');
    expect(loader).not.toContain('from("cms_form_versions")');
    expect(form).toContain("formResult.error");
    expect(form.indexOf("formResult.error")).toBeLessThan(form.indexOf("status: 204"));
    expect(form).toContain("const publicForm = presentPublicForm(formResult.data)");
    expect(form).toMatch(/publicForm[\s\S]+Formulário temporariamente indisponível[\s\S]+503/);
    expect(campaign).toContain("formResult.error");
    expect(campaign).toContain("formResult.data && !publicForm");
    expect(campaign).toContain("...(publicForm ? { form: publicForm } : {})");
    expect(campaign).toMatch(/formResult\.data && !publicForm[\s\S]+503/);
  });

  it("fails closed on resolver and unexpected network/storage exceptions", () => {
    expect(documentResolver).toContain("if (error) throw error");
    expect(documentResolver).toContain('destination: "validated" | number');
    expect(documentResolver).not.toContain("documentId:");
    expect(publicApi).toContain('if (type === "document")');
    expect(publicApi).toContain('url.searchParams.get("position")');
    expect(publicApi).toContain("cms_public_document_download_target");
    expect(publicApi).toContain("sha256Bytes(bytes)");
    expect(publicApi).not.toContain("status: 304");
    expect(publicApi).toMatch(/Deno\.serve\(async \(req\) => \{[\s\S]*return await handleRequest\(req\);/);
    expect(publicApi).toMatch(/catch \{[\s\S]*temporariamente indisponível[\s\S]*503/);
  });

  it("allows governed public images to be embedded from the cross-site Supabase proxy", () => {
    const media = section('if (type === "media")', 'if (type === "document")');

    expect(media).toContain('"Cross-Origin-Resource-Policy": "cross-origin"');
    expect(media).not.toContain('"Cross-Origin-Resource-Policy": "same-site"');
    expect(media).toContain("...headers");
    expect(publicApi).toContain('const headers = { "Access-Control-Allow-Origin": "*"');
  });

  it("does not silently degrade search rules or synonyms on backend failure", () => {
    expect(publicApi).toContain("error: redirectError");
    expect(publicApi).toContain("if (redirectError)");
    expect(publicApi).toContain("error: synonymError");
    expect(publicApi).toContain("if (synonymError)");
  });
});
