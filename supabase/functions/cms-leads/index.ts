import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, rateLimitKeyHash, readJsonLimited, sha256 } from "../_shared/security.ts";

const Uuid=z.uuid();
const Field=z.object({id:Uuid,key:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),label:z.string().trim().min(1).max(120),type:z.enum(["text","email","tel","textarea","select","checkbox","hidden"]),required:z.boolean(),maxLength:z.number().int().min(1).max(5000).optional(),options:z.array(z.string().trim().min(1).max(120)).max(50),personalData:z.boolean(),order:z.number().int().min(0).max(999)}).strict();
const FormDefinition=z.object({fields:z.array(Field).min(1).max(50),successMessage:z.string().trim().min(1).max(500),submitLabel:z.string().trim().min(1).max(120)}).strict().superRefine((value,context)=>{const keys=new Set<string>();value.fields.forEach((field,index)=>{if(keys.has(field.key))context.addIssue({code:"custom",path:["fields",index,"key"],message:"Chave duplicada."});keys.add(field.key);if(field.type==="select"&&!field.options.length)context.addIssue({code:"custom",path:["fields",index,"options"],message:"Seleção exige opções."});});});
const Command=z.discriminatedUnion("action",[
  z.object({action:z.literal("list_forms"),limit:z.number().int().min(1).max(500).default(500)}).strict(),
  z.object({action:z.literal("list_leads"),status:z.enum(["new","assigned","in_service","responded","converted","disqualified","archived","anonymized"]).nullish(),limit:z.number().int().min(1).max(100),offset:z.number().int().min(0).max(1000000)}).strict(),
  z.object({action:z.literal("save_form"),formId:Uuid.nullish(),expectedLockVersion:z.number().int().positive().nullish(),formKey:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:z.string().trim().min(1).max(180),purpose:z.string().trim().min(3).max(500),definition:FormDefinition,consentText:z.string().trim().min(3).max(2000),consentVersion:z.string().trim().min(1).max(80),privacyPath:z.string().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/).max(300),slaMinutes:z.number().int().min(5).max(525600),retentionDays:z.number().int().min(1).max(3650),reason:z.string().trim().min(3).max(500)}).strict().superRefine((value,context)=>{if(Boolean(value.formId)!==Boolean(value.expectedLockVersion))context.addIssue({code:"custom",path:["expectedLockVersion"],message:"Versão de lock incompatível."});}),
  z.object({action:z.literal("publish_form"),formId:Uuid,versionId:Uuid,expectedLockVersion:z.number().int().positive()}).strict(),
  z.object({action:z.literal("archive_form"),formId:Uuid,expectedLockVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("restore_form"),formId:Uuid,sourceVersionId:Uuid,expectedLockVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("update_lead"),leadId:Uuid,status:z.enum(["new","assigned","in_service","responded","converted","disqualified","archived"]),assignedTo:Uuid.nullish(),reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("anonymize_lead"),leadId:Uuid,reason:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("export_leads"),status:z.enum(["new","assigned","in_service","responded","converted","disqualified","archived"]).nullish(),justification:z.string().trim().min(3).max(500)}).strict(),
  z.object({action:z.literal("retry_delivery"),eventId:Uuid,justification:z.string().trim().min(3).max(500)}).strict(),
]);

