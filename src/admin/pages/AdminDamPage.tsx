import { useCallback, useEffect, useMemo, useState } from "react";
import { damCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment } from "../ev2-runtime";
import { fingerprintMediaFile } from "../dam-model";
import {
  mediaVariantSlots,
  uploadMediaPackage,
  validateMediaUploadPackage,
  type MediaUploadDescriptor,
  type MediaUploadSlot,
} from "../media-upload-model";
import {
  Ev2DamAssetListResultSchema,
  Ev2DamAssetResultSchema,
  Ev2DamCapabilityResultSchema,
  Ev2DamMatchResultSchema,
  Ev2DamReplacementPreviewResultSchema,
  type Ev2DamAsset,
  type Ev2DamCollection,
  type Ev2DamTag,
} from "@/shared/contracts/ev2-dam";
import {
  AdminAlert,
  EmptyState,
  FieldGroup,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
  StatePanel,
} from "../components/AdminUI";

const CMS_ENVIRONMENT = cmsEnvironment();

function envelope(expectedVersion?: number) {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}

function expiryValue(value: string) {
  return value ? new Date(`${value}T23:59:59.000Z`).toISOString() : null;
}

function rightsLabel(state: Ev2DamAsset["rightsState"]) {
  return {
    valid: "válidos",
    expiring: "vencem em até 30 dias",
    expired: "expirados",
    undated: "sem vencimento",
  }[state];
}

type UploadForm = {
  sourceKind: "synthetic_test" | "owner_authored" | "official_manufacturer" | "official_company";
  sourceReference: string;
  licenseName: string;
  ownerName: string;
  rightsExpiresOn: string;
  altText: string;
  caption: string;
  credit: string;
  focalX: number;
  focalY: number;
  rightsConfirmed: boolean;
};

const initialUpload: UploadForm = {
  sourceKind: "owner_authored",
  sourceReference: "",
  licenseName: "Uso autorizado pela GAIATEC",
  ownerName: "GAIATEC SISTEMAS",
  rightsExpiresOn: "",
  altText: "",
  caption: "",
  credit: "",
  focalX: 0.5,
  focalY: 0.5,
  rightsConfirmed: false,
};

