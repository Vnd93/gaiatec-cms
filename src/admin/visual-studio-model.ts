import type { CmsPageBlock } from "@/shared/contracts/cms-content";
import {
  Ev2VisualDocumentSchema,
  type Ev2VisualComponentKey,
  type Ev2VisualDocument,
} from "@/shared/contracts/ev2-visual";
import {
  createPageBlock,
  duplicatePageBlock,
  movePageBlock,
  type PageBlockReferences,
} from "./page-builder-model";

type Breakpoint = "desktop" | "tablet" | "mobile";

export const DEFAULT_VISUAL_LAYOUT: NonNullable<CmsPageBlock["layout"]> = {
  desktop: { span: 12, hidden: false },
  tablet: { span: 8, hidden: false },
  mobile: { span: 4, hidden: false },
};

export function prepareVisualBlock(block: CmsPageBlock): CmsPageBlock {
  return {
    ...structuredClone(block),
    componentVersion: 1,
    layout: block.layout ?? structuredClone(DEFAULT_VISUAL_LAYOUT),
  } as CmsPageBlock;
}

export function createVisualDocument(input: {
  itemId: string;
  siteKey?: string;
  environment: "local" | "staging";
  branchKey: string;
  blocks: CmsPageBlock[];
  themeKey?: string;
}): Ev2VisualDocument {
  return Ev2VisualDocumentSchema.parse({
    schemaVersion: 1,
    registryVersion: 1,
    itemId: input.itemId,
    siteKey: input.siteKey ?? "main",
    environment: input.environment,
    branchKey: input.branchKey,
    themeKey: input.themeKey ?? "gaiatec-default",
    mode: "guided",
    grid: { desktop: 12, tablet: 8, mobile: 4 },
    nodes: input.blocks.map(prepareVisualBlock),
    bindings: [],
  });
}

export function appendVisualComponent(
  document: Ev2VisualDocument,
  component: Ev2VisualComponentKey,
  references: PageBlockReferences = {},
): Ev2VisualDocument {
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: [...document.nodes, prepareVisualBlock(createPageBlock(component, references))],
  });
}

export function updateVisualNode(
  document: Ev2VisualDocument,
  nodeId: string,
  update: CmsPageBlock,
): Ev2VisualDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? prepareVisualBlock(update) : node)),
  } as Ev2VisualDocument;
}

export function removeVisualNode(document: Ev2VisualDocument, nodeId: string): Ev2VisualDocument {
  if (document.nodes.length === 1)
    throw new Error("O documento visual precisa manter ao menos um componente.");
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.filter((node) => node.id !== nodeId),
    bindings: document.bindings.filter((binding) => binding.nodeId !== nodeId),
  });
}

export function duplicateVisualNode(document: Ev2VisualDocument, nodeId: string): Ev2VisualDocument {
  const index = document.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return document;
  const duplicate = prepareVisualBlock(duplicatePageBlock(document.nodes[index]));
  const nodes = document.nodes.slice();
  nodes.splice(index + 1, 0, duplicate);
  return Ev2VisualDocumentSchema.parse({ ...document, nodes });
}

export function moveVisualNode(
  document: Ev2VisualDocument,
  nodeId: string,
  offset: -1 | 1,
): Ev2VisualDocument {
  const index = document.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return document;
  return Ev2VisualDocumentSchema.parse({ ...document, nodes: movePageBlock(document.nodes, index, offset) });
}

export function reorderVisualNode(
  document: Ev2VisualDocument,
  sourceId: string,
  targetId: string,
): Ev2VisualDocument {
  const sourceIndex = document.nodes.findIndex((node) => node.id === sourceId);
  const targetIndex = document.nodes.findIndex((node) => node.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return document;
  const nodes = document.nodes.slice();
  const [source] = nodes.splice(sourceIndex, 1);
  nodes.splice(targetIndex, 0, source);
  return Ev2VisualDocumentSchema.parse({ ...document, nodes });
}

export function setVisualSpan(
  document: Ev2VisualDocument,
  nodeId: string,
  breakpoint: Breakpoint,
  span: number,
): Ev2VisualDocument {
  const columns = document.grid[breakpoint];
  const safeSpan = Math.max(1, Math.min(columns, Math.trunc(span)));
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const layout = node.layout ?? structuredClone(DEFAULT_VISUAL_LAYOUT);
      const current = layout[breakpoint];
      const start = current.start && current.start + safeSpan - 1 <= columns ? current.start : undefined;
      return {
        ...node,
        layout: { ...layout, [breakpoint]: { ...current, span: safeSpan, start } },
      } as CmsPageBlock;
    }),
  });
}

export function setVisualVisibility(
  document: Ev2VisualDocument,
  nodeId: string,
  breakpoint: Breakpoint,
  hidden: boolean,
): Ev2VisualDocument {
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const layout = node.layout ?? structuredClone(DEFAULT_VISUAL_LAYOUT);
      return {
        ...node,
        layout: { ...layout, [breakpoint]: { ...layout[breakpoint], hidden } },
      } as CmsPageBlock;
    }),
  });
}

export function setVisualStart(
  document: Ev2VisualDocument,
  nodeId: string,
  breakpoint: Breakpoint,
  start?: number,
): Ev2VisualDocument {
  const columns = document.grid[breakpoint];
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const layout = node.layout ?? structuredClone(DEFAULT_VISUAL_LAYOUT);
      const slot = layout[breakpoint];
      const safeStart = start === undefined ? undefined : Math.max(1, Math.min(columns, Math.trunc(start)));
      if (safeStart !== undefined && safeStart + slot.span - 1 > columns)
        throw new Error(`A posição precisa manter o componente dentro das ${columns} colunas.`);
      return {
        ...node,
        layout: { ...layout, [breakpoint]: { ...slot, start: safeStart } },
      } as CmsPageBlock;
    }),
  });
}

export function groupVisualNodes(
  document: Ev2VisualDocument,
  nodeIds: string[],
  groupId: string = crypto.randomUUID(),
): Ev2VisualDocument {
  const selected = new Set(nodeIds);
  const indexes = document.nodes.flatMap((node, index) => (selected.has(node.id) ? [index] : []));
  if (indexes.length < 2 || indexes.at(-1)! - indexes[0] + 1 !== indexes.length)
    throw new Error("Agrupe ao menos dois componentes adjacentes.");
  const count = indexes.length;
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => {
      if (!selected.has(node.id)) return node;
      const layout = structuredClone(node.layout ?? DEFAULT_VISUAL_LAYOUT);
      for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
        const columns = document.grid[breakpoint];
        layout[breakpoint] = {
          ...layout[breakpoint],
          span: Math.max(1, Math.floor(columns / count)),
          start: undefined,
        };
      }
      return { ...node, groupId, layout } as CmsPageBlock;
    }),
  });
}

export function ungroupVisualNodes(document: Ev2VisualDocument, groupId: string): Ev2VisualDocument {
  return Ev2VisualDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) =>
      node.groupId === groupId ? ({ ...node, groupId: undefined } as CmsPageBlock) : node,
    ),
  });
}

export function visualPageMetadata(document: Ev2VisualDocument, branchId: string, documentHash: string) {
  return {
    schemaVersion: 1 as const,
    branchId,
    documentHash,
    registryVersion: 1 as const,
    themeKey: document.themeKey,
    mode: document.mode,
    grid: document.grid,
  };
}
