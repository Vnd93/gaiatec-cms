import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const publicEdge = source("supabase/functions/cms-public/index.ts");
const publicPresenter = source("supabase/functions/_shared/cms-public-wire.ts");
const publicClient = source("src/public/catalog-api.ts");
const leadClient = source("src/public/lead-api.ts");
const compatibilityAdapter = source("src/public/form-backend-compatibility.ts");
const leadEdge = source("supabase/functions/lead-capture/index.ts");

describe("fronteira semântica da API pública", () => {
  it("aplica apresentação e rejeição fail-closed em toda resposta JSON pública bem-sucedida", () => {
    expect(publicEdge).toContain("publicWireLeak(body)");
    expect(publicEdge).toContain("cms.public.contract_rejected");
    expect(publicEdge).toContain("presentPublicRow");
    expect(publicEdge).toContain("presentPublicForm");
    expect(publicPresenter).toContain("embeddedUuidPattern.test(value)");
    expect(publicPresenter).toContain("[0-9a-f]{40,128}");
    expect(publicPresenter).toContain("/\\/storage\\/v1\\/(?:object|render)\\//i.test(value)");
    expect(publicClient).toContain("wireHasInternalData(data)");
    expect(publicClient).toContain("[0-9a-f]{40,128}");
  });

  it("seleciona comparação e downloads apenas por referências públicas semânticas", () => {
    expect(publicClient).toContain('slugs: slugs.join(",")');
    expect(publicEdge).toContain('url.searchParams.get("slugs")');
    expect(publicEdge).not.toContain('url.searchParams.get("ids")');
    expect(publicEdge).toContain('url.searchParams.get("kind")');
    expect(publicEdge).toContain('url.searchParams.get("slug")');
    expect(publicEdge).toContain('url.searchParams.get("position")');
    expect(publicEdge).not.toContain('url.searchParams.get("documentId")');
    expect(publicEdge).not.toContain('url.searchParams.get("sha256")');
  });

  it("isola a ponte legada e mantém o contrato normal sem IDs ou correlação", () => {
    expect(leadClient).toContain("compatibleLeadRequest");
    expect(leadClient).not.toContain("formId:");
    expect(leadClient).not.toContain("formVersionId:");
    expect(leadClient).not.toContain("correlationId");
    expect(compatibilityAdapter).toContain("formKey: input.form.key");
    expect(compatibilityAdapter).toContain("formVersion: input.form.version");
    expect(compatibilityAdapter).toContain('submissionToken: input.idempotencyKey.replaceAll("-", "")');
    expect(compatibilityAdapter).toContain("const legacyBindings = new WeakMap");
    expect(compatibilityAdapter).toContain('LEGACY_FORM_BRIDGE_RETIREMENT_GATE = "f48-tabs-drained"');
    expect(leadEdge).toContain("requestedFormKey=null");
    expect(leadEdge).toContain("requestedFormId=input.formId");
    expect(leadEdge).toContain("requestedFormVersionId=input.formVersionId");
    expect(leadEdge).toContain("requestedFormKey=input.formKey");
    expect(leadEdge).toContain("requestedFormId=null");
    expect(leadEdge).toContain("requestedFormVersionId=null");
    expect(leadEdge).toContain("p_form_key:requestedFormKey");
    expect(leadEdge).toContain("p_form_id:requestedFormId");
    expect(leadEdge).toContain("p_version_id:requestedFormVersionId");
    expect(leadEdge).toContain("/^LD-[A-F0-9]{10}$/.test(data.reference)");
    expect(leadEdge).toContain("return json(req,{reference,duplicate:data.duplicate},201)");
    expect(leadEdge).not.toContain("return json(req,{correlationId");
  });
});
