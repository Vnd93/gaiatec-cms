import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { EmptyState } from "../components/EmptyState";
import { RelatorioCard } from "../components/RelatorioCard";
import { SearchInput } from "../components/SearchInput";
import { getRelatorio, listRelatorios, setStatus } from "../lib/relatorios";
import { filtrarTexto } from "../lib/filter";
import type { Relatorio } from "../lib/types";

export default function RelatoriosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setItems(await listRelatorios("ativos"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => filtrarTexto(items, q), [items, q]);

  async function handleDownload(r: Relatorio) {
    setDownloadingId(r.id);
    try {
      const [{ downloadRelatorioPdf }, full] = await Promise.all([
        import("../lib/pdf"),
        getRelatorio(r.id),
      ]);
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

  return (
    <AppShell>
      <Toaster position="top-center" />

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
            {items.length} {items.length === 1 ? "relatório" : "relatórios"}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)] sm:text-[38px]">
            Relatórios de Obra
          </h1>
        </div>
        <button
          onClick={() => navigate("/relatorio-de-obra/novo")}
          className="shrink-0 bg-[var(--rdo-orange)] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)]"
        >
          Novo relatório
        </button>
      </div>

      <div className="mt-8">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente, contrato ou engenheiro" />
      </div>

      <div className="mt-2">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            kicker="Comece aqui"
            title="Nenhum relatório ainda"
            subtitle="Crie o primeiro relatório diário de obra da equipe."
            action={
              <button
                onClick={() => navigate("/relatorio-de-obra/novo")}
                className="bg-[var(--rdo-orange)] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)]"
              >
                Novo relatório
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum resultado" subtitle="Ajuste a busca e tente novamente." />
        ) : (
          <div className="border-t border-[var(--rdo-line)]">
            {filtered.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.25), ease: [0.16, 1, 0.3, 1] }}
              >
                <RelatorioCard
                  relatorio={r}
                  busyDownload={downloadingId === r.id}
                  onOpen={() => navigate(`/relatorio-de-obra/relatorio/${r.id}`)}
                  onDownload={r.status === "finalizado" ? () => handleDownload(r) : undefined}
                  onArchive={() => handleArchive(r)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Loading() {
  return (
    <div className="flex justify-center border-t border-[var(--rdo-line)] py-20">
      <span className="rdo-spin h-6 w-6 rounded-full border-2 border-[var(--rdo-line-strong)] border-t-[var(--rdo-orange)]" />
    </div>
  );
}
