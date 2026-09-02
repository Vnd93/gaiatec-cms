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

export function mediaUploadSlot(descriptor: Pick<MediaUploadDescriptor, "key" | "format">): MediaUploadSlot {
  return descriptor.key === "original"
    ? "original"
    : (`${descriptor.key}.${descriptor.format}` as MediaUploadSlot);
}

export function validateMediaUploadPackage(files: Partial<Record<MediaUploadSlot, File>>): string[] {
  const issues: string[] = [];
  const original = files.original;
  const allowedOriginal = ["image/png", "image/jpeg", "image/webp", "image/avif"];
  if (!original) issues.push("Selecione a imagem original.");
  else {
    if (!allowedOriginal.includes(original.type)) issues.push("O original deve ser PNG, JPEG, WebP ou AVIF.");
    if (original.size > 20 * 1024 * 1024) issues.push("O original deve ter no máximo 20 MB.");
  }
  for (const slot of mediaVariantSlots) {
    const file = files[slot];
    const expectedType = slot.endsWith(".webp") ? "image/webp" : "image/avif";
    if (!file) issues.push(`Selecione a variante ${slot}.`);
    else if (file.type !== expectedType) issues.push(`A variante ${slot} deve usar MIME ${expectedType}.`);
  }
  return issues;
}

export async function uploadMediaPackage(
  descriptors: MediaUploadDescriptor[],
  files: Partial<Record<MediaUploadSlot, File>>,
  request: typeof fetch = fetch,
) {
  for (const descriptor of descriptors) {
    const slot = mediaUploadSlot(descriptor);
    const file = files[slot];
    if (!file) throw new Error(`Arquivo ausente para ${slot}.`);
    const response = await request(descriptor.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error(`Falha ao enviar ${slot}.`);
  }
}
