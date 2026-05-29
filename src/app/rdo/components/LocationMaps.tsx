import { useEffect, useState } from "react";
import { Eye, MapPin } from "lucide-react";
import { forwardGeocode } from "../lib/geo";
import { hasMapsKey, mapEmbedUrl, streetViewEmbedUrl } from "../lib/maps";

/**
 * Mostra o local em 2 formatos (Google Maps Embed API, grátis):
 *  - mapa de satélite com marcador
 *  - Street View
 * Funciona com GPS (lat/lng) ou só com o endereço digitado (geocodifica p/ o Street View).
 */
export function LocationMaps({
  endereco,
  numero,
  lat,
  lng,
}: {
  endereco?: string | null;
  numero?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const enderecoFull = [endereco?.trim(), numero?.trim()].filter(Boolean).join(", ");
  const temCoords = lat != null && lng != null;
  // Mapa: usa o ponto exato do GPS quando há; senão o endereço digitado.
  const mapQuery = temCoords ? `${lat},${lng}` : enderecoFull;

  // Street View precisa de coordenadas: usa GPS, ou geocodifica o endereço.
  const [sv, setSv] = useState<{ lat: number; lng: number } | null>(temCoords ? { lat: lat!, lng: lng! } : null);

  useEffect(() => {
    if (temCoords) {
      setSv({ lat: lat!, lng: lng! });
      return;
    }
    setSv(null);
    if (!enderecoFull || !hasMapsKey()) return;
    let active = true;
    const t = setTimeout(() => {
      forwardGeocode(enderecoFull)
        .then((c) => active && c && setSv(c))
        .catch(() => {});
    }, 700);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [temCoords, lat, lng, enderecoFull]);

  if (!hasMapsKey() || !mapQuery) return null;

  const mapUrl = mapEmbedUrl(mapQuery, { maptype: "satellite", zoom: 18 });
  const svUrl = sv ? streetViewEmbedUrl(sv.lat, sv.lng) : null;
  const frame = "h-48 w-full sm:h-56";

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MapPanel icon={<MapPin size={12} className="text-[var(--rdo-blue)]" />} label="Satélite">
        {mapUrl && <iframe title="Mapa de satélite" src={mapUrl} className={frame} loading="lazy" style={{ border: 0 }} allowFullScreen />}
      </MapPanel>
      <MapPanel icon={<Eye size={12} className="text-[var(--rdo-blue)]" />} label="Street View">
        {svUrl ? (
          <iframe title="Street View" src={svUrl} className={frame} loading="lazy" style={{ border: 0 }} allowFullScreen />
        ) : (
          <div className={`flex items-center justify-center px-3 text-center text-[11px] text-[var(--rdo-ghost)] ${frame}`}>
            Street View indisponível para este local.
          </div>
        )}
      </MapPanel>
    </div>
  );
}

function MapPanel({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)]">
      <figcaption className="flex items-center gap-1.5 border-b border-[var(--rdo-line)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--rdo-ink-3)]">
        {icon} {label}
      </figcaption>
      {children}
    </figure>
  );
}
