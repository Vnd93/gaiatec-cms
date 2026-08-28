import { supabase } from "@/lib/supabase";
import type { Relatorio } from "./types";

async function notify(report: Relatorio, action: "finalized" | "resend_signature") {
  const { data, error } = await supabase.functions.invoke("rdo-notify", {
    body: { reportId: report.id, action, idempotencyKey: crypto.randomUUID() },
  });
  if (error) throw error;
  return data as { ok: boolean; signLink?: string | null };
}

/** O servidor reconstrói resumo, destinatários e link a partir do reportId canônico. */
export async function notifyRelatorioFinalizado(report: Relatorio): Promise<void> {
  await notify(report, "finalized");
}

export async function enviarLinkAssinaturaCliente(report: Relatorio): Promise<string | null> {
  const data = await notify(report, "resend_signature");
  return data.signLink ?? null;
}
