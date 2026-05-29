import { supabase } from "@/lib/supabase";
import type { Relatorio } from "./types";
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

/**
 * Ao finalizar: gera o PDF do relatório, monta um resumo e dispara o e-mail
 * (com PDF anexado) para os admins via Edge Function `rdo-notify`.
 * É best-effort — quem chama deve tratar erro sem bloquear a finalização.
 */
export async function notifyRelatorioFinalizado(r: Relatorio): Promise<void> {
  const blob = await generateRelatorioPdf(r);
  const pdfBase64 = await blobToBase64(blob);
  const dataStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `RDO_${slugifyFilename(r.cliente)}_${dataStr}.pdf`;

  const localBase = [r.local_endereco?.trim(), r.local_numero?.trim()].filter(Boolean).join(", ");
  const local =
    localBase || (r.local_lat != null && r.local_lng != null ? `${r.local_lat.toFixed(6)}, ${r.local_lng.toFixed(6)}` : "");

  const { data: au } = await supabase.auth.getUser();

  const resumo = {
    id: r.id,
    contrato: r.contrato || "",
    cliente: r.cliente || "",
    cnpj: r.cnpj || "",
    razaoSocial: r.razao_social || "",
    nomeFantasia: r.nome_fantasia || "",
    engGaiatec: r.eng_gaiatec || "",
    crea: r.crea || "",
    engCliente: r.eng_cliente || "",
    inicio: r.periodo_inicio ? formatDate(r.periodo_inicio) : "",
    fim: r.periodo_fim ? formatDate(r.periodo_fim) : "",
    local,
    fotos: (r.fotos ?? []).length,
    finalizadoPor: au?.user?.email ?? "",
    finalizadoEm: formatDateTime(new Date().toISOString()),
  };

  const { error } = await supabase.functions.invoke("rdo-notify", { body: { resumo, pdfBase64, filename } });
  if (error) throw error;
}
