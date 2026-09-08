import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import AdminDamPage from "./AdminDamPage";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import { damCommand, mediaCommand } from "../api/cms-api";
import {
  uploadMediaPackage,
  validateOriginalMediaFile,
  type MediaUploadDescriptor,
  type MediaUploadSlot,
} from "../media-upload-model";
import { createResponsiveMediaPackage } from "../responsive-media";
import {
  AdminAlert,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FieldGroup,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  RecordDrawer,
  SectionCard,
  StatePanel,
} from "../components/AdminUI";
import { operatorErrorMessage } from "../operator-error-message";
import { useSafeRasterPreview } from "../hooks/useSafeRasterPreview";

type Media = {
  id: string;
  original_filename: string;
  processing_status: string;
  scan_status: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  source_kind: string;
  license_name: string;
  owner_name: string;
  archived_at: string | null;
  preview_url?: string | null;
};

type MediaUsage = {
  item_id: string;
  revision_id: string | null;
  block_id: string | null;
  usage_kind: string;
  created_at: string;
  content_type: string;
  display_title: string;
  admin_path: string;
  block_label: string | null;
};

function usageLabel(kind: string) {
  return (
    {
      content: "Conteúdo editorial",
      draft: "Rascunho editorial",
      revision: "Revisão editorial",
      block: "Bloco de página",
      product: "Produto",
    }[kind] ?? "Conteúdo vinculado"
  );
}

function processingStatusLabel(status?: string | null) {
  return (
    {
      awaiting_upload: "Aguardando envio",
      processing: "Em processamento",
      ready: "Pronta para uso",
      rejected: "Rejeitada",
      failed: "Falha no processamento",
      replaced: "Substituída",
    }[status ?? ""] ?? "Estado indisponível"
  );
}

function scanStatusLabel(status?: string | null) {
  return (
    {
      pending: "Verificação pendente",
      clean: "Arquivo aprovado",
      rejected: "Arquivo rejeitado",
      failed: "Não foi possível verificar",
    }[status ?? ""] ?? "Verificação indisponível"
  );
}

function sourceKindLabel(source?: string | null) {
  return (
    {
      synthetic_test: "Teste sintético",
      owner_authored: "Autoria da GAIATEC",
      official_manufacturer: "Fabricante oficial",
      official_company: "Empresa oficial",
    }[source ?? ""] ?? "Origem não informada"
  );
}

type UploadForm = {
  sourceKind: "synthetic_test" | "owner_authored" | "official_manufacturer" | "official_company";
  sourceReference: string;
  licenseName: string;
  ownerName: string;
  altText: string;
  caption: string;
  credit: string;
  focalX: number;
  focalY: number;
  rightsConfirmed: boolean;
};

const initialUploadForm: UploadForm = {
  sourceKind: "owner_authored",
  sourceReference: "",
  licenseName: "Uso autorizado pela GAIATEC",
  ownerName: "GAIATEC SISTEMAS",
  altText: "",
  caption: "",
  credit: "",
  focalX: 0.5,
  focalY: 0.5,
  rightsConfirmed: false,
};

function mediaCommandEnvelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: cmsEnvironment(), siteKey: "main" as const },
  };
}

export default function AdminMediaPage() {
  const { profile } = useAdminAuth();
  return isEv2FeatureEnabled(profile, "ev2.dam") ? <AdminDamPage /> : <LegacyMediaPage />;
}

