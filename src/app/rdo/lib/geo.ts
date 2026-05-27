/** Reverse geocoding via Nominatim (OpenStreetMap) — sem chave, CORS liberado. */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ endereco: string; numero: string }> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR&zoom=18`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Falha no reverse geocoding");
  const j = await res.json();
  const a = j.address ?? {};
  const rua = a.road || a.pedestrian || a.footway || a.cycleway || a.path || "";
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.village || "";
  const cidade = a.city || a.town || a.municipality || a.county || "";
  const uf = a.state_code || a.state || "";
  const cidadeUf = [cidade, uf].filter(Boolean).join("/");
  const endereco = [rua, bairro, cidadeUf].filter(Boolean).join(" - ") || (j.display_name ?? "");
  return { endereco, numero: a.house_number || "" };
}
