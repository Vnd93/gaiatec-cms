import { useEffect, useRef, useState } from "react";
import { damCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment } from "../ev2-runtime";
import { fingerprintMediaFile } from "../dam-model";
import {
  uploadMediaPackage,
  validateOriginalMediaFile,
  type MediaUploadDescriptor,
} from "../media-upload-model";
import { createResponsiveMediaPackage } from "../responsive-media";
import { rightsExpiryAtOperationalDayEnd } from "../rights-expiry";
import {
  Ev2DamAssetListResultSchema,
  Ev2DamAssetResultSchema,
  Ev2DamCapabilityResultSchema,
  Ev2DamMatchResultSchema,
  type Ev2DamAsset,
  type Ev2DamCollection,
} from "@/shared/contracts/ev2-dam";
import { operatorErrorMessage } from "../operator-error-message";

const CMS_ENVIRONMENT = cmsEnvironment();

const rightsStateLabels: Record<Ev2DamAsset["rightsState"], string> = {
  valid: "Direitos válidos",
  expiring: "Direitos próximos do vencimento",
  expired: "Direitos vencidos",
  undated: "Direitos sem vencimento",
};

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
  };
}

function isSelectableAsset(asset: Ev2DamAsset) {
  return (
    asset.processingStatus === "ready" &&
    asset.scanStatus === "clean" &&
    asset.rightsState !== "expired" &&
    asset.archivedAt === null
  );
}

export type DamPickerSelection = Pick<Ev2DamAsset, "id" | "originalFilename" | "altText" | "previewUrl">;

