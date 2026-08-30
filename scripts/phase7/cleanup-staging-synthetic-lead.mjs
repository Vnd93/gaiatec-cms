import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.GAIATEC_SUPABASE_URL;
const serviceKey = process.env.GAIATEC_SUPABASE_SERVICE_ROLE_KEY;
const reference = process.env.GAIATEC_SYNTHETIC_LEAD_REFERENCE;
const stagingProject = "glcqsosxwgmlhzgcsnzv";

if (!supabaseUrl || !serviceKey || !reference)
  throw new Error("URL, chave segura e referência sintética são obrigatórias.");
if (new URL(supabaseUrl).hostname !== `${stagingProject}.supabase.co`)
  throw new Error("Este utilitário aceita somente o projeto Supabase de staging.");
if (!/^LD-[A-F0-9]{10}$/.test(reference)) throw new Error("Referência de lead inválida.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const found = await admin
  .from("cms_leads")
  .select("id,status,origin_source,payload,anonymized_at")
  .eq("reference_code", reference)
  .single();
if (found.error || !found.data) throw found.error ?? new Error("Lead não encontrado.");
if (found.data.anonymized_at) {
  process.stdout.write(`${JSON.stringify({ reference, status: "already_anonymized" }, null, 2)}\n`);
  process.exit(0);
}
if (
  found.data.origin_source !== "contact" ||
  typeof found.data.payload?.email !== "string" ||
  !found.data.payload.email.endsWith("@example.com")
)
  throw new Error("A referência não pertence a uma fixture sintética autorizada.");

const now = new Date().toISOString();
const correlationId = crypto.randomUUID();
const updated = await admin
  .from("cms_leads")
  .update({
    payload: {},
    utm: {},
    assigned_to: null,
    status: "anonymized",
    anonymized_at: now,
    last_activity_at: now,
  })
  .eq("id", found.data.id)
  .eq("reference_code", reference)
  .is("anonymized_at", null);
if (updated.error) throw updated.error;
const history = await admin.from("cms_lead_status_history").insert({
  lead_id: found.data.id,
  from_status: found.data.status,
  to_status: "anonymized",
  reason: "Limpeza de fixture sintética executada após validação pública",
});
if (history.error) throw history.error;
const event = await admin.from("cms_operational_events").insert({
  severity: "info",
  event_type: "cms.leads.synthetic_cleanup",
  correlation_id: correlationId,
  error_code: "fixture_anonymized",
});
if (event.error) throw event.error;

process.stdout.write(
  `${JSON.stringify({ reference, status: "anonymized", correlationId, productionTouched: false }, null, 2)}\n`,
);
