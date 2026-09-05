import { useEffect, useState } from "react";
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
  type Ev2DamAsset,
  type Ev2DamCollection,
} from "@/shared/contracts/ev2-dam";

const CMS_ENVIRONMENT = cmsEnvironment();

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
  };
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
  const [files, setFiles] = useState<Partial<Record<MediaUploadSlot, File>>>({});
  const [sourceReference, setSourceReference] = useState("");
  const [ownerName, setOwnerName] = useState("GAIATEC SISTEMAS");
  const [licenseName, setLicenseName] = useState("Uso autorizado pela GAIATEC");
  const [altText, setAltText] = useState("");
  const [rightsExpiresOn, setRightsExpiresOn] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [similarHash, setSimilarHash] = useState("");
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
      setItems(
        result.items.filter((asset) => asset.processingStatus === "ready" && asset.rightsState !== "expired"),
      );
      setCollections(result.collections);
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "Seletor de mídia indisponível.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(asset: Ev2DamAsset) {
    const selection = {
      id: asset.id,
      originalFilename: asset.originalFilename,
      altText: asset.altText,
      previewUrl: asset.previewUrl,
    };
    if (!multiple) {
      onChange([selection]);
      setOpen(false);
      return;
    }
    onChange(
      value.some((current) => current.id === asset.id)
        ? value.filter((current) => current.id !== asset.id)
        : [...value, selection],
    );
  }

  function chooseFile(slot: MediaUploadSlot, file?: File) {
    setFiles((current) => {
      const next = { ...current };
      if (file) next[slot] = file;
      else delete next[slot];
      return next;
    });
    if (slot === "original") setSimilarHash("");
  }

  async function quickUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    const issues = validateMediaUploadPackage(files);
    if (sourceReference.trim().length < 3) issues.push("Informe a referência da origem.");
    if (!altText.trim()) issues.push("Informe o texto alternativo.");
    if (!rightsConfirmed) issues.push("Confirme os direitos de uso.");
    if (issues.length) {
      setError(issues[0]!);
      return;
    }
    setBusy(true);
    setError("");
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
        toggle(matches.exact);
        setError("Arquivo já existente reutilizado; nenhum upload foi necessário.");
        return;
      }
      if (matches.similar.length && similarHash !== fingerprint.sha256) {
        setItems((current) => [
          ...matches.similar,
          ...current.filter((item) => !matches.similar.some((match) => match.id === item.id)),
        ]);
        setSimilarHash(fingerprint.sha256);
        setError(
          "Há imagens semelhantes no início da lista. Revise e envie novamente somente se esta imagem for distinta.",
        );
        return;
      }
      const reservation = await damCommand<{ assetId: string; uploads: MediaUploadDescriptor[] }>(session, {
        action: "reserve_upload",
        envelope: envelope(),
        metadata: {
          originalFilename: files.original!.name,
          declaredMime: files.original!.type,
          sourceKind: "owner_authored",
          sourceReference,
          rightsConfirmed: true,
          rightsExpiresAt: rightsExpiresOn
            ? new Date(`${rightsExpiresOn}T23:59:59.000Z`).toISOString()
            : null,
          licenseName,
          ownerName,
          altText,
          caption: null,
          credit: null,
          focalX: 0.5,
          focalY: 0.5,
          ...fingerprint,
        },
      });
      await uploadMediaPackage(reservation.uploads, files);
      await damCommand(session, {
        action: "finalize_upload",
        envelope: envelope(),
        assetId: reservation.assetId,
      });
      const result = Ev2DamAssetResultSchema.parse(
        await damCommand(session, {
          action: "get_asset",
          envelope: envelope(),
          assetId: reservation.assetId,
        }),
      );
      toggle(result.asset);
      setFiles({});
      setShowUpload(false);
      setSourceReference("");
      setAltText("");
      setRightsConfirmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
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
                disabled={disabled}
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
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)}>
        {open ? "Fechar biblioteca" : "Escolher ou enviar imagem"}
      </button>
      {open && (
        <div className="admin-dam-picker__panel">
          {capability === "disabled" ? (
            <p>O DAM EV2.5 não está habilitado para esta sessão.</p>
          ) : (
            <>
              <div className="admin-dam-picker__filters">
                <label>
                  Buscar
                  <input value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <label>
                  Coleção
                  <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                    <option value="">Todas</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => void load()} disabled={loading}>
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
                      className={value.some((current) => current.id === asset.id) ? "is-selected" : ""}
                      onClick={() => toggle(asset)}
                    >
                      {asset.previewUrl && <img src={asset.previewUrl} alt="" />}
                      <strong>{asset.originalFilename}</strong>
                      <span>{asset.altText}</span>
                      <small>Direitos: {asset.rightsState}</small>
                    </button>
                  ))}
                </div>
              )}
              {canUpload && (
                <>
                  <button type="button" onClick={() => setShowUpload((current) => !current)}>
                    {showUpload ? "Cancelar envio" : "Enviar nova imagem sem sair"}
                  </button>
                  {showUpload && (
                    <form className="admin-form admin-dam-picker__upload" onSubmit={quickUpload}>
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
                          {slot}
                          <input
                            type="file"
                            required
                            accept={slot.endsWith(".webp") ? "image/webp" : "image/avif"}
                            onChange={(event) => chooseFile(slot, event.target.files?.[0])}
                          />
                        </label>
                      ))}
                      <label>
                        Referência da origem
                        <input
                          required
                          value={sourceReference}
                          onChange={(event) => setSourceReference(event.target.value)}
                        />
                      </label>
                      <label>
                        Proprietário
                        <input
                          required
                          value={ownerName}
                          onChange={(event) => setOwnerName(event.target.value)}
                        />
                      </label>
                      <label>
                        Licença
                        <input
                          required
                          value={licenseName}
                          onChange={(event) => setLicenseName(event.target.value)}
                        />
                      </label>
                      <label>
                        Direitos válidos até
                        <input
                          type="date"
                          value={rightsExpiresOn}
                          onChange={(event) => setRightsExpiresOn(event.target.value)}
                        />
                      </label>
                      <label>
                        Texto alternativo
                        <textarea
                          required
                          value={altText}
                          onChange={(event) => setAltText(event.target.value)}
                        />
                      </label>
                      <label className="admin-checkbox-row">
                        <input
                          type="checkbox"
                          checked={rightsConfirmed}
                          onChange={(event) => setRightsConfirmed(event.target.checked)}
                        />
                        Confirmo origem e direitos
                      </label>
                      <button type="submit" disabled={busy}>
                        {busy
                          ? "Validando…"
                          : similarHash
                            ? "Confirmar imagem distinta"
                            : "Verificar e enviar"}
                      </button>
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
