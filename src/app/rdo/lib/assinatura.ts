import { supabase } from "@/lib/supabase";
import type { Relatorio } from "./types";

const BUCKET_ASSINADOS = "rdo-assinados";

export interface AssinaturaPayload {
  gaiatecMetodo: "desenho" | "importado";
  gaiatecAssinatura?: string | null;
  gaiatecPdf?: File | null;
  gaiatecNome: string;
  modo: "presencial" | "remoto";
  clienteAssinatura?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function signLinkUrl(token: string): string {
  if (/^https?:\/\//.test(token)) return token;
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://gaiatecsistemas.com.br";
  return `${origin}/relatorio-de-obra/assinar/${token}`;
}

/** Finalização é um comando server-side idempotente; o browser não atualiza assinaturas/status diretamente. */
export async function finalizarComAssinatura(id: string, payload: AssinaturaPayload): Promise<Relatorio> {
  const gaiatecPdfBase64 = payload.gaiatecMetodo === "importado" && payload.gaiatecPdf ? await fileToDataUrl(payload.gaiatecPdf) : null;
  const { data, error } = await supabase.functions.invoke("rdo-command", {
    body: {
      action: "finalize",
      reportId: id,
      idempotencyKey: crypto.randomUUID(),
      signature: {
        gaiatecMethod: payload.gaiatecMetodo,
        gaiatecName: payload.gaiatecNome,
        gaiatecSignature: payload.gaiatecAssinatura ?? null,
        gaiatecPdfBase64,
        gaiatecPdfName: payload.gaiatecPdf?.name ?? null,
        mode: payload.modo,
        customerSignature: payload.clienteAssinatura ?? null,
        customerName: payload.clienteNome ?? null,
        customerEmail: payload.clienteEmail ?? null,
      },
    },
  });
  if (error || !data?.report) throw error ?? new Error("Não foi possível finalizar.");
  return data.report as Relatorio;
}

/** URL assinada curta para PDF privado, após autorização RLS. */
export async function signedPdfUrl(path: string, expiresSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_ASSINADOS).createSignedUrl(path, expiresSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Gera/rotaciona um link remoto no servidor; token nunca é persistido em claro. */
export async function garantirToken(report: Relatorio): Promise<string> {
  const { data, error } = await supabase.functions.invoke("rdo-notify", {
    body: { reportId: report.id, action: "signature_link", idempotencyKey: crypto.randomUUID() },
  });
  if (error || !data?.signLink) throw error ?? new Error("Não foi possível gerar o link.");
  return data.signLink as string;
}
