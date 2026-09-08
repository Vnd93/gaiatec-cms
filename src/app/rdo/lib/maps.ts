/** Google Maps Embed API (grátis, iframe). A chave é pública por natureza —
 *  deve ser RESTRITA por referrer (gaiatecsistemas.com.br/*) no console do Google. */

export const GOOGLE_MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim() ?? "";

export const hasMapsKey = (): boolean => Boolean(GOOGLE_MAPS_KEY);

const EMBED = "https://www.google.com/maps/embed/v1";

/** Mapa (com marcador) via modo `place`. `query` pode ser endereço ou "lat,lng". */
export function mapEmbedUrl(
  query: string,
  opts?: { maptype?: "roadmap" | "satellite"; zoom?: number },
): string | null {
  if (!GOOGLE_MAPS_KEY || !query.trim()) return null;
  const p = new URLSearchParams({
    key: GOOGLE_MAPS_KEY,
    q: query.trim(),
    maptype: opts?.maptype ?? "satellite",
    zoom: String(opts?.zoom ?? 18),
  });
  return `${EMBED}/place?${p.toString()}`;
}

/** Street View via modo `streetview`. Requer coordenadas. */
export function streetViewEmbedUrl(lat: number, lng: number): string | null {
  if (!GOOGLE_MAPS_KEY) return null;
  const p = new URLSearchParams({
    key: GOOGLE_MAPS_KEY,
    location: `${lat},${lng}`,
    fov: "90",
  });
  return `${EMBED}/streetview?${p.toString()}`;
}
