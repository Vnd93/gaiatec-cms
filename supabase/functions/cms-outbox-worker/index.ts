import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EmailProviderError, leadNotificationEmail, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const expected = Deno.env.get("OUTBOX_WORKER_SECRET"), supplied = req.headers.get("X-Worker-Secret");
  if (!expected || !supplied || supplied !== expected) return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401 });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405 });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "Serviço indisponível." }), { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } }), correlationId = crypto.randomUUID();
  const expiredCampaigns = await admin.rpc("cms_expire_campaigns", { p_limit: 50, p_correlation_id: correlationId });
  const retainedLeads = await admin.rpc("cms_apply_lead_retention", { p_limit: 100, p_correlation_id: correlationId });
  const breachedSlas = await admin.rpc("cms_enqueue_lead_sla_breaches", { p_limit: 100, p_correlation_id: correlationId });
  if (expiredCampaigns.error || retainedLeads.error || breachedSlas.error)
    return new Response(JSON.stringify({ error: "Falha nas rotinas da Fase 7.", correlationId }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const due = await admin.from("cms_content_items").select("id").eq("workflow_status", "scheduled").lte("scheduled_for", new Date().toISOString()).limit(20);
  let scheduled = 0;
  for (const item of due.data ?? []) { const result = await admin.rpc("cms_publish_due_schedule", { p_item_id: item.id, p_correlation_id: crypto.randomUUID() }); if (!result.error) scheduled += 1; }
  const claimed = await admin.rpc("cms_claim_outbox", { p_limit: 20, p_worker_id: correlationId });
  if (claimed.error) return new Response(JSON.stringify({ error: "Falha ao reservar eventos.", correlationId }), { status: 503 });
  let completed = 0, failed = 0;
  for (const event of claimed.data ?? []) {
    const simulate = req.headers.get("X-Simulate-Failure") === "true";
    const success = !simulate;
    const finish = await admin.rpc("cms_finish_outbox", { p_id: event.id, p_success: success,
      p_error_code: success ? null : "simulated_cache_failure", p_correlation_id: event.correlation_id });
    if (!finish.error && success) completed += 1; else failed += 1;
  }
  const leadClaimed = await admin.rpc("cms_claim_lead_outbox", { p_limit: 20 });
  if (leadClaimed.error)
    return new Response(JSON.stringify({ error: "Falha na fila de leads.", correlationId }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  let leadCompleted = 0, leadFailed = 0, leadSkipped = 0;
  const resendKey = Deno.env.get("RESEND_API_KEY"), recipient = Deno.env.get("LEAD_NOTIFICATION_TO"), adminBaseUrl = Deno.env.get("CMS_ADMIN_URL");
  for (const event of leadClaimed.data ?? []) {
    let success = false, errorCode: string | null = null;
    try {
      const { data: lead, error: leadError } = await admin.from("cms_leads").select("reference_code,anonymized_at").eq("id", event.lead_id).single();
      if (leadError || !lead) throw new Error("lead_not_found");
      if (lead.anonymized_at) {
        leadSkipped += 1;
      } else {
        if (!resendKey || !recipient || !adminBaseUrl) throw new Error("lead_notification_not_configured");
        await sendEmail(resendKey, recipient.split(",").map((value) => value.trim()).filter(Boolean), leadNotificationEmail(lead.reference_code, event.event_type, adminBaseUrl));
      }
      success = true;
    } catch (caught) {
      errorCode = caught instanceof Error && caught.message === "lead_not_found"
        ? "lead_not_found"
        : caught instanceof EmailProviderError
        ? `lead_notification_${caught.reason}`
        : "lead_notification_failed";
    }
    const finish = await admin.rpc("cms_finish_lead_outbox", { p_id: event.id, p_success: success, p_error_code: errorCode });
    if (!finish.error && success) leadCompleted += 1; else leadFailed += 1;
  }
  return new Response(JSON.stringify({ scheduled, expiredCampaigns: expiredCampaigns.data ?? 0, retainedLeads: retainedLeads.data ?? 0, breachedSlas: breachedSlas.data ?? 0, claimed: claimed.data?.length ?? 0, completed, failed, leadClaimed: leadClaimed.data?.length ?? 0, leadCompleted, leadFailed, leadSkipped, correlationId }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
