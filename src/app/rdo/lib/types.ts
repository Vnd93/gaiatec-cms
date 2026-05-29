export type RdoStatus = "rascunho" | "finalizado" | "arquivado";

export type AssinaturaStatus = "nao_assinado" | "aguardando_cliente" | "assinado_gaiatec" | "assinado";

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
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  endereco_cliente: string | null;
  eng_gaiatec: string | null;
  crea: string | null;
  eng_cliente: string | null;
  crea_cliente: string | null;
  email_cliente: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  local_endereco: string | null;
  local_numero: string | null;
  local_lat: number | null;
  local_lng: number | null;
  comentarios: string | null;
  status: RdoStatus;
  // Assinatura eletrônica
  assinatura_status: AssinaturaStatus;
  assinatura_gaiatec: string | null;
  assinatura_gaiatec_nome: string | null;
  assinatura_gaiatec_em: string | null;
  assinatura_cliente: string | null;
  assinatura_cliente_nome: string | null;
  assinatura_cliente_em: string | null;
  termos_aceitos: boolean;
  termos_versao: string | null;
  termos_aceito_em: string | null;
  cliente_assina_na_hora: boolean | null;
  assinatura_token: string | null;
  assinatura_token_expira: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  fotos?: Foto[];
}

/** Campos editáveis no formulário (contrato é gerado automaticamente no banco). */
export type RelatorioInput = Pick<
  Relatorio,
  | "cliente"
  | "cnpj"
  | "razao_social"
  | "nome_fantasia"
  | "endereco_cliente"
  | "eng_gaiatec"
  | "crea"
  | "eng_cliente"
  | "crea_cliente"
  | "email_cliente"
  | "periodo_inicio"
  | "periodo_fim"
  | "local_endereco"
  | "local_numero"
  | "local_lat"
  | "local_lng"
  | "comentarios"
>;

export const STATUS_LABEL: Record<RdoStatus, string> = {
  rascunho: "Rascunho",
  finalizado: "Finalizado",
  arquivado: "Arquivado",
};

export const ASSINATURA_LABEL: Record<AssinaturaStatus, string> = {
  nao_assinado: "Não assinado",
  aguardando_cliente: "Aguardando cliente",
  assinado_gaiatec: "Assinado (Gaiatec)",
  assinado: "Assinado",
};
