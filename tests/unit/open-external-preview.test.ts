import { describe, expect, it, vi } from "vitest";
import { openExternalAfterAsync } from "@/admin/open-external-preview";

function previewWindow() {
  return {
    opener: {} as Window,
    document: { title: "", body: { textContent: "" } },
    location: { replace: vi.fn() },
    close: vi.fn(),
  };
}

describe("preview externo assíncrono", () => {
  it("abre a aba durante o clique, remove o opener e a redireciona após obter o token", async () => {
    let release!: (value: string) => void;
    const url = new Promise<string>((resolve) => {
      release = resolve;
    });
    const target = previewWindow();
    const openWindow = vi.fn(() => target as unknown as Window);

    const pending = openExternalAfterAsync(() => url, openWindow);
    expect(openWindow).toHaveBeenCalledOnce();
    expect(target.opener).toBeNull();
    expect(target.document.body.textContent).toContain("Aguarde");

    release("/preview/token-seguro");
    await expect(pending).resolves.toEqual({ status: "opened", url: "/preview/token-seguro" });
    expect(target.location.replace).toHaveBeenCalledWith("/preview/token-seguro");
  });

  it("devolve uma URL explícita quando o navegador bloqueia a nova aba", async () => {
    await expect(
      openExternalAfterAsync(
        async () => "/preview/fallback",
        () => null,
      ),
    ).resolves.toEqual({
      status: "blocked",
      url: "/preview/fallback",
    });
  });

  it("mantém o editor na aba atual e apresenta falha útil na aba reservada", async () => {
    const target = previewWindow();
    const result = await openExternalAfterAsync(
      async () => {
        throw new Error("Token expirado");
      },
      () => target as unknown as Window,
    );
    expect(result).toMatchObject({ status: "failed", error: new Error("Token expirado") });
    expect(target.document.title).toBe("Visualização indisponível");
    expect(target.document.body.textContent).toContain("Token expirado");
    expect(target.location.replace).not.toHaveBeenCalled();
  });
});
