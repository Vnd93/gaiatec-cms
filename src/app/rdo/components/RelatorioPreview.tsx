import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Loader2, Pencil, X } from "lucide-react";
import { getRelatorio } from "../lib/relatorios";
import type { Relatorio } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold tracking-wide text-[var(--rdo-ink-3)]">
                  {r.contrato || "—"}
                </span>
                <StatusBadge status={r.status} />
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
                {r.crea && <Field label="CREA" value={r.crea} />}
                <Field label="Engenheiro do Cliente" value={r.eng_cliente} />
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

              <p className="mt-6 text-[11px] text-[var(--rdo-ghost)]">
                {STATUS_LABEL[r.status]} · atualizado em {formatDateTime(r.updated_at)}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {r && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--rdo-line)] px-5 py-3.5">
            <button
              onClick={() => onEdit(r.id)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--rdo-line)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)]"
            >
              <Pencil size={15} /> Editar
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
