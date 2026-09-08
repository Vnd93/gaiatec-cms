import { describe, expect, it } from "vitest";
import {
  humanValidationIssue,
  humanValidationMessage,
  humanValidationPath,
} from "../../src/admin/validation-field-label";

describe("mensagens humanas de validação", () => {
  it("traduz caminho e restrição sem expor nomes internos ou o texto bruto do schema", () => {
    const issue = {
      code: "too_small",
      path: ["models", 0, "variants", 1, "internalOwnerId"],
      message: '[{"code":"too_small","minimum":1,"path":["models",0]}]',
    };

    const rendered = humanValidationIssue(issue);

    expect(rendered).toBe(
      "Modelos › item 1 › Variantes › item 2 › Campo do cadastro: informe um valor que atenda ao mínimo permitido.",
    );
    expect(rendered).not.toContain("internalOwnerId");
    expect(rendered).not.toContain("too_small");
    expect(rendered).not.toContain("minimum");
  });

  it("mantém mensagens e campos comerciais previsíveis para importação", () => {
    expect(humanValidationPath(["seo", "canonicalPath"])).toBe("SEO › Endereço canônico");
    expect(humanValidationMessage({ code: "invalid_format", path: ["seo"] })).toBe(
      "revise o formato do valor informado.",
    );
  });
});
