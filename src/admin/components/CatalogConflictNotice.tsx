import type { CatalogConflictDetail } from "../api/catalog-workspace-api";

export function CatalogConflictNotice({ detail }: { detail: CatalogConflictDetail | null }) {
  if (!detail) return null;
  return (
    <dl aria-label="Origem da alteração concorrente">
      <dt>Autor</dt>
      <dd>{detail.author === "self" ? "Você, em outra edição" : "Outro operador autorizado"}</dd>
      <dt>Horário</dt>
      <dd>
        <time dateTime={detail.changedAt}>{new Date(detail.changedAt).toLocaleString("pt-BR")}</time>
      </dd>
      <dt>Correlação</dt>
      <dd>{detail.correlationId ?? "Indisponível nesta revisão"}</dd>
    </dl>
  );
}
