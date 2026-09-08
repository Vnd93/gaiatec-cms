import type { PublicFormVersion } from "./catalog-api";

type PublicFormIdentity = { key: string; version: number };
type RequestedFormIdentity = { key: string; version?: number };

type LegacyFormBinding = PublicFormIdentity & {
  formId: string;
  formVersionId: string;
};

type LeadFieldValue = string | boolean | string[];

type LeadSubmissionInput = {
  form: PublicFormVersion;
  fields: Record<string, LeadFieldValue>;
  idempotencyKey: string;
  origin: {
    path: string;
    source: string;
    campaignPath?: string;
    productSlug?: string;
    utm: Record<string, string | undefined>;
  };
  consentAccepted: boolean;
  honeypot: string;
  captchaToken?: string;
};

export type CompatibleLeadContract = "legacy-f48" | "public-v2";

// Removal gate: delete this adapter after release evidence proves that pre-candidate f48 tabs have drained.
export const LEGACY_FORM_BRIDGE_RETIREMENT_GATE = "f48-tabs-drained";

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicLeadReference = /^LD-[A-F0-9]{10}$/;
const legacyBindings = new WeakMap<object, LegacyFormBinding>();
const legacyLeadContexts = new Map<string, string>();
const formFieldTypes = new Set(["text", "email", "tel", "textarea", "select", "checkbox", "hidden"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
}

export function normalizeLegacyFormResponse(
  value: unknown,
  requested: RequestedFormIdentity,
  normalizePublicForm: (candidate: unknown) => PublicFormVersion | null,
): PublicFormVersion | null {
  if (!isRecord(value)) return null;
  if (
    !hasExactKeys(
      value,
      [
        "schemaVersion",
        "formId",
        "versionId",
        "version",
        "key",
        "title",
        "purpose",
        "fields",
        "consent",
        "slaMinutes",
        "retentionDays",
        "successMessage",
        "submitLabel",
        "status",
      ],
      [
        "schemaVersion",
        "formId",
        "versionId",
        "version",
        "key",
        "title",
        "purpose",
        "fields",
        "consent",
        "slaMinutes",
        "retentionDays",
        "successMessage",
        "submitLabel",
        "status",
      ],
    ) ||
    value.schemaVersion !== 1 ||
    !canonicalUuidPattern.test(typeof value.formId === "string" ? value.formId : "") ||
    !canonicalUuidPattern.test(typeof value.versionId === "string" ? value.versionId : "") ||
    value.key !== requested.key ||
    (requested.version !== undefined && value.version !== requested.version) ||
    value.status !== "published" ||
    !Number.isSafeInteger(value.slaMinutes) ||
    Number(value.slaMinutes) < 5 ||
    Number(value.slaMinutes) > 525_600 ||
    !Number.isSafeInteger(value.retentionDays) ||
    Number(value.retentionDays) < 1 ||
    Number(value.retentionDays) > 3_650 ||
    !Array.isArray(value.fields) ||
    value.fields.length < 1 ||
    value.fields.length > 50
  )
    return null;

  const publicFields: Array<Record<string, unknown>> = [];
  for (const entry of value.fields) {
    if (!isRecord(entry)) return null;
    if (
      !hasExactKeys(
        entry,
        ["id", "key", "label", "type", "required", "maxLength", "options", "personalData", "order"],
        ["id", "key", "label", "type", "required", "options", "personalData", "order"],
      ) ||
      !canonicalUuidPattern.test(typeof entry.id === "string" ? entry.id : "") ||
      typeof entry.personalData !== "boolean" ||
      typeof entry.type !== "string" ||
      !formFieldTypes.has(entry.type)
    )
      return null;
    if (entry.type === "hidden") {
      if (entry.required === true) return null;
      continue;
    }
    publicFields.push({
      key: entry.key,
      label: entry.label,
      type: entry.type,
      required: entry.required,
      ...(entry.maxLength === undefined ? {} : { maxLength: entry.maxLength }),
      options: entry.options,
      order: entry.order,
    });
  }

  const normalized = normalizePublicForm({
    key: value.key,
    version: value.version,
    title: value.title,
    purpose: value.purpose,
    fields: publicFields,
    consent: value.consent,
    successMessage: value.successMessage,
    submitLabel: value.submitLabel,
  });
  if (!normalized) return null;
  registerLegacyFormBinding(normalized, {
    key: normalized.key,
    version: normalized.version,
    formId: value.formId as string,
    formVersionId: value.versionId as string,
  });
  return normalized;
}

function registerLegacyFormBinding(form: PublicFormIdentity, binding: LegacyFormBinding): void {
  if (
    form.key !== binding.key ||
    form.version !== binding.version ||
    !canonicalUuidPattern.test(binding.formId) ||
    !canonicalUuidPattern.test(binding.formVersionId)
  )
    return;
  legacyBindings.set(form, { ...binding });
}

function legacyFormBindingFor(form: PublicFormIdentity): LegacyFormBinding | null {
  const binding = legacyBindings.get(form);
  if (
    !binding ||
    binding.key !== form.key ||
    binding.version !== form.version ||
    !canonicalUuidPattern.test(binding.formId) ||
    !canonicalUuidPattern.test(binding.formVersionId)
  )
    return null;
  return { ...binding };
}

export function transferLegacyFormBinding(source: object, destination: PublicFormIdentity): void {
  const sourceIdentity = source as Partial<PublicFormIdentity>;
  if (typeof sourceIdentity.key !== "string" || !Number.isSafeInteger(sourceIdentity.version)) return;
  const binding = legacyFormBindingFor(sourceIdentity as PublicFormIdentity);
  if (binding) registerLegacyFormBinding(destination, binding);
}

export function registerLegacyLeadContext(
  kind: "campaign" | "product",
  selector: string,
  itemId: string,
): void {
  if (
    !selector ||
    selector.length > 300 ||
    !canonicalUuidPattern.test(itemId) ||
    (kind === "campaign" && !/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selector)) ||
    (kind === "product" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selector))
  )
    return;
  const key = `${kind}:${selector}`;
  legacyLeadContexts.delete(key);
  legacyLeadContexts.set(key, itemId);
  if (legacyLeadContexts.size > 500)
    legacyLeadContexts.delete(legacyLeadContexts.keys().next().value as string);
}

