import { describe, expect, it, vi } from "vitest";
import {
  mediaVariantSlots,
  uploadMediaPackage,
  validateMediaUploadPackage,
  type MediaUploadDescriptor,
  type MediaUploadSlot,
} from "../../src/admin/media-upload-model";

function image(name: string, type: string, content = "safe-image") {
  return new File([content], name, { type });
}

function validPackage(): Record<MediaUploadSlot, File> {
  return {
    original: image("original.png", "image/png"),
    "thumbnail.webp": image("thumbnail.webp", "image/webp"),
    "thumbnail.avif": image("thumbnail.avif", "image/avif"),
    "medium.webp": image("medium.webp", "image/webp"),
    "medium.avif": image("medium.avif", "image/avif"),
    "large.webp": image("large.webp", "image/webp"),
    "large.avif": image("large.avif", "image/avif"),
  };
}

function descriptors(): MediaUploadDescriptor[] {
  return [
    { key: "original", format: "png", signedUrl: "https://upload.test/original" },
    ...mediaVariantSlots.map((slot) => {
      const [key, format] = slot.split(".");
      return {
        key: key as "thumbnail" | "medium" | "large",
        format,
        signedUrl: `https://upload.test/${slot}`,
      };
    }),
  ];
}

describe("media upload package", () => {
  it("requires the original and every governed responsive variant", () => {
    expect(validateMediaUploadPackage({})).toHaveLength(7);
    expect(validateMediaUploadPackage(validPackage())).toEqual([]);
  });

  it("rejects invalid MIME values and an original larger than 20 MB", () => {
    const files = validPackage();
    files["thumbnail.webp"] = image("thumbnail.webp", "image/jpeg");
    Object.defineProperty(files.original, "size", { value: 20 * 1024 * 1024 + 1 });

    expect(validateMediaUploadPackage(files)).toEqual([
      "O original deve ter no máximo 20 MB.",
      "A miniatura em WebP deve estar no formato correto.",
    ]);
  });

  it("uploads all seven files to their signed destinations with the correct MIME", async () => {
    const request = vi.fn(async () => new Response(null, { status: 200 }));

    await uploadMediaPackage(descriptors(), validPackage(), request as typeof fetch);

    expect(request).toHaveBeenCalledTimes(7);
    const calls = request.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });
    expect(calls[1]?.[1]).toMatchObject({
      headers: { "Content-Type": "image/webp" },
    });
  });

  it("stops finalization when any signed upload fails", async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      String(init?.headers && (init.headers as Record<string, string>)["Content-Type"]).includes("avif")
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 200 }),
    );

    await expect(uploadMediaPackage(descriptors(), validPackage(), request as typeof fetch)).rejects.toThrow(
      "Não foi possível enviar a miniatura em AVIF. Tente novamente.",
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("neutraliza falhas técnicas de rede sem expor URL ou detalhe da plataforma", async () => {
    const request = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND private-storage.internal");
    });

    let caught: unknown;
    try {
      await uploadMediaPackage(descriptors(), validPackage(), request as typeof fetch);
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(
      new Error("Não foi possível enviar as imagens. Verifique sua conexão e tente novamente."),
    );
    expect((caught as Error).message).not.toMatch(/ENOTFOUND|private-storage|https?:\/\//);
  });

  it("propaga cancelamento do operador e interrompe a sequência", async () => {
    const controller = new AbortController();
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      controller.abort(new DOMException("Cancelado pelo operador.", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      if ((init?.signal as AbortSignal | undefined)?.aborted) throw (init?.signal as AbortSignal).reason;
      return new Response(null, { status: 200 });
    });

    await expect(
      uploadMediaPackage(descriptors(), validPackage(), request as typeof fetch, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("aplica um timeout independente a cada PUT", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
        }),
    );
    const upload = uploadMediaPackage(descriptors(), validPackage(), request as typeof fetch, {
      timeoutMs: 50,
    });
    const rejected = expect(upload).rejects.toThrow("O envio demorou mais que o esperado");
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    vi.useRealTimers();
  });
});
