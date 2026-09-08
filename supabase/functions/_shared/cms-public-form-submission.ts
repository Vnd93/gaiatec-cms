export const publicFormFieldTypes = [
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "checkbox",
  "hidden",
] as const;

export type PublicFormFieldType = (typeof publicFormFieldTypes)[number];
export type PublicFormSubmissionValue = string | boolean | string[];

export type GovernedPublicFormField = {
  key: string;
  label: string;
  type: PublicFormFieldType;
  required: boolean;
  maxLength?: number;
  options: string[];
  order: number;
};

export type PublicFormDefinitionValidation =
  | { ok: true; fields: GovernedPublicFormField[] }
  | { ok: false; reason: string };

export type PublicFormSubmissionValidation =
  | { ok: true; fields: Record<string, PublicFormSubmissionValue> }
  | { ok: false; kind: "configuration" | "submission"; reason: string };

const fieldTypeSet = new Set<string>(publicFormFieldTypes);
const fieldKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatedOptions(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const options: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const option = entry.trim();
    if (!option || option.length > 120 || options.includes(option)) return null;
    options.push(option);
  }
  return options;
}

export function validatePublicFormDefinition(value: unknown): PublicFormDefinitionValidation {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50)
    return { ok: false, reason: "field-count" };

  const keys = new Set<string>();
  const orders = new Set<number>();
  const fields: GovernedPublicFormField[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return { ok: false, reason: "field-shape" };
    const key = typeof entry.key === "string" ? entry.key : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const type = typeof entry.type === "string" ? entry.type : "";
    const maxLength = entry.maxLength;
    const order = entry.order;
    const options = validatedOptions(entry.options);
    if (
      !fieldKeyPattern.test(key) ||
      key.length > 120 ||
      !label ||
      label.length > 120 ||
      !fieldTypeSet.has(type) ||
      typeof entry.required !== "boolean" ||
      options === null ||
      !Number.isSafeInteger(order) ||
      Number(order) < 0 ||
      (maxLength !== undefined &&
        (!Number.isInteger(maxLength) || Number(maxLength) < 1 || Number(maxLength) > 5_000)) ||
      keys.has(key) ||
      orders.has(Number(order))
    )
      return { ok: false, reason: "field-invalid" };
    if (type === "select" && options.length === 0)
      return { ok: false, reason: "select-options" };
    if (type === "hidden" && entry.required)
      return { ok: false, reason: "required-hidden-field" };

    keys.add(key);
    orders.add(Number(order));
    fields.push({
      key,
      label,
      type: type as PublicFormFieldType,
      required: entry.required,
      ...(maxLength === undefined ? {} : { maxLength: Number(maxLength) }),
      options,
      order: Number(order),
    });
  }

  if (!fields.some((field) => field.type !== "hidden"))
    return { ok: false, reason: "no-visible-fields" };
  return { ok: true, fields: fields.sort((left, right) => left.order - right.order) };
}

export function validatePublicFormSubmission(
  definition: unknown,
  submitted: unknown,
): PublicFormSubmissionValidation {
  const validatedDefinition = validatePublicFormDefinition(definition);
  if (!validatedDefinition.ok)
    return { ok: false, kind: "configuration", reason: validatedDefinition.reason };
  if (!isRecord(submitted)) return { ok: false, kind: "submission", reason: "fields-shape" };

  const allowed = new Map(
    validatedDefinition.fields
      .filter((field) => field.type !== "hidden")
      .map((field) => [field.key, field] as const),
  );
  if (Object.keys(submitted).some((key) => !allowed.has(key)))
    return { ok: false, kind: "submission", reason: "unknown-field" };

  for (const field of allowed.values()) {
    const value = submitted[field.key];
    const empty =
      value === undefined ||
      value === null ||
      value === false ||
      (typeof value === "string" && value.trim() === "");
    if (field.required && empty)
      return { ok: false, kind: "submission", reason: "required-field" };
    if (empty) continue;
    if (field.type === "checkbox") {
      if (typeof value !== "boolean")
        return { ok: false, kind: "submission", reason: "field-type" };
      continue;
    }
    if (typeof value !== "string")
      return { ok: false, kind: "submission", reason: "field-type" };
    if (field.maxLength !== undefined && value.length > field.maxLength)
      return { ok: false, kind: "submission", reason: "field-limit" };
    if (field.type === "select" && !field.options.includes(value))
      return { ok: false, kind: "submission", reason: "select-value" };
    if (field.type === "email" && (!emailPattern.test(value) || value.length > 320))
      return { ok: false, kind: "submission", reason: "email-value" };
  }

  return {
    ok: true,
    fields: submitted as Record<string, PublicFormSubmissionValue>,
  };
}
