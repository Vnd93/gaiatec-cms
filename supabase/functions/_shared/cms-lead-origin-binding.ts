type UnknownRecord = Record<string, unknown>;

export type GovernedFormBinding = Readonly<{
  formId: string;
  formVersionId: string;
}>;

export type GovernedLeadOrigin = Readonly<{
  path: string;
  source: string;
}>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function directBindingMatches(payload: UnknownRecord, expected: GovernedFormBinding): boolean {
  const form = record(payload.form);
  return form?.formId === expected.formId &&
    form.versionId === expected.formVersionId;
}

function blockBindingMatches(payload: UnknownRecord, expected: GovernedFormBinding): boolean {
  if (!Array.isArray(payload.blocks)) return false;
  return payload.blocks.some((candidate) => {
    const block = record(candidate);
    const data = block?.type === "form" ? record(block.data) : null;
    return data?.formId === expected.formId &&
      data.formVersionId === expected.formVersionId;
  });
}

export function publishedProjectionBindsExactForm(
  payload: unknown,
  expected: GovernedFormBinding,
): boolean {
  const projection = record(payload);
  if (!projection) return false;
  return directBindingMatches(projection, expected) || blockBindingMatches(projection, expected);
}

export function publishedProjectionAuthorizesLeadContext(
  projection: Readonly<{ contentType: "campaign" | "product"; slug: string; payload: unknown }>,
  expected: GovernedFormBinding,
  origin: GovernedLeadOrigin,
): boolean {
  const payload = record(projection.payload);
  if (!payload || !publishedProjectionBindsExactForm(payload, expected)) return false;
  const route = record(payload.route);
  const declaredRoute = typeof route?.path === "string" && route.path.startsWith("/") ? route.path : null;
  const authoritativePath = projection.contentType === "campaign"
    ? declaredRoute
    : `/produtos/${projection.slug}`;
  return origin.source === projection.contentType &&
    authoritativePath !== null &&
    origin.path === authoritativePath;
}
