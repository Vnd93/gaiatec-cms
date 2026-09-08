type PublicCollectionEntry = {
  score?: number;
  row: {
    slug?: string;
    payload?: { displayOrder?: number; title?: string };
  };
};

function normalizedDisplayOrder(entry: PublicCollectionEntry) {
  const order = entry.row.payload?.displayOrder;
  return Number.isInteger(order) && Number(order) >= 0 && Number(order) <= 999
    ? Number(order)
    : 999;
}

/**
 * Keeps relevance first when a visitor searches. On unfiltered discovery
 * collections the governed display order is authoritative, with a stable
 * editorial title/slug fallback for old records that predate the field.
 */
export function comparePublicCollectionEntries(
  left: PublicCollectionEntry,
  right: PublicCollectionEntry,
  hasQuery: boolean,
) {
  if (hasQuery) {
    const relevance = Number(right.score ?? 0) - Number(left.score ?? 0);
    if (relevance) return relevance;
  }
  const displayOrder = normalizedDisplayOrder(left) - normalizedDisplayOrder(right);
  if (displayOrder) return displayOrder;
  const leftLabel = left.row.payload?.title ?? left.row.slug ?? "";
  const rightLabel = right.row.payload?.title ?? right.row.slug ?? "";
  return leftLabel.localeCompare(rightLabel, "pt-BR");
}
