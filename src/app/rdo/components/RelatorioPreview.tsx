import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Download, FileCheck2, Loader2, PenLine, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getRelatorio } from "../lib/relatorios";
import { anexarPdfAssinadoEquipe, garantirToken, signedPdfUrl, signLinkUrl } from "../lib/assinatura";
import { enviarLinkAssinaturaCliente } from "../lib/notify";
import type { Relatorio } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { formatDate, formatDateTime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { AssinaturaBadge } from "./AssinaturaBadge";
import { LocationMaps } from "./LocationMaps";

export function RelatorioPreview({
  id,
  onClose,
  onEdit,
  onDownload,
  busyDownload,
}: {
  id: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDownload: (r: Relatorio) => void;
  busyDownload?: boolean;
}) {
  const [r, setR] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const anexoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) {
      setR(null);
      return;
    }
    let active = true;
    setLoading(true);
    getRelatorio(id).then((data) => {
      if (active) {
        setR(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  const fotos = (r?.fotos ?? []).filter((f) => f.url);
  const local = [r?.local_endereco, r?.local_numero].filter(Boolean).join(", ");
  const temAssinaturas =
    !!r && (r.assinatura_status !== "nao_assinado" || !!r.assinatura_gaiatec || !!r.assinatura_gaiatec_pdf_path);

  async function copiarLink() {
    if (!r) return;
    setLinkBusy(true);
    try {
      const token = r.assinatura_token || (await garantirToken(r));
      await navigator.clipboard.writeText(signLinkUrl(token));
      toast.success("Link de assinatura copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function reenviar() {
    if (!r) return;
    setLinkBusy(true);
    try {
      const token = r.assinatura_token || (await garantirToken(r));
      await enviarLinkAssinaturaCliente(r, signLinkUrl(token));
      toast.success("Link reenviado ao cliente por e-mail.");
    } catch {
      toast.error("Não foi possível reenviar o e-mail.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function anexarAssinado(file: File) {
    if (!r) return;
    if (file.type && file.type !== "application/pdf") return toast.error("O arquivo precisa ser um PDF.");
    if (file.size > 14_000_000) return toast.error("PDF muito grande (máx. 14MB).");
    setAnexando(true);
    try {
      const atualizado = await anexarPdfAssinadoEquipe(r.id, file);
      setR((prev) => (prev ? { ...prev, ...atualizado, fotos: prev.fotos } : atualizado));
      toast.success("PDF assinado anexado.");
    } catch {
      toast.error("Não foi possível anexar o PDF.");
    } finally {
      setAnexando(false);
    }
  }

  async function baixarOficial(path?: string | null) {
    if (!path) return;
    const url = await signedPdfUrl(path);
    if (url) window.open(url, "_blank", "noreferrer");
    else toast.error("Não foi possível abrir o PDF assinado.");
  }

  return (
    <Dialog.Root open={!!id} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex max-h-[90dvh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white shadow-[var(--rdo-shadow)] outline-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--rdo-line)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <img src="/logo-gaiatec-emblema.png" alt="" className="h-6 w-6 object-contain" />
            <Dialog.Title className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--rdo-ink)]">
              Relatório Diário de Obra
            </Dialog.Title>
          </div>
          <Dialog.Close asChild>
            <button aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--rdo-ink-3)] transition-colors hover:bg-[var(--rdo-bg-2)]">
              <X size={18} />
            </button>
          </Dialog.Close>
        </div>

        {/* Body */}
        <div className="rdo-scroll flex-1 overflow-y-auto px-6 py-5">
          {loading || !r ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="rdo-spin text-[var(--rdo-blue)]" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold tracking-wide text-[var(--rdo-ink-3)]">{r.contrato || "—"}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {(r.status === "finalizado" || r.assinatura_status !== "nao_assinado") && (
                    <AssinaturaBadge status={r.assinatura_status} />
                  )}
                </div>
              </div>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-[var(--rdo-ink)]">
                {r.cliente || "Sem cliente"}
              </h2>

              {(r.cnpj || r.razao_social || r.nome_fantasia || r.endereco_cliente) && (
                <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {r.cnpj && <Field label="CNPJ" value={r.cnpj} />}
                  {r.razao_social && <Field label="Razão Social" value={r.razao_social} />}
                  {r.nome_fantasia && <Field label="Nome Fantasia" value={r.nome_fantasia} />}
                  {r.endereco_cliente && <Field label="Endereço do Cliente" value={r.endereco_cliente} />}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <Field label="Engenheiro Gaiatec Sistemas" value={r.eng_gaiatec} />
                {r.crea && <Field label="CREA (Gaiatec)" value={r.crea} />}
                <Field label="Engenheiro do Cliente" value={r.eng_cliente} />
                {r.crea_cliente && <Field label="CREA (Cliente)" value={r.crea_cliente} />}
                {r.email_cliente && <Field label="E-mail do Cliente" value={r.email_cliente} />}
                <Field label="Início" value={r.periodo_inicio ? formatDateTime(r.periodo_inicio) : null} />
                <Field label="Término" value={r.periodo_fim ? formatDateTime(r.periodo_fim) : null} />
              </div>

              {(local || (r.local_lat != null && r.local_lng != null)) && (
                <div className="mt-5 border-t border-[var(--rdo-line)] pt-5">
                  <Field
                    label="Localização da obra"
                    value={local || `${r.local_lat?.toFixed(6)}, ${r.local_lng?.toFixed(6)}`}
                  />
                  {local && r.local_lat != null && r.local_lng != null && (
                    <p className="mt-1 text-[12px] text-[var(--rdo-ghost)]">
                      GPS: {r.local_lat.toFixed(6)}, {r.local_lng.toFixed(6)}
                    </p>
                  )}
                  <LocationMaps endereco={r.local_endereco} numero={r.local_numero} lat={r.local_lat} lng={r.local_lng} />
                </div>
              )}

              {r.comentarios?.trim() && (
                <div className="mt-5 border-t border-[var(--rdo-line)] pt-5">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                    Comentários e observações
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--rdo-ink-2)]">{r.comentarios}</p>
                </div>
              )}

              {fotos.length > 0 && (
                <div className="mt-5 border-t border-[var(--rdo-line)] pt-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                    Registro fotográfico ({fotos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {fotos.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)]">
                        <img src={f.url} alt="" className="h-full w-full object-cover transition-transform hover:scale-105" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Assinaturas */}
              {temAssinaturas && (
                <div className="mt-5 border-t border-[var(--rdo-line)] pt-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                    Assinaturas
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AssinaturaView
                      img={r.assinatura_gaiatec}
                      nome={r.assinatura_gaiatec_nome || r.eng_gaiatec}
                      papel="Responsável Gaiatec Sistemas"
                      em={r.assinatura_gaiatec_em}
                      metodo={r.assinatura_gaiatec_metodo}
                      onDownloadOficial={r.assinatura_gaiatec_pdf_path ? () => baixarOficial(r.assinatura_gaiatec_pdf_path) : undefined}
                    />
                    <AssinaturaView
                      img={r.assinatura_cliente}
                      nome={r.assinatura_cliente_nome || r.eng_cliente}
                      papel="Responsável do Cliente"
                      em={r.assinatura_cliente_em}
                      aguardando={r.assinatura_status === "aguardando_cliente"}
                      metodo={r.assinatura_cliente_metodo}
                      onDownloadOficial={r.assinatura_cliente_pdf_path ? () => baixarOficial(r.assinatura_cliente_pdf_path) : undefined}
                    />
                  </div>
                </div>
              )}

              <p className="mt-6 text-[11px] text-[var(--rdo-ghost)]">
                {STATUS_LABEL[r.status]} · atualizado em {formatDateTime(r.updated_at)}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {r && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rdo-line)] px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              {r.assinatura_status === "aguardando_cliente" && (
                <>
                  <button
                    onClick={copiarLink}
                    disabled={linkBusy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[12.5px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55"
                  >
                    <Copy size={14} /> Copiar link
                  </button>
                  <button
                    onClick={reenviar}
                    disabled={linkBusy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[12.5px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55"
                  >
                    {linkBusy ? <Loader2 size={14} className="rdo-spin" /> : <Send size={14} />} Reenviar ao cliente
                  </button>
                </>
              )}
              {r.status === "finalizado" && r.assinatura_status === "nao_assinado" && (
                <button
                  onClick={() => onEdit(r.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--rdo-blue)] transition-colors hover:bg-[var(--rdo-blue)]/10"
                >
                  <PenLine size={14} /> Assinar
                </button>
              )}
              {/* Equipe anexa um PDF assinado por fora (gov.br, certificado, etc.) */}
              {r.status !== "arquivado" && (
                <>
                  <input
                    ref={anexoRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) anexarAssinado(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => anexoRef.current?.click()}
                    disabled={anexando}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[12.5px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55"
                  >
                    {anexando ? <Loader2 size={14} className="rdo-spin" /> : <Upload size={14} />} Anexar PDF assinado
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(r.id)}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--rdo-line)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)]"
              >
                <PenLine size={15} /> Editar
              </button>
              <button
                onClick={() => onDownload(r)}
                disabled={busyDownload}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--rdo-blue)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
              >
                {busyDownload ? <Loader2 size={15} className="rdo-spin" /> : <Download size={15} />}
                Baixar PDF
              </button>
            </div>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)]">{label}</p>
      <p className="text-[15px] text-[var(--rdo-ink)]">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

function AssinaturaView({
  img,
  nome,
  papel,
  em,
  aguardando,
  metodo,
  onDownloadOficial,
}: {
  img?: string | null;
  nome?: string | null;
  papel: string;
  em?: string | null;
  aguardando?: boolean;
  metodo?: "desenho" | "importado" | null;
  onDownloadOficial?: () => void;
}) {
  const importado = metodo === "importado";
  return (
    <div className="rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)] p-3">
      <div className="flex h-16 items-center justify-center overflow-hidden rounded bg-white">
        {importado ? (
          <div className="flex flex-col items-center gap-1 text-[#1a7f43]">
            <FileCheck2 size={20} />
            <span className="text-[10.5px] font-medium">Documento assinado externamente</span>
          </div>
        ) : img ? (
          <img src={img} alt={`Assinatura ${papel}`} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[11.5px] text-[var(--rdo-ghost)]">{aguardando ? "Aguardando assinatura" : "—"}</span>
        )}
      </div>
      <p className="mt-2 text-[13px] font-semibold text-[var(--rdo-ink)]">{nome || "—"}</p>
      <p className="text-[11px] text-[var(--rdo-ink-3)]">{papel}</p>
      {(img || importado) && em && <p className="mt-0.5 text-[11px] text-[var(--rdo-ghost)]">Assinado em {formatDateTime(em)}</p>}
      {importado && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {onDownloadOficial && (
            <button onClick={onDownloadOficial} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--rdo-blue)] hover:text-[var(--rdo-blue-strong)]">
              <Download size={12} /> Baixar PDF assinado
            </button>
          )}
          <a href="https://validar.iti.br" target="_blank" rel="noreferrer" className="text-[11px] text-[var(--rdo-ghost)] underline">
            validar.iti.br
          </a>
        </div>
      )}
    </div>
  );
}
