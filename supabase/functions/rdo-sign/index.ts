// supabase/functions/rdo-sign/index.ts
// Assinatura REMOTA do cliente (sem login) — protegida por token de uso único.
//  - action=get  { token }                          -> dados do relatório p/ assinar
//  - action=sign { token, assinatura, nome, aceite, pdfBase64, filename }
// Usa service_role (a RLS é ignorada), mas SÓ age na linha cujo token confere e
// que está 'aguardando_cliente'. O token é limpo após assinar (uso único).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { relatorioAssinadoEmail, sendEmail, type ResumoRelatorio } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_PDF_B64 = 19_000_000;
const FALLBACK_ADMIN = "marcelo@gaiatecsistemas.com.br";
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  const action = String(body.action ?? "get");
  const token = String(body.token ?? "").trim();
  if (!isUuid(token)) return json({ error: "Link inválido." }, 400);

  // Carrega a linha pelo token
  const { data: row, error } = await admin
    .from("rdo_relatorios")
    .select("*")
    .eq("assinatura_token", token)
    .maybeSingle();
  if (error) return json({ error: "Erro ao carregar." }, 500);
  if (!row) return json({ error: "Link inválido ou já utilizado." }, 404);
  if (row.assinatura_status !== "aguardando_cliente")
    return json({ error: "Este relatório não está aguardando assinatura." }, 409);
  if (row.assinatura_token_expira && new Date(row.assinatura_token_expira).getTime() < Date.now())
    return json({ error: "Link expirado. Solicite um novo à Gaiatec Sistemas." }, 410);

  // Fotos (URLs públicas do bucket rdo-fotos)
  const { data: fotosRows } = await admin
    .from("rdo_fotos")
    .select("id, storage_path, ordem")
    .eq("relatorio_id", row.id)
    .order("ordem", { ascending: true });
  const fotos = (fotosRows ?? []).map((f) => ({
    id: f.id,
    url: `${url}/storage/v1/object/public/rdo-fotos/${f.storage_path}`,
  }));

  // ── GET: devolve os dados p/ renderizar e assinar ────────────────
  if (action === "get") {
    const { assinatura_token: _t, assinatura_token_expira: _e, created_by: _c, ...safe } = row as Record<string, unknown>;
    return json({ relatorio: { ...safe, fotos } });
  }

  // ── SIGN: grava a assinatura do cliente e conclui ────────────────
  if (action === "sign") {
    const assinatura = String(body.assinatura ?? "");
    const nome = String(body.nome ?? "").trim();
    const aceite = body.aceite === true;
    const pdfBase64 = String(body.pdfBase64 ?? "");
    const filename = String(body.filename ?? "relatorio-assinado.pdf");

    if (!assinatura.startsWith("data:image/")) return json({ error: "Assinatura ausente." }, 400);
    if (!nome) return json({ error: "Informe o seu nome." }, 400);
    if (!aceite) return json({ error: "É necessário aceitar os termos." }, 400);

    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("rdo_relatorios")
      .update({
        assinatura_cliente: assinatura,
        assinatura_cliente_nome: nome,
        assinatura_cliente_em: now,
        assinatura_cliente_metodo: "desenho",
        assinatura_status: "assinado",
        assinatura_token: null,
        assinatura_token_expira: null,
      })
      .eq("id", row.id)
      .eq("assinatura_token", token); // garante uso único (corrida)
    if (upErr) return json({ error: "Não foi possível registrar a assinatura." }, 500);

    // E-mail (admins + cliente) com o PDF assinado
    const localBase = [row.local_endereco, row.local_numero].filter(Boolean).join(", ");
    const resumo: ResumoRelatorio = {
      contrato: row.contrato ?? "",
      cliente: row.cliente ?? "",
      cnpj: row.cnpj ?? "",
      razaoSocial: row.razao_social ?? "",
      engGaiatec: row.eng_gaiatec ?? "",
      crea: row.crea ?? "",
      engCliente: nome,
      creaCliente: row.crea_cliente ?? "",
      emailCliente: row.email_cliente ?? "",
      inicio: fmtDate(row.periodo_inicio),
      fim: fmtDate(row.periodo_fim),
      local: localBase,
      fotos: fotos.length,
      assinatura: "Assinado",
      finalizadoEm: new Date().toLocaleString("pt-BR"),
    };

    let admins: string[] = [];
    try {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      admins = (data?.users ?? [])
        .filter((x) => (x.app_metadata as Record<string, unknown> | null)?.role === "admin")
        .map((x) => x.email ?? "")
        .filter(Boolean);
    } catch {
      /* fallback */
    }
    if (admins.length === 0) admins = [FALLBACK_ADMIN];

    const attachment = pdfBase64 && pdfBase64.length <= MAX_PDF_B64 ? [{ filename, content: pdfBase64 }] : undefined;
    const dest = [...new Set([...admins, ...(row.email_cliente ? [String(row.email_cliente)] : [])])];
    try {
      await sendEmail(resendKey, dest, { ...relatorioAssinadoEmail(resumo), attachments: attachment });
    } catch (_) {
      /* assinatura já registrada; e-mail é best-effort */
    }
    return json({ ok: true });
  }

  // ── UPLOAD-SIGNED: cliente assinou por fora e envia o PDF assinado ─
  if (action === "upload-signed") {
    let b64 = String(body.pdfBase64 ?? "");
    const comma = b64.indexOf(",");
    if (b64.startsWith("data:") && comma > -1) b64 = b64.slice(comma + 1);
    const filename = String(body.filename ?? "relatorio-assinado.pdf");
    const nome = String(body.nome ?? "").trim();
    if (!b64) return json({ error: "Envie o PDF assinado." }, 400);

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return json({ error: "Arquivo inválido." }, 400);
    }
    if (bytes.length > 14_000_000) return json({ error: "PDF muito grande (máx. 14MB)." }, 400);
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46))
      return json({ error: "O arquivo precisa ser um PDF." }, 400);

    const path = `assinados/${row.id}/${crypto.randomUUID()}.pdf`;
    const up = await admin.storage.from("rdo-assinados").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) return json({ error: "Falha ao salvar o PDF." }, 500);

    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("rdo_relatorios")
      .update({
        assinatura_cliente_metodo: "importado",
        assinatura_cliente_pdf_path: path,
        assinatura_cliente_arquivo: filename,
        assinatura_cliente_nome: nome || row.assinatura_cliente_nome || row.eng_cliente,
        assinatura_cliente_em: now,
        assinatura_status: "assinado",
        assinatura_token: null,
        assinatura_token_expira: null,
      })
      .eq("id", row.id)
      .eq("assinatura_token", token);
    if (upErr) return json({ error: "Não foi possível concluir." }, 500);

    const localBase = [row.local_endereco, row.local_numero].filter(Boolean).join(", ");
    const resumo: ResumoRelatorio = {
      contrato: row.contrato ?? "",
      cliente: row.cliente ?? "",
      cnpj: row.cnpj ?? "",
      razaoSocial: row.razao_social ?? "",
      engGaiatec: row.eng_gaiatec ?? "",
      crea: row.crea ?? "",
      engCliente: nome || row.eng_cliente || "",
      creaCliente: row.crea_cliente ?? "",
      emailCliente: row.email_cliente ?? "",
      inicio: fmtDate(row.periodo_inicio),
      fim: fmtDate(row.periodo_fim),
      local: localBase,
      fotos: fotos.length,
      assinatura: "Assinado (documento externo)",
      finalizadoEm: new Date().toLocaleString("pt-BR"),
    };
    let admins: string[] = [];
    try {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      admins = (data?.users ?? [])
        .filter((x) => (x.app_metadata as Record<string, unknown> | null)?.role === "admin")
        .map((x) => x.email ?? "")
        .filter(Boolean);
    } catch {
      /* fallback */
    }
    if (admins.length === 0) admins = [FALLBACK_ADMIN];
    const dest = [...new Set([...admins, ...(row.email_cliente ? [String(row.email_cliente)] : [])])];
    try {
      await sendEmail(resendKey, dest, { ...relatorioAssinadoEmail(resumo), attachments: [{ filename, content: b64 }] });
    } catch (_) {
      /* best-effort */
    }
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
