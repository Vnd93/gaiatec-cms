import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const editorPaths = [
  "src/admin/pages/AdminEditorPage.tsx",
  "src/admin/pages/AdminProductEditorPage.tsx",
  "src/admin/pages/AdminCampaignEditorPage.tsx",
  "src/admin/pages/AdminPageBuilderPage.tsx",
  "src/admin/pages/AdminSiteConfigurationPage.tsx",
  "src/admin/pages/AdminDiscoveryPage.tsx",
];

describe("published revision reconciliation coverage", () => {
  it.each(editorPaths)("reconciles the authoritative state in %s", (path) => {
    const editor = source(path);
    expect(editor).toContain("saveWithPublishedRevisionReconciliation({");
    expect(editor).toContain("fetchAuthoritativeEditorialItem(");
    expect(editor).toContain("INVALIDATED_EDITOR_SNAPSHOT");
  });

  it("covers both the editor save and bidirectional relation mutation", () => {
    const discovery = source("src/admin/pages/AdminDiscoveryPage.tsx");
    expect(discovery.match(/saveWithPublishedRevisionReconciliation\(\{/g)).toHaveLength(2);
    expect(discovery).toContain(
      "const authoritative = await fetchAuthoritativeEditorialItem(item.id, contentType)",
    );
  });

  it("keeps the public projection available and never retries or republishes automatically", () => {
    const helper = source("src/admin/published-revision-save.ts");
    expect(helper).toContain("A publicação atual permanece disponível.");
    expect(helper).not.toContain('action: "publish"');
    expect(helper.match(/return await save\(\)|return save\(\)/g)).toHaveLength(2);
  });
});
