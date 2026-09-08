import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isConfiguredCmsEnvironment } from "../_shared/ev2-environment.ts";
import { validatePublicFormSubmission } from "../_shared/cms-public-form-submission.ts";
import { publishedProjectionAuthorizesLeadContext } from "../_shared/cms-lead-origin-binding.ts";
import {
  LeadCaptureEnvelopeSchema,
  type LeadCaptureEnvelope,
} from "../_shared/cms-lead-capture-envelope.ts";
import { isControlledQaLeadOrigin } from "../_shared/cms-synthetic-lead.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, isAllowedTurnstileVerification, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const TURNSTILE_ACTION = "lead_capture";
const GENERIC_ORIGIN_SOURCES = new Set(["site", "contact", "newsletter", "website"]);

async function verifyTurnstile(token: string, ip: string, idempotencyKey: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  const body = new FormData(); body.set("secret",secret); body.set("response",token); body.set("idempotency_key",idempotencyKey); if (ip!=="unknown") body.set("remoteip",ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body});
  if(!response.ok) return false;
  const result = await response.json().catch(()=>({success:false})) as {success?:boolean;hostname?:string;action?:string};
  const expectedAction=Deno.env.get("TURNSTILE_EXPECTED_ACTION")||TURNSTILE_ACTION;
  return isAllowedTurnstileVerification(result, secret, expectedAction);
}

