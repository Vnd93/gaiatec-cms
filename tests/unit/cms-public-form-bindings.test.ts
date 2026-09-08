import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_FORM_BINDING_CONCURRENCY,
  PUBLIC_FORM_BINDING_LIMIT,
  governedPublicFormBindings,
  resolveGovernedPublicFormBindings,
} from "../../supabase/functions/_shared/cms-public-form-bindings";

const formId = (index: number) => `86000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const versionId = (index: number) => `87000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const formBlock = (index: number) => ({
  type: "form",
  data: { formId: formId(index), formVersionId: versionId(index) },
});

describe("public governed form binding budget", () => {
  it("deduplicates exact bindings before loading them", async () => {
    const load = vi.fn(
      async ({ formId: id, versionId: revision }: { formId: string; versionId: string }) => ({
        data: { key: "contato", version: 1, formId: id, versionId: revision },
        error: null,
      }),
    );

    const result = await resolveGovernedPublicFormBindings(
      { blocks: [formBlock(1), formBlock(1)] },
      new Map(),
      load,
    );

    expect(result.error).toBeNull();
    expect(result.data.size).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fails closed before loading when distinct bindings exceed the response budget", async () => {
    const payload = {
      blocks: Array.from({ length: PUBLIC_FORM_BINDING_LIMIT + 1 }, (_, index) => formBlock(index + 1)),
    };
    const load = vi.fn(async () => ({ data: null, error: null }));

    expect(() => governedPublicFormBindings(payload)).toThrow("CMS_PUBLIC_FORM_BINDING_LIMIT_EXCEEDED");
    const result = await resolveGovernedPublicFormBindings(payload, new Map(), load);
    expect(result.error).toBeInstanceOf(Error);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads the maximum distinct set with bounded parallelism", async () => {
    let active = 0;
    let maximumActive = 0;
    const load = vi.fn(async ({ formId: id, versionId: revision }: { formId: string; versionId: string }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        data: { key: `form-${id.slice(-2)}`, version: 1, formId: id, versionId: revision },
        error: null,
      };
    });

    const result = await resolveGovernedPublicFormBindings(
      { blocks: Array.from({ length: PUBLIC_FORM_BINDING_LIMIT }, (_, index) => formBlock(index + 1)) },
      new Map(),
      load,
    );

    expect(result.error).toBeNull();
    expect(result.data.size).toBe(PUBLIC_FORM_BINDING_LIMIT);
    expect(load).toHaveBeenCalledTimes(PUBLIC_FORM_BINDING_LIMIT);
    expect(maximumActive).toBe(PUBLIC_FORM_BINDING_CONCURRENCY);
  });
});
