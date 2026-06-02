import { supabase } from "@/lib/supabase";
import type { Relatorio } from "./types";
import { ASSINATURA_LABEL } from "./types";
import { generateRelatorioPdf } from "./pdf";
import { formatDate, formatDateTime, slugifyFilename } from "./format";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler o PDF."));
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.readAsDataURL(blob);
  });
}

function montarResumo(r: Relatorio, finalizadoPor: string) {
  const localBase = [r.local_endereco?.trim(), r.local_numero?.trim()].filter(Boolean).join(", ");
  const local =
    localBase || (r.local_lat != null && r.local_lng != null ? `${r.local_lat.toFixed(6)}, ${r.local_lng.toFixed(6)}` : "");
  return {
    id: r.id,
    contrato: r.contrato || "",
    cliente: r.cliente || "",
    cnpj: r.cnpj || "",
    razaoSocial: r.razao_social || "",
    nomeFantasia: r.nome_fantasia || "",
    engGaiatec: r.eng_gaiatec || "",
    crea: r.crea || "",
    engCliente: r.eng_cliente || "",
    creaCliente: r.crea_cliente || "",
    emailCliente: r.email_cliente || "",
    inicio: r.periodo_inicio ? formatDate(r.periodo_inicio) : "",
    fim: r.periodo_fim ? formatDate(r.periodo_fim) : "",
    local,
    fotos: (r.fotos ?? []).length,
    assinatura: ASSINATURA_LABEL[r.assinatura_status] || "",
    finalizadoPor,
    finalizadoEm: formatDateTime(new Date().toISOString()),
  };
}

/**
 * Ao finalizar: gera o PDF, monta o resumo e dispara e-mail aos admins (PDF
 * anexado). Se `signLink` vier (cliente vai assinar remoto), o cliente recebe
 * o link de assinatura; se já estiver 100% assinado, o cliente recebe o PDF.
 * Best-effort — quem chama deve tratar erro sem bloquear a finalização.
 */
export async function notifyRelatorioFinalizado(
  r: Relatorio,
  opts?: { signLink?: string | null; officialPdf?: Blob | null },
): Promise<void> {
  // Se a Gaiatec assinou por fora, o PDF oficial é o arquivo enviado (não o gerado).
  const blob = opts?.officialPdf ?? (await generateRelatorioPdf(r));
  const pdfBase64 = await blobToBase64(blob);
  const dataStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `RDO_${slugifyFilename(r.cliente)}_${dataStr}.pdf`;

  const { data: au } = await supabase.auth.getUser();
  const resumo = montarResumo(r, au?.user?.email ?? "");

  const { error } = await supabase.functions.invoke("rdo-notify", {
    body: {
      resumo,
      pdfBase64,
      filename,
      clienteEmail: r.email_cliente ?? null,
      signLink: opts?.signLink ?? null,
    },
  });
  if (error) throw error;
}

/** Reenvia apenas ao cliente o link de assinatura remota (sem PDF, sem admins). */
export async function enviarLinkAssinaturaCliente(r: Relatorio, signLink: string): Promise<void> {
  const { data: au } = await supabase.auth.getUser();
  const resumo = montarResumo(r, au?.user?.email ?? "");
  const { error } = await supabase.functions.invoke("rdo-notify", {
    body: { resumo, clienteEmail: r.email_cliente ?? null, signLink, apenasCliente: true },
  });
  if (error) throw error;
}
