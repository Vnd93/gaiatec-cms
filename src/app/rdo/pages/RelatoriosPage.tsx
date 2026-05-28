import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "motion/react";
import { LayoutGrid, List as ListIcon, Loader2, Plus } from "lucide-react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { EmptyState } from "../components/EmptyState";
import { RelatorioCard } from "../components/RelatorioCard";
import { RelatorioPreview } from "../components/RelatorioPreview";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { getRelatorio, listRelatorios, setStatus } from "../lib/relatorios";
import { filtrarTexto } from "../lib/filter";
import { formatDate } from "../lib/format";
import type { Relatorio, RdoStatus } from "../lib/types";

type View = "lista" | "kanban";
const KANBAN: { status: RdoStatus; label: string }[] = [
  { status: "rascunho", label: "Rascunho" },
  { status: "finalizado", label: "Finalizado" },
];

export default function RelatoriosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("rdo_view") === "kanban" ? "kanban" : "lista",
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<RdoStatus | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autor = searchParams.get("autor");
  const autorEmail = searchParams.get("e");

  async function load() {
    setLoading(true);
    setItems(await listRelatorios("ativos"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function changeView(v: View) {
    setView(v);
    localStorage.setItem("rdo_view", v);
  }

  const filtered = useMemo(() => {
    const base = autor ? items.filter((r) => r.created_by === autor) : items;
    return filtrarTexto(base, q);
  }, [items, q, autor]);

  async function handleDownload(r: Relatorio) {
    setDownloadingId(r.id);
    try {
      const [{ downloadRelatorioPdf }, full] = await Promise.all([import("../lib/pdf"), getRelatorio(r.id)]);
      await downloadRelatorioPdf(full ?? r);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleArchive(r: Relatorio) {
    try {
      await setStatus(r.id, "arquivado");
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Relatório arquivado.");
    } catch {
      toast.error("Não foi possível arquivar.");
    }
  }

  async function moveStatus(r: Relatorio, status: RdoStatus) {
    if (r.status === status) return;
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      await setStatus(r.id, status);
      toast.success(status === "finalizado" ? "Relatório finalizado." : "Movido para rascunho.");
    } catch {
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
      toast.error("Não foi possível mover.");
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

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
            {items.length} {items.length === 1 ? "relatório" : "relatórios"}
          </p>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)] sm:text-[32px]">
            Relatórios de Obra
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <ViewToggle view={view} onChange={changeView} />
          <button
            onClick={() => navigate("/relatorio-de-obra/novo")}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--rdo-blue)] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[var(--rdo-shadow-sm)] transition-colors hover:bg-[var(--rdo-blue-strong)]"
          >
            <Plus size={16} strokeWidth={2.4} /> Novo relatório
          </button>
        </div>
      </div>

      <div className="mt-6 max-w-md">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente, contrato ou engenheiro" />
      </div>

      {autor && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--rdo-blue-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--rdo-blue)]">
          <span>Relatórios de {autorEmail || "usuário selecionado"}</span>
          <button onClick={() => setSearchParams({})} className="text-[var(--rdo-blue-strong)] hover:underline">
            limpar ✕
          </button>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={26} className="rdo-spin text-[var(--rdo-blue)]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            kicker="Comece aqui"
            title="Nenhum relatório ainda"
            subtitle="Crie o primeiro relatório diário de obra da equipe."
            action={
              <button
                onClick={() => navigate("/relatorio-de-obra/novo")}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--rdo-blue)] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)]"
              >
                <Plus size={16} strokeWidth={2.4} /> Novo relatório
              </button>
            }
          />
        ) : view === "lista" ? (
          <div className="overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white">
            {filtered.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-[var(--rdo-ink-3)]">Nenhum resultado para a busca.</p>
            ) : (
              filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.025, 0.2), ease: [0.16, 1, 0.3, 1] }}
                >
                  <RelatorioCard
                    relatorio={r}
                    busyDownload={downloadingId === r.id}
                    onOpen={() => setPreviewId(r.id)}
                    onDownload={r.status === "finalizado" ? () => handleDownload(r) : undefined}
                    onArchive={() => handleArchive(r)}
                  />
                </motion.div>
              ))
            )}
          </div>
        ) : (
          /* Kanban */
          <div className="rdo-scroll flex gap-4 overflow-x-auto pb-2">
            {KANBAN.map((col) => {
              const cards = filtered.filter((r) => r.status === col.status);
              return (
                <div
                  key={col.status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(col.status);
                  }}
                  onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    const r = items.find((x) => x.id === id);
                    if (r) moveStatus(r, col.status);
                  }}
                  className={`flex w-[300px] shrink-0 flex-col rounded-xl border bg-[var(--rdo-bg-2)] transition-colors ${
                    dragOver === col.status ? "border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)]" : "border-[var(--rdo-line)]"
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <StatusBadge status={col.status} />
                    <span className="text-[12px] font-semibold text-[var(--rdo-ink-3)]">{cards.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 px-3 pb-3">
                    {cards.length === 0 ? (
                      <p className="px-1 py-6 text-center text-[12px] text-[var(--rdo-ghost)]">Arraste relatórios para cá</p>
                    ) : (
                      cards.map((r) => (
                        <KanbanCard
                          key={r.id}
                          r={r}
                          onOpen={() => setPreviewId(r.id)}
                          onDownload={r.status === "finalizado" ? () => handleDownload(r) : undefined}
                          busyDownload={downloadingId === r.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--rdo-line)] bg-white p-0.5">
      {[
        { v: "lista" as View, icon: <ListIcon size={16} />, label: "Lista" },
        { v: "kanban" as View, icon: <LayoutGrid size={16} />, label: "Kanban" },
      ].map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          title={o.label}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
            view === o.v ? "bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]" : "text-[var(--rdo-ink-3)] hover:text-[var(--rdo-ink)]"
          }`}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function KanbanCard({
  r,
  onOpen,
  onDownload,
  busyDownload,
}: {
  r: Relatorio;
  onOpen: () => void;
  onDownload?: () => void;
  busyDownload?: boolean;
}) {
  const eng = [r.eng_gaiatec, r.eng_cliente].filter(Boolean).join(" · ");
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
      onClick={onOpen}
      className="cursor-pointer rounded-lg border border-[var(--rdo-line)] bg-white p-3 shadow-[var(--rdo-shadow-sm)] transition-colors hover:border-[var(--rdo-line-strong)]"
    >
      <span className="text-[10.5px] font-semibold tracking-wide text-[var(--rdo-ink-3)]">{r.contrato || "—"}</span>
      <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--rdo-ink)]">{r.cliente || "Sem cliente"}</p>
      {eng && <p className="mt-0.5 truncate text-[12px] text-[var(--rdo-ink-3)]">{eng}</p>}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-[var(--rdo-ghost)]">{formatDate(r.updated_at)}</span>
        {onDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            disabled={busyDownload}
            className="text-[11px] font-semibold text-[var(--rdo-blue)] transition-colors hover:text-[var(--rdo-blue-strong)] disabled:opacity-55"
          >
            {busyDownload ? "…" : "PDF"}
          </button>
        )}
      </div>
    </div>
  );
}
