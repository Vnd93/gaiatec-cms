export function campaignWindowLabel(window?: { startsAt?: string; endsAt?: string }) {
  if (!window?.startsAt) return "—";
  const startsAt = new Date(window.startsAt);
  const endsAt = window.endsAt ? new Date(window.endsAt) : null;
  if (Number.isNaN(startsAt.getTime())) return "—";
  const startLabel = startsAt.toLocaleDateString("pt-BR");
  if (!endsAt || Number.isNaN(endsAt.getTime())) return `A partir de ${startLabel}`;
  return `${startLabel} – ${endsAt.toLocaleDateString("pt-BR")}`;
}
