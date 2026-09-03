import { describe, expect, it } from "vitest";
import { createInitialPagePayload, createPageBlock } from "../../src/admin/page-builder-model";
import { createVisualDocument, prepareVisualBlock } from "../../src/admin/visual-studio-model";
import { CmsPageContentSchema } from "../../src/shared/contracts/cms-content";
import { EV2_VISUAL_COMPONENT_KEYS, Ev2VisualDocumentSchema } from "../../src/shared/contracts/ev2-visual";

describe("EV2.9 visual contracts", () => {
  const references = { assetId: crypto.randomUUID(), relatedItemId: crypto.randomUUID() };

  it("locks the MVP registry to 20 unique governed components", () => {
    expect(EV2_VISUAL_COMPONENT_KEYS).toHaveLength(20);
    expect(new Set(EV2_VISUAL_COMPONENT_KEYS).size).toBe(20);
    expect(EV2_VISUAL_COMPONENT_KEYS).toEqual(
      expect.arrayContaining([
        "hero",
        "form",
        "split_content",
        "logo_cloud",
        "tabs",
        "comparison_table",
        "alert",
        "timeline",
        "link_list",
      ]),
    );
  });

  it("creates a valid 12/8/4 document for every component renderer", () => {
    for (const component of EV2_VISUAL_COMPONENT_KEYS) {
      const document = createVisualDocument({
        itemId: crypto.randomUUID(),
        environment: "local",
        branchKey: `test-${component.replaceAll("_", "-")}`,
        blocks: [createPageBlock(component, references)],
      });
      expect(Ev2VisualDocumentSchema.safeParse(document).success, component).toBe(true);
      expect(document.nodes[0].componentVersion).toBe(1);
      expect(document.nodes[0].layout).toEqual({
        desktop: { span: 12, hidden: false },
        tablet: { span: 8, hidden: false },
        mobile: { span: 4, hidden: false },
      });
    }
  });

  it("rejects executable content, tenant/production drift and orphan bindings", () => {
    const source = createVisualDocument({
      itemId: crypto.randomUUID(),
      environment: "staging",
      branchKey: "visual-test",
      blocks: [createPageBlock("rich_text")],
    });
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        nodes: [
          {
            ...source.nodes[0],
            data: { ...source.nodes[0].data, text: "<script>alert(1)</script>" },
          },
        ],
      }).success,
    ).toBe(false);
    for (const unsafe of [
      "<svg onload=alert(1)>",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "<iframe srcdoc='x'>",
    ])
      expect(
        Ev2VisualDocumentSchema.safeParse({
          ...source,
          nodes: [{ ...source.nodes[0], data: { ...source.nodes[0].data, text: unsafe } }],
        }).success,
        unsafe,
      ).toBe(false);
    expect(Ev2VisualDocumentSchema.safeParse({ ...source, environment: "production" }).success).toBe(false);
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        bindings: [
          {
            id: crypto.randomUUID(),
            nodeId: crypto.randomUUID(),
            property: "data.heading",
            source: "static",
            path: "heading",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid visual groups and duplicate comparison columns", () => {
    const first = prepareVisualBlock(createPageBlock("rich_text"));
    const second = prepareVisualBlock(createPageBlock("comparison_table"));
    const groupId = crypto.randomUUID();
    const source = createVisualDocument({
      itemId: crypto.randomUUID(),
      environment: "local",
      branchKey: "visual-groups",
      blocks: [first, second],
    });
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        nodes: [{ ...source.nodes[0], groupId }, source.nodes[1]],
      }).success,
    ).toBe(false);
    if (source.nodes[1].type !== "comparison_table") throw new Error("fixture inválida");
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        nodes: [
          source.nodes[0],
          {
            ...source.nodes[1],
            data: { ...source.nodes[1].data, columns: ["Modelo", "modelo"] },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate heroes and layout overflow", () => {
    const source = createVisualDocument({
      itemId: crypto.randomUUID(),
      environment: "local",
      branchKey: "visual-layout",
      blocks: [createPageBlock("hero")],
    });
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        nodes: [...source.nodes, prepareVisualBlock(createPageBlock("hero"))],
      }).success,
    ).toBe(false);
    expect(
      Ev2VisualDocumentSchema.safeParse({
        ...source,
        nodes: [
          {
            ...source.nodes[0],
            layout: {
              ...source.nodes[0].layout!,
              mobile: { span: 4, start: 2, hidden: false },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts new components only when a governed visual provenance is attached", () => {
    const page = createInitialPagePayload("page");
    const block = prepareVisualBlock(createPageBlock("split_content", references));
    expect(CmsPageContentSchema.safeParse({ ...page, blocks: [block] }).success).toBe(false);
    expect(
      CmsPageContentSchema.safeParse({
        ...page,
        blocks: [block],
        visual: {
          schemaVersion: 1,
          branchId: crypto.randomUUID(),
          documentHash: "a".repeat(64),
          registryVersion: 1,
          themeKey: "gaiatec-default",
          mode: "guided",
          grid: { desktop: 12, tablet: 8, mobile: 4 },
        },
      }).success,
    ).toBe(true);
  });
});
