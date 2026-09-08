import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicFormVersion } from "../../src/public/catalog-api";
import { submitGovernedLead } from "../../src/public/lead-api";

const form: PublicFormVersion = {
  key: "contato-principal",
  version: 2,
  title: "Contato",
  purpose: "Atendimento comercial",
  fields: [],
  consent: {
    required: true,
    text: "Autorizo o contato conforme a política de privacidade.",
    version: "2026-v1",
    privacyPath: "/politica-de-privacidade",
  },
  successMessage: "Recebido.",
  submitLabel: "Enviar",
};

const submit = () =>
  submitGovernedLead({
    form,
    fields: { email: "pessoa@example.test" },
    idempotencyKey: "01234567-89ab-4cde-af01-23456789abcd",
    source: "contato",
    consentAccepted: true,
  });

afterEach(() => vi.unstubAllGlobals());

describe("public lead API response boundary", () => {
  it("accepts only the exact public confirmation contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reference: "LD-0123ABCDEF", duplicate: false }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(submit()).resolves.toEqual({ reference: "LD-0123ABCDEF", duplicate: false });
  });

  it.each([
    ["invalid reference", { reference: "LD-91000000-0000-4000-8000-000000000001", duplicate: false }],
    ["missing duplicate flag", { reference: "LD-0123ABCDEF" }],
    ["unexpected internal field", { reference: "LD-0123ABCDEF", duplicate: false, correlationId: "opaque" }],
  ])("fails closed over a successful but invalid response: %s", async (_label, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(submit()).rejects.toThrow("Não foi possível confirmar o envio");
  });

  it("does not surface an internal identifier received in an error payload", async () => {
    const internal = "91000000-0000-4000-8000-000000000001";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: `Falha ${internal}`, correlationId: internal }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error = await submit().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Não foi possível enviar. Tente novamente.");
    expect((error as Error).message).not.toContain(internal);
  });
});
