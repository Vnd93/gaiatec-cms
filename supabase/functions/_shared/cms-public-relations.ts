export const PUBLIC_RELATION_LIMIT = 500;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function appendRelationIds(target: Set<string>, candidates: unknown): void {
  if (!Array.isArray(candidates)) throw new Error("CMS_PUBLIC_RELATION_INVALID");
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !uuidPattern.test(candidate))
      throw new Error("CMS_PUBLIC_RELATION_INVALID");
    target.add(candidate.toLowerCase());
    if (target.size > PUBLIC_RELATION_LIMIT)
      throw new Error("CMS_PUBLIC_RELATION_LIMIT_EXCEEDED");
  }
}

/**
 * Mirrors the publication trigger: every relation visible to cms-public is
 * validated and deduplicated before use. Invalid or oversized projections are
 * rejected instead of being partially rendered.
 */
export function publicRelationIds(payload: unknown): string[] {
  if (!isRecord(payload)) throw new Error("CMS_PUBLIC_RELATION_INVALID");
  const ids = new Set<string>();

  if (payload.relations !== undefined) {
    if (!isRecord(payload.relations)) throw new Error("CMS_PUBLIC_RELATION_INVALID");
    for (const candidates of Object.values(payload.relations)) appendRelationIds(ids, candidates);
  }

  if (payload.blocks !== undefined) {
    if (!Array.isArray(payload.blocks)) throw new Error("CMS_PUBLIC_RELATION_INVALID");
    for (const block of payload.blocks) {
      if (!isRecord(block)) throw new Error("CMS_PUBLIC_RELATION_INVALID");
      if (block.type !== "related_content") continue;
      if (!isRecord(block.data)) continue;
      if (block.data.itemIds !== undefined) appendRelationIds(ids, block.data.itemIds);
    }
  }

  return [...ids];
}
