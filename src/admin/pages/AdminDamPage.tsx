import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { damCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment } from "../ev2-runtime";
import { fingerprintMediaFile } from "../dam-model";
import { maximumDamCropFrame } from "../dam-crop-frame";
import {
  uploadMediaPackage,
  validateOriginalMediaFile,
  type MediaUploadDescriptor,
  type MediaUploadSlot,
} from "../media-upload-model";
import { createResponsiveMediaPackage } from "../responsive-media";
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
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { urlSegmentFromText } from "../url-segment";
import { operatorErrorMessage } from "../operator-error-message";
import { useSafeRasterPreview } from "../hooks/useSafeRasterPreview";
import { operationalDateFromInstant, rightsExpiryAtOperationalDayEnd } from "../rights-expiry";

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

function rightsLabel(state: Ev2DamAsset["rightsState"]) {
  return {
    valid: "válidos",
    expiring: "vencem em até 30 dias",
    expired: "expirados",
    undated: "sem vencimento",
  }[state];
}

function processingStatusLabel(status: Ev2DamAsset["processingStatus"]) {
  return (
    {
      awaiting_upload: "Aguardando envio",
      processing: "Em processamento",
      ready: "Pronta para uso",
      rejected: "Rejeitada",
      failed: "Falha no processamento",
      replaced: "Substituída",
      archived: "Arquivada",
    }[status] ?? "Estado indisponível"
  );
}

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

const cropAspectOptions = [
  { value: "1:1", label: "Quadrado (1:1)", width: 1, height: 1 },
  { value: "16:9", label: "Paisagem ampla (16:9)", width: 16, height: 9 },
  { value: "4:3", label: "Paisagem padrão (4:3)", width: 4, height: 3 },
  { value: "4:5", label: "Retrato (4:5)", width: 4, height: 5 },
] as const;

const initialCrop = {
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
};

