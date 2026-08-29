import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";
const Command=z.discriminatedUnion("action",[
  z.object({action:z.literal("list")}).strict(),z.object({action:z.literal("analytics")}).strict(),
  z.object({action:z.literal("upsert"),id:z.uuid().optional(),canonicalTerm:z.string().trim().min(1).max(120),aliases:z.array(z.string().trim().min(1).max(120)).min(1).max(50),scope:z.enum(["all","product","service","industry","application","solution"]),sourceReference:z.string().trim().min(3).max(300),active:z.boolean()}).strict(),
  z.object({action:z.literal("remove"),id:z.uuid()}).strict(),
]);
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:corsHeaders(req)});
  if(!isAllowedOrigin(req))return json(req,{error:"Origem não autorizada."},403);
  if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);
  const identity=await authenticateCms(req); if(!identity)return json(req,{error:"Sessão inválida."},401);
  let input:z.infer<typeof Command>; try{input=Command.parse(await readJsonLimited(req,32768));}catch{return json(req,{error:"Comando inválido."},400)}
  const permission=input.action==="analytics"?"cms:search.analytics":input.action==="list"?"cms:search.read":"cms:search.manage";
  const {data:allowed}=await identity.admin.rpc("cms_actor_authorized",{p_actor_id:identity.user.id,p_permission:permission,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt});
  if(!allowed)return json(req,{error:"Permissão insuficiente."},403);
  if(input.action==="list"){const {data,error}=await identity.admin.from("cms_search_synonyms").select("*").order("canonical_term");return error?json(req,{error:"Busca indisponível."},503):json(req,{items:data??[]});}
  if(input.action==="analytics"){const {data,error}=await identity.admin.from("cms_search_events").select("normalized_query,result_count,content_types,refinements,occurred_at").eq("result_count",0).order("occurred_at",{ascending:false}).limit(100);return error?json(req,{error:"Analytics indisponível."},503):json(req,{zeroResults:data??[]});}
  const correlationId=crypto.randomUUID();
  if(input.action==="remove"){
    const {error}=await identity.admin.from("cms_search_synonyms").delete().eq("id",input.id);if(error)return json(req,{error:"Sinônimo não removido."},422);
    await identity.admin.from("cms_audit_log").insert({actor_id:identity.user.id,action:"cms:search.synonym_removed",target_type:"search_synonym",target_id:input.id,correlation_id:correlationId});
    return json(req,{ok:true,correlationId});
  }
  const payload={canonical_term:input.canonicalTerm,aliases:input.aliases,scope:input.scope,source_reference:input.sourceReference,active:input.active,updated_by:identity.user.id,...(!input.id?{created_by:identity.user.id}:{})};
  const query=input.id?identity.admin.from("cms_search_synonyms").update(payload).eq("id",input.id).select().single():identity.admin.from("cms_search_synonyms").insert(payload).select().single();
  const {data,error}=await query;if(error)return json(req,{error:"Sinônimo não salvo."},422);
  await identity.admin.from("cms_audit_log").insert({actor_id:identity.user.id,action:"cms:search.synonym_saved",target_type:"search_synonym",target_id:data.id,correlation_id:correlationId,event_data:{scope:input.scope}});
  return json(req,{item:data,correlationId},input.id?200:201);
});
