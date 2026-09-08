import { governedFormBindingSelector } from "./cms-public-wire.ts";

type JsonRecord = Record<string, unknown>;

export type GovernedPublicFormBinding = {
  formId: string;
  versionId: string;
};

export type PublicFormBinding = {
  key: string;
  version: number;
};

export type PublicFormBindingLoadResult = {
  data: unknown | null;
  error: unknown | null;
};

// CmsPageContent accepts at most 80 blocks. A page made entirely of governed
// form blocks must remain renderable, while concurrency keeps the authoritative
// lookups bounded.
export const PUBLIC_FORM_BINDING_LIMIT = 80;
export const PUBLIC_FORM_BINDING_CONCURRENCY = 4;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function governedPublicFormBindings(payload: unknown): GovernedPublicFormBinding[] {
  if (!isRecord(payload) || !Array.isArray(payload.blocks)) return [];
  const distinct = new Map<string, GovernedPublicFormBinding>();
  for (const block of payload.blocks) {
    if (!isRecord(block) || block.type !== "form" || !isRecord(block.data)) continue;
    const formId = block.data.formId;
    const versionId = block.data.formVersionId;
    if (
      typeof formId !== "string" ||
      !uuidPattern.test(formId) ||
      typeof versionId !== "string" ||
      !uuidPattern.test(versionId)
    )
      continue;
    const canonical = {
      formId: formId.toLowerCase(),
      versionId: versionId.toLowerCase(),
    };
    distinct.set(governedFormBindingSelector(canonical.formId, canonical.versionId), canonical);
    if (distinct.size > PUBLIC_FORM_BINDING_LIMIT)
      throw new Error("CMS_PUBLIC_FORM_BINDING_LIMIT_EXCEEDED");
  }
  return [...distinct.values()];
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const consume = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => consume()));
  return results;
}

export async function resolveGovernedPublicFormBindings(
  payload: unknown,
  cachedForms: ReadonlyMap<string, unknown | null>,
  load: (binding: GovernedPublicFormBinding) => Promise<PublicFormBindingLoadResult>,
): Promise<{ data: Map<string, PublicFormBinding>; error: unknown | null }> {
  let bindings: GovernedPublicFormBinding[];
  try {
    bindings = governedPublicFormBindings(payload);
  } catch (error) {
    return { data: new Map(), error };
  }

  const resolvedForms = new Map(cachedForms);
  const missing = bindings.filter(
    ({ formId, versionId }) =>
      !resolvedForms.has(governedFormBindingSelector(formId, versionId)),
  );
  let loaded: PublicFormBindingLoadResult[];
  try {
    loaded = await mapWithConcurrency(missing, PUBLIC_FORM_BINDING_CONCURRENCY, load);
  } catch (error) {
    return { data: new Map(), error };
  }
  for (const [index, result] of loaded.entries()) {
    if (result.error) return { data: new Map(), error: result.error };
    const binding = missing[index];
    resolvedForms.set(
      governedFormBindingSelector(binding.formId, binding.versionId),
      result.data,
    );
  }

  const publicBindings = new Map<string, PublicFormBinding>();
  for (const { formId, versionId } of bindings) {
    const selector = governedFormBindingSelector(formId, versionId);
    const form = resolvedForms.get(selector);
    if (
      !isRecord(form) ||
      typeof form.key !== "string" ||
      typeof form.formId !== "string" ||
      form.formId.toLowerCase() !== formId ||
      typeof form.versionId !== "string" ||
      form.versionId.toLowerCase() !== versionId ||
      !Number.isSafeInteger(form.version) ||
      Number(form.version) < 1
    )
      continue;
    publicBindings.set(selector, { key: form.key, version: Number(form.version) });
  }
  return { data: publicBindings, error: null };
}