const handleRequest = async(req: Request) => {
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders(req)});
  if(!isAllowedOrigin(req)) return json(req,{error:"Origem não autorizada."},403);
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json(req,{error:"Serviço temporariamente indisponível."},503);
  const environment=Deno.env.get("CMS_ENVIRONMENT");
  if(!isConfiguredCmsEnvironment(environment)) return json(req,{error:"Serviço temporariamente indisponível."},503);
  let input:LeadCaptureEnvelope;
  try{input=LeadCaptureEnvelopeSchema.parse(await readJsonLimited(req,65536));}catch{return json(req,{error:"Revise os campos do formulário."},400);}
  const evidenceSalt=Deno.env.get("LEAD_EVIDENCE_SALT");
  if(!evidenceSalt) return json(req,{error:"Serviço temporariamente indisponível."},503);
  let legacyInput:boolean;
  let campaignContext:string|undefined;
  let productContext:string|undefined;
  let requestedFormKey:string|null;
  let requestedFormId:string|null;
  let requestedFormVersionId:string|null;
  let requestedFormVersion:number|null;
  let idempotencyKey:string;
  if("formId" in input){
    legacyInput=true;
    campaignContext=input.origin.campaignId;
    productContext=input.origin.productId;
    requestedFormKey=null;
    requestedFormId=input.formId;
    requestedFormVersionId=input.formVersionId;
    requestedFormVersion=null;
    idempotencyKey=input.idempotencyKey;
  }else{
    legacyInput=false;
    campaignContext=input.origin.campaignPath;
    productContext=input.origin.productSlug;
    requestedFormKey=input.formKey;
    requestedFormId=null;
    requestedFormVersionId=null;
    requestedFormVersion=input.formVersion;
    const digest=await sha256(`${evidenceSalt}:submission:${input.submissionToken}`);
    idempotencyKey=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
  }
  const controlledQaFixture=input.origin.source==="qa_fixture"&&isControlledQaLeadOrigin({
    origin_source:input.origin.source,origin_path:input.origin.path,
  });
  if(
    (campaignContext&&productContext)||
    (campaignContext&&input.origin.source!=="campaign")||
    (productContext&&input.origin.source!=="product")||
    (!campaignContext&&!productContext&&!GENERIC_ORIGIN_SOURCES.has(input.origin.source)&&!controlledQaFixture)
  ) return json(req,{error:"Origem do formulário inválida."},422);
  const admin=createClient(url,service,{auth:{persistSession:false}}),ip=clientAddress(req),correlationId=crypto.randomUUID();
  try {
    if (!(await consumeRateLimit(admin,req,"lead_capture_preflight",ip,60,60)))
      return json(req,{error:"Muitas tentativas. Aguarde antes de tentar novamente."},429);
  } catch {
    return json(req,{error:"Proteção temporariamente indisponível."},503);
  }
  const formResult=await admin.rpc("cms_public_form_scoped",{
    p_environment:environment,
    p_form_key:requestedFormKey,
    p_form_id:requestedFormId,
    p_version_id:requestedFormVersionId,
  });
  if(formResult.error) return json(req,{error:"Formulário temporariamente indisponível."},503);
  const version=formResult.data;
  if(
    !version||
    (requestedFormId!==null&&(
      typeof version.id!=="string"||version.id.toLowerCase()!==requestedFormId.toLowerCase()||
      typeof version.version_id!=="string"||version.version_id.toLowerCase()!==requestedFormVersionId?.toLowerCase()
    ))||
    (requestedFormKey!==null&&(version.form_key!==requestedFormKey||version.version!==requestedFormVersion))
  ) return json(req,{error:"Formulário indisponível."},422);
  const submission = validatePublicFormSubmission(version.definition?.fields, input.fields);
  if (!submission.ok) {
    if (submission.kind === "configuration")
      return json(req, { error: "Formulário temporariamente indisponível." }, 503);
    const message = submission.reason === "required-field"
      ? "Preencha os campos obrigatórios."
      : submission.reason === "email-value"
      ? "Informe um e-mail válido."
      : "Revise os campos do formulário.";
    return json(req, { error: message }, 422);
  }
  try{
    const normal=await consumeRateLimit(admin,req,"lead_capture",`${ip}:${version.id}`,5,3600);
    const requiresCaptcha=Deno.env.get("CONTACT_CAPTCHA_ALWAYS")==="true"||!normal;
    if(requiresCaptcha){
      if(!normal){
      const protectedWindow=await consumeRateLimit(admin,req,"lead_capture_protected",`${ip}:${version.id}`,20,3600);
      if(!protectedWindow) return json(req,{error:"Muitas tentativas. Aguarde antes de tentar novamente."},429);
      }
      if(!input.captchaToken||!(await verifyTurnstile(input.captchaToken,ip,idempotencyKey))) return json(req,{error:"Confirme a verificação de segurança.",challengeRequired:true},403);
    }
  }catch{return json(req,{error:"Proteção temporariamente indisponível."},503);}
  const evidence={ipHash:await sha256(`${evidenceSalt}:${ip}`),userAgentHash:await sha256(req.headers.get("User-Agent")??"unknown"),receivedAt:new Date().toISOString()};
  const exactFormBinding={formId:version.id,formVersionId:version.version_id};
  const [campaignResult,productResult]=await Promise.all([
    campaignContext
      ? (legacyInput
        ? admin.from("cms_published_projection").select("item_id,slug,payload").eq("content_type","campaign").eq("item_id",campaignContext).limit(1).maybeSingle()
        : admin.from("cms_published_projection").select("item_id,slug,payload").eq("content_type","campaign").eq("payload->route->>path",campaignContext).limit(1).maybeSingle())
      : Promise.resolve({data:null,error:null}),
    productContext
      ? (legacyInput
        ? admin.from("cms_published_projection").select("item_id,slug,payload").eq("content_type","product").eq("item_id",productContext).limit(1).maybeSingle()
        : admin.from("cms_published_projection").select("item_id,slug,payload").eq("content_type","product").eq("slug",productContext).limit(1).maybeSingle())
      : Promise.resolve({data:null,error:null}),
  ]);
  if(campaignResult.error||productResult.error) return json(req,{error:"Serviço temporariamente indisponível."},503);
  if(
    (campaignContext&&(!campaignResult.data||!publishedProjectionAuthorizesLeadContext(
      {contentType:"campaign",slug:campaignResult.data.slug,payload:campaignResult.data.payload},exactFormBinding,
      {path:input.origin.path,source:input.origin.source},
    )))||
    (productContext&&(!productResult.data||!publishedProjectionAuthorizesLeadContext(
      {contentType:"product",slug:productResult.data.slug,payload:productResult.data.payload},exactFormBinding,
      {path:input.origin.path,source:input.origin.source},
    )))
  )
    return json(req,{error:"Origem do formulário inválida."},422);
  const governedOrigin={
    path:input.origin.path,source:input.origin.source,utm:input.origin.utm,
    ...(campaignResult.data?.item_id?{campaignId:campaignResult.data.item_id}:{}),
    ...(productResult.data?.item_id?{productId:productResult.data.item_id}:{}),
  };
  const {data,error}=await admin.rpc("cms_capture_lead_scoped",{p_environment:environment,p_form_id:version.id,p_form_version_id:version.version_id,p_idempotency_key:idempotencyKey,p_fields:input.fields,p_origin:governedOrigin,p_consent:input.consent,p_technical_evidence:evidence,p_correlation_id:correlationId});
  if(error){
    const invalid=error.message.includes("INVALID")||error.message.includes("REQUIRED")||error.message.includes("CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN")||error.code==="23514";
    return json(req,{error:invalid?"Revise os campos e o consentimento.":"Não foi possível registrar agora."},invalid?422:503);
  }
  const reference=typeof data?.reference==="string"&&/^LD-[A-F0-9]{10}$/.test(data.reference)?data.reference:null;
  if(!reference||typeof data?.duplicate!=="boolean") return json(req,{error:"Não foi possível registrar agora."},503);
  return json(req,{reference,duplicate:data.duplicate},201);
};

Deno.serve(async(req)=>{
  try {
    return await handleRequest(req);
  } catch {
    return json(req,{error:"Serviço temporariamente indisponível."},503);
  }
});
