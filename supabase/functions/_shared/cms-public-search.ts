/**
 * Converte somente os valores de uma projeção pública já sanitizada em texto
 * pesquisável. Evita o silencioso `[object Object]` produzido por `join()` e
 * não adiciona nomes de campos técnicos ao índice.
 */
export function flattenPublicSearchValues(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPublicSearchValues);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenPublicSearchValues);
  }
  return [];
}

export function publicBlockSearchValues(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return [];
    const record = block as Record<string, unknown>;
    const data =
      record.data && typeof record.data === "object" && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : {};
    if (record.type === "rich_text") return flattenPublicSearchValues(data.text);
    if (record.type === "image") return flattenPublicSearchValues([data.alt, data.caption]);
    if (record.type === "cta") return flattenPublicSearchValues(data.label);
    if (record.type === "related_content") return flattenPublicSearchValues(data.state);
    return [];
  });
}
