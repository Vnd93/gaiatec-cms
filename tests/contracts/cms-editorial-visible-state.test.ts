import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editorialStateFromVisibleText, editorialVisibleStateText } from "../e2e/cms-editorial-visible-state";

const scenario = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");

describe("editorial visible-state contract", () => {
  it("requires the exact rendered state instead of a backend code substring", () => {
    expect(scenario.includes("editorialVisibleStateText(plan.kind, state)")).toBe(true);
    expect(scenario.includes("editorialStateLocator(page, plan)).toContainText(state")).toBe(false);
  });

  it("decodes the rendered state before choosing the normal cleanup action", () => {
    expect(scenario.includes("editorialStateFromVisibleText(")).toBe(true);
    expect(scenario.includes('state.includes("published")')).toBe(false);
    expect(scenario.includes('state.includes("archived")')).toBe(false);
  });

  for (const [kind, file, declaration] of [
    ["post", "AdminEditorPage.tsx", "editorialStatusLabels"],
    ["product", "AdminProductEditorPage.tsx", "workflowLabels"],
    ["campaign", "AdminCampaignEditorPage.tsx", "campaignWorkflowLabels"],
  ]) {
    it(`matches every authoritative ${kind} UI label and round-trips its canonical state`, () => {
      const source = readFileSync(`src/admin/pages/${file}`, "utf8");
      const block = source.match(new RegExp(`const ${declaration}[^=]*= \\{([^}]+)\\}`))?.[1];
      expect(block).toBeTruthy();
      const entries = [...block!.matchAll(/([a-z_]+): "([^"]+)"/g)];
      expect(entries.length).toBeGreaterThanOrEqual(6);
      for (const [, state, label] of entries) {
        const visible = kind === "campaign" ? `Rascunho salvo · ${label}` : label;
        expect(editorialVisibleStateText(kind, state)).toBe(visible);
        expect(editorialStateFromVisibleText(kind, visible)).toBe(state);
      }
    });
  }

  it("requires the actual spaced discovery state for all four surfaces", () => {
    const source = readFileSync("src/admin/pages/AdminDiscoveryPage.tsx", "utf8");
    expect(source.includes('workflowStatus.replaceAll("_", " ")')).toBe(true);
    for (const kind of ["service", "industry", "application", "solution"]) {
      expect(editorialVisibleStateText(kind, "in_review")).toBe("in review");
      expect(editorialStateFromVisibleText(kind, "in review")).toBe("in_review");
      expect(() => editorialStateFromVisibleText(kind, "in_review")).toThrow(/VISIBLE_STATE_INVALID/);
    }
  });

  it("fails closed for unknown, dirty, ambiguous, stale-code and wrong-gender text", () => {
    for (const [kind, visible] of [
      ["post", "draft"],
      ["post", "Publicado Arquivado"],
      ["product", "Rascunho salvo · Publicado"],
      ["campaign", "Alterações não salvas"],
      ["campaign", "Rascunho salvo · Publicado"],
      ["campaign", "Rascunho salvo · in_review"],
    ])
      expect(() => editorialStateFromVisibleText(kind, visible)).toThrow(/VISIBLE_STATE_INVALID/);
    expect(() => editorialVisibleStateText("page", "draft")).toThrow(/SURFACE_INVALID/);
    expect(() => editorialVisibleStateText("post", "unknown")).toThrow(/STATE_INVALID/);
    expect(() => editorialVisibleStateText("product", "scheduled")).toThrow(/STATE_INVALID/);
  });
});
