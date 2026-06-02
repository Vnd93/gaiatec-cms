import { supabase } from "@/lib/supabase";
import type { Relatorio } from "./types";
import { TERMOS_VERSAO } from "./terms";

const TABLE = "rdo_relatorios";
const TOKEN_TTL_DIAS = 30;
const BUCKET_ASSINADOS = "rdo-assinados";

export interface AssinaturaPayload {
  gaiatecMetodo: "desenho" | "importado";
  gaiatecAssinatura?: string | null; // PNG (data URL) quando desenho
  gaiatecPdf?: File | null; // PDF assinado quando importado
  gaiatecNome: string;
  modo: "presencial" | "remoto";
  clienteAssinatura?: string | null; // presencial
  clienteNome?: string | null; // presencial
  clienteEmail?: string | null; // remoto
}

/** URL pública para o cliente assinar remotamente. */
export function signLinkUrl(token: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://gaiatecsistemas.com.br";
  return `${origin}/relatorio-de-obra/assinar/${token}`;
}

/**
 * Grava as assinaturas (e o aceite de termos) num relatório já finalizado e
 * define o assinatura_status. No modo remoto gera um token de uso único.
 * Retorna o relatório atualizado (com assinatura_token quando remoto).
 */
export async function finalizarComAssinatura(id: string, p: AssinaturaPayload): Promise<Relatorio> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    assinatura_gaiatec_nome: p.gaiatecNome.trim() || null,
    assinatura_gaiatec_em: now,
    assinatura_gaiatec_metodo: p.gaiatecMetodo,
    termos_aceitos: true,
    termos_versao: TERMOS_VERSAO,
    termos_aceito_em: now,
  };

  if (p.gaiatecMetodo === "importado" && p.gaiatecPdf) {
    const path = `assinados/${id}/gaiatec-${crypto.randomUUID()}.pdf`;
    const up = await supabase.storage.from(BUCKET_ASSINADOS).upload(path, p.gaiatecPdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) throw up.error;
    patch.assinatura_gaiatec_pdf_path = path;
    patch.assinatura_gaiatec_arquivo = p.gaiatecPdf.name;
    patch.assinatura_gaiatec = null;
  } else {
    patch.assinatura_gaiatec = p.gaiatecAssinatura ?? null;
    patch.assinatura_gaiatec_pdf_path = null;
    patch.assinatura_gaiatec_arquivo = null;
  }

  if (p.modo === "presencial") {
    patch.assinatura_cliente = p.clienteAssinatura ?? null;
    patch.assinatura_cliente_nome = (p.clienteNome ?? "").trim() || null;
    patch.assinatura_cliente_em = now;
    patch.assinatura_cliente_metodo = "desenho";
    patch.cliente_assina_na_hora = true;
    patch.assinatura_status = "assinado";
    patch.assinatura_token = null;
    patch.assinatura_token_expira = null;
  } else {
    const expira = new Date(Date.now() + TOKEN_TTL_DIAS * 86400_000).toISOString();
    patch.cliente_assina_na_hora = false;
    patch.assinatura_status = "aguardando_cliente";
    patch.assinatura_token = crypto.randomUUID();
    patch.assinatura_token_expira = expira;
    if (p.clienteEmail) patch.email_cliente = p.clienteEmail.trim().toLowerCase();
    // limpa assinatura de cliente anterior (caso reassinatura)
    patch.assinatura_cliente = null;
    patch.assinatura_cliente_nome = null;
    patch.assinatura_cliente_em = null;
  }

  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Relatorio;
}

/** Reabre a assinatura: limpa assinaturas/termos e volta para "não assinado". */
export async function reabrirAssinatura(id: string): Promise<Relatorio> {
  const patch = {
    assinatura_status: "nao_assinado",
    assinatura_gaiatec: null,
    assinatura_gaiatec_nome: null,
    assinatura_gaiatec_em: null,
    assinatura_cliente: null,
    assinatura_cliente_nome: null,
    assinatura_cliente_em: null,
    termos_aceitos: false,
    termos_versao: null,
    termos_aceito_em: null,
    cliente_assina_na_hora: null,
    assinatura_token: null,
    assinatura_token_expira: null,
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Relatorio;
}

/** Equipe anexa manualmente um PDF assinado (caso o cliente devolva por e-mail/WhatsApp). */
export async function anexarPdfAssinadoEquipe(id: string, file: File): Promise<Relatorio> {
  const path = `assinados/${id}/${crypto.randomUUID()}.pdf`;
  const up = await supabase.storage.from(BUCKET_ASSINADOS).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      assinatura_cliente_metodo: "importado",
      assinatura_cliente_pdf_path: path,
      assinatura_cliente_arquivo: file.name,
      assinatura_cliente_em: new Date().toISOString(),
      assinatura_status: "assinado",
      assinatura_token: null,
      assinatura_token_expira: null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Relatorio;
}

/** URL assinada (temporária) para baixar um PDF assinado do bucket privado. */
export async function signedPdfUrl(path: string, expiraSeg = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_ASSINADOS).createSignedUrl(path, expiraSeg);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Garante um token ativo p/ assinatura remota (regenera se faltar). */
export async function garantirToken(r: Relatorio): Promise<string> {
  if (r.assinatura_token) return r.assinatura_token;
  const token = crypto.randomUUID();
  const expira = new Date(Date.now() + TOKEN_TTL_DIAS * 86400_000).toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({ assinatura_token: token, assinatura_token_expira: expira, assinatura_status: "aguardando_cliente" })
    .eq("id", r.id);
  if (error) throw error;
  return token;
}
