import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const Uuid=z.uuid();
const Field=z.object({id:Uuid,key:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),label:z.string().trim().min(1).max(120),type:z.enum(["text","email","tel","textarea","select","checkbox","hidden"]),required:z.boolean(),maxLength:z.number().int().min(1).max(5000).optional(),options:z.array(z.string().trim().min(1).max(120)).max(50),personalData:z.boolean(),order:z.number().int().min(0).max(999)}).strict();
const FormDefinition=z.object({fields:z.array(Field).min(1).max(50),successMessage:z.string().trim().min(1).max(500),submitLabel:z.string().trim().min(1).max(120)}).strict().superRefine((value,context)=>{const keys=new Set<string>();value.fields.forEach((field,index)=>{if(keys.has(field.key))context.addIssue({code:"custom",path:["fields",index,"key"],message:"Chave duplicada."});keys.add(field.key);if(field.type==="select"&&!field.options.length)context.addIssue({code:"custom",path:["fields",index,"options"],message:"Seleção exige opções."});});});
const Command=z.discriminatedUnion("action",[
  z.object({action:z.literal("save_form"),formId:Uuid.nullish(),formKey:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:z.string().trim().min(1).max(180),purpose:z.string().trim().min(3).max(500),definition:FormDefinition,consentText:z.string().trim().min(3).max(2000),consentVersion:z.string().trim().min(1).max(80),privacyPath:z.string().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/).max(300),slaMinutes:z.number().int().min(5).max(525600),retentionDays:z.number().int().min(1).max(3650),reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("publish_form"),formId:Uuid,versionId:Uuid}).strict(),
  z.object({action:z.literal("update_lead"),leadId:Uuid,status:z.enum(["new","assigned","in_service","responded","converted","disqualified","archived"]),assignedTo:Uuid.nullish(),reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("anonymize_lead"),leadId:Uuid,reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("export_leads"),status:z.enum(["new","assigned","in_service","responded","converted","disqualified","archived"]).nullish(),justification:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("retry_delivery"),eventId:Uuid,justification:z.string().trim().min(3).max(500)}).strict(),
]);

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders(req)});
  if(!isAllowedOrigin(req)) return json(req,{error:"Origem não autorizada."},403);
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  const identity=await authenticateCms(req); if(!identity) return json(req,{error:"Sessão inválida."},401);
  const idempotencyKey=req.headers.get("X-Idempotency-Key"); if(!idempotencyKey||!Uuid.safeParse(idempotencyKey).success) return json(req,{error:"Chave idempotente obrigatória."},400);
  let input:z.infer<typeof Command>; try{input=Command.parse(await readJsonLimited(req,262144));}catch{return json(req,{error:"Comando inválido."},400);}
  try{if(!(await consumeRateLimit(identity.admin,req,`cms_leads_${input.action}`,`${identity.user.id}:${clientAddress(req)}`,60,900))) return json(req,{error:"Muitas operações. Aguarde."},429);}catch{return json(req,{error:"Proteção temporariamente indisponível."},503);}
  const correlationId=crypto.randomUUID(); let rpc="",args:Record<string,unknown>={};
  if(input.action==="save_form"){
    rpc="cms_save_form_version";args={p_actor_id:identity.user.id,p_form_id:input.formId??null,p_form_key:input.formKey,p_title:input.title,p_purpose:input.purpose,p_definition:input.definition,p_consent_text:input.consentText,p_consent_version:input.consentVersion,p_privacy_path:input.privacyPath,p_sla_minutes:input.slaMinutes,p_retention_days:input.retentionDays,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId};
  }else if(input.action==="publish_form"){
    rpc="cms_publish_form_version";args={p_actor_id:identity.user.id,p_form_id:input.formId,p_version_id:input.versionId,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId};
  }else if(input.action==="update_lead"){
    rpc="cms_manage_lead";args={p_actor_id:identity.user.id,p_lead_id:input.leadId,p_status:input.status,p_assigned_to:input.assignedTo??null,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId};
  }else if(input.action==="anonymize_lead"){
    rpc="cms_anonymize_lead";args={p_actor_id:identity.user.id,p_lead_id:input.leadId,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId};
  }else if(input.action==="retry_delivery"){
    const environment=Deno.env.get("CMS_ENVIRONMENT")??"production";
    if(environment!=="local"&&environment!=="staging") return json(req,{error:"EV2.11 não está autorizada neste ambiente.",code:"CMS_SYSTEM_PRODUCTION_GATED",correlationId,preserved:true},403);
    rpc="cms_retry_lead_delivery";args={p_actor_id:identity.user.id,p_event_id:input.eventId,p_justification:input.justification,p_environment:environment,p_site_key:"main",p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId,p_idempotency_key:idempotencyKey,p_request_hash:await sha256(JSON.stringify(input))};
  }else{
    rpc="cms_export_leads";args={p_actor_id:identity.user.id,p_status:input.status??null,p_justification:input.justification,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId};
  }
  const {data,error}=await identity.admin.rpc(rpc,args);
  if(error){const marker=error.message.match(/CMS_[A-Z0-9_]+/)?.[0],forbidden=error.message.includes("FORBIDDEN")||error.message.includes("FEATURE_DISABLED")||error.code==="42501",notFound=error.message.includes("NOT_FOUND")||error.code==="PT404",conflict=error.message.includes("CONFLICT")||error.message.includes("NOT_RETRYABLE")||error.code==="PT409",invalid=error.message.includes("INVALID")||error.code==="23514"||error.code==="22023";return json(req,{error:forbidden?"Permissão insuficiente ou recurso não habilitado.":notFound?"Registro não encontrado.":conflict?"A entrega não pode ser reprocessada no estado atual.":invalid?"Dados ou transição inválidos.":"Falha na operação.",code:marker,correlationId,preserved:input.action==="retry_delivery"},forbidden?403:notFound?404:conflict?409:invalid?422:500);}
  return json(req,{...data,correlationId});
});
