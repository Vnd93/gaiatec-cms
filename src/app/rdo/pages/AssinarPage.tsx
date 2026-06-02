import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { motion } from "motion/react";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, ChevronDown, Download, FileCheck2, Loader2, PenLine, ShieldCheck, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SignaturePad } from "../components/SignaturePad";
import { TERMOS_TEXTO, TERMOS_TITULO, TERMOS_VERSAO } from "../lib/terms";
import { formatDate } from "../lib/format";
import type { Relatorio } from "../lib/types";
import "../rdo.css";

type Estado = "checking" | "ready" | "error" | "done";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler o PDF."));
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.readAsDataURL(blob);
  });
}

export default function AssinarPage() {
  const { token } = useParams();
  const [estado, setEstado] = useState<Estado>("checking");
  const [erro, setErro] = useState("");
  const [r, setR] = useState<Relatorio | null>(null);

  const [metodo, setMetodo] = useState<"desenho" | "externo">("desenho");
  const [nome, setNome] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [verTermos, setVerTermos] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [baixouPdf, setBaixouPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErro, setFormErro] = useState("");

  useEffect(() => {
    if (!token) {
      setErro("Link inválido.");
      setEstado("error");
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase.functions.invoke("rdo-sign", { body: { action: "get", token } });
      if (!active) return;
      if (error || !data?.relatorio) {
        // tenta extrair a mensagem da função
        let msg = "Link inválido, expirado ou já utilizado.";
        try {
          const ctx = (error as { context?: Response } | null)?.context;
          if (ctx) {
            const j = await ctx.json();
            if (j?.error) msg = j.error;
          }
        } catch {
          /* ignore */
        }
        setErro(msg);
        setEstado("error");
        return;
      }
      const rel = data.relatorio as Relatorio;
      setR(rel);
      setNome(rel.eng_cliente || "");
      setEstado("ready");
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function assinar() {
    setFormErro("");
    if (!r) return;
    if (!nome.trim()) return setFormErro("Informe o seu nome.");
    if (!assinatura) return setFormErro("Faça a sua assinatura no quadro.");
    if (!aceite) return setFormErro("É necessário aceitar os termos e condições.");
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const completo: Relatorio = {
        ...r,
        assinatura_cliente: assinatura,
        assinatura_cliente_nome: nome.trim(),
        assinatura_cliente_em: now,
        assinatura_status: "assinado",
        termos_aceitos: true,
        termos_versao: r.termos_versao || TERMOS_VERSAO,
      };
      const { generateRelatorioPdf } = await import("../lib/pdf");
      const blob = await generateRelatorioPdf(completo);
      const pdfBase64 = await blobToBase64(blob);
      const dataStr = now.slice(0, 10).replace(/-/g, "");
      const filename = `RDO_${(r.cliente || "relatorio").replace(/[^a-z0-9]+/gi, "_")}_${dataStr}.pdf`;

      const { data, error } = await supabase.functions.invoke("rdo-sign", {
        body: { action: "sign", token, assinatura, nome: nome.trim(), aceite: true, pdfBase64, filename },
      });
      if (error || !data?.ok) throw new Error("Falha ao registrar a assinatura.");
      setEstado("done");
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : "Não foi possível assinar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  // Método "por fora": baixa o PDF do relatório para o cliente assinar em qualquer assinador.
  async function baixarPdf() {
    if (!r) return;
    try {
      const { downloadRelatorioPdf } = await import("../lib/pdf");
      await downloadRelatorioPdf(r);
      setBaixouPdf(true);
    } catch {
      setFormErro("Não foi possível gerar o PDF. Tente novamente.");
    }
  }

  // Método "por fora": envia o PDF já assinado externamente.
  async function enviarAssinado() {
    setFormErro("");
    if (!arquivo) return setFormErro("Selecione o PDF assinado para enviar.");
    if (arquivo.type && arquivo.type !== "application/pdf") return setFormErro("O arquivo precisa ser um PDF.");
    if (arquivo.size > 14_000_000) return setFormErro("PDF muito grande (máx. 14MB).");
    setBusy(true);
    try {
      const pdfBase64 = await blobToBase64(arquivo);
      const { data, error } = await supabase.functions.invoke("rdo-sign", {
        body: { action: "upload-signed", token, pdfBase64, filename: arquivo.name, nome: nome.trim() },
      });
      if (error || !data?.ok) throw new Error("Falha ao enviar o PDF assinado.");
      setEstado("done");
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const fotos = (r?.fotos ?? []).filter((f) => f.url);
  const local = [r?.local_endereco, r?.local_numero].filter(Boolean).join(", ");
  const inputCls =
    "w-full rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2.5 text-[14px] text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]";

  return (
    <div className="rdo-root min-h-[100dvh] bg-[var(--rdo-surface)] px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        {/* Marca */}
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/logo-gaiatec-emblema.png" alt="" className="h-8 w-8 object-contain" />
          <div>
            <p className="text-[13px] font-semibold leading-none tracking-[-0.01em] text-[var(--rdo-ink)]">Gaiatec Sistemas</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
              Relatório Diário de Obra
            </p>
          </div>
        </div>

        {estado === "checking" && (
          <div className="flex justify-center py-24">
            <Loader2 size={26} className="rdo-spin text-[var(--rdo-blue)]" />
          </div>
        )}

        {estado === "error" && (
          <div className="rounded-xl border border-[var(--rdo-line)] bg-white p-8 text-center">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--rdo-ink)]">Não foi possível abrir</h1>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-[var(--rdo-ink-3)]">{erro}</p>
          </div>
        )}

        {estado === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[var(--rdo-line)] bg-white p-8 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f5ee]">
              <ShieldCheck size={24} className="text-[#1a7f43]" />
            </div>
            <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-[var(--rdo-ink)]">Relatório assinado!</h1>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-[var(--rdo-ink-3)]">
              Obrigado. Sua assinatura foi registrada e uma cópia do relatório assinado em PDF foi enviada por e-mail.
            </p>
          </motion.div>
        )}

        {estado === "ready" && r && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Resumo */}
            <div className="rounded-xl border border-[var(--rdo-line)] bg-white p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-semibold tracking-wide text-[var(--rdo-ink-3)]">{r.contrato || "—"}</span>
                <span className="text-[11px] text-[var(--rdo-ghost)]">{r.periodo_inicio ? formatDate(r.periodo_inicio) : ""}</span>
              </div>
              <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[var(--rdo-ink)]">
                {r.cliente || "Relatório de Obra"}
              </h1>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--rdo-ink-2)]">
                A <strong>Gaiatec Sistemas</strong> solicita a sua assinatura no relatório abaixo. Revise as informações e
                assine no fim da página.
              </p>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Info label="Eng. Gaiatec Sistemas" value={r.eng_gaiatec} />
                <Info label="Eng. do Cliente" value={r.eng_cliente} />
                {local && <Info label="Local" value={local} />}
                {r.periodo_fim && <Info label="Término" value={formatDate(r.periodo_fim)} />}
              </dl>

              {r.comentarios?.trim() && (
                <div className="mt-4 border-t border-[var(--rdo-line)] pt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)]">Observações</p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--rdo-ink-2)]">{r.comentarios}</p>
                </div>
              )}

              {fotos.length > 0 && (
                <div className="mt-4 border-t border-[var(--rdo-line)] pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)]">
                    Fotos ({fotos.length})
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {fotos.slice(0, 8).map((f) => (
                      <div key={f.id} className="aspect-square overflow-hidden rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)]">
                        <img src={f.url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assinatura já aposta pela Gaiatec */}
              {r.assinatura_gaiatec && (
                <div className="mt-4 border-t border-[var(--rdo-line)] pt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)]">
                    Assinatura Gaiatec Sistemas
                  </p>
                  <img src={r.assinatura_gaiatec} alt="Assinatura Gaiatec" className="h-14 object-contain" />
                  <p className="mt-1 text-[11.5px] text-[var(--rdo-ink-3)]">
                    {r.assinatura_gaiatec_nome || r.eng_gaiatec}
                    {r.assinatura_gaiatec_em ? ` · ${formatDate(r.assinatura_gaiatec_em)}` : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Bloco de assinatura do cliente */}
            <div className="rounded-xl border border-[var(--rdo-line)] bg-white p-5">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--rdo-ink)]">Sua assinatura</h2>

              {/* Seletor de método */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { v: "desenho" as const, icon: <PenLine size={15} />, label: "Assinar aqui" },
                  { v: "externo" as const, icon: <ShieldCheck size={15} />, label: "Assinar por fora" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => {
                      setMetodo(o.v);
                      setFormErro("");
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors ${
                      metodo === o.v
                        ? "border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]"
                        : "border-[var(--rdo-line)] bg-white text-[var(--rdo-ink-2)] hover:border-[var(--rdo-ink-3)]"
                    }`}
                  >
                    {o.icon}
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-[var(--rdo-ghost)]">
                {metodo === "desenho"
                  ? "Assine com o dedo ou mouse, direto aqui."
                  : "Baixe o PDF, assine no app que preferir (gov.br, certificado digital, etc.) e envie o PDF assinado de volta."}
              </p>

              {metodo === "desenho" ? (
                <>
                  <label className="mt-4 mb-1.5 block text-[12px] font-medium text-[var(--rdo-ink-2)]">Seu nome completo</label>
                  <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem assina" />

                  <div className="mt-3">
                    <SignaturePad onChange={setAssinatura} disabled={busy} />
                  </div>

                  <div className="mt-3 rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)] p-3">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox.Root
                        checked={aceite}
                        onCheckedChange={(c) => setAceite(c === true)}
                        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--rdo-line-strong)] bg-white data-[state=checked]:border-[var(--rdo-blue)] data-[state=checked]:bg-[var(--rdo-blue)]"
                      >
                        <Checkbox.Indicator>
                          <Check size={13} strokeWidth={3} className="text-white" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <span className="text-[12.5px] leading-snug text-[var(--rdo-ink-2)]">
                        Li e aceito os <strong>termos e condições</strong> de assinatura eletrônica.
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setVerTermos((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 pl-7 text-[12px] font-medium text-[var(--rdo-blue)] transition-colors hover:text-[var(--rdo-blue-strong)]"
                    >
                      <ChevronDown size={13} className={`transition-transform ${verTermos ? "rotate-180" : ""}`} />
                      {verTermos ? "Ocultar termos" : "Ler os termos"}
                    </button>
                    {verTermos && (
                      <div className="rdo-scroll mt-2 max-h-44 overflow-y-auto rounded-md border border-[var(--rdo-line)] bg-white p-3">
                        <p className="mb-1.5 text-[11px] font-semibold text-[var(--rdo-ink-2)]">
                          {TERMOS_TITULO} <span className="font-normal text-[var(--rdo-ghost)]">({TERMOS_VERSAO})</span>
                        </p>
                        <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--rdo-ink-3)]">{TERMOS_TEXTO}</p>
                      </div>
                    )}
                  </div>

                  {formErro && <p className="mt-3 text-[12.5px] font-medium text-[#d4453e]">{formErro}</p>}

                  <button
                    onClick={assinar}
                    disabled={busy}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--rdo-blue)] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
                  >
                    {busy ? <Loader2 size={16} className="rdo-spin" /> : <ShieldCheck size={16} />}
                    {busy ? "Registrando…" : "Assinar relatório"}
                  </button>
                  <p className="mt-2.5 text-center text-[11px] text-[var(--rdo-ghost)]">
                    Assinatura eletrônica · registra nome, data e hora · MP 2.200-2/2001
                  </p>
                </>
              ) : (
                <>
                  {/* Passo 1: baixar */}
                  <div className="mt-4 flex items-start gap-3 rounded-md border border-[var(--rdo-line)] p-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--rdo-blue-soft)] text-[11px] font-bold text-[var(--rdo-blue)]">1</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--rdo-ink)]">Baixe o PDF do relatório</p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--rdo-ghost)]">Assine no gov.br, certificado digital ou no assinador que preferir.</p>
                      <button
                        type="button"
                        onClick={baixarPdf}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[12.5px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)]"
                      >
                        {baixouPdf ? <FileCheck2 size={14} className="text-[#1a7f43]" /> : <Download size={14} />}
                        {baixouPdf ? "PDF baixado — baixar de novo" : "Baixar PDF"}
                      </button>
                    </div>
                  </div>

                  {/* Passo 2: enviar */}
                  <div className="mt-2 flex items-start gap-3 rounded-md border border-[var(--rdo-line)] p-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--rdo-blue-soft)] text-[11px] font-bold text-[var(--rdo-blue)]">2</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--rdo-ink)]">Envie o PDF assinado</p>
                      <label className="mt-2 block cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            setArquivo(e.target.files?.[0] ?? null);
                            setFormErro("");
                          }}
                        />
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--rdo-line-strong)] bg-[var(--rdo-bg-2)] px-3 py-2 text-[12.5px] font-medium text-[var(--rdo-ink-2)] transition-colors hover:border-[var(--rdo-blue)]">
                          {arquivo ? <FileCheck2 size={14} className="text-[#1a7f43]" /> : <Upload size={14} />}
                          {arquivo ? arquivo.name : "Escolher PDF assinado"}
                        </span>
                      </label>
                    </div>
                  </div>

                  <label className="mt-3 mb-1.5 block text-[12px] font-medium text-[var(--rdo-ink-2)]">
                    Seu nome <span className="text-[var(--rdo-ghost)]">(opcional)</span>
                  </label>
                  <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem assinou" />

                  {formErro && <p className="mt-3 text-[12.5px] font-medium text-[#d4453e]">{formErro}</p>}

                  <button
                    onClick={enviarAssinado}
                    disabled={busy || !arquivo}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--rdo-blue)] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
                  >
                    {busy ? <Loader2 size={16} className="rdo-spin" /> : <Upload size={16} />}
                    {busy ? "Enviando…" : "Enviar relatório assinado"}
                  </button>
                  <p className="mt-2.5 text-center text-[11px] text-[var(--rdo-ghost)]">
                    Após assinar, valide em{" "}
                    <a href="https://validar.iti.br" target="_blank" rel="noreferrer" className="text-[var(--rdo-blue)] underline">
                      validar.iti.br
                    </a>
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)]">{label}</p>
      <p className="mt-0.5 text-[13.5px] text-[var(--rdo-ink)]">{value}</p>
    </div>
  );
}
