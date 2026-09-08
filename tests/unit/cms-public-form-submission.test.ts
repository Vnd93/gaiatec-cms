import { describe, expect, it } from "vitest";

import {
  validatePublicFormDefinition,
  validatePublicFormSubmission,
} from "../../supabase/functions/_shared/cms-public-form-submission";

const fields = [
  {
    id: "91000000-0000-4000-8000-000000000001",
    key: "email",
    label: "E-mail",
    type: "email",
    required: true,
    maxLength: 254,
    options: [],
    personalData: true,
    order: 0,
  },
  {
    id: "91000000-0000-4000-8000-000000000002",
    key: "website",
    label: "Site",
    type: "text",
    required: false,
    maxLength: 200,
    options: [],
    personalData: false,
    order: 1,
  },
  {
    id: "91000000-0000-4000-8000-000000000003",
    key: "aceite",
    label: "Aceite",
    type: "checkbox",
    required: true,
    maxLength: 1,
    options: [],
    personalData: false,
    order: 2,
  },
] as const;

describe("governed public form submission boundary", () => {
  it("projects a deterministic unique field order", () => {
    const result = validatePublicFormDefinition([fields[2], fields[0], fields[1]]);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.fields.map((field) => [field.key, field.order])).toEqual([
      ["email", 0],
      ["website", 1],
      ["aceite", 2],
    ]);
  });

  it("accepts the governed website field independently from the empty honeypot", () => {
    expect(
      validatePublicFormSubmission(fields, {
        email: "pessoa@example.test",
        website: "https://cliente.example",
        aceite: true,
      }),
    ).toEqual({
      ok: true,
      fields: {
        email: "pessoa@example.test",
        website: "https://cliente.example",
        aceite: true,
      },
    });
  });

  it.each([
    ["duplicate keys", [...fields, { ...fields[1], id: "different" }]],
    ["required hidden field", [{ ...fields[0], type: "hidden", required: true }]],
    ["select without options", [{ ...fields[0], type: "select", options: [] }]],
    ["unsupported field", [{ ...fields[0], type: "file" }]],
    ["duplicate order", [{ ...fields[0] }, { ...fields[1], order: 0 }]],
    ["negative order", [{ ...fields[0], order: -1 }]],
    ["non-finite order", [{ ...fields[0], order: Number.POSITIVE_INFINITY }]],
    ["only hidden fields", [{ ...fields[0], type: "hidden", required: false }]],
  ])("rejects a non-operational published definition: %s", (_label, definition) => {
    expect(validatePublicFormDefinition(definition).ok).toBe(false);
    expect(validatePublicFormSubmission(definition, {})).toMatchObject({
      ok: false,
      kind: "configuration",
    });
  });

  it.each([
    ["missing required text", { website: "https://cliente.example", aceite: true }],
    ["required checkbox false", { email: "pessoa@example.test", aceite: false }],
    ["unknown field", { email: "pessoa@example.test", aceite: true, internalId: "opaque" }],
    ["invalid email", { email: "not-an-email", aceite: true }],
    ["array for scalar", { email: ["pessoa@example.test"], aceite: true }],
    ["over limit", { email: `${"a".repeat(250)}@example.test`, aceite: true }],
  ])("rejects an invalid submission without returning a field label: %s", (_label, submission) => {
    const result = validatePublicFormSubmission(fields, submission);
    expect(result).toMatchObject({ ok: false, kind: "submission" });
    expect(JSON.stringify(result)).not.toContain("E-mail");
  });
});
