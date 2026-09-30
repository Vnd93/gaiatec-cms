import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicFormVersion } from "../../src/public/catalog-api";
import { submitGovernedLead } from "../../src/public/lead-api";
import { requiresStagingLeadProof } from "../../src/public/staging-lead-proof";
import { urlSegmentFromText } from "../../src/admin/url-segment";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

describe("real Chrome staging HTTP duplicate proof", () => {
  const runTag = "qa-cms-final-20260930-12345678";
  const path = `/campanhas/qa-lead-${runTag}-abcdef12`;
  // Same title-to-key transformation as the real Chrome bootstrap and form editor.
  const proofForm = {
    ...form,
    key: urlSegmentFromText(`${runTag.toUpperCase()} Formulário operacional abcdef12`, 100),
  };
  const fields = { email: `qa-iab-${runTag}-1-0123456789abcdef@example.invalid` };
  const guard = {
    environment: "staging",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    path,
    campaignPath: path,
    source: "campaign",
    formKey: proofForm.key,
    fields,
  };
  const response = (duplicate: boolean, status = 201, reference = "LD-0123ABCDEF") =>
    new Response(JSON.stringify({ reference, duplicate }), { status });
  const submitProof = () =>
    submitGovernedLead({
      form: proofForm,
      fields,
      source: "campaign",
      campaignPath: path,
      idempotencyKey: "01234567-89ab-4cde-af01-23456789abcd",
      consentAccepted: true,
      captchaToken: "unit-test-token-not-a-real-credential",
    });
  const setup = (environment = "staging") => {
    vi.stubEnv("VITE_CMS_ENVIRONMENT", environment);
    vi.stubGlobal("window", { location: new URL(`${guard.origin}${path}`) });
  };

  it("accepts only the exact staging handoff scope", () => {
    expect(requiresStagingLeadProof(guard)).toBe(true);
    for (const patch of [
      { environment: "production" },
      { environment: undefined },
      { origin: "https://gaiatecsistemas.com.br" },
      { origin: "https://gaiatec-cms-staging.pages.dev" },
      { source: "contact" },
      { campaignPath: "/contato" },
      { formKey: "contato-principal" },
      { formKey: `qa-ops-${runTag}-abcdef12` },
      { formKey: proofForm.key.replace("12345678", "deadbeef") },
      { fields: { email: "qa@example.invalid" } },
      { fields: { email: fields.email, other: fields.email } },
      { fields: { email: fields.email.replace("12345678", "deadbeef") } },
    ])
      expect(requiresStagingLeadProof({ ...guard, ...patch })).toBe(false);
  });

  it("requires first 201/nonduplicate then exactly one 201/duplicate with identical bytes", async () => {
    setup();
    const fetcher = vi.fn().mockResolvedValueOnce(response(false)).mockResolvedValueOnce(response(true));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitProof()).resolves.toEqual({
      reference: "LD-0123ABCDEF",
      duplicate: false,
      stagingHttpIdempotencyVerified: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[0]);
  });

  it.each(["production", "local", ""])(
    "never duplicates a production or unconfigured request (%s)",
    async (environment) => {
      setup(environment);
      const fetcher = vi.fn().mockResolvedValueOnce(response(false));
      vi.stubGlobal("fetch", fetcher);
      await expect(submitProof()).resolves.toEqual({ reference: "LD-0123ABCDEF", duplicate: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([403, 503, 200])("does not retry or mark success after initial HTTP %s", async (status) => {
    setup();
    const fetcher = vi.fn().mockResolvedValueOnce(response(false, status));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitProof()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not accept an already-duplicated first capture", async () => {
    setup();
    const fetcher = vi.fn().mockResolvedValueOnce(response(true));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitProof()).rejects.toThrow("captação sintética inicial");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [false, 201, "LD-0123ABCDEF"],
    [true, 200, "LD-0123ABCDEF"],
    [true, 403, "LD-0123ABCDEF"],
    [true, 503, "LD-0123ABCDEF"],
    [true, 201, "LD-FFFFFFFFFF"],
  ])("fails closed on a non-equivalent second response (%s/%s/%s)", async (duplicate, status, reference) => {
    setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(duplicate as boolean, status as number, reference as string));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitProof()).rejects.toThrow("idempotência sintética");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry the second request after a network failure", async () => {
    setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitProof()).rejects.toThrow("idempotência sintética");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