export function compatibleLeadRequest(input: LeadSubmissionInput): {
  contract: CompatibleLeadContract;
  body: Record<string, unknown>;
} | null {
  const binding = legacyFormBindingFor(input.form);
  const consent = {
    accepted: input.consentAccepted,
    text: input.form.consent.text,
    version: input.form.consent.version,
  };
  if (binding) {
    if (input.origin.campaignPath && input.origin.productSlug) return null;
    const campaignId = input.origin.campaignPath
      ? legacyLeadContexts.get(`campaign:${input.origin.campaignPath}`)
      : undefined;
    const productId = input.origin.productSlug
      ? legacyLeadContexts.get(`product:${input.origin.productSlug}`)
      : undefined;
    if (
      (input.origin.source === "campaign" && (!input.origin.campaignPath || !campaignId)) ||
      (input.origin.source === "product" && (!input.origin.productSlug || !productId))
    )
      return null;
    return {
      contract: "legacy-f48",
      body: {
        formId: binding.formId,
        formVersionId: binding.formVersionId,
        idempotencyKey: input.idempotencyKey,
        fields: input.fields,
        origin: {
          path: input.origin.path,
          source: input.origin.source,
          ...(campaignId ? { campaignId } : {}),
          ...(productId ? { productId } : {}),
          utm: input.origin.utm,
        },
        consent,
        honeypot: input.honeypot,
        ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
      },
    };
  }
  return {
    contract: "public-v2",
    body: {
      formKey: input.form.key,
      formVersion: input.form.version,
      submissionToken: input.idempotencyKey.replaceAll("-", ""),
      fields: input.fields,
      origin: input.origin,
      consent,
      honeypot: input.honeypot,
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
    },
  };
}

export function normalizeCompatibleLeadSuccess(
  value: unknown,
  contract: CompatibleLeadContract,
): { reference: string; duplicate: boolean } | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const newShape = keys.length === 2 && keys.every((key) => ["reference", "duplicate"].includes(key));
  const legacyShape =
    contract === "legacy-f48" &&
    keys.length === 3 &&
    keys.every((key) => ["reference", "duplicate", "correlationId"].includes(key)) &&
    canonicalUuidPattern.test(typeof value.correlationId === "string" ? value.correlationId : "");
  if (
    (!newShape && !legacyShape) ||
    !publicLeadReference.test(typeof value.reference === "string" ? value.reference : "") ||
    typeof value.duplicate !== "boolean"
  )
    return null;
  return { reference: value.reference as string, duplicate: value.duplicate };
}
