import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublishedForm } from "../../src/public/catalog-api";

afterEach(() => vi.unstubAllGlobals());

describe("public governed form binding", () => {
  it("requests the exact approved form definition and version", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    await expect(getPublishedForm("contato-principal", 3)).resolves.toBeNull();

    const requested = new URL(String(request.mock.calls[0][0]));
    expect(requested.searchParams.get("key")).toBe("contato-principal");
    expect(requested.searchParams.get("version")).toBe("3");
    expect(requested.searchParams.has("formId")).toBe(false);
    expect(requested.searchParams.has("versionId")).toBe(false);
  });

  it("fails closed when a 200 response contains an unusable public definition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          key: "contato-principal",
          version: 3,
          title: "Contato",
          purpose: "Atendimento",
          fields: [
            {
              key: "segmento",
              label: "Segmento",
              type: "select",
              required: true,
              options: [],
              order: 0,
            },
          ],
          consent: { required: true, text: "Aceito", version: "v1", privacyPath: "/privacidade" },
          successMessage: "Recebido",
          submitLabel: "Enviar",
        }),
      ),
    );

    await expect(getPublishedForm("contato-principal", 3)).rejects.toThrow(
      "Formulário incompatível com o contrato público vigente.",
    );
  });

  it.each([
    ["outra-chave", 3],
    ["contato-principal", 4],
  ])("rejects a valid form returned for another public binding (%s v%s)", async (key, version) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          key,
          version,
          title: "Contato",
          purpose: "Atendimento",
          fields: [
            {
              key: "email",
              label: "E-mail",
              type: "email",
              required: true,
              options: [],
              order: 0,
            },
          ],
          consent: { required: true, text: "Aceito", version: "v1", privacyPath: "/privacidade" },
          successMessage: "Recebido",
          submitLabel: "Enviar",
        }),
      ),
    );

    await expect(getPublishedForm("contato-principal", 3)).rejects.toThrow(
      "Formulário incompatível com o contrato público vigente.",
    );
  });
});
