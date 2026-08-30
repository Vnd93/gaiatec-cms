import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@4.4.3";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const Path = z.string().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/).max(300);
const Capture = z.object({
  formId: z.uuid(), formVersionId: z.uuid(), idempotencyKey: z.uuid(),
  fields: z.record(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), z.union([z.string().max(5000),z.boolean(),z.array(z.string().max(500)).max(50)])),
  origin: z.object({ path: Path, source: z.string().trim().min(1).max(120), campaignId: z.uuid().optional(), productId: z.uuid().optional(),
    utm: z.object({ source:z.string().max(120).optional(),medium:z.string().max(120).optional(),campaign:z.string().max(160).optional(),term:z.string().max(160).optional(),content:z.string().max(160).optional() }).strict() }).strict(),
  consent: z.object({ accepted:z.literal(true),text:z.string().trim().min(3).max(2000),version:z.string().trim().min(1).max(80) }).strict(),
  honeypot: z.string().max(0).default(""), captchaToken: z.string().max(4096).optional(),
}).strict();

async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  const body = new FormData(); body.set("secret",secret); body.set("response",token); if (ip!=="unknown") body.set("remoteip",ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body});
  const result = await response.json().catch(()=>({success:false})) as {success?:boolean};
  return result.success===true;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders(req)});
  if(!isAllowedOrigin(req)) return json(req,{error:"Origem não autorizada."},403);
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json(req,{error:"Serviço temporariamente indisponível."},503);
  let input:z.infer<typeof Capture>;
  try{input=Capture.parse(await readJsonLimited(req,65536));}catch{return json(req,{error:"Revise os campos do formulário."},400);}
  const admin=createClient(url,service,{auth:{persistSession:false}}),ip=clientAddress(req),correlationId=crypto.randomUUID();
  const [{data:form},{data:version}]=await Promise.all([
    admin.from("cms_form_definitions").select("id,active_version_id,status").eq("id",input.formId).maybeSingle(),
    admin.from("cms_form_versions").select("id,form_id,definition,status").eq("id",input.formVersionId).eq("form_id",input.formId).maybeSingle(),
  ]);
  if(!form||form.status!=="published"||form.active_version_id!==input.formVersionId||!version||version.status!=="published") return json(req,{error:"Formulário indisponível."},422);
  const definitions=Array.isArray(version.definition?.fields)?version.definition.fields:[];
  const allowed=new Map(definitions.map((field:any)=>[field.key,field]));
  if(Object.keys(input.fields).some((key)=>!allowed.has(key)||allowed.get(key)?.type==="hidden")) return json(req,{error:"Revise os campos do formulário."},422);
  for(const field of definitions){
    if(field.type==="hidden") continue;
    const value=input.fields[field.key];
    const empty=value===undefined||value===null||value===""||value===false;
    if(field.required&&empty) return json(req,{error:`Preencha o campo ${field.label}.`},422);
    if(empty) continue;
    if(field.type==="checkbox"&&typeof value!=="boolean") return json(req,{error:`Revise o campo ${field.label}.`},422);
    if(field.type!=="checkbox"&&typeof value!=="string") return json(req,{error:`Revise o campo ${field.label}.`},422);
    if(typeof value==="string"&&field.maxLength&&value.length>field.maxLength) return json(req,{error:`O campo ${field.label} excede o limite.`},422);
    if(field.type==="select"&&!(field.options??[]).includes(value)) return json(req,{error:`Selecione uma opção válida em ${field.label}.`},422);
    if(field.type==="email"&&typeof value==="string"&&!z.email().safeParse(value).success) return json(req,{error:"Informe um e-mail válido."},422);
  }
  try{
    const normal=await consumeRateLimit(admin,req,"lead_capture",`${ip}:${input.formId}`,5,3600);
    if(!normal){
      const protectedWindow=await consumeRateLimit(admin,req,"lead_capture_protected",`${ip}:${input.formId}`,20,3600);
      if(!protectedWindow) return json(req,{error:"Muitas tentativas. Aguarde antes de tentar novamente."},429);
      if(!input.captchaToken||!(await verifyTurnstile(input.captchaToken,ip))) return json(req,{error:"Confirme a verificação de segurança.",challengeRequired:true},403);
    }
  }catch{return json(req,{error:"Proteção temporariamente indisponível."},503);}
  const evidenceSalt=Deno.env.get("LEAD_EVIDENCE_SALT");
  if(!evidenceSalt) return json(req,{error:"Serviço temporariamente indisponível."},503);
  const evidence={ipHash:await sha256(`${evidenceSalt}:${ip}`),userAgentHash:await sha256(req.headers.get("User-Agent")??"unknown"),receivedAt:new Date().toISOString()};
  const {data,error}=await admin.rpc("cms_capture_lead",{p_form_id:input.formId,p_form_version_id:input.formVersionId,p_idempotency_key:input.idempotencyKey,p_fields:input.fields,p_origin:input.origin,p_consent:input.consent,p_technical_evidence:evidence,p_correlation_id:correlationId});
  if(error){
    const invalid=error.message.includes("INVALID")||error.message.includes("REQUIRED")||error.code==="23514";
    return json(req,{error:invalid?"Revise os campos e o consentimento.":"Não foi possível registrar agora.",correlationId},invalid?422:503);
  }
  return json(req,{reference:data.reference,duplicate:data.duplicate,correlationId},201);
});
