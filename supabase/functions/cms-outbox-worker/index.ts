import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const expected = Deno.env.get("OUTBOX_WORKER_SECRET"), supplied = req.headers.get("X-Worker-Secret");
  if (!expected || !supplied || supplied !== expected) return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401 });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405 });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "Serviço indisponível." }), { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } }), correlationId = crypto.randomUUID();
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
  return new Response(JSON.stringify({ scheduled, claimed: claimed.data?.length ?? 0, completed, failed, correlationId }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
