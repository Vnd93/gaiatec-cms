import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const Uuid=z.uuid();
const List=z.object({id:Uuid.optional(),listKey:z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),entityType:z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),dimensionKey:z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),label:z.string().trim().min(1).max(120),description:z.string().max(500).default(""),publicVisible:z.boolean().default(true),active:z.boolean().default(true),sortOrder:z.number().int().min(0).max(9999).default(0)}).strict();
const Option=z.object({id:Uuid.optional(),listId:Uuid,slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),label:z.string().trim().min(1).max(160),description:z.string().max(500).default(""),publicVisible:z.boolean().default(true),active:z.boolean().default(true),sortOrder:z.number().int().min(0).max(9999).default(0)}).strict();
const Command=z.discriminatedUnion("action",[
  z.object({action:z.literal("list"),entityType:z.string().max(80).optional(),includeInactive:z.boolean().default(false)}).strict(),
  z.object({action:z.literal("upsert_list"),list:List}).strict(),
  z.object({action:z.literal("upsert_option"),option:Option}).strict(),
  z.object({action:z.literal("set_option_active"),option:z.object({id:Uuid,active:z.boolean()}).strict()}).strict(),
]);

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders(req)});
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  if(!isAllowedOrigin(req)) return json(req,{error:"Origem não autorizada."},403);
  const identity=await authenticateCms(req); if(!identity) return json(req,{error:"Sessão inválida."},401);
  let command:z.infer<typeof Command>; try{command=Command.parse(await readJsonLimited(req,128*1024));}catch{return json(req,{error:"Comando de lista mestra inválido."},400);}
  try{if(!await consumeRateLimit(identity.admin,req,"cms_vocabularies",identity.user.id+":"+clientAddress(req),120,900)) return json(req,{error:"Muitas operações. Aguarde."},429);}catch{return json(req,{error:"Proteção temporariamente indisponível."},503);}
  if(command.action==="list"){
    const {data:allowed}=await identity.admin.rpc("cms_actor_authorized",{p_actor_id:identity.user.id,p_permission:"cms:vocabularies.read",p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,p_issued_at:identity.claims.issuedAt});
    if(!allowed) return json(req,{error:"Permissão insuficiente."},403);
    let query=identity.admin.from("cms_controlled_lists").select("id,list_key,entity_type,dimension_key,label,description,public_visible,active,sort_order,updated_at,cms_controlled_options(id,slug,label,description,public_visible,active,sort_order,updated_at)").order("sort_order").order("label");
    if(command.entityType) query=query.eq("entity_type",command.entityType);
    if(!command.includeInactive) query=query.eq("active",true).eq("cms_controlled_options.active",true);
    const {data,error}=await query; if(error) return json(req,{error:"Listas mestras indisponíveis."},503);
    const items=(data??[]).map((list:any)=>({...list,options:(list.cms_controlled_options??[]).sort((a:any,b:any)=>a.sort_order-b.sort_order||a.label.localeCompare(b.label,"pt-BR"))}));
    return json(req,{items});
  }
  const correlationId=crypto.randomUUID();
  const {data,error}=await identity.admin.rpc("cms_manage_controlled_vocabulary",{
    p_actor_id:identity.user.id,p_action:command.action,p_list:command.action==="upsert_list"?command.list:null,
    p_option:command.action!=="upsert_list"?command.option:null,p_aal:identity.claims.aal,p_session_id:identity.claims.sessionId,
    p_issued_at:identity.claims.issuedAt,p_correlation_id:correlationId,
  });
  if(error){const forbidden=error.message.includes("FORBIDDEN");return json(req,{error:forbidden?"Permissão insuficiente.":"Não foi possível atualizar a lista mestra.",correlationId,code:error.code},forbidden?403:422);}
  return json(req,{...data,correlationId});
});
