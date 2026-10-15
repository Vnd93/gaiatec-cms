// UI text is an assertion boundary, not the backend workflow wire value.
// Keep each surface exact: feminine campaign labels and spaced discovery codes
// are distinct contracts. Unknown/dirty/combined text must never authorize cleanup.
const commonLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  archived: "Arquivado",
  trashed: "Na lixeira",
};
const productLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado",
};
const campaignLabels: Record<string, string> = {
  new: "Nova campanha",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
  trashed: "Na lixeira",
};
const discoveryKinds = new Set(["service", "industry", "application", "solution"]);

function labelsFor(kind: string): Record<string, string> {
  if (kind === "post" || discoveryKinds.has(kind)) return commonLabels;
  if (kind === "product") return productLabels;
  if (kind === "campaign") return campaignLabels;
  throw new Error("QA_CMS_EDITORIAL_SURFACE_INVALID");
}

export function editorialVisibleStateText(kind: string, state: string): string {
  const labels = labelsFor(kind);
  if (!Object.hasOwn(labels, state)) throw new Error("QA_CMS_EDITORIAL_STATE_INVALID");
  if (discoveryKinds.has(kind)) return state.replaceAll("_", " ");
  return kind === "campaign" ? `Rascunho salvo · ${labels[state]}` : labels[state];
}

export function editorialStateFromVisibleText(kind: string, text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const matching = Object.keys(labelsFor(kind)).filter(
    (state) => editorialVisibleStateText(kind, state) === normalized,
  );
  if (matching.length !== 1) throw new Error("QA_CMS_EDITORIAL_VISIBLE_STATE_INVALID");
  return matching[0];
}
