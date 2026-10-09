import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("categoria de serviço na homologação autenticada", () => {
  it("usa o select real e recusa opções vazias ou desabilitadas", () => {
    const coverage = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");
    const editor = readFileSync("src/admin/components/DiscoveryContentEditor.tsx", "utf8");
    const helper = coverage.slice(
      coverage.indexOf("async function selectFirstActiveControlledOption"),
      coverage.indexOf("async function fillSyntheticPostForCreate"),
    );
    expect(editor).toMatch(/<Field label="Categoria do serviço">\s*<select/);
    expect(helper).toContain('getByRole("combobox", { name: label, exact: true })');
    expect(helper).toContain('option:not([value=""]):not(:disabled)');
    expect(helper).toContain("if (!value) throw new Error");
    expect(helper).toContain("await select.selectOption(value)");
    expect(helper).toContain("await expect(select).toHaveValue(value)");
    expect(coverage).toContain('await selectFirstActiveControlledOption(page, "Categoria do serviço")');
    expect(coverage).not.toContain('fillFirstDatalistOption(page, "Categoria do serviço")');
  });
});