export function DamPicker({
  label,
  value,
  multiple = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: DamPickerSelection[];
  multiple?: boolean;
  disabled?: boolean;
  onChange(value: DamPickerSelection[]): void;
}) {
  const { session, profile } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">("checking");
  const [items, setItems] = useState<Ev2DamAsset[]>([]);
  const [collections, setCollections] = useState<Ev2DamCollection[]>([]);
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [original, setOriginal] = useState<File | undefined>();
  const [sourceReference, setSourceReference] = useState("");
  const [ownerName, setOwnerName] = useState("GAIATEC SISTEMAS");
  const [licenseName, setLicenseName] = useState("Uso autorizado pela GAIATEC");
  const [altText, setAltText] = useState("");
  const [rightsExpiresOn, setRightsExpiresOn] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [similarHash, setSimilarHash] = useState("");
  const [preparationMessage, setPreparationMessage] = useState("");
  const uploadAbortController = useRef<AbortController | null>(null);
  const latestValue = useRef(value);
  const latestOnChange = useRef(onChange);
  const latestMultiple = useRef(multiple);
  latestValue.current = value;
  latestOnChange.current = onChange;
  latestMultiple.current = multiple;
  const canUpload = profile?.permissions.includes("cms:media.upload") ?? false;

  async function load() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const flag = Ev2DamCapabilityResultSchema.parse(
        await damCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!flag.enabled) {
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
          includeArchived: false,
          page: 1,
          pageSize: 50,
        }),
      );
      setItems(result.items.filter(isSelectableAsset));
      setCollections(result.collections);
    } catch (caught) {
      setCapability("error");
      setError(operatorErrorMessage(caught, { fallback: "Seletor de mídia indisponível." }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      const operation = uploadAbortController.current;
      uploadAbortController.current = null;
      operation?.abort(new DOMException("Envio interrompido ao fechar o seletor.", "AbortError"));
    },
    [],
  );

  function selectionFromAsset(asset: Ev2DamAsset): DamPickerSelection {
    return {
      id: asset.id,
      originalFilename: asset.originalFilename,
      altText: asset.altText,
      previewUrl: asset.previewUrl,
    };
  }

  function select(asset: Ev2DamAsset) {
    if (!isSelectableAsset(asset)) return;
    const selection = selectionFromAsset(asset);
    if (!latestMultiple.current) {
      latestOnChange.current([selection]);
      setOpen(false);
      return;
    }
    const currentValue = latestValue.current;
    if (!currentValue.some((current) => current.id === asset.id)) {
      latestOnChange.current([...currentValue, selection]);
    }
  }

  function toggle(asset: Ev2DamAsset) {
    if (busy || disabled || !isSelectableAsset(asset)) return;
    const selection = selectionFromAsset(asset);
    if (!latestMultiple.current) {
      latestOnChange.current([selection]);
      setOpen(false);
      return;
    }
    const currentValue = latestValue.current;
    latestOnChange.current(
      currentValue.some((current) => current.id === asset.id)
        ? currentValue.filter((current) => current.id !== asset.id)
        : [...currentValue, selection],
    );
  }

  function chooseFile(file?: File) {
    if (busy) return;
    setOriginal(file);
    setSimilarHash("");
  }

  function cancelQuickUpload() {
    const operation = uploadAbortController.current;
    if (!operation || operation.signal.aborted) return;
    setPreparationMessage("Cancelando envio…");
    operation.abort(new DOMException("Envio cancelado pelo operador.", "AbortError"));
  }

  async function quickUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy || uploadAbortController.current) return;
    const issues = validateOriginalMediaFile(original);
    if (sourceReference.trim().length < 3) issues.push("Informe a referência da origem.");
    if (ownerName.trim().length < 2) issues.push("Informe o proprietário.");
    if (licenseName.trim().length < 2) issues.push("Informe a licença.");
    if (!altText.trim()) issues.push("Informe o texto alternativo.");
    if (!rightsConfirmed) issues.push("Confirme os direitos de uso.");
    if (issues.length) {
      setError(issues[0]!);
      return;
    }
    const operation = new AbortController();
    uploadAbortController.current = operation;
    const submitted = {
      original: original!,
      sourceReference: sourceReference.trim(),
      ownerName: ownerName.trim(),
      licenseName: licenseName.trim(),
      altText: altText.trim(),
      rightsExpiresOn,
      similarHash,
    };
    setBusy(true);
    setError("");
    let reservedAssetId = "";
    try {
      const fingerprint = await fingerprintMediaFile(submitted.original);
      operation.signal.throwIfAborted();
      const matches = Ev2DamMatchResultSchema.parse(
        await damCommand(session, {
          action: "match_asset",
          envelope: envelope(),
          ...fingerprint,
          maximumDistance: 8,
        }),
      );
      operation.signal.throwIfAborted();
      if (matches.exact) {
        if (!isSelectableAsset(matches.exact)) {
          setError("O arquivo já existe, mas ainda não está liberado para uso.");
          return;
        }
        select(matches.exact);
        setError("Arquivo já existente reutilizado; nenhum upload foi necessário.");
        return;
      }
      const selectableSimilar = matches.similar.filter(isSelectableAsset);
      if (selectableSimilar.length && submitted.similarHash !== fingerprint.sha256) {
        setItems((current) => [
          ...selectableSimilar,
          ...current.filter((item) => !selectableSimilar.some((match) => match.id === item.id)),
        ]);
        setSimilarHash(fingerprint.sha256);
        setError(
          "Há imagens semelhantes no início da lista. Revise e envie novamente somente se esta imagem for distinta.",
        );
        return;
      }
      setPreparationMessage("Preparando versões para diferentes telas…");
      const responsiveFiles = await createResponsiveMediaPackage(submitted.original, {
        onProgress: (progress) => {
          if (uploadAbortController.current === operation && !operation.signal.aborted) {
            setPreparationMessage(`${progress.message}…`);
          }
        },
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      const reservation = await damCommand<{ assetId: string; uploads: MediaUploadDescriptor[] }>(session, {
        action: "reserve_upload",
        envelope: envelope(),
        metadata: {
          originalFilename: submitted.original.name,
          declaredMime: submitted.original.type,
          sourceKind: "owner_authored",
          sourceReference: submitted.sourceReference,
          rightsConfirmed: true,
          rightsExpiresAt: rightsExpiryAtOperationalDayEnd(submitted.rightsExpiresOn),
          licenseName: submitted.licenseName,
          ownerName: submitted.ownerName,
          altText: submitted.altText,
          caption: null,
          credit: null,
          focalX: 0.5,
          focalY: 0.5,
          ...fingerprint,
        },
      });
      reservedAssetId = reservation.assetId;
      operation.signal.throwIfAborted();
      setPreparationMessage("Enviando as imagens com segurança…");
      await uploadMediaPackage(reservation.uploads, responsiveFiles, fetch, {
        signal: operation.signal,
      });
      operation.signal.throwIfAborted();
      await damCommand(session, {
        action: "finalize_upload",
        envelope: envelope(),
        assetId: reservation.assetId,
      });
      operation.signal.throwIfAborted();
      reservedAssetId = "";
      const result = Ev2DamAssetResultSchema.parse(
        await damCommand(session, {
          action: "get_asset",
          envelope: envelope(),
          assetId: reservation.assetId,
        }),
      );
      operation.signal.throwIfAborted();
      if (uploadAbortController.current === operation) {
        select(result.asset);
        setOriginal(undefined);
        setShowUpload(false);
        setSourceReference("");
        setAltText("");
        setRightsConfirmed(false);
      }
    } catch (caught) {
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
          // Preserve the original error; stale reservations are also covered by the server watchdog.
        }
      }
      if (uploadAbortController.current === operation) {
        setError(
          operation.signal.aborted
            ? reservedAssetId
              ? "Envio cancelado. A reserva temporária foi encaminhada para limpeza segura."
              : "Envio cancelado antes da reserva da imagem."
            : operatorErrorMessage(caught, { fallback: "Não foi possível enviar a imagem." }),
        );
      }
    } finally {
      if (uploadAbortController.current === operation) {
        uploadAbortController.current = null;
        setPreparationMessage("");
        setBusy(false);
      }
    }
  }

  return (
    <fieldset className="admin-dam-picker">
      <legend>{label}</legend>
      {value.length ? (
        <ul className="admin-dam-picker__selection">
          {value.map((asset) => (
            <li key={asset.id}>
              {asset.previewUrl && <img src={asset.previewUrl} alt="" />}
              {asset.originalFilename}
              <button
                type="button"
                aria-label={`Remover ${asset.originalFilename}`}
                disabled={disabled || busy}
                onClick={() => onChange(value.filter((current) => current.id !== asset.id))}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-help">Nenhuma imagem selecionada.</p>
      )}
      <button type="button" disabled={disabled || busy} onClick={() => setOpen((current) => !current)}>
        {open ? "Fechar biblioteca" : "Escolher ou enviar imagem"}
      </button>
      {open && (
        <div className="admin-dam-picker__panel">
          {capability === "disabled" ? (
            <p>A biblioteca de mídia não está disponível para esta sessão.</p>
          ) : (
            <>
              <div className="admin-dam-picker__filters">
                <label>
                  Buscar
                  <input
                    disabled={disabled || busy}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label>
                  Coleção
                  <select
                    disabled={disabled || busy}
                    value={collectionId}
                    onChange={(event) => setCollectionId(event.target.value)}
                  >
                    <option value="">Todas</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => void load()} disabled={disabled || loading || busy}>
                  Filtrar
                </button>
              </div>
              {error && (
                <p className="admin-notice admin-notice--error" role="alert">
                  {error}
                </p>
              )}
              {loading ? (
                <p>Carregando biblioteca…</p>
              ) : (
                <div className="admin-dam-picker__grid">
                  {items.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      disabled={disabled || busy}
                      className={value.some((current) => current.id === asset.id) ? "is-selected" : ""}
                      onClick={() => toggle(asset)}
                    >
                      {asset.previewUrl && <img src={asset.previewUrl} alt="" />}
                      <strong>{asset.originalFilename}</strong>
                      <span>{asset.altText}</span>
                      <small>{rightsStateLabels[asset.rightsState]}</small>
                    </button>
                  ))}
                </div>
              )}
              {canUpload && (
                <>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => setShowUpload((current) => !current)}
                  >
                    {showUpload ? "Cancelar envio" : "Enviar nova imagem sem sair"}
                  </button>
                  {showUpload && (
                    <form className="admin-form admin-dam-picker__upload" onSubmit={quickUpload}>
                      <label>
                        Imagem original
                        <input
                          type="file"
                          required
                          disabled={disabled || busy}
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          onChange={(event) => chooseFile(event.target.files?.[0])}
                        />
                        <small>As versões otimizadas para outras telas são preparadas automaticamente.</small>
                      </label>
                      <label>
                        Referência da origem
                        <input
                          required
                          disabled={disabled || busy}
                          minLength={3}
                          maxLength={500}
                          value={sourceReference}
                          onChange={(event) => setSourceReference(event.target.value)}
                        />
                      </label>
                      <label>
                        Proprietário
                        <input
                          required
                          disabled={disabled || busy}
                          minLength={2}
                          maxLength={120}
                          value={ownerName}
                          onChange={(event) => setOwnerName(event.target.value)}
                        />
                      </label>
                      <label>
                        Licença
                        <input
                          required
                          disabled={disabled || busy}
                          minLength={2}
                          maxLength={120}
                          value={licenseName}
                          onChange={(event) => setLicenseName(event.target.value)}
                        />
                      </label>
                      <label>
                        Direitos válidos até
                        <input
                          type="date"
                          disabled={disabled || busy}
                          value={rightsExpiresOn}
                          onChange={(event) => setRightsExpiresOn(event.target.value)}
                        />
                      </label>
                      <label>
                        Texto alternativo
                        <textarea
                          required
                          disabled={disabled || busy}
                          maxLength={300}
                          value={altText}
                          onChange={(event) => setAltText(event.target.value)}
                        />
                      </label>
                      <label className="admin-checkbox-row">
                        <input
                          type="checkbox"
                          disabled={disabled || busy}
                          checked={rightsConfirmed}
                          onChange={(event) => setRightsConfirmed(event.target.checked)}
                        />
                        Confirmo origem e direitos
                      </label>
                      <button type="submit" disabled={disabled || busy}>
                        {busy
                          ? "Validando…"
                          : similarHash
                            ? "Confirmar imagem distinta"
                            : "Verificar e enviar"}
                      </button>
                      {busy && (
                        <button type="button" onClick={cancelQuickUpload}>
                          Cancelar envio em andamento
                        </button>
                      )}
                      {preparationMessage && (
                        <p role="status" aria-live="polite">
                          {preparationMessage}
                        </p>
                      )}
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
