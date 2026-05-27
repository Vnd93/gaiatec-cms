import type { Relatorio } from "./types";

/** Busca textual por cliente, contrato ou nomes de engenheiros. */
export function filtrarTexto(items: Relatorio[], q: string): Relatorio[] {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((r) =>
    [r.cliente, r.contrato, r.eng_gaiatec, r.eng_cliente]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(t)),
  );
}
