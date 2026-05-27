import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { EmptyState } from "../components/EmptyState";
import { RelatorioCard } from "../components/RelatorioCard";
import { RelatorioPreview } from "../components/RelatorioPreview";
import { SearchInput } from "../components/SearchInput";
import { deleteRelatorio, getRelatorio, listRelatorios, setStatus } from "../lib/relatorios";
import { filtrarTexto } from "../lib/filter";
import type { Relatorio } from "../lib/types";

type Periodo = "todos" | "30d" | "90d" | "ano";
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "todos", label: "Todos os períodos" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
];

export default function ArquivoPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setItems(await listRelatorios("arquivados"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => filtrarPeriodo(filtrarTexto(items, q), periodo), [items, q, periodo]);

  async function handleDownload(r: Relatorio) {
    setDownloadingId(r.id);
    try {
      const [{ downloadRelatorioPdf }, full] = await Promise.all([import("../lib/pdf"), getRelatorio(r.id)]);
      await downloadRelatorioPdf(full ?? r);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRestore(r: Relatorio) {
    try {
      await setStatus(r.id, r.finalized_at ? "finalizado" : "rascunho");
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Relatório restaurado.");
    } catch {
      toast.error("Não foi possível restaurar.");
    }
  }

  async function handleDelete(r: Relatorio) {
    if (!confirm(`Excluir definitivamente o relatório de "${r.cliente || "sem cliente"}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteRelatorio(r.id);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Relatório excluído.");
    } catch {
      toast.error("Não foi possível excluir.");
    }
  }

  return (
    <AppShell>
      <Toaster position="top-center" />
      <RelatorioPreview
        id={previewId}
        busyDownload={!!previewId && downloadingId === previewId}
        onClose={() => setPreviewId(null)}
        onEdit={(id) => navigate(`/relatorio-de-obra/relatorio/${id}`)}
        onDownload={handleDownload}
      />

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
          {items.length} {items.length === 1 ? "arquivado" : "arquivados"}
        </p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)] sm:text-[32px]">
          Arquivo de Relatórios
        </h1>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="max-w-md flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente ou contrato" />
        </div>
        <div className="relative">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="w-full appearance-none rounded-md border border-[var(--rdo-line)] bg-white py-2 pl-3 pr-9 text-[13px] font-medium text-[var(--rdo-ink)] outline-none transition-colors focus:border-[var(--rdo-blue)] sm:w-auto"
          >
            {PERIODOS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--rdo-ink-3)]">▾</span>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={26} className="rdo-spin text-[var(--rdo-blue)]" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhum relatório encontrado"
            subtitle={items.length === 0 ? "Relatórios arquivados aparecem aqui." : "Tente ajustar os filtros."}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white">
            {filtered.map((r) => (
              <RelatorioCard
                key={r.id}
                relatorio={r}
                busyDownload={downloadingId === r.id}
                onOpen={() => setPreviewId(r.id)}
                onDownload={() => handleDownload(r)}
                onRestore={() => handleRestore(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function filtrarPeriodo(items: Relatorio[], periodo: Periodo): Relatorio[] {
  if (periodo === "todos") return items;
  const now = new Date();
  const limite = new Date(now);
  if (periodo === "30d") limite.setDate(now.getDate() - 30);
  else if (periodo === "90d") limite.setDate(now.getDate() - 90);
  else if (periodo === "ano") {
    limite.setMonth(0, 1);
    limite.setHours(0, 0, 0, 0);
  }
  return items.filter((r) => new Date(r.updated_at) >= limite);
}
