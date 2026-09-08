export function governedSignedMediaIdentity(sourceValue: unknown, serviceValue: unknown): string | null {
  if (typeof sourceValue !== "string" || typeof serviceValue !== "string") return null;
  try {
    const source = new URL(sourceValue);
    const service = new URL(serviceValue);
    if (
      source.protocol !== "https:" ||
      service.protocol !== "https:" ||
      source.origin !== service.origin ||
      source.username ||
      source.password ||
      source.hash ||
      !/^\/storage\/v1\/object\/sign\/cms-media-private\/[A-Za-z0-9%/._-]+$/.test(source.pathname) ||
      source.searchParams.getAll("token").length !== 1 ||
      !source.searchParams.get("token") ||
      [...source.searchParams.keys()].some((key) => key !== "token")
    )
      return null;
    return `${source.origin}${source.pathname}`;
  } catch {
    return null;
  }
}