export default function AdminDamPage() {
  const { session, profile } = useAdminAuth();
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">("checking");
  const [items, setItems] = useState<Ev2DamAsset[]>([]);
  const [collections, setCollections] = useState<Ev2DamCollection[]>([]);
  const [tags, setTags] = useState<Ev2DamTag[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [rightsFilter, setRightsFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<Ev2DamAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [files, setFiles] = useState<Partial<Record<MediaUploadSlot, File>>>({});
  const [upload, setUpload] = useState(initialUpload);
  const [similar, setSimilar] = useState<Ev2DamAsset[]>([]);
  const [confirmedFingerprint, setConfirmedFingerprint] = useState("");
  const [metadata, setMetadata] = useState({
    originalFilename: "",
    sourceReference: "",
    licenseName: "",
    ownerName: "",
    rightsExpiresOn: "",
    altText: "",
    caption: "",
    credit: "",
    focalX: 0.5,
    focalY: 0.5,
  });
  const [tagInput, setTagInput] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");
  const [crop, setCrop] = useState({
    cropKey: "quadrado",
    label: "Quadrado",
    aspectWidth: 1,
    aspectHeight: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    focalX: 0.5,
    focalY: 0.5,
  });
  const [replacementTarget, setReplacementTarget] = useState("");
  const [replacementPreview, setReplacementPreview] = useState<ReturnType<
    typeof Ev2DamReplacementPreviewResultSchema.parse
  > | null>(null);
  const pageSize = 20;
  const canUpload = profile?.permissions.includes("cms:media.upload") ?? false;
  const canManage = profile?.permissions.includes("cms:media.manage") ?? false;
  const canEdit = (profile?.permissions.includes("cms:media.edit") ?? false) || canManage;

  const load = useCallback(
    async (requestedPage = page) => {
      if (!session) return;
      setLoading(true);
      try {
        const capabilityResult = Ev2DamCapabilityResultSchema.parse(
          await damCommand(session, { action: "capability", envelope: envelope() }),
        );
        if (!capabilityResult.enabled) {
          setCapability("disabled");
          return;
        }
        setCapability("enabled");
        const result = Ev2DamAssetListResultSchema.parse(
          await damCommand(session, {
            action: "list_assets",
            envelope: envelope(),
            query,
            ...(collectionId ? { collectionId } : {}),
            tagIds: [],
            ...(rightsFilter ? { rightsState: rightsFilter } : {}),
            includeArchived,
            page: requestedPage,
            pageSize,
          }),
        );
        setItems(result.items);
        setCollections(result.collections);
        setTags(result.tags);
        setTotal(result.total);
        setPage(requestedPage);
        setError("");
      } catch (caught) {
        setCapability("error");
        setError(caught instanceof Error ? caught.message : "DAM indisponível.");
      } finally {
        setLoading(false);
      }
    },
    [collectionId, includeArchived, page, query, rightsFilter, session],
  );

  useEffect(() => {
    void load(1);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (slot === "original") {
      setSimilar([]);
      setConfirmedFingerprint("");
    }
  }

  async function refreshSelected(assetId: string) {
    if (!session) return;
    const result = Ev2DamAssetResultSchema.parse(
      await damCommand(session, { action: "get_asset", envelope: envelope(), assetId }),
    );
    setSelected(result.asset);
    setMetadata({
      originalFilename: result.asset.originalFilename,
      sourceReference: result.asset.sourceReference,
      licenseName: result.asset.licenseName,
      ownerName: result.asset.ownerName,
      rightsExpiresOn: result.asset.rightsExpiresAt?.slice(0, 10) ?? "",
      altText: result.asset.altText,
      caption: result.asset.caption ?? "",
      credit: result.asset.credit ?? "",
      focalX: result.asset.focalX,
      focalY: result.asset.focalY,
    });
    setTagInput(result.asset.tags.map((tag) => tag.name).join(", "));
    setSelectedCollections(result.asset.collections.map((collection) => collection.id));
    setReplacementTarget("");
    setReplacementPreview(null);
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    const issues = validateMediaUploadPackage(files);
    if (!upload.rightsConfirmed) issues.push("Confirme os direitos de uso.");
    if (upload.sourceReference.trim().length < 3) issues.push("Informe a referência da origem.");
    if (!upload.altText.trim()) issues.push("Informe o texto alternativo.");
    if (issues.length) {
      setError(issues[0]!);
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fingerprint = await fingerprintMediaFile(files.original!);
      const matches = Ev2DamMatchResultSchema.parse(
        await damCommand(session, {
          action: "match_asset",
          envelope: envelope(),
          ...fingerprint,
          maximumDistance: 8,
        }),
      );
      if (matches.exact) {
        setSimilar([matches.exact]);
        setError("Este arquivo já existe. Reutilize o ativo indicado; nenhum upload foi feito.");
        return;
      }
      if (matches.similar.length && confirmedFingerprint !== fingerprint.sha256) {
        setSimilar(matches.similar);
        setConfirmedFingerprint(fingerprint.sha256);
        setError(
          "Encontramos imagens visualmente semelhantes. Revise as sugestões e envie novamente apenas se for um ativo distinto.",
        );
        return;
      }
      const uploadEnvelope = envelope();
      const reservation = await damCommand<{ assetId: string; uploads: MediaUploadDescriptor[] }>(session, {
        action: "reserve_upload",
        envelope: uploadEnvelope,
        metadata: {
          originalFilename: files.original!.name,
          declaredMime: files.original!.type,
          sourceKind: upload.sourceKind,
          sourceReference: upload.sourceReference,
          rightsConfirmed: true,
          rightsExpiresAt: expiryValue(upload.rightsExpiresOn),
          licenseName: upload.licenseName,
          ownerName: upload.ownerName,
          altText: upload.altText,
          caption: upload.caption || null,
          credit: upload.credit || null,
          focalX: upload.focalX,
          focalY: upload.focalY,
          ...fingerprint,
        },
      });
      await uploadMediaPackage(reservation.uploads, files);
      await damCommand(session, {
        action: "finalize_upload",
        envelope: envelope(),
        assetId: reservation.assetId,
      });
      setFiles({});
      setUpload(initialUpload);
      setSimilar([]);
      setConfirmedFingerprint("");
      setSuccess("Mídia validada e adicionada ao DAM privado.");
      await load(1);
      await refreshSelected(reservation.assetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir o upload.");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(body: Record<string, unknown>, message: string, assetId = selected?.id) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await damCommand(session, body, crypto.randomUUID());
      setSuccess(message);
      await load(page);
      if (assetId) await refreshSelected(assetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectReplacement() {
    if (!session || !selected || !replacementTarget) return;
    setBusy(true);
    setError("");
    try {
      const preview = Ev2DamReplacementPreviewResultSchema.parse(
        await damCommand(session, {
          action: "preview_replacement",
          envelope: envelope(),
          sourceAssetId: selected.id,
          targetAssetId: replacementTarget,
        }),
      );
      setReplacementPreview(preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao analisar a substituição.");
    } finally {
      setBusy(false);
    }
  }

  if (capability === "disabled")
    return (
      <StatePanel
        kind="forbidden"
        title="DAM EV2.5 desativado"
        description="A sessão foi elegível no manifesto, mas a API específica manteve a capacidade desligada."
      />
    );
  if (capability === "checking" && loading) return <LoadingSkeleton label="Validando DAM EV2.5" rows={5} />;
  if (capability === "error" && !items.length)
    return (
      <StatePanel
        kind="error"
        title="DAM indisponível"
        description={error || "Não foi possível validar a capacidade."}
      />
    );

  return (
    <section>
      <PageHeader
        eyebrow="DAM EV2.5 · BIBLIOTECA PRIVADA"
        title="Mídia contextual"
        description="Localize, reutilize e governe imagens, direitos, crops e substituições sem perder vínculos."
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}

      {canUpload && (
        <SectionCard
          title="Enviar imagem governada"
          description="O hash é verificado antes do upload. Imagens similares exigem revisão explícita; duplicatas exatas devem ser reutilizadas."
        >
          <form className="admin-form" onSubmit={submitUpload}>
            <FieldGroup
              legend="Pacote responsivo"
              description="Selecione o original e as variantes WebP/AVIF já processadas; o servidor valida MIME real e dimensões."
            >
              <label>
                Original
                <input
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={(event) => chooseFile("original", event.target.files?.[0])}
                />
              </label>
              {mediaVariantSlots.map((slot) => (
                <label key={slot}>
                  Variante {slot}
                  <input
                    type="file"
                    required
                    accept={slot.endsWith(".webp") ? "image/webp" : "image/avif"}
                    onChange={(event) => chooseFile(slot, event.target.files?.[0])}
                  />
                </label>
              ))}
              {originalPreview && (
                <figure className="admin-media-upload-preview">
                  <img src={originalPreview} alt="Prévia local do arquivo ainda não enviado" />
                  <figcaption>Prévia local; nenhum dado foi enviado.</figcaption>
                </figure>
              )}
            </FieldGroup>
            <FieldGroup legend="Origem, direito e acessibilidade">
              <label>
                Origem
                <select
                  value={upload.sourceKind}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      sourceKind: event.target.value as UploadForm["sourceKind"],
                    }))
                  }
                >
                  <option value="owner_authored">Autoria GAIATEC</option>
                  <option value="official_manufacturer">Fabricante oficial</option>
                  <option value="official_company">Empresa oficial</option>
                  <option value="synthetic_test">Teste sintético</option>
                </select>
              </label>
              <label>
                Referência
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={upload.sourceReference}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, sourceReference: event.target.value }))
                  }
                />
              </label>
              <label>
                Proprietário
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={upload.ownerName}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, ownerName: event.target.value }))
                  }
                />
              </label>
              <label>
                Licença
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={upload.licenseName}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, licenseName: event.target.value }))
                  }
                />
              </label>
              <label>
                Direitos válidos até <span className="admin-optional">(opcional)</span>
                <input
                  type="date"
                  value={upload.rightsExpiresOn}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, rightsExpiresOn: event.target.value }))
                  }
                />
              </label>
              <label>
                Texto alternativo
                <textarea
                  required
                  maxLength={300}
                  value={upload.altText}
                  onChange={(event) => setUpload((current) => ({ ...current, altText: event.target.value }))}
                />
              </label>
              <label>
                Legenda <span className="admin-optional">(opcional)</span>
                <textarea
                  maxLength={500}
                  value={upload.caption}
                  onChange={(event) => setUpload((current) => ({ ...current, caption: event.target.value }))}
                />
              </label>
              <label>
                Crédito <span className="admin-optional">(opcional)</span>
                <input
                  maxLength={200}
                  value={upload.credit}
                  onChange={(event) => setUpload((current) => ({ ...current, credit: event.target.value }))}
                />
              </label>
              <label className="admin-checkbox-row">
                <input
                  type="checkbox"
                  required
                  checked={upload.rightsConfirmed}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, rightsConfirmed: event.target.checked }))
                  }
                />
                Confirmo a origem e os direitos de uso
              </label>
            </FieldGroup>
            <button className="admin-button" type="submit" disabled={busy}>
              {busy
                ? "Validando…"
                : confirmedFingerprint
                  ? "Confirmar ativo distinto e enviar"
                  : "Verificar e enviar"}
            </button>
          </form>
          {similar.length > 0 && (
            <div className="admin-media-usages" role="status">
              <strong>
                {similar.length} ativo{similar.length === 1 ? "" : "s"} para reutilização/revisão
              </strong>
              <ul>
                {similar.map((asset) => (
                  <li key={asset.id}>
                    <button type="button" onClick={() => void refreshSelected(asset.id)}>
                      {asset.originalFilename}
                    </button>{" "}
                    · {asset.altText}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      <FilterBar summary={`${total} ativo${total === 1 ? "" : "s"}`}>
        <label>
          Buscar
          <input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Coleção
          <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
            <option value="">Todas</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name} ({collection.assetCount})
              </option>
            ))}
          </select>
        </label>
        <label>
          Direitos
          <select value={rightsFilter} onChange={(event) => setRightsFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="valid">Válidos</option>
            <option value="expiring">Vencem em 30 dias</option>
            <option value="expired">Expirados</option>
            <option value="undated">Sem vencimento</option>
          </select>
        </label>
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Incluir arquivados
        </label>
        <button type="button" onClick={() => void load(1)} disabled={loading}>
          Aplicar
        </button>
      </FilterBar>

      {loading ? (
        <LoadingSkeleton label="Carregando DAM" rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum ativo encontrado"
          description="Ajuste os filtros ou envie uma imagem autorizada."
        />
      ) : (
        <div className="admin-media-grid">
          {items.map((asset) => (
            <article key={asset.id}>
              {asset.previewUrl && <img src={asset.previewUrl} alt={asset.altText} loading="lazy" />}
              <h2>{asset.originalFilename}</h2>
              <p>{asset.altText}</p>
              <dl>
                <dt>Estado</dt>
                <dd>{asset.processingStatus}</dd>
                <dt>Direitos</dt>
                <dd>{rightsLabel(asset.rightsState)}</dd>
                <dt>Organização</dt>
                <dd>
                  {[
                    ...asset.collections.map((entry) => entry.name),
                    ...asset.tags.map((entry) => `#${entry.name}`),
                  ].join(" · ") || "sem classificação"}
                </dd>
              </dl>
              <button type="button" onClick={() => void refreshSelected(asset.id)}>
                Abrir detalhes e usos
              </button>
            </article>
          ))}
        </div>
      )}

      <nav className="admin-pagination" aria-label="Paginação do DAM">
        <button type="button" disabled={loading || page === 1} onClick={() => void load(page - 1)}>
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          type="button"
          disabled={loading || page * pageSize >= total}
          onClick={() => void load(page + 1)}
        >
          Próxima página
        </button>
      </nav>

      {selected && (
        <SectionCard
          title={`Governar: ${selected.originalFilename}`}
          description={`${selected.usages.length} uso${selected.usages.length === 1 ? "" : "s"}; versão ${selected.lockVersion}.`}
        >
          {selected.previewUrl && (
            <img className="admin-media-detail-preview" src={selected.previewUrl} alt={selected.altText} />
          )}
          <FieldGroup legend="Metadados e vigência">
            <label>
              Nome do arquivo
              <input
                value={metadata.originalFilename}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, originalFilename: event.target.value }))
                }
              />
            </label>
            <label>
              Referência da origem
              <input
                value={metadata.sourceReference}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, sourceReference: event.target.value }))
                }
              />
            </label>
            <label>
              Proprietário
              <input
                value={metadata.ownerName}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, ownerName: event.target.value }))
                }
              />
            </label>
            <label>
              Licença
              <input
                value={metadata.licenseName}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, licenseName: event.target.value }))
                }
              />
            </label>
            <label>
              Direitos válidos até
              <input
                type="date"
                value={metadata.rightsExpiresOn}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, rightsExpiresOn: event.target.value }))
                }
              />
            </label>
            <label>
              Texto alternativo
              <textarea
                value={metadata.altText}
                onChange={(event) => setMetadata((current) => ({ ...current, altText: event.target.value }))}
              />
            </label>
            <label>
              Legenda
              <textarea
                value={metadata.caption}
                onChange={(event) => setMetadata((current) => ({ ...current, caption: event.target.value }))}
              />
            </label>
            <label>
              Crédito
              <input
                value={metadata.credit}
                onChange={(event) => setMetadata((current) => ({ ...current, credit: event.target.value }))}
              />
            </label>
          </FieldGroup>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void mutate(
                  {
                    action: "update_metadata",
                    envelope: envelope(selected.lockVersion),
                    assetId: selected.id,
                    patch: {
                      originalFilename: metadata.originalFilename,
                      sourceReference: metadata.sourceReference,
                      ownerName: metadata.ownerName,
                      licenseName: metadata.licenseName,
                      rightsExpiresAt: expiryValue(metadata.rightsExpiresOn),
                      altText: metadata.altText,
                      caption: metadata.caption || null,
                      credit: metadata.credit || null,
                      focalX: metadata.focalX,
                      focalY: metadata.focalY,
                    },
                    reason: "Revisão dos metadados e direitos no DAM",
                  },
                  "Metadados e direitos atualizados.",
                )
              }
            >
              Salvar metadados
            </button>
          )}

          <FieldGroup legend="Coleções e tags">
            <label>
              Coleções
              <select
                multiple
                value={selectedCollections}
                onChange={(event) =>
                  setSelectedCollections(
                    Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                  )
                }
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tags separadas por vírgula
              <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} />
            </label>
            {canEdit && (
              <>
                <label>
                  Nova coleção
                  <input value={newCollection} onChange={(event) => setNewCollection(event.target.value)} />
                </label>
                <button
                  type="button"
                  disabled={busy || !newCollection.trim()}
                  onClick={() =>
                    void mutate(
                      {
                        action: "upsert_collection",
                        envelope: envelope(),
                        name: newCollection,
                        description: "Coleção criada no DAM contextual",
                        reason: "Organização da biblioteca",
                      },
                      "Coleção criada.",
                      selected.id,
                    ).then(() => setNewCollection(""))
                  }
                >
                  Criar coleção
                </button>
              </>
            )}
          </FieldGroup>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void mutate(
                  {
                    action: "set_organization",
                    envelope: envelope(selected.lockVersion),
                    assetId: selected.id,
                    collectionIds: selectedCollections,
                    tags: tagInput
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    reason: "Classificação do ativo no DAM",
                  },
                  "Coleções e tags atualizadas.",
                )
              }
            >
              Salvar organização
            </button>
          )}

          <FieldGroup
            legend="Crop governado"
            description="Coordenadas normalizadas preservam o original e permitem reprocessamento."
          >
            <label>
              Identificador
              <input
                value={crop.cropKey}
                onChange={(event) => setCrop((current) => ({ ...current, cropKey: event.target.value }))}
              />
            </label>
            <label>
              Nome
              <input
                value={crop.label}
                onChange={(event) => setCrop((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            {(["x", "y", "width", "height", "focalX", "focalY"] as const).map((field) => (
              <label key={field}>
                {field}
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={crop[field]}
                  onChange={(event) =>
                    setCrop((current) => ({ ...current, [field]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
          </FieldGroup>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void mutate(
                  {
                    action: "save_crop",
                    envelope: envelope(selected.lockVersion),
                    assetId: selected.id,
                    crop,
                    reason: "Crop contextual do ativo",
                  },
                  "Crop salvo sem alterar o original.",
                )
              }
            >
              Salvar crop
            </button>
          )}

          <div className="admin-media-usages">
            <strong>Mapa de usos</strong>
            {selected.usages.length === 0 ? (
              <p>Sem vínculos; arquivamento permitido.</p>
            ) : (
              <ul>
                {selected.usages.map((usage) => (
                  <li key={`${usage.itemId}-${usage.revisionId}-${usage.blockId}-${usage.usageKind}`}>
                    {usage.usageKind} · item {usage.itemId.slice(0, 8)} · revisão{" "}
                    {usage.revisionId?.slice(0, 8) ?? "atual"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage && (
            <FieldGroup
              legend="Substituição reversível"
              description="Primeiro analise o impacto. O conteúdo mantém a identidade original e passa a resolver o novo arquivo, permitindo rollback."
            >
              {selected.activeReplacement ? (
                <div role="status">
                  <p>
                    Substituição ativa para o destino {selected.activeReplacement.targetAssetId.slice(0, 8)}.
                    O identificador original permanece no conteúdo.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        {
                          action: "rollback_replacement",
                          envelope: envelope(selected.activeReplacement!.lockVersion),
                          replacementId: selected.activeReplacement!.id,
                          reason: "Rollback explícito da substituição no DAM contextual",
                        },
                        "Substituição revertida; o ativo original voltou a ser resolvido.",
                      )
                    }
                  >
                    Reverter substituição
                  </button>
                </div>
              ) : (
                <>
                  <label>
                    Ativo substituto
                    <select
                      value={replacementTarget}
                      onChange={(event) => {
                        setReplacementTarget(event.target.value);
                        setReplacementPreview(null);
                      }}
                    >
                      <option value="">Selecione</option>
                      {items
                        .filter(
                          (asset) =>
                            asset.id !== selected.id &&
                            asset.processingStatus === "ready" &&
                            asset.rightsState !== "expired",
                        )
                        .map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.originalFilename}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !replacementTarget}
                    onClick={() => void inspectReplacement()}
                  >
                    Analisar impacto
                  </button>
                </>
              )}
              {!selected.activeReplacement && replacementPreview && (
                <div role="status">
                  <p>
                    {replacementPreview.usageCount} uso{replacementPreview.usageCount === 1 ? "" : "s"} será
                    resolvido pelo novo ativo. Destino{" "}
                    {replacementPreview.targetPublishable ? "apto" : "bloqueado"}.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !replacementPreview.targetPublishable}
                    onClick={() =>
                      void mutate(
                        {
                          action: "activate_replacement",
                          envelope: envelope(selected.lockVersion),
                          sourceAssetId: selected.id,
                          targetAssetId: replacementTarget,
                          reason: "Substituição revisada no DAM contextual",
                        },
                        "Substituição ativada com rollback preservado.",
                      )
                    }
                  >
                    Ativar substituição
                  </button>
                </div>
              )}
            </FieldGroup>
          )}

          {canManage &&
            (selected.archivedAt ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    {
                      action: "restore_asset",
                      envelope: envelope(selected.lockVersion),
                      assetId: selected.id,
                      reason: "Restauração dentro da retenção do DAM",
                    },
                    "Ativo restaurado e coleta cancelada.",
                  )
                }
              >
                Restaurar ativo
              </button>
            ) : (
              <button
                className="admin-danger-link"
                type="button"
                disabled={busy || selected.usages.length > 0 || Boolean(selected.activeReplacement)}
                onClick={() =>
                  void mutate(
                    {
                      action: "archive_asset",
                      envelope: envelope(selected.lockVersion),
                      assetId: selected.id,
                      reason: "Arquivamento com retenção de 30 dias",
                    },
                    "Ativo arquivado; exclusão física somente após a retenção.",
                  )
                }
              >
                Arquivar ativo
              </button>
            ))}
        </SectionCard>
      )}
      {tags.length > 0 && (
        <p className="admin-help">
          Tags disponíveis: {tags.map((tag) => `${tag.name} (${tag.assetCount})`).join(" · ")}
        </p>
      )}
    </section>
  );
}
