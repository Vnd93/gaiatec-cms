export type MediaUploadSlot =
  | "original"
  | "thumbnail.webp"
  | "thumbnail.avif"
  | "medium.webp"
  | "medium.avif"
  | "large.webp"
  | "large.avif";

export type MediaUploadDescriptor = {
  key: "original" | "thumbnail" | "medium" | "large";
  format: string;
  signedUrl: string;
};

export const mediaVariantSlots = [
  "thumbnail.webp",
  "thumbnail.avif",
  "medium.webp",
  "medium.avif",
  "large.webp",
  "large.avif",
] as const satisfies readonly MediaUploadSlot[];

const mediaUploadSlotLabels: Record<MediaUploadSlot, string> = {
  original: "imagem original",
  "thumbnail.webp": "miniatura em WebP",
  "thumbnail.avif": "miniatura em AVIF",
  "medium.webp": "imagem média em WebP",
  "medium.avif": "imagem média em AVIF",
  "large.webp": "imagem grande em WebP",
  "large.avif": "imagem grande em AVIF",
};

export type MediaUploadOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function mediaUploadSlotLabel(slot: MediaUploadSlot): string {
  return mediaUploadSlotLabels[slot];
}

export function mediaUploadSlot(descriptor: Pick<MediaUploadDescriptor, "key" | "format">): MediaUploadSlot {
  return descriptor.key === "original"
    ? "original"
    : (`${descriptor.key}.${descriptor.format}` as MediaUploadSlot);
}

export function validateOriginalMediaFile(original?: File): string[] {
  const issues: string[] = [];
  const allowedOriginal = ["image/png", "image/jpeg", "image/webp", "image/avif"];
  if (!original) issues.push("Selecione a imagem original.");
  else {
    if (!allowedOriginal.includes(original.type)) issues.push("O original deve ser PNG, JPEG, WebP ou AVIF.");
    if (original.size > 20 * 1024 * 1024) issues.push("O original deve ter no máximo 20 MB.");
  }
  return issues;
}

export function validateMediaUploadPackage(files: Partial<Record<MediaUploadSlot, File>>): string[] {
  const issues = validateOriginalMediaFile(files.original);
  for (const slot of mediaVariantSlots) {
    const file = files[slot];
    const expectedType = slot.endsWith(".webp") ? "image/webp" : "image/avif";
    if (!file) issues.push(`Selecione a ${mediaUploadSlotLabels[slot]}.`);
    else if (file.type !== expectedType)
      issues.push(`A ${mediaUploadSlotLabels[slot]} deve estar no formato correto.`);
  }
  return issues;
}

export async function uploadMediaPackage(
  descriptors: MediaUploadDescriptor[],
  files: Partial<Record<MediaUploadSlot, File>>,
  request: typeof fetch = fetch,
  options: MediaUploadOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new Error("Tempo limite de upload inválido.");

  const throwIfCancelled = () => {
    if (!options.signal?.aborted) return;
    const reason = options.signal.reason;
    if (reason instanceof Error && reason.name === "AbortError") throw reason;
    throw new DOMException("O envio foi cancelado.", "AbortError");
  };

  for (const descriptor of descriptors) {
    throwIfCancelled();
    const slot = mediaUploadSlot(descriptor);
    const file = files[slot];
    if (!file) throw new Error(`Selecione a ${mediaUploadSlotLabels[slot]} antes de continuar.`);
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Tempo limite do upload excedido.", "TimeoutError"));
    }, timeoutMs);
    let response: Response;
    try {
      response = await request(descriptor.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: controller.signal,
      });
    } catch (error) {
      throwIfCancelled();
      if (timedOut)
        throw new Error("O envio demorou mais que o esperado. Verifique sua conexão e tente novamente.", {
          cause: error,
        });
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name?: unknown }).name === "AbortError"
      )
        throw error;
      throw new Error("Não foi possível enviar as imagens. Verifique sua conexão e tente novamente.", {
        cause: error,
      });
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
    }
    if (!response.ok)
      throw new Error(`Não foi possível enviar a ${mediaUploadSlotLabels[slot]}. Tente novamente.`);
  }
}