function metadataEditorValue(asset: Ev2DamAsset) {
  return {
    originalFilename: asset.originalFilename,
    sourceReference: asset.sourceReference,
    licenseName: asset.licenseName,
    ownerName: asset.ownerName,
    rightsExpiresOn: operationalDateFromInstant(asset.rightsExpiresAt),
    altText: asset.altText,
    caption: asset.caption ?? "",
    credit: asset.credit ?? "",
    focalX: asset.focalX,
    focalY: asset.focalY,
  };
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function cropEditorValue(value?: Partial<typeof initialCrop>) {
  if (!value) return { ...initialCrop };
  return {
    cropKey: value.cropKey ?? initialCrop.cropKey,
    label: value.label ?? initialCrop.label,
    aspectWidth: value.aspectWidth ?? initialCrop.aspectWidth,
    aspectHeight: value.aspectHeight ?? initialCrop.aspectHeight,
    x: value.x ?? initialCrop.x,
    y: value.y ?? initialCrop.y,
    width: value.width ?? initialCrop.width,
    height: value.height ?? initialCrop.height,
    focalX: value.focalX ?? initialCrop.focalX,
    focalY: value.focalY ?? initialCrop.focalY,
  };
}

function newCropForAsset(asset: Pick<Ev2DamAsset, "width" | "height">) {
  const frame = maximumDamCropFrame(
    initialCrop.aspectWidth,
    initialCrop.aspectHeight,
    asset.width,
    asset.height,
  );
  return {
    ...initialCrop,
    x: (1 - frame.width) / 2,
    y: (1 - frame.height) / 2,
    width: frame.width,
    height: frame.height,
  };
}

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
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preparationMessage, setPreparationMessage] = useState("");
  const uploadAbortController = useRef<AbortController | null>(null);
  const selectedAssetRequest = useRef(0);
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
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");
  const [crop, setCrop] = useState(cropEditorValue);
  const [selectedCropId, setSelectedCropId] = useState("");
  const [cropDirty, setCropDirty] = useState(false);
  const [replacementTarget, setReplacementTarget] = useState("");
  const [replacementPreview, setReplacementPreview] = useState<ReturnType<
    typeof Ev2DamReplacementPreviewResultSchema.parse
  > | null>(null);
  const pageSize = 20;
  const canUpload = profile?.permissions.includes("cms:media.upload") ?? false;
  const canManage = profile?.permissions.includes("cms:media.manage") ?? false;
  const canEdit = (profile?.permissions.includes("cms:media.edit") ?? false) || canManage;
  const metadataDirty = selected
    ? JSON.stringify(metadata) !== JSON.stringify(metadataEditorValue(selected))
    : false;
  const organizationDirty = selected
    ? !sameStringSet(
        selectedCollections,
        selected.collections.map((collection) => collection.id),
      ) ||
      !sameStringSet(
        selectedTagNames,
        selected.tags.map((tag) => tag.name),
      )
    : false;
  const organizationEditing = organizationDirty || Boolean(tagDraft.trim()) || Boolean(newCollection.trim());
  const hasPendingDetailChanges = metadataDirty || organizationEditing || cropDirty;

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
        setError(operatorErrorMessage(caught, { fallback: "Biblioteca de mídia indisponível." }));
      } finally {
        setLoading(false);
      }
    },
    [collectionId, includeArchived, page, query, rightsFilter, session],
  );

  useEffect(() => {
    void load(1);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const originalPreview = useSafeRasterPreview(files.original);

  function chooseOriginal(file?: File) {
    setFiles(file ? { original: file } : {});
    setSimilar([]);
    setConfirmedFingerprint("");
  }

  async function refreshSelected(assetId: string) {
    if (!session) return;
    if (hasPendingDetailChanges && selected && selected.id !== assetId) {
      setError("Salve ou descarte as alterações antes de abrir outra imagem.");
      return;
    }
    const requestId = selectedAssetRequest.current + 1;
    selectedAssetRequest.current = requestId;
    setError("");
    setSelectedLoading(true);
    setSelected(null);
    try {
      const result = Ev2DamAssetResultSchema.parse(
        await damCommand(session, { action: "get_asset", envelope: envelope(), assetId }),
      );
      if (selectedAssetRequest.current !== requestId) return;
      setSelected(result.asset);
      setMetadata(metadataEditorValue(result.asset));
      setSelectedTagNames(result.asset.tags.map((tag) => tag.name));
      setTagDraft("");
      setNewCollection("");
      setSelectedCollections(result.asset.collections.map((collection) => collection.id));
      setReplacementTarget("");
      setReplacementPreview(null);
      const existingCrop = result.asset.crops[0];
      setSelectedCropId(existingCrop?.id ?? "");
      setCrop(existingCrop ? cropEditorValue(existingCrop) : newCropForAsset(result.asset));
      setCropDirty(false);
    } catch (caught) {
      if (selectedAssetRequest.current === requestId) {
        setError(operatorErrorMessage(caught, { fallback: "Não foi possível abrir os detalhes da imagem." }));
      }
    } finally {
      if (selectedAssetRequest.current === requestId) setSelectedLoading(false);
    }
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    const issues = validateOriginalMediaFile(files.original);
    if (!upload.rightsConfirmed) issues.push("Confirme os direitos de uso.");
    if (upload.sourceReference.trim().length < 3) issues.push("Informe a referência da origem.");
    if (upload.ownerName.trim().length < 2) issues.push("Informe o proprietário.");
    if (upload.licenseName.trim().length < 2) issues.push("Informe a licença.");
    if (!upload.altText.trim()) issues.push("Informe o texto alternativo.");
    if (issues.length) {
      setError(issues[0]!);
      return;
    }
    const operation = new AbortController();
    uploadAbortController.current = operation;
    setBusy(true);
    setError("");
    setSuccess("");
    let reservedAssetId = "";
    let finalizationEnvelope: ReturnType<typeof envelope> | null = null;
    const applyFinalizedUpload = async (assetId: string, message: string) => {
      setFiles({});
      setUpload(initialUpload);
      setSimilar([]);
      setConfirmedFingerprint("");
      setSuccess(message);
      await load(1);
      try {
        await refreshSelected(assetId);
      } catch {
        setError("A imagem foi concluída, mas os detalhes não puderam ser atualizados. Recarregue a página.");
      }
    };
    try {
      const original = files.original!;
      const fingerprint = await fingerprintMediaFile(original);
      operation.signal.throwIfAborted();
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
        setError("Este arquivo já existe. Reutilize a imagem indicada; nenhum envio foi feito.");
        return;
      }
      if (matches.similar.length && confirmedFingerprint !== fingerprint.sha256) {
        setSimilar(matches.similar);
        setConfirmedFingerprint(fingerprint.sha256);
        setError(
          "Encontramos imagens visualmente semelhantes. Revise as sugestões e envie novamente apenas se for uma imagem distinta.",
        );
        return;
      }
      setPreparationMessage("Preparando versões para diferentes telas…");
      const responsiveFiles = await createResponsiveMediaPackage(original, {
        onProgress: (progress) => setPreparationMessage(`${progress.message}…`),
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      const uploadEnvelope = envelope();
      const reservation = await damCommand<{ assetId: string; uploads: MediaUploadDescriptor[] }>(session, {
        action: "reserve_upload",
        envelope: uploadEnvelope,
        metadata: {
          originalFilename: original.name,
          declaredMime: original.type,
          sourceKind: upload.sourceKind,
          sourceReference: upload.sourceReference,
          rightsConfirmed: true,
          rightsExpiresAt: rightsExpiryAtOperationalDayEnd(upload.rightsExpiresOn),
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
      reservedAssetId = reservation.assetId;
      operation.signal.throwIfAborted();
      setPreparationMessage("Enviando as imagens com segurança…");
      await uploadMediaPackage(reservation.uploads, responsiveFiles, undefined, {
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      finalizationEnvelope = envelope();
      await damCommand(session, {
        action: "finalize_upload",
        envelope: finalizationEnvelope,
        assetId: reservation.assetId,
      });
      const completedAssetId = reservation.assetId;
      reservedAssetId = "";
      await applyFinalizedUpload(completedAssetId, "Mídia validada e adicionada à biblioteca privada.");
    } catch (caught) {
      let reconciled = false;
      if (reservedAssetId && finalizationEnvelope) {
        try {
          await damCommand(session, {
            action: "finalize_upload",
            envelope: finalizationEnvelope,
            assetId: reservedAssetId,
          });
          const completedAssetId = reservedAssetId;
          reservedAssetId = "";
          await applyFinalizedUpload(
            completedAssetId,
            "Mídia concluída no servidor e reconciliada com segurança.",
          );
          return;
        } catch {
          // Fall through to the read-only status reconciliation.
        }
      }
      if (reservedAssetId) {
        try {
          const result = Ev2DamAssetResultSchema.parse(
            await damCommand(session, {
              action: "get_asset",
              envelope: envelope(),
              assetId: reservedAssetId,
            }),
          );
          if (result.asset.processingStatus === "ready" && result.asset.scanStatus === "clean") {
            reconciled = true;
            const completedAssetId = reservedAssetId;
            reservedAssetId = "";
            await applyFinalizedUpload(
              completedAssetId,
              "Mídia concluída no servidor e reconciliada com segurança.",
            );
          }
        } catch {
          // If status cannot be proven ready, the reservation must be compensated below.
        }
      }
      if (reconciled) return;
      if (reservedAssetId) {
        const abortEnvelope = envelope();
        try {
          await damCommand(
            session,
            {
              action: "abort_upload",
              envelope: abortEnvelope,
              assetId: reservedAssetId,
              reasonCode: operation.signal.aborted ? "client_cancelled" : "client_upload_failed",
            },
            abortEnvelope.commandId,
          );
        } catch {
          // Preserve the original upload error. The server watchdog remains the final safety net.
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

  async function mutate(body: Record<string, unknown>, message: string, assetId = selected?.id) {
    if (!session || busy) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await damCommand(session, body, crypto.randomUUID());
      setSuccess(message);
      await load(page);
      if (assetId) await refreshSelected(assetId);
      return true;
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível concluir a operação." }));
      return false;
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
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível analisar a substituição." }));
    } finally {
      setBusy(false);
    }
  }

  if (capability === "disabled")
    return (
      <StatePanel
        kind="forbidden"
        title="Biblioteca de mídia desativada"
        description="Este recurso não está habilitado para o seu acesso. Nenhum dado foi alterado."
      />
    );
  if (capability === "checking" && loading)
    return <LoadingSkeleton label="Validando biblioteca de mídia" rows={5} />;
  if (capability === "error" && !items.length)
    return (
      <StatePanel
        kind="error"
        title="Biblioteca de mídia indisponível"
        description={error || "Não foi possível validar a capacidade."}
      />
    );

  return (
    <section>
      <UnsavedChangesGuard dirty={hasPendingDetailChanges && !busy} />
      <PageHeader
        eyebrow="BIBLIOTECA DE MÍDIA PRIVADA"
        title="Mídia contextual"
        description="Localize, reutilize e organize imagens, direitos, recortes e substituições sem perder vínculos."
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}

      {canUpload && (
        <SectionCard
          title="Enviar imagem governada"
          description="A integridade é verificada antes do envio. Imagens similares exigem revisão explícita; duplicatas exatas devem ser reutilizadas."
        >
          <form className="admin-form" aria-label="Enviar mídia governada" onSubmit={submitUpload}>
            <FieldGroup
              legend="Imagem original"
              description="Selecione uma imagem. O CMS prepara automaticamente versões otimizadas para celulares, tablets e telas grandes."
              disabled={busy}
            >
              <label>
                Imagem original
                <input
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp,image/avif"
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
                  <img src={originalPreview.url} alt="Prévia local segura do arquivo ainda não enviado" />
                  <figcaption>Prévia local; nenhum dado foi enviado.</figcaption>
                </figure>
              )}
            </FieldGroup>
            <FieldGroup legend="Origem, direito e acessibilidade" disabled={busy}>
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
              <label>
                Foco horizontal ({Math.round(upload.focalX * 100)}%)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={upload.focalX}
                  aria-valuetext={`${Math.round(upload.focalX * 100)}%`}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, focalX: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Foco vertical ({Math.round(upload.focalY * 100)}%)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={upload.focalY}
                  aria-valuetext={`${Math.round(upload.focalY * 100)}%`}
                  onChange={(event) =>
                    setUpload((current) => ({ ...current, focalY: Number(event.target.value) }))
                  }
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
            <button
              className="admin-button"
              type="submit"
              disabled={busy || originalPreview.loading || Boolean(originalPreview.error)}
            >
              {busy
                ? preparationMessage || "Validando…"
                : confirmedFingerprint
                  ? "Confirmar imagem distinta e enviar"
                  : "Verificar e enviar"}
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
          {similar.length > 0 && (
            <div className="admin-media-usages" role="status">
              <strong>
                {similar.length === 1 ? "1 imagem" : `${similar.length} imagens`} para reutilização ou revisão
              </strong>
              <ul>
                {similar.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      aria-label={`Abrir imagem semelhante ${asset.originalFilename}`}
                      disabled={busy}
                      onClick={() => void refreshSelected(asset.id)}
                    >
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

      <FilterBar summary={total === 1 ? "1 imagem" : `${total} imagens`}>
        <label>
          Buscar
          <input
            value={query}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Coleção
          <select
            value={collectionId}
            disabled={busy}
            onChange={(event) => setCollectionId(event.target.value)}
          >
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
          <select
            value={rightsFilter}
            disabled={busy}
            onChange={(event) => setRightsFilter(event.target.value)}
          >
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
            disabled={busy}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Incluir arquivados
        </label>
        <button type="button" onClick={() => void load(1)} disabled={loading || busy}>
          Aplicar
        </button>
      </FilterBar>

      {loading ? (
        <LoadingSkeleton label="Carregando biblioteca de mídia" rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma imagem encontrada"
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
                <dd>{processingStatusLabel(asset.processingStatus)}</dd>
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
              <button
                type="button"
                aria-label={`Abrir detalhes e usos de ${asset.originalFilename}`}
                disabled={busy}
                onClick={() => void refreshSelected(asset.id)}
              >
                Abrir detalhes e usos
              </button>
            </article>
          ))}
        </div>
      )}

      <nav className="admin-pagination" aria-label="Paginação da biblioteca de mídia">
        <button type="button" disabled={loading || busy || page === 1} onClick={() => void load(page - 1)}>
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          type="button"
          disabled={loading || busy || page * pageSize >= total}
          onClick={() => void load(page + 1)}
        >
          Próxima página
        </button>
      </nav>

      {selectedLoading && <LoadingSkeleton label="Carregando detalhes da imagem" rows={3} />}
      {selected && (
        <SectionCard
          title={`Governar: ${selected.originalFilename}`}
          description={`${selected.usages.length} uso${selected.usages.length === 1 ? "" : "s"} registrado${selected.usages.length === 1 ? "" : "s"}.`}
        >
          {selected.previewUrl && (
            <img className="admin-media-detail-preview" src={selected.previewUrl} alt={selected.altText} />
          )}
          <FieldGroup legend="Metadados e vigência" disabled={busy || organizationEditing || cropDirty}>
            <label>
              Nome do arquivo
              <input
                required
                minLength={1}
                maxLength={180}
                value={metadata.originalFilename}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, originalFilename: event.target.value }))
                }
              />
            </label>
            <label>
              Referência da origem
              <input
                required
                minLength={3}
                maxLength={500}
                value={metadata.sourceReference}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, sourceReference: event.target.value }))
                }
              />
            </label>
            <label>
              Proprietário
              <input
                required
                minLength={2}
                maxLength={120}
                value={metadata.ownerName}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, ownerName: event.target.value }))
                }
              />
            </label>
            <label>
              Licença
              <input
                required
                minLength={2}
                maxLength={120}
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
                required
                minLength={1}
                maxLength={300}
                value={metadata.altText}
                onChange={(event) => setMetadata((current) => ({ ...current, altText: event.target.value }))}
              />
            </label>
            <label>
              Legenda
              <textarea
                maxLength={500}
                value={metadata.caption}
                onChange={(event) => setMetadata((current) => ({ ...current, caption: event.target.value }))}
              />
            </label>
            <label>
              Crédito
              <input
                maxLength={200}
                value={metadata.credit}
                onChange={(event) => setMetadata((current) => ({ ...current, credit: event.target.value }))}
              />
            </label>
            <label>
              Foco horizontal ({Math.round(metadata.focalX * 100)}%)
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={metadata.focalX}
                aria-valuetext={`${Math.round(metadata.focalX * 100)}%`}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, focalX: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Foco vertical ({Math.round(metadata.focalY * 100)}%)
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={metadata.focalY}
                aria-valuetext={`${Math.round(metadata.focalY * 100)}%`}
                onChange={(event) =>
                  setMetadata((current) => ({ ...current, focalY: Number(event.target.value) }))
                }
              />
            </label>
          </FieldGroup>
          {canEdit && (
            <button
              type="button"
              disabled={busy || !metadataDirty}
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
                      rightsExpiresAt: rightsExpiryAtOperationalDayEnd(metadata.rightsExpiresOn),
                      altText: metadata.altText,
                      caption: metadata.caption || null,
                      credit: metadata.credit || null,
                      focalX: metadata.focalX,
                      focalY: metadata.focalY,
                    },
                    reason: "Revisão dos metadados e direitos da imagem",
                  },
                  "Metadados e direitos atualizados.",
                )
              }
            >
              Salvar metadados
            </button>
          )}
          <button
            type="button"
            disabled={busy || !metadataDirty}
            onClick={() => setMetadata(metadataEditorValue(selected))}
          >
            Descartar alterações de metadados
          </button>

          <FieldGroup legend="Coleções e tags" disabled={busy || metadataDirty || cropDirty}>
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
            <div className="admin-form-row">
              <label>
                Nova tag
                <input
                  maxLength={80}
                  pattern="[^,;]+"
                  list="dam-available-tags"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                />
                <small>Adicione uma tag por vez, sem vírgulas ou ponto e vírgula.</small>
              </label>
              <datalist id="dam-available-tags">
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name} />
                ))}
              </datalist>
              <button
                type="button"
                disabled={!tagDraft.trim() || /[,;]/.test(tagDraft)}
                onClick={() => {
                  const normalized = tagDraft.trim();
                  setSelectedTagNames((current) =>
                    current.some(
                      (tag) => tag.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"),
                    )
                      ? current
                      : [...current, normalized],
                  );
                  setTagDraft("");
                }}
              >
                Adicionar tag
              </button>
            </div>
            <ul className="admin-chip-list" aria-label="Tags da imagem">
              {selectedTagNames.map((tag) => (
                <li key={tag}>
                  <span>{tag}</span>
                  <button
                    type="button"
                    aria-label={`Remover tag ${tag}`}
                    onClick={() =>
                      setSelectedTagNames((current) => current.filter((candidate) => candidate !== tag))
                    }
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            {canEdit && (
              <>
                <label>
                  Nova coleção
                  <input
                    required
                    minLength={1}
                    maxLength={120}
                    value={newCollection}
                    onChange={(event) => setNewCollection(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !newCollection.trim() || organizationDirty || Boolean(tagDraft.trim())}
                  onClick={() =>
                    void mutate(
                      {
                        action: "upsert_collection",
                        envelope: envelope(),
                        name: newCollection,
                        description: "Coleção criada na biblioteca de mídia",
                        reason: "Organização da biblioteca",
                      },
                      "Coleção criada.",
                      selected.id,
                    ).then((succeeded) => {
                      if (succeeded) setNewCollection("");
                    })
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
              disabled={busy || !organizationDirty}
              onClick={() =>
                void mutate(
                  {
                    action: "set_organization",
                    envelope: envelope(selected.lockVersion),
                    assetId: selected.id,
                    collectionIds: selectedCollections,
                    tags: selectedTagNames,
                    reason: "Organização da imagem na biblioteca",
                  },
                  "Coleções e tags atualizadas.",
                )
              }
            >
              Salvar organização
            </button>
          )}
          <button
            type="button"
            disabled={busy || !organizationEditing}
            onClick={() => {
              setSelectedCollections(selected.collections.map((collection) => collection.id));
              setSelectedTagNames(selected.tags.map((tag) => tag.name));
              setTagDraft("");
              setNewCollection("");
            }}
          >
            Descartar alterações de organização
          </button>

          <FieldGroup
            legend="Recorte da imagem"
            description="Escolha um formato e ajuste visualmente a área do recorte. A imagem original permanece preservada."
            disabled={busy || metadataDirty || organizationEditing}
          >
            {selected.crops.length > 0 && (
              <label>
                Recorte salvo
                <select
                  value={selectedCropId}
                  disabled={cropDirty}
                  onChange={(event) => {
                    const cropId = event.target.value;
                    const existing = selected.crops.find((candidate) => candidate.id === cropId);
                    setSelectedCropId(cropId);
                    setCrop(existing ? cropEditorValue(existing) : newCropForAsset(selected));
                    setCropDirty(false);
                  }}
                >
                  <option value="">Novo recorte</option>
                  {selected.crops.map((existing) => (
                    <option value={existing.id} key={existing.id}>
                      {existing.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Formato do recorte
              <select
                value={`${crop.aspectWidth}:${crop.aspectHeight}`}
                onChange={(event) => {
                  const option = cropAspectOptions.find(
                    (candidate) => candidate.value === event.target.value,
                  );
                  if (option) {
                    const frame = maximumDamCropFrame(
                      option.width,
                      option.height,
                      selected.width,
                      selected.height,
                    );
                    setCrop((current) => ({
                      ...current,
                      aspectWidth: option.width,
                      aspectHeight: option.height,
                      x: (1 - frame.width) / 2,
                      y: (1 - frame.height) / 2,
                      width: frame.width,
                      height: frame.height,
                    }));
                    setCropDirty(true);
                  }
                }}
              >
                {cropAspectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome do recorte
              <input
                required
                minLength={1}
                maxLength={120}
                value={crop.label}
                onChange={(event) => {
                  const label = event.target.value;
                  setCrop((current) => ({
                    ...current,
                    label,
                    cropKey: urlSegmentFromText(label, 80) || "recorte",
                  }));
                  setCropDirty(true);
                }}
              />
            </label>
            {(["x", "y"] as const).map((field) => (
              <label key={field}>
                {field === "x" ? "Margem esquerda" : "Margem superior"} ({Math.round(crop[field] * 100)}%)
                <input
                  type="range"
                  min="0"
                  max={field === "x" ? 1 - crop.width : 1 - crop.height}
                  step="0.01"
                  value={crop[field]}
                  aria-valuetext={`${Math.round(crop[field] * 100)}%`}
                  onChange={(event) => {
                    setCrop((current) => ({ ...current, [field]: Number(event.target.value) }));
                    setCropDirty(true);
                  }}
                />
              </label>
            ))}
            <label>
              Tamanho do recorte (
              {Math.round(
                Math.min(
                  crop.width /
                    maximumDamCropFrame(crop.aspectWidth, crop.aspectHeight, selected.width, selected.height)
                      .width,
                  crop.height /
                    maximumDamCropFrame(crop.aspectWidth, crop.aspectHeight, selected.width, selected.height)
                      .height,
                ) * 100,
              )}
              %)
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={Math.min(
                  crop.width /
                    maximumDamCropFrame(crop.aspectWidth, crop.aspectHeight, selected.width, selected.height)
                      .width,
                  crop.height /
                    maximumDamCropFrame(crop.aspectWidth, crop.aspectHeight, selected.width, selected.height)
                      .height,
                )}
                onChange={(event) => {
                  const scale = Number(event.target.value);
                  const frame = maximumDamCropFrame(
                    crop.aspectWidth,
                    crop.aspectHeight,
                    selected.width,
                    selected.height,
                  );
                  const width = frame.width * scale;
                  const height = frame.height * scale;
                  setCrop((current) => ({
                    ...current,
                    x: Math.min(Math.max(0, current.x + current.width / 2 - width / 2), 1 - width),
                    y: Math.min(Math.max(0, current.y + current.height / 2 - height / 2), 1 - height),
                    width,
                    height,
                  }));
                  setCropDirty(true);
                }}
              />
            </label>
            {(["focalX", "focalY"] as const).map((field) => (
              <label key={field}>
                {field === "focalX" ? "Foco horizontal" : "Foco vertical"} ({Math.round(crop[field] * 100)}%)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={crop[field]}
                  aria-valuetext={`${Math.round(crop[field] * 100)}%`}
                  onChange={(event) => {
                    setCrop((current) => ({ ...current, [field]: Number(event.target.value) }));
                    setCropDirty(true);
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              disabled={!cropDirty}
              onClick={() => {
                const existing = selected.crops.find((candidate) => candidate.id === selectedCropId);
                setCrop(existing ? cropEditorValue(existing) : newCropForAsset(selected));
                setCropDirty(false);
              }}
            >
              Descartar alterações do recorte
            </button>
          </FieldGroup>
          {canEdit && (
            <button
              type="button"
              disabled={busy || !cropDirty}
              onClick={() =>
                void mutate(
                  {
                    action: "save_crop",
                    envelope: envelope(selected.lockVersion),
                    assetId: selected.id,
                    crop,
                    reason: "Recorte contextual da imagem",
                  },
                  "Recorte salvo sem alterar a imagem original.",
                )
              }
            >
              Salvar recorte
            </button>
          )}

          <div className="admin-media-usages">
            <strong>Mapa de usos</strong>
            {selected.incomingReplacement && (
              <AdminAlert tone="warning">
                Esta imagem é o destino de uma substituição ativa. Reverta a substituição de origem antes de
                arquivá-la.
              </AdminAlert>
            )}
            {selected.usages.length === 0 ? (
              <p>
                {selected.incomingReplacement
                  ? "Sem vínculos diretos de conteúdo; arquivamento bloqueado pela substituição ativa."
                  : "Sem vínculos; arquivamento permitido."}
              </p>
            ) : (
              <ul>
                {selected.usages.map((usage) => (
                  <li key={`${usage.itemId}-${usage.revisionId}-${usage.blockId}-${usage.usageKind}`}>
                    <Link to={usage.adminPath}>{usage.displayTitle}</Link> · {usageLabel(usage.usageKind)} ·{" "}
                    {usage.revisionId ? "revisão registrada" : "versão atual"}
                    {usage.blockLabel ? ` · ${usage.blockLabel}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage && (
            <FieldGroup
              legend="Substituição reversível"
              description="Primeiro analise o impacto. Os vínculos são preservados e a substituição pode ser revertida."
              disabled={busy || hasPendingDetailChanges}
            >
              {selected.activeReplacement ? (
                <div role="status">
                  <p>
                    Substituição reversível ativa. Os vínculos existentes continuam preservados e passam a
                    resolver o arquivo substituto.
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
                          reason: "Reversão da substituição da imagem",
                        },
                        "Substituição revertida; a imagem original voltou a ser usada.",
                      )
                    }
                  >
                    Reverter substituição
                  </button>
                </div>
              ) : (
                <>
                  <label>
                    Imagem substituta
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
                    atualizado para a nova imagem. Destino{" "}
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
                          reason: "Substituição revisada na biblioteca de mídia",
                        },
                        "Substituição ativada e reversão disponível.",
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
                disabled={busy || hasPendingDetailChanges}
                onClick={() =>
                  void mutate(
                    {
                      action: "restore_asset",
                      envelope: envelope(selected.lockVersion),
                      assetId: selected.id,
                      reason: "Restauração dentro do período de retenção",
                    },
                    "Imagem restaurada e remoção cancelada.",
                  )
                }
              >
                Restaurar imagem
              </button>
            ) : (
              <button
                className="admin-danger-link"
                type="button"
                disabled={
                  busy ||
                  hasPendingDetailChanges ||
                  selected.usages.length > 0 ||
                  Boolean(selected.activeReplacement) ||
                  Boolean(selected.incomingReplacement)
                }
                onClick={() =>
                  void mutate(
                    {
                      action: "archive_asset",
                      envelope: envelope(selected.lockVersion),
                      assetId: selected.id,
                      reason: "Arquivamento com retenção de 30 dias",
                    },
                    "Imagem arquivada; a exclusão física ocorrerá somente após a retenção.",
                  )
                }
              >
                Arquivar imagem
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