const handleRequest = async(req: Request) => {
  const requestStartedAt=performance.now();
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders(req)});
  if(!isAllowedOrigin(req)) return json(req,{error:"Origem não autorizada."},403);
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  const identity=await authenticateCms(req); if(!identity) return json(req,{error:"Sessão inválida."},401);
  const environment=Deno.env.get("CMS_ENVIRONMENT");
  if(!isConfiguredCmsEnvironment(environment)) return json(req,{error:"Ambiente CMS inválido."},503);
  const idempotencyKey=req.headers.get("X-Idempotency-Key"); if(!idempotencyKey||!Uuid.safeParse(idempotencyKey).success) return json(req,{error:"Chave idempotente obrigatória."},400);
  let input:z.infer<typeof Command>; try{input=Command.parse(await readJsonLimited(req,262144));}catch{return json(req,{error:"Comando inválido."},400);}
  const rateAction=`cms_leads_${input.action}`;
  const rateIdentity=`${identity.user.id}:${clientAddress(req)}`;
  let fusedRateLimitHash:string|undefined;
  try{
    if(input.action==="retry_delivery") fusedRateLimitHash=await rateLimitKeyHash(rateAction,rateIdentity);
    else if(!(await consumeRateLimit(identity.admin,req,rateAction,rateIdentity,60,900))) return json(req,{error:"Muitas operações. Aguarde."},429);
  }catch{return json(req,{error:"Proteção temporariamente indisponível."},503);}
  const correlationId=crypto.randomUUID();
  let command;
  if(input.action==="list_forms"){
    command=identity.admin.rpc("cms_forms_list_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_limit:input.limit});
  }else if(input.action==="list_leads"){
    command=identity.admin.rpc("cms_leads_list_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_status:input.status??null,p_limit:input.limit,p_offset:input.offset,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt});
  }else if(input.action==="save_form"){
    command=identity.admin.rpc("cms_save_form_version_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_form_id:input.formId??null,p_expected_lock_version:input.expectedLockVersion??null,p_form_key:input.formKey,p_title:input.title,p_purpose:input.purpose,p_definition:input.definition,p_consent_text:input.consentText,p_consent_version:input.consentVersion,p_privacy_path:input.privacyPath,p_sla_minutes:input.slaMinutes,p_retention_days:input.retentionDays,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId});
  }else if(input.action==="publish_form"){
    command=identity.admin.rpc("cms_publish_form_version_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_form_id:input.formId,p_version_id:input.versionId,p_expected_lock_version:input.expectedLockVersion,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId});
  }else if(input.action==="archive_form"||input.action==="restore_form"){
    command=identity.admin.rpc("cms_execute_form_lifecycle_command_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_action:input.action,p_form_id:input.formId,p_source_version_id:input.action==="restore_form"?input.sourceVersionId:null,p_expected_lock_version:input.expectedLockVersion,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_idempotency_key:idempotencyKey,p_request_hash:await sha256(JSON.stringify(input)),p_correlation_id:correlationId});
  }else if(input.action==="update_lead"){
    command=identity.admin.rpc("cms_manage_lead_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_lead_id:input.leadId,p_status:input.status,p_assigned_to:input.assignedTo??null,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId});
  }else if(input.action==="anonymize_lead"){
    command=identity.admin.rpc("cms_anonymize_lead_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_lead_id:input.leadId,p_reason:input.reason,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId});
  }else if(input.action==="retry_delivery"){
    if(!isConfiguredCmsEnvironment(environment)||(environment==="production"&&!isProductionOperationEnabled(environment))) return json(req,{error:"O reprocessamento não está autorizado neste ambiente.",code:"CMS_SYSTEM_PRODUCTION_GATED",correlationId,preserved:true},403);
    command=identity.admin.rpc("cms_retry_lead_delivery_limited",{p_actor_id:identity.user.id,p_event_id:input.eventId,p_justification:input.justification,p_environment:environment,p_site_key:"main",p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId,p_idempotency_key:idempotencyKey,p_request_hash:await sha256(JSON.stringify(input)),p_rate_limit_key_hash:fusedRateLimitHash});
  }else{
    command=identity.admin.rpc("cms_export_leads_scoped",{p_actor_id:identity.user.id,p_environment:environment,p_status:input.status??null,p_justification:input.justification,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId});
  }
  const {data,error}=await command;
  if(error){const marker=error.message.match(/CMS_[A-Z0-9_]+/)?.[0],forbidden=error.message.includes("FORBIDDEN")||error.message.includes("FEATURE_DISABLED")||error.code==="42501",notFound=error.message.includes("NOT_FOUND")||error.code==="PT404",conflict=error.message.includes("CONFLICT")||error.message.includes("NOT_RETRYABLE")||error.code==="PT409",rateLimited=marker==="CMS_RATE_LIMIT_EXCEEDED"||error.code==="PT429",invalid=error.message.includes("INVALID")||error.code==="23514"||error.code==="22023",formLifecycle=input.action==="archive_form"||input.action==="restore_form",currentVersion=marker==="CMS_FORM_VERSION_CONFLICT"?Number(error.message.match(/CMS_FORM_VERSION_CONFLICT:(\d+)/)?.[1]):undefined;return json(req,{error:forbidden?"Permissão insuficiente ou recurso não habilitado.":notFound?"Registro não encontrado.":conflict?(formLifecycle?"O formulário foi alterado por outra sessão. Recarregue e tente novamente.":"A entrega não pode ser reprocessada no estado atual."):rateLimited?"Muitas operações. Aguarde.":invalid?"Dados ou transição inválidos.":"Serviço temporariamente indisponível.",code:marker,correlationId,currentVersion:Number.isSafeInteger(currentVersion)?currentVersion:undefined,preserved:input.action==="retry_delivery"},forbidden?403:notFound?404:conflict?409:rateLimited?429:invalid?422:503);}
  return json(req,{...data,correlationId},200,{"Server-Timing":`command;dur=${Math.round(performance.now()-requestStartedAt)}`});
};

Deno.serve(async(req)=>{
  try {
    return await handleRequest(req);
  } catch {
    return json(req,{error:"Serviço temporariamente indisponível."},503);
  }
});
