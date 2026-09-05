import { describe, expect, it } from "vitest";
import { createPageBlock } from "../../src/admin/page-builder-model";
import {
  appendVisualComponent,
  createVisualDocument,
  duplicateVisualNode,
  groupVisualNodes,
  moveVisualNode,
  removeVisualNode,
  reorderVisualNode,
  setVisualSpan,
  setVisualStart,
  setVisualVisibility,
  ungroupVisualNodes,
  updateVisualNode,
  visualPageMetadata,
} from "../../src/admin/visual-studio-model";

const createDocument = () =>
  createVisualDocument({
    itemId: crypto.randomUUID(),
    environment: "local",
    branchKey: "unit-visual",
    blocks: [createPageBlock("rich_text"), createPageBlock("cta")],
  });

describe("visual studio immutable editor model", () => {
  it("adds, duplicates, moves and removes nodes without reusing identities", () => {
    const initial = createDocument();
    const withAlert = appendVisualComponent(initial, "alert");
    expect(withAlert.nodes).toHaveLength(3);
    expect(initial.nodes).toHaveLength(2);

    const duplicated = duplicateVisualNode(withAlert, withAlert.nodes[0].id);
    expect(duplicated.nodes[1].id).not.toBe(duplicated.nodes[0].id);
    const moved = moveVisualNode(duplicated, duplicated.nodes[0].id, 1);
    expect(moved.nodes[1].id).toBe(duplicated.nodes[0].id);
    const reordered = reorderVisualNode(moved, moved.nodes.at(-1)!.id, moved.nodes[0].id);
    expect(reordered.nodes[0].id).toBe(moved.nodes.at(-1)!.id);
    const removed = removeVisualNode(reordered, reordered.nodes[0].id);
    expect(removed.nodes).toHaveLength(3);
  });

  it("enforces responsive spans, visibility and same-document groups", () => {
    const initial = createDocument();
    const nodeId = initial.nodes[0].id;
    const resized = setVisualSpan(initial, nodeId, "mobile", 99);
    expect(resized.nodes[0].layout?.mobile.span).toBe(4);
    const hidden = setVisualVisibility(resized, nodeId, "tablet", true);
    expect(hidden.nodes[0].layout?.tablet.hidden).toBe(true);
    const desktopSized = setVisualSpan(hidden, nodeId, "desktop", 6);
    const positioned = setVisualStart(desktopSized, nodeId, "desktop", 2);
    expect(positioned.nodes[0].layout?.desktop.start).toBe(2);
    const groupId = crypto.randomUUID();
    const grouped = groupVisualNodes(
      positioned,
      positioned.nodes.map((node) => node.id),
      groupId,
    );
    expect(grouped.nodes.every((node) => node.groupId === groupId)).toBe(true);
    expect(grouped.nodes[0].layout?.desktop.start).toBeUndefined();
    expect(ungroupVisualNodes(grouped, groupId).nodes.every((node) => !node.groupId)).toBe(true);
  });

  it("preserves transient field edits until the explicit save validation", () => {
    const initial = createDocument();
    const node = initial.nodes[0];
    if (node.type !== "rich_text") throw new Error("fixture inválida");
    const changed = updateVisualNode(initial, node.id, {
      ...node,
      data: { ...node.data, text: "" },
    });
    expect(changed.nodes[0]).toMatchObject({ data: { text: "" } });
  });

  it("requires real catalog selections before inserting reference-backed components", () => {
    const initial = createDocument();
    expect(() => appendVisualComponent(initial, "image")).toThrow(/mídia válida/i);
    expect(() => appendVisualComponent(initial, "related_content")).toThrow(/conteúdo relacionado válido/i);
    const assetId = crypto.randomUUID();
    const relationId = crypto.randomUUID();
    expect(appendVisualComponent(initial, "image", { assetId }).nodes.at(-1)).toMatchObject({
      data: { assetId },
    });
    expect(
      appendVisualComponent(initial, "related_content", { relatedItemId: relationId }).nodes.at(-1),
    ).toMatchObject({ data: { itemIds: [relationId] } });
  });

  it("does not permit deleting the last node and emits publication provenance", () => {
    const one = createVisualDocument({
      itemId: crypto.randomUUID(),
      environment: "staging",
      branchKey: "only-node",
      blocks: [createPageBlock("rich_text")],
    });
    expect(() => removeVisualNode(one, one.nodes[0].id)).toThrow(/ao menos um componente/i);
    expect(visualPageMetadata(one, crypto.randomUUID(), "b".repeat(64))).toMatchObject({
      schemaVersion: 1,
      registryVersion: 1,
      themeKey: "gaiatec-default",
      grid: { desktop: 12, tablet: 8, mobile: 4 },
    });
  });
});
