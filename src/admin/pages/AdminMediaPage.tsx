import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDamPage from "./AdminDamPage";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import { mediaCommand } from "../api/cms-api";
import {
  mediaVariantSlots,
  uploadMediaPackage,
  validateMediaUploadPackage,
  type MediaUploadDescriptor,
  type MediaUploadSlot,
} from "../media-upload-model";
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
  preview_url?: string | null;
};

type MediaUsage = {
  item_id: string;
  revision_id: string;
  block_id: string | null;
  usage_kind: string;
  created_at: string;
};

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
  replacesAssetId: string;
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
  replacesAssetId: "",
};

export default function AdminMediaPage() {
  const { profile } = useAdminAuth();
  return isEv2FeatureEnabled(profile, "ev2.dam") ? <AdminDamPage /> : <LegacyMediaPage />;
}

function LegacyMediaPage() {
  const { session, profile } = useAdminAuth();
  const [items, setItems] = useState<Media[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [files, setFiles] = useState<Partial<Record<MediaUploadSlot, File>>>({});
  const [usages, setUsages] = useState<{ asset: Media; rows: MediaUsage[] } | null>(null);
  const [deleting, setDeleting] = useState<Media | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const pageSize = 20;
  const canUpload = profile?.permissions.includes("cms:media.upload") ?? false;
  const canManage = profile?.permissions.includes("cms:media.manage") ?? false;

  const load = useCallback(
    async (requestedQuery: string, requestedPage: number) => {
      if (!session) return;
      setLoading(true);
      try {
        const result = await mediaCommand<{ items: Media[]; total: number }>(session, {
          action: "list",
          query: requestedQuery,
          page: requestedPage,
          pageSize,
        });
        setItems(result.items);
        setTotal(result.total);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Falha ao carregar mídia.");
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load("", 1);
  }, [load]);

  const originalPreview = useMemo(
    () => (files.original ? URL.createObjectURL(files.original) : ""),
    [files.original],
  );
  useEffect(
    () => () => {
      if (originalPreview) URL.revokeObjectURL(originalPreview);
    },
    [originalPreview],
  );

  function chooseFile(slot: MediaUploadSlot, file?: File) {
    setFiles((current) => {
      const next = { ...current };
      if (file) next[slot] = file;
      else delete next[slot];
      return next;
    });
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setError("");
    setSuccess("");
    const fileIssues = validateMediaUploadPackage(files);
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
    setBusy(true);
    let reservedAssetId = "";
    try {
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
          replacesAssetId: uploadForm.replacesAssetId || null,
        },
      });
      reservedAssetId = reservation.assetId;
      await uploadMediaPackage(reservation.uploads, files);
      const finalized = await mediaCommand<{ status: string; width: number; height: number }>(session, {
        action: "finalize",
        assetId: reservation.assetId,
      });
      setSuccess(`Mídia pronta (${finalized.width} × ${finalized.height}) com variantes validadas.`);
      setFiles({});
      setUploadForm(initialUploadForm);
      setPage(1);
      await load(query, 1);
    } catch (caught) {
      if (reservedAssetId && canManage)
        await mediaCommand(session, { action: "delete", assetId: reservedAssetId }).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir o upload.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectUsages(asset: Media) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await mediaCommand<{ usages: MediaUsage[] }>(session, {
        action: "usages",
        assetId: asset.id,
      });
      setUsages({ asset, rows: result.usages });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível consultar os usos.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!session || !deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await mediaCommand(session, { action: "delete", assetId: deleting.id });
      setSuccess("Mídia excluída da biblioteca privada.");
      setDeleting(null);
      await load(query, page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir a mídia.");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="BIBLIOTECA PRIVADA"
        title="Mídia"
        description="Envie, consulte e governe arquivos autorizados, variantes responsivas, direitos e usos."
      />

      {canUpload ? (
        <SectionCard
          title="Enviar pacote responsivo"
          description="O original e as seis variantes são validados pelo servidor antes de entrar na biblioteca."
        >
          <form className="admin-form" onSubmit={submitUpload}>
            <FieldGroup
              legend="Arquivos"
              description="Original: PNG, JPEG, WebP ou AVIF até 20 MB. Variantes: WebP e AVIF nos tamanhos thumbnail, medium e large."
            >
              <label>
                Imagem original
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  required
                  onChange={(event) => chooseFile("original", event.target.files?.[0])}
                />
              </label>
              {mediaVariantSlots.map((slot) => (
                <label key={slot}>
                  Variante {slot}
                  <input
                    type="file"
                    accept={slot.endsWith(".webp") ? "image/webp" : "image/avif"}
                    required
                    onChange={(event) => chooseFile(slot, event.target.files?.[0])}
                  />
                </label>
              ))}
              {originalPreview && (
                <figure className="admin-media-upload-preview">
                  <img src={originalPreview} alt="Prévia local da imagem selecionada" />
                  <figcaption>Prévia local; o arquivo ainda não foi enviado.</figcaption>
                </figure>
              )}
            </FieldGroup>

            <FieldGroup legend="Origem, direitos e acessibilidade">
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
                Substituir mídia existente
                <select
                  value={uploadForm.replacesAssetId}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, replacesAssetId: event.target.value }))
                  }
                >
                  <option value="">Não substituir</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.original_filename}
                    </option>
                  ))}
                </select>
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
            <button className="admin-button" type="submit" disabled={busy}>
              {busy ? "Enviando e validando…" : "Enviar e finalizar mídia"}
            </button>
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

      <FilterBar summary={`${total} arquivo${total === 1 ? "" : "s"}`}>
        <label>
          Buscar arquivo
          <input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load(query, 1);
          }}
          disabled={loading}
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPage(1);
            void load("", 1);
          }}
          disabled={loading || !query}
        >
          Limpar filtro
        </button>
      </FilterBar>

      {loading ? (
        <LoadingSkeleton label="Carregando mídia" rows={4} />
      ) : error && items.length === 0 ? (
        <ErrorState title="Biblioteca indisponível" description={error} />
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
                <dd>{item.processing_status}</dd>
                <dt>Verificação</dt>
                <dd>{item.scan_status}</dd>
                <dt>Dimensões</dt>
                <dd>{item.width && item.height ? `${item.width} × ${item.height}` : "aguardando"}</dd>
                <dt>Origem</dt>
                <dd>{item.source_kind}</dd>
                <dt>Direitos</dt>
                <dd>
                  {item.owner_name} · {item.license_name}
                </dd>
              </dl>
              <div className="admin-actions">
                <button type="button" onClick={() => setSelected(item)}>
                  Abrir
                </button>
                <button type="button" onClick={() => void inspectUsages(item)} disabled={busy}>
                  Consultar usos
                </button>
                {canManage && (
                  <button
                    type="button"
                    className="admin-danger-link"
                    onClick={() => setDeleting(item)}
                    disabled={busy}
                  >
                    Excluir
                  </button>
                )}
              </div>
              {usages?.asset.id === item.id && (
                <div className="admin-media-usages" role="status">
                  <strong>
                    {usages.rows.length} uso{usages.rows.length === 1 ? "" : "s"}
                  </strong>
                  {usages.rows.length === 0 ? (
                    <p>Esta mídia não está vinculada a conteúdo.</p>
                  ) : (
                    <ul>
                      {usages.rows.map((usage) => (
                        <li key={`${usage.revision_id}-${usage.block_id}-${usage.usage_kind}`}>
                          {usage.usage_kind} · item {usage.item_id.slice(0, 8)} · revisão{" "}
                          {usage.revision_id.slice(0, 8)}
                        </li>
                      ))}
                    </ul>
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
          disabled={loading || page === 1}
          onClick={() => {
            const previous = page - 1;
            setPage(previous);
            void load(query, previous);
          }}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          type="button"
          disabled={loading || page * pageSize >= total}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void load(query, next);
          }}
        >
          Próxima página
        </button>
      </nav>

      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="MÍDIA"
        title={selected?.original_filename ?? "Arquivo"}
        address={selected ? `/midia/${selected.id}` : undefined}
        status={<span className="admin-status">{selected?.processing_status}</span>}
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
                { label: "Verificação", value: selected.scan_status },
              ]
            : undefined
        }
        summary={selected?.alt_text || "Sem texto alternativo."}
        primary={
          selected && (
            <button type="button" onClick={() => void inspectUsages(selected)}>
              Ver ficha completa
            </button>
          )
        }
        onClose={() => setSelected(null)}
      >
        {selected && usages?.asset.id === selected.id && (
          <section className="admin-record-drawer__summary">
            <h3>Usos registrados</h3>
            <p>
              {usages.rows.length
                ? `${usages.rows.length} vínculo(s) localizado(s).`
                : "Nenhum uso registrado."}
            </p>
          </section>
        )}
      </RecordDrawer>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir mídia privada?"
        description={
          deleting
            ? `A exclusão de ${deleting.original_filename} só será concluída se a API confirmar que não existem usos.`
            : ""
        }
        confirmLabel={busy ? "Excluindo…" : "Excluir mídia"}
        dangerous
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
