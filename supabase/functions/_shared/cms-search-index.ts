import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sanitizePublicPayload } from "./cms-public-projection.ts";

const searchableTypes = ["product", "service", "industry", "application", "solution", "post", "page", "homepage"];
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[₂]/g, "2").replace(/[–—]/g, "-").replace(/\bdn\s+(\d+)/g, "dn$1").replace(/4\s*-\s*20\s*ma/g, "4-20ma").replace(/[^a-z0-9%/.-]+/g, " ").trim();
const routeFor = (row: any) => row.content_type === "product" ? `/produtos/${row.slug}` : row.content_type === "industry" ? `/industrias/${row.slug}` : row.content_type === "application" ? `/aplicacoes/${row.slug}` : row.content_type === "solution" ? `/solucoes/${row.slug}` : row.content_type === "service" ? `/servicos/${row.slug}` : row.content_type === "post" ? `/blog/${row.slug}` : row.payload?.route?.path ?? "/";

function flatten(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number") output.push(String(value));
  else if (Array.isArray(value)) value.forEach((entry) => flatten(entry, output));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((entry) => flatten(entry, output));
  return output;
}

function facets(payload: Record<string, any>) {
  const controlled = payload.controlledClassification ?? {};
  return Object.fromEntries(Object.entries({ productCategory: controlled.productCategory?.label, applicationMagnitude: controlled.applicationMagnitude?.label, technology: controlled.technology?.label, installationOperation: controlled.installationOperation?.label, monitoredElement: controlled.monitoredElement?.label, serviceKind: payload.serviceKindRef?.label ?? payload.serviceKind, market: payload.marketName }).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, [value]]));
}

async function technicalRanges(admin: SupabaseClient, itemId: string) {
  const { data: product } = await admin.from("cms_pim_products").select("id").eq("content_item_id", itemId).eq("status", "active").maybeSingle();
  if (!product) return {};
  const { data: values, error } = await admin.from("cms_pim_attribute_values").select("definition_id,canonical_min,canonical_max,unit_code").eq("product_id", product.id).eq("active", true).eq("homologated", true);
  if (error || !values?.length) return {};
  const definitionIds = [...new Set(values.map((entry) => entry.definition_id))];
  const { data: definitions } = await admin.from("cms_pim_attribute_definitions").select("id,attribute_key,searchable,filterable").in("id", definitionIds).eq("status", "active");
  const byId = new Map((definitions ?? []).map((entry) => [entry.id, entry])), result: Record<string, any[]> = {};
  for (const value of values) {
    const definition = byId.get(value.definition_id);
    if (!definition || (!definition.searchable && !definition.filterable)) continue;
    const min = value.canonical_min === null ? undefined : Number(value.canonical_min), max = value.canonical_max === null ? undefined : Number(value.canonical_max);
    if (min !== undefined || max !== undefined) (result[definition.attribute_key] ??= []).push({ min: min ?? max, max: max ?? min, unit: value.unit_code ?? undefined });
  }
  return result;
}

export async function syncPublicSearchDocument(admin: SupabaseClient, itemId: string) {
  const { data: row, error } = await admin.from("cms_published_projection").select("item_id,revision_id,content_type,slug,payload,etag").eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  if (!row || !searchableTypes.includes(row.content_type)) {
    await admin.from("cms_search_documents").delete().eq("item_id", itemId);
    return "removed" as const;
  }
  const payload = sanitizePublicPayload(row.payload, { includeSearchMetadata: true });
  const { error: upsertError } = await admin.from("cms_search_documents").upsert({ item_id: row.item_id, revision_id: row.revision_id, content_type: row.content_type, slug: row.slug, public_path: routeFor({ ...row, payload }), title: String(payload.title ?? row.slug).slice(0, 300), summary: typeof payload.summary === "string" ? payload.summary.slice(0, 1000) : null, searchable_text: normalize(flatten(payload).join(" ")).slice(0, 64_000), facets: facets(payload), technical_ranges: row.content_type === "product" ? await technicalRanges(admin, itemId) : {}, source_etag: row.etag, indexed_at: new Date().toISOString() }, { onConflict: "item_id" });
  if (upsertError) throw upsertError;
  return "synced" as const;
}
