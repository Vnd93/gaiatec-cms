export type RdoStatus = "rascunho" | "finalizado" | "arquivado";

export interface Foto {
  id: string;
  relatorio_id: string;
  storage_path: string;
  ordem: number;
  legenda: string | null;
  created_at: string;
  /** URL pública resolvida em runtime (não é coluna do banco). */
  url?: string;
}

export interface Relatorio {
  id: string;
  created_by: string | null;
  cliente: string;
  contrato: string;
  eng_gaiatec: string | null;
  eng_cliente: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  local_endereco: string | null;
  local_lat: number | null;
  local_lng: number | null;
  comentarios: string | null;
  status: RdoStatus;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  fotos?: Foto[];
}

/** Campos editáveis no formulário. */
export type RelatorioInput = Pick<
  Relatorio,
  | "cliente"
  | "contrato"
  | "eng_gaiatec"
  | "eng_cliente"
  | "periodo_inicio"
  | "periodo_fim"
  | "local_endereco"
  | "local_lat"
  | "local_lng"
  | "comentarios"
>;

export const STATUS_LABEL: Record<RdoStatus, string> = {
  rascunho: "Rascunho",
  finalizado: "Finalizado",
  arquivado: "Arquivado",
};