function LegacyMediaPage() {
  const { session, profile } = useAdminAuth();
  const [items, setItems] = useState<Media[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState("");
  const uploadAbortController = useRef<AbortController | null>(null);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [files, setFiles] = useState<Partial<Record<MediaUploadSlot, File>>>({});
  const [usages, setUsages] = useState<{
    asset: Media;
    rows: MediaUsage[];
    totalUsageCount: number;
    hiddenUsageCount: number;
  } | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Media | null>(null);
  const pageSize = 20;
  const canUpload = profile?.permissions.includes("cms:media.upload") ?? false;
  const canManage = profile?.permissions.includes("cms:media.manage") ?? false;

  const load = useCallback(
    async (requestedQuery: string, requestedPage: number, requestedIncludeArchived: boolean) => {
      if (!session) return;
      setLoading(true);
      try {
        const result = await mediaCommand<{ items: Media[]; total: number }>(session, {
          action: "list",
          query: requestedQuery,
          includeArchived: requestedIncludeArchived,
          page: requestedPage,
          pageSize,
        });
        setItems(result.items);
        setTotal(result.total);
        setLoadError("");
      } catch (caught) {
        setLoadError(operatorErrorMessage(caught, { fallback: "Não foi possível carregar a mídia." }));
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load("", 1, false);
  }, [load]);

  const originalPreview = useSafeRasterPreview(files.original);

  function chooseOriginal(file?: File) {
    setFiles(file ? { original: file } : {});
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setError("");
    setSuccess("");
    const fileIssues = validateOriginalMediaFile(files.original);
    if (!uploadForm.rightsConfirmed) fileIssues.push("Confirme os direitos de uso.");
    if (uploadForm.sourceReference.trim().length < 3) fileIssues.push("Informe a referência da origem.");
    if (uploadForm.ownerName.trim().length < 2) fileIssues.push("Informe o proprietário.");
    if (uploadForm.licenseName.trim().length < 2) fileIssues.push("Informe a licença.");
    if (!uploadForm.altText.trim()) fileIssues.push("Informe o texto alternativo.");
    if (fileIssues.length) {
      setError(fileIssues[0]);
      return;
    }
    const original = files.original!;
    let reservedAssetId: string | null = null;
    let uploadFinalized = false;
    let finalizeAttempted = false;
    const operation = new AbortController();
    uploadAbortController.current = operation;
    const applyFinalizedUpload = async (finalized: { width: number; height: number }) => {
      uploadFinalized = true;
      reservedAssetId = null;
      setSuccess(
        `Mídia pronta (${finalized.width} × ${finalized.height}) com versões para diferentes telas verificadas.`,
      );
      setFiles({});
      setUploadForm(initialUploadForm);
      setPage(1);
      await load(query, 1, includeArchived);
    };
    setBusy(true);
    try {
      setPreparationMessage("Preparando as versões para diferentes telas…");
      const responsiveFiles = await createResponsiveMediaPackage(original, {
        onProgress: (progress) => setPreparationMessage(`${progress.message}…`),
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      const reservation = await mediaCommand<{
        assetId: string;
        uploads: MediaUploadDescriptor[];
      }>(session, {
        action: "create",
        metadata: {
          originalFilename: original.name,
          declaredMime: original.type,
          sourceKind: uploadForm.sourceKind,
          sourceReference: uploadForm.sourceReference,
          rightsConfirmed: true,
          licenseName: uploadForm.licenseName,
          ownerName: uploadForm.ownerName,
          altText: uploadForm.altText,
          caption: uploadForm.caption || null,
          credit: uploadForm.credit || null,
          focalX: uploadForm.focalX,
          focalY: uploadForm.focalY,
        },
      });
      reservedAssetId = reservation.assetId;
      operation.signal.throwIfAborted();
      setPreparationMessage("Enviando as imagens com segurança…");
      await uploadMediaPackage(reservation.uploads, responsiveFiles, undefined, {
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      finalizeAttempted = true;
      const finalized = await mediaCommand<{ status: string; width: number; height: number }>(session, {
        action: "finalize",
        assetId: reservation.assetId,
      });
      await applyFinalizedUpload(finalized);
    } catch (caught) {
      if (reservedAssetId && finalizeAttempted) {
        try {
          const reconciled = await mediaCommand<{ status: string; width: number; height: number }>(session, {
            action: "finalize",
            assetId: reservedAssetId,
          });
          if (reconciled.status === "ready") {
            await applyFinalizedUpload(reconciled);
            return;
          }
        } catch {
          // A reservation not proven ready is compensated below.
        }
      }
      if (reservedAssetId && !uploadFinalized) {
        const abortEnvelope = mediaCommandEnvelope();
        try {
          await damCommand(
            session,
            {
              action: "abort_upload",
              assetId: reservedAssetId,
              reasonCode: operation.signal.aborted ? "client_cancelled" : "client_upload_failed",
              envelope: abortEnvelope,
            },
            abortEnvelope.commandId,
          );
        } catch {
          // A compensação é best-effort; o erro original continua sendo a orientação principal.
        }
      }
      setError(
        operation.signal.aborted
          ? "Envio cancelado. A reserva temporária foi encaminhada para limpeza segura."
          : operatorErrorMessage(caught, { fallback: "Não foi possível concluir o envio." }),
      );
    } finally {
      if (uploadAbortController.current === operation) uploadAbortController.current = null;
      setPreparationMessage("");
      setBusy(false);
    }
  }

  async function inspectUsages(asset: Media) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await mediaCommand<{
        usages: MediaUsage[];
        totalUsageCount: number;
        hiddenUsageCount: number;
      }>(session, {
        action: "usages",
        assetId: asset.id,
      });
      setUsages({
        asset,
        rows: result.usages,
        totalUsageCount: result.totalUsageCount,
        hiddenUsageCount: result.hiddenUsageCount,
      });
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível consultar os usos." }));
    } finally {
      setBusy(false);
    }
  }

  async function archiveMedia() {
    if (!session || !archiveCandidate || busy) return;
    const asset = archiveCandidate;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await mediaCommand(session, { action: "delete", assetId: asset.id });
      setArchiveCandidate(null);
      setSelected((current) => (current?.id === asset.id ? null : current));
      setUsages((current) => (current?.asset.id === asset.id ? null : current));
      setSuccess("Mídia arquivada com retenção e auditoria preservadas.");
      await load(query, page, includeArchived);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível arquivar a mídia." }));
    } finally {
      setBusy(false);
    }
  }

  async function restoreMedia(asset: Media) {
    if (!session || busy || !asset.archived_at) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await mediaCommand(session, { action: "restore", assetId: asset.id });
      setSelected((current) => (current?.id === asset.id ? null : current));
      setUsages((current) => (current?.asset.id === asset.id ? null : current));
      setSuccess("Mídia restaurada; a limpeza agendada foi cancelada.");
      await load(query, page, includeArchived);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível restaurar a mídia." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="BIBLIOTECA PRIVADA"
        title="Mídia"
        description="Envie e organize imagens autorizadas, seus direitos e os locais onde são usadas."
      />

      {canUpload ? (
        <SectionCard
          title="Enviar imagem"
          description="Selecione uma imagem original. O CMS prepara automaticamente versões otimizadas para celulares, tablets e telas grandes."
        >
          <form className="admin-form" onSubmit={submitUpload}>
            <FieldGroup
              legend="Arquivos"
              description="Use PNG, JPEG, WebP ou AVIF com até 20 MB. A imagem nunca será ampliada além do tamanho original."
              disabled={busy}
            >
              <label>
                Imagem original
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  required
                  onChange={(event) => chooseOriginal(event.target.files?.[0])}
                />
              </label>
              {originalPreview.loading && <p className="admin-help">Preparando prévia segura…</p>}
              {originalPreview.error && (
                <p className="admin-field-error" role="alert">
                  {originalPreview.error}
                </p>
              )}
              {originalPreview.url && (
                <figure className="admin-media-upload-preview">
                  <img src={originalPreview.url} alt="Prévia local segura da imagem selecionada" />
                  <figcaption>Prévia local; o arquivo ainda não foi enviado.</figcaption>
                </figure>
              )}
            </FieldGroup>

            <FieldGroup legend="Origem, direitos e acessibilidade" disabled={busy}>
              <label>
                Tipo de origem
                <select
                  value={uploadForm.sourceKind}
                  onChange={(event) =>
                    setUploadForm((current) => ({
                      ...current,
                      sourceKind: event.target.value as UploadForm["sourceKind"],
                    }))
                  }
                >
                  <option value="owner_authored">Autoria da GAIATEC</option>
                  <option value="official_manufacturer">Fabricante oficial</option>
                  <option value="official_company">Empresa oficial</option>
                  <option value="synthetic_test">Teste sintético</option>
                </select>
              </label>
              <label>
                Referência da origem
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={uploadForm.sourceReference}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, sourceReference: event.target.value }))
                  }
                />
              </label>
              <label>
                Proprietário
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={uploadForm.ownerName}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, ownerName: event.target.value }))
                  }
                />
              </label>
              <label>
                Licença
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={uploadForm.licenseName}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, licenseName: event.target.value }))
                  }
                />
              </label>
              <label>
                Texto alternativo
                <textarea
                  required
                  maxLength={300}
                  value={uploadForm.altText}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, altText: event.target.value }))
                  }
                />
              </label>
              <label>
                Legenda opcional
                <textarea
                  maxLength={500}
                  value={uploadForm.caption}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, caption: event.target.value }))
                  }
                />
              </label>
              <label>
                Crédito opcional
                <input
                  maxLength={200}
                  value={uploadForm.credit}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, credit: event.target.value }))
                  }
                />
              </label>
              <label>
                Foco horizontal ({uploadForm.focalX.toFixed(2)})
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={uploadForm.focalX}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, focalX: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Foco vertical ({uploadForm.focalY.toFixed(2)})
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={uploadForm.focalY}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, focalY: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="admin-checkbox-row">
                <input
                  type="checkbox"
                  required
                  checked={uploadForm.rightsConfirmed}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, rightsConfirmed: event.target.checked }))
                  }
                />
                Confirmo a origem e os direitos de uso destes arquivos
              </label>
            </FieldGroup>
            <button
              className="admin-button"
              type="submit"
              disabled={busy || originalPreview.loading || Boolean(originalPreview.error)}
            >
              {busy ? preparationMessage || "Preparando imagem…" : "Enviar imagem"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={() =>
                  uploadAbortController.current?.abort(
                    new DOMException("Envio cancelado pelo operador.", "AbortError"),
                  )
                }
              >
                Cancelar envio em andamento
              </button>
            )}
            {preparationMessage && (
              <p className="admin-help" role="status" aria-live="polite">
                {preparationMessage}
              </p>
            )}
          </form>
        </SectionCard>
      ) : (
        <StatePanel
          kind="forbidden"
          title="Upload não permitido"
          description="Seu papel possui somente leitura da biblioteca."
        />
      )}

      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {loadError && items.length > 0 && (
        <AdminAlert tone="warning">
          {loadError} Os arquivos exibidos são da última consulta concluída com sucesso.
        </AdminAlert>
      )}

      <FilterBar summary={`${total} arquivo${total === 1 ? "" : "s"}`}>
        <label>
          Buscar arquivo
          <input
            value={query}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={includeArchived}
            disabled={loading || busy}
            onChange={(event) => {
              const next = event.target.checked;
              setIncludeArchived(next);
              setPage(1);
              setUsages(null);
              setSelected(null);
              void load(query, 1, next);
            }}
          />
          Incluir arquivadas
        </label>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load(query, 1, includeArchived);
          }}
          disabled={loading || busy}
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPage(1);
            void load("", 1, includeArchived);
          }}
          disabled={loading || busy || !query}
        >
          Limpar filtro
        </button>
      </FilterBar>

      {loading ? (
        <LoadingSkeleton label="Carregando mídia" rows={4} />
      ) : loadError && items.length === 0 ? (
        <ErrorState title="Biblioteca indisponível" description={loadError} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Biblioteca vazia"
          description="Nenhuma mídia corresponde aos filtros atuais. Limpe a busca ou envie um pacote autorizado."
        />
      ) : (
        <div className="admin-media-grid">
          {items.map((item) => (
            <article key={item.id}>
              {item.preview_url && <img src={item.preview_url} alt={item.alt_text} loading="lazy" />}
              <h2>{item.original_filename}</h2>
              <p>{item.alt_text}</p>
              <dl>
                <dt>Status</dt>
                <dd>
                  {item.archived_at
                    ? "Arquivada com retenção"
                    : processingStatusLabel(item.processing_status)}
                </dd>
                <dt>Verificação</dt>
                <dd>{scanStatusLabel(item.scan_status)}</dd>
                <dt>Dimensões</dt>
                <dd>{item.width && item.height ? `${item.width} × ${item.height}` : "aguardando"}</dd>
                <dt>Origem</dt>
                <dd>{sourceKindLabel(item.source_kind)}</dd>
                <dt>Direitos</dt>
                <dd>
                  {item.owner_name} · {item.license_name}
                </dd>
              </dl>
              <div className="admin-actions">
                <button
                  type="button"
                  aria-label={`Abrir detalhes de ${item.original_filename}`}
                  disabled={busy}
                  onClick={() => setSelected(item)}
                >
                  Abrir
                </button>
                {canManage &&
                  !item.archived_at &&
                  item.processing_status === "ready" &&
                  item.scan_status === "clean" && (
                    <button
                      type="button"
                      aria-label={`Arquivar ${item.original_filename}`}
                      disabled={busy || usages?.asset.id !== item.id || (usages?.totalUsageCount ?? 0) > 0}
                      onClick={() => setArchiveCandidate(item)}
                      title={
                        usages?.asset.id !== item.id
                          ? "Consulte os usos antes de arquivar."
                          : usages.totalUsageCount > 0
                            ? "Remova os vínculos antes de arquivar."
                            : "Arquivar com retenção e possibilidade de restauração no DAM."
                      }
                    >
                      Arquivar
                    </button>
                  )}
                {canManage &&
                  item.archived_at &&
                  item.processing_status === "ready" &&
                  item.scan_status === "clean" && (
                    <button
                      type="button"
                      aria-label={`Restaurar ${item.original_filename}`}
                      disabled={busy}
                      onClick={() => void restoreMedia(item)}
                    >
                      Restaurar
                    </button>
                  )}
                <button
                  type="button"
                  aria-label={`Consultar usos de ${item.original_filename}`}
                  onClick={() => void inspectUsages(item)}
                  disabled={busy}
                >
                  Consultar usos
                </button>
              </div>
              {usages?.asset.id === item.id && (
                <div className="admin-media-usages" role="status">
                  <strong>
                    {usages.totalUsageCount} uso{usages.totalUsageCount === 1 ? "" : "s"}
                  </strong>
                  {usages.totalUsageCount === 0 ? (
                    <p>Esta mídia não está vinculada a conteúdo.</p>
                  ) : (
                    <>
                      {usages.hiddenUsageCount > 0 && (
                        <p>
                          {usages.hiddenUsageCount} vínculo(s) adicional(is) existe(m) em conteúdo fora do seu
                          escopo de leitura. O arquivamento permanece bloqueado.
                        </p>
                      )}
                      <ul>
                        {usages.rows.map((usage) => (
                          <li key={`${usage.revision_id}-${usage.block_id}-${usage.usage_kind}`}>
                            <Link to={usage.admin_path}>{usage.display_title}</Link> ·{" "}
                            {usageLabel(usage.usage_kind)} ·{" "}
                            {usage.revision_id ? "revisão registrada" : "versão atual"}
                            {usage.block_label ? ` · ${usage.block_label}` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <nav className="admin-pagination" aria-label="Paginação da biblioteca">
        <button
          type="button"
          disabled={loading || busy || page === 1}
          onClick={() => {
            const previous = page - 1;
            setPage(previous);
            void load(query, previous, includeArchived);
          }}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          type="button"
          disabled={loading || busy || page * pageSize >= total}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void load(query, next, includeArchived);
          }}
        >
          Próxima página
        </button>
      </nav>

      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="MÍDIA"
        title={selected?.original_filename ?? "Arquivo"}
        status={
          <span className="admin-status">
            {selected?.archived_at
              ? "Arquivada com retenção"
              : processingStatusLabel(selected?.processing_status)}
          </span>
        }
        fields={
          selected
            ? [
                {
                  label: "Tipo",
                  value: selected.original_filename.split(".").pop()?.toUpperCase() ?? "Arquivo",
                },
                {
                  label: "Dimensões",
                  value:
                    selected.width && selected.height
                      ? `${selected.width} × ${selected.height}`
                      : "Aguardando",
                },
                { label: "Direitos", value: `${selected.owner_name} · ${selected.license_name}` },
                { label: "Verificação", value: scanStatusLabel(selected.scan_status) },
                { label: "Origem", value: sourceKindLabel(selected.source_kind) },
              ]
            : undefined
        }
        summary={selected?.alt_text || "Sem texto alternativo."}
        primary={
          selected && (
            <button
              type="button"
              aria-label={`Consultar usos no painel de ${selected.original_filename}`}
              disabled={busy}
              onClick={() => void inspectUsages(selected)}
            >
              Consultar usos
            </button>
          )
        }
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        {selected && usages?.asset.id === selected.id && (
          <section className="admin-record-drawer__summary">
            <h3>Usos registrados</h3>
            <p>
              {usages.totalUsageCount
                ? `${usages.totalUsageCount} vínculo(s) registrado(s), ${usages.rows.length} visível(is) neste escopo.`
                : "Nenhum uso registrado."}
            </p>
          </section>
        )}
      </RecordDrawer>
      <ConfirmDialog
        open={Boolean(archiveCandidate)}
        title="Arquivar mídia?"
        description="A mídia sairá da biblioteca ativa, mas permanecerá retida e auditável antes da limpeza definitiva."
        confirmLabel="Arquivar mídia"
        confirmDisabled={busy}
        onCancel={() => {
          if (!busy) setArchiveCandidate(null);
        }}
        onConfirm={() => void archiveMedia()}
      />
    </section>
  );
}
