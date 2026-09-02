import { useCallback, useEffect, useMemo, useState } from "react";
import { attributesCommand, pimCommand, masterDataCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  Ev2PimCapabilityResultSchema,
  Ev2PimAttributeCatalogResultSchema,
  Ev2PimMutationResultSchema,
  Ev2PimProductInputSchema,
  Ev2PimProductListResultSchema,
  type Ev2PimProductInput,
  type Ev2PimAttributeCatalogResult,
  type Ev2PimAttributeDefinition,
  type Ev2PimProductSummary,
  type Ev2PimSku,
} from "@/shared/contracts/ev2-pim";
import {
  Ev2MasterDependencyResultSchema,
  Ev2MasterEntityListResultSchema,
  type Ev2MasterEntity,
} from "@/shared/contracts/ev2-master-data";
import {
  addPimModel,
  addPimVariant,
  createEmptyPimProduct,
  setPrimaryPimModel,
  slugifyPimName,
  withGeneratedSlug,
} from "../pim-editor-model";

const CANDIDATE_ENABLED = import.meta.env.VITE_EV2_PIM_CANDIDATE === "true";
const CMS_ENVIRONMENT = import.meta.env.VITE_CMS_ENVIRONMENT === "staging" ? "staging" : "local";

type LoadedPimProduct = Ev2PimProductInput & { lockVersion: number; skus: Ev2PimSku[] };

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

function MultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: Ev2MasterEntity[];
  onChange(ids: string[]): void;
}) {
  return (
    <label>
      {label}
      <select
        multiple
        value={value}
        onChange={(event) =>
          onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
        }
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.canonicalName}
          </option>
        ))}
      </select>
      <small>Use Ctrl/Cmd para selecionar mais de uma opção.</small>
    </label>
  );
}

type AttributeEntry = Ev2PimProductInput["attributes"][number];

function TechnicalAttributeField({
  definition,
  catalog,
  entry,
  onChange,
}: {
  definition: Ev2PimAttributeDefinition;
  catalog: Ev2PimAttributeCatalogResult;
  entry?: AttributeEntry;
  onChange(value: AttributeEntry["value"] | undefined, unitCode?: string): void;
}) {
  const numeric = definition.dataType === "decimal" || definition.dataType === "range";
  const units = catalog.units.filter((unit) => unit.canonicalCode === definition.canonicalUnitCode);
  const selectedUnit = entry?.unitCode ?? definition.canonicalUnitCode ?? undefined;
  const range =
    entry?.value && typeof entry.value === "object" && !Array.isArray(entry.value) ? entry.value : undefined;
  return (
    <fieldset>
      <legend>
        {definition.label}
        {definition.required ? " *" : ""}
      </legend>
      {definition.description && <small>{definition.description}</small>}
      {definition.dataType === "text" && (
        <input
          aria-label={definition.label}
          value={typeof entry?.value === "string" ? entry.value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
      {definition.dataType === "decimal" && (
        <input
          aria-label={definition.label}
          type="number"
          step="any"
          value={typeof entry?.value === "number" ? entry.value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value), selectedUnit)
          }
        />
      )}
      {definition.dataType === "boolean" && (
        <select
          aria-label={definition.label}
          value={typeof entry?.value === "boolean" ? String(entry.value) : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.value === "true")
          }
        >
          <option value="">Não informado</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      )}
      {definition.dataType === "enum" && (
        <select
          aria-label={definition.label}
          value={typeof entry?.value === "string" ? entry.value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Selecione</option>
          {definition.enumOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
      {definition.dataType === "range" && (
        <div className="admin-form-grid">
          <label>
            Mínimo
            <input
              type="number"
              step="any"
              value={range?.min ?? ""}
              onChange={(event) => {
                if (event.target.value === "" && range === undefined) return;
                onChange({ min: Number(event.target.value || 0), max: range?.max ?? 0 }, selectedUnit);
              }}
            />
          </label>
          <label>
            Máximo
            <input
              type="number"
              step="any"
              value={range?.max ?? ""}
              onChange={(event) => {
                if (event.target.value === "" && range === undefined) return;
                onChange({ min: range?.min ?? 0, max: Number(event.target.value || 0) }, selectedUnit);
              }}
            />
          </label>
        </div>
      )}
      {numeric && (
        <label>
          Unidade
          <select
            value={selectedUnit ?? ""}
            onChange={(event) => entry && onChange(entry.value, event.target.value || undefined)}
          >
            {units.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.label} ({unit.symbol})
              </option>
            ))}
          </select>
        </label>
      )}
      <small>
        Escopo: produto · {definition.inherited ? "herdável" : "não herdável"}
        {definition.filterable ? " · filtrável após homologação" : ""}
      </small>
    </fieldset>
  );
}

export default function AdminPimPage() {
  const { session, profile } = useAdminAuth();
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    CANDIDATE_ENABLED ? "checking" : "disabled",
  );
  const [products, setProducts] = useState<Ev2PimProductSummary[]>([]);
  const [masters, setMasters] = useState<Ev2MasterEntity[]>([]);
  const [compatible, setCompatible] = useState<Record<string, string[]>>({});
  const [attributeCatalog, setAttributeCatalog] = useState<Ev2PimAttributeCatalogResult | null>(null);
  const [draft, setDraft] = useState<Ev2PimProductInput>(createEmptyPimProduct);
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>();
  const [skus, setSkus] = useState<Ev2PimSku[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canManage = profile?.permissions.includes("cms:pim.manage") ?? false;
  const canArchive = profile?.permissions.includes("cms:pim.archive") ?? false;

  const load = useCallback(async () => {
    if (!session || !CANDIDATE_ENABLED) return;
    try {
      const capabilityResult = Ev2PimCapabilityResultSchema.parse(
        await pimCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!capabilityResult.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      const [productResult, masterResult] = await Promise.all([
        pimCommand(session, {
          action: "list_products",
          envelope: envelope(),
          query: "",
          includeArchived: true,
        }),
        masterDataCommand(session, {
          action: "list_entities",
          envelope: envelope(),
          query: "",
          includeInactive: false,
        }),
      ]);
      setProducts(Ev2PimProductListResultSchema.parse(productResult).products);
      setMasters(Ev2MasterEntityListResultSchema.parse(masterResult).entities);
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "PIM indisponível.");
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session || capability !== "enabled") return;
    const requests: Array<Promise<[string, string[]]>> = [];
    const relation = (key: string, relationType: string, sourceEntityId?: string) => {
      if (!sourceEntityId) return;
      requests.push(
        masterDataCommand(session, {
          action: "get_dependencies",
          envelope: envelope(),
          relationType,
          sourceEntityId,
          includeInactive: false,
        }).then((result) => [
          key,
          Ev2MasterDependencyResultSchema.parse(result).compatibilities.map((item) => item.targetEntityId),
        ]),
      );
    };
    relation("brands", "manufacturer_brand", draft.masterData.manufacturerId);
    relation("lines", "brand_line", draft.masterData.brandId);
    relation("magnitudes", "category_magnitude", draft.masterData.categoryId);
    relation("technologies", "category_technology", draft.masterData.categoryId);
    relation("installations", "category_installation", draft.masterData.categoryId);
    relation("monitored", "category_monitored_element", draft.masterData.categoryId);
    void Promise.all(requests)
      .then((entries) => setCompatible(Object.fromEntries(entries)))
      .catch(() => setError("Não foi possível resolver as dependências dos dados mestres."));
  }, [
    capability,
    draft.masterData.brandId,
    draft.masterData.categoryId,
    draft.masterData.manufacturerId,
    session,
  ]);

  useEffect(() => {
    if (!session || capability !== "enabled" || !draft.masterData.categoryId) {
      setAttributeCatalog(null);
      return;
    }
    setAttributeCatalog(null);
    void attributesCommand(session, {
      action: "list_catalog",
      envelope: envelope(),
      categoryId: draft.masterData.categoryId,
    })
      .then((result) => setAttributeCatalog(Ev2PimAttributeCatalogResultSchema.parse(result)))
      .catch(() => setError("Não foi possível carregar as especificações técnicas desta categoria."));
  }, [capability, draft.masterData.categoryId, session]);

  const options = (type: Ev2MasterEntity["entityType"], compatibilityKey?: string) =>
    masters.filter(
      (entity) =>
        entity.entityType === type &&
        (!compatibilityKey || (compatible[compatibilityKey] ?? []).includes(entity.id)),
    );
  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return products.filter(
      (product) =>
        !needle || product.name.toLocaleLowerCase("pt-BR").includes(needle) || product.slug.includes(needle),
    );
  }, [products, query]);

  async function openProduct(productId: string) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await pimCommand<{ product: LoadedPimProduct }>(session, {
        action: "get_product",
        envelope: envelope(),
        productId,
      });
      if (!result.product) throw new Error("Produto PIM não encontrado.");
      const { lockVersion, skus: loadedSkus, ...product } = result.product;
      setDraft(Ev2PimProductInputSchema.parse(product));
      setLoadedVersion(lockVersion);
      setSkus(loadedSkus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Produto PIM indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session) return;
    const missingRequired = attributeCatalog?.definitions.filter(
      (definition) =>
        definition.required &&
        !draft.attributes.some(
          (entry) =>
            entry.definitionId === definition.id && entry.scope === "product" && entry.ownerId === draft.id,
        ),
    );
    if (missingRequired?.length) {
      setError(
        `Preencha as especificações obrigatórias: ${missingRequired.map((item) => item.label).join(", ")}.`,
      );
      return;
    }
    const parsed = Ev2PimProductInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Cadastro PIM incompleto.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = Ev2PimMutationResultSchema.parse(
        await pimCommand(
          session,
          {
            action: "save_product",
            envelope: envelope(loadedVersion),
            mode: loadedVersion === undefined ? "create" : "update",
            product: parsed.data,
            reason: loadedVersion === undefined ? "Criação guiada do PIM" : "Atualização guiada do PIM",
          },
          crypto.randomUUID(),
        ),
      );
      await load();
      await openProduct(result.productId);
      setSuccess(`Produto normalizado salvo. Código ${result.correlationId.slice(0, 8)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "O cadastro foi preservado, mas não foi salvo.");
    } finally {
      setBusy(false);
    }
  }

  async function generateSku(modelId: string, variantId?: string) {
    if (!session || loadedVersion === undefined) return;
    setBusy(true);
    setError("");
    try {
      const result = Ev2PimMutationResultSchema.parse(
        await pimCommand(
          session,
          {
            action: "generate_sku",
            envelope: envelope(),
            productId: draft.id,
            modelId,
            variantId,
            reason: "Geração governada de SKU",
          },
          crypto.randomUUID(),
        ),
      );
      if (result.sku)
        setSkus((current) => [...current.filter((item) => item.id !== result.sku?.id), result.sku!]);
      setSuccess(`SKU ${result.sku?.sku ?? "gerado"} registrado e imutável.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar o SKU.");
    } finally {
      setBusy(false);
    }
  }

  function setProductAttribute(
    definition: Ev2PimAttributeDefinition,
    value: AttributeEntry["value"] | undefined,
    unitCode?: string,
  ) {
    setDraft((current) => {
      const existing = current.attributes.find(
        (entry) =>
          entry.definitionId === definition.id && entry.scope === "product" && entry.ownerId === current.id,
      );
      const remaining = current.attributes.filter((entry) => entry !== existing);
      if (value === undefined) return { ...current, attributes: remaining };
      return {
        ...current,
        attributes: [
          ...remaining,
          {
            id: existing?.id ?? crypto.randomUUID(),
            definitionId: definition.id,
            scope: "product",
            ownerId: current.id,
            value,
            ...(unitCode ? { unitCode } : {}),
            sourceType: "manual",
            sourceRef: current.sourceRef,
            confidence: 1,
            homologated: existing?.homologated ?? false,
          },
        ],
      };
    });
  }

  if (!CANDIDATE_ENABLED)
    return (
      <section>
        <h1>PIM EV2</h1>
        <div role="status" className="admin-notice">
          O candidato EV2.4 não está incluído neste build. O editor de produtos v1 permanece ativo.
        </div>
      </section>
    );
  if (capability !== "enabled")
    return (
      <section>
        <h1>PIM EV2</h1>
        <div role={capability === "error" ? "alert" : "status"} className="admin-notice">
          {capability === "checking"
            ? "Verificando autorização do PIM EV2.4…"
            : capability === "error"
              ? error || "Não foi possível verificar o PIM EV2.4."
              : "O PIM EV2.4 está desativado. O catálogo v1 permanece operacional."}
        </div>
      </section>
    );

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">EV2.4 · PIM NORMALIZADO</p>
          <h1>Produtos, modelos, variantes e SKU</h1>
          <p className="admin-help">
            Cadastro guiado sem UUID ou JSON visível. O catálogo v1 continua intacto até a reconciliação do
            Gate G4.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="admin-notice--success">
          {success}
        </div>
      )}
      <div className="admin-editor-card">
        <div className="admin-section-heading">
          <div>
            <h2>Catálogo shadow</h2>
            <p>Somente identidades normalizadas da EV2.4.</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setDraft(createEmptyPimProduct());
                setLoadedVersion(undefined);
                setSkus([]);
              }}
            >
              Novo produto
            </button>
          )}
        </div>
        <label>
          Buscar produto
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Estado</th>
                <th>Modelos</th>
                <th>Variantes</th>
                <th>SKUs ativos</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <small>{product.slug}</small>
                  </td>
                  <td>{product.status}</td>
                  <td>{product.modelCount}</td>
                  <td>{product.variantCount}</td>
                  <td>{product.skuCount}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => void openProduct(product.id)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canManage && (
        <div className="admin-editor-card">
          <h2>{loadedVersion === undefined ? "Novo produto PIM" : "Editar identidade PIM"}</h2>
          <div className="admin-form-grid">
            <label>
              Nome do produto
              <input
                required
                maxLength={180}
                value={draft.name}
                onChange={(event) => setDraft((current) => withGeneratedSlug(current, event.target.value))}
              />
            </label>
            <label>
              Endereço público sugerido
              <input
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </label>
            <label>
              Resumo
              <textarea
                maxLength={500}
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
            <label>
              Proposta de valor
              <textarea
                maxLength={500}
                value={draft.valueProposition}
                onChange={(event) => setDraft({ ...draft, valueProposition: event.target.value })}
              />
            </label>
            <label>
              Fabricante
              <select
                required
                value={draft.masterData.manufacturerId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    attributes: [],
                    masterData: {
                      ...draft.masterData,
                      manufacturerId: event.target.value,
                      brandId: undefined,
                      lineId: undefined,
                    },
                  })
                }
              >
                <option value="">Selecione</option>
                {options("manufacturer").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Marca
              <select
                value={draft.masterData.brandId ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    masterData: {
                      ...draft.masterData,
                      brandId: event.target.value || undefined,
                      lineId: undefined,
                    },
                  })
                }
              >
                <option value="">Sem marca</option>
                {options("brand", "brands").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linha
              <select
                value={draft.masterData.lineId ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    masterData: { ...draft.masterData, lineId: event.target.value || undefined },
                  })
                }
              >
                <option value="">Linha geral</option>
                {options("line", "lines").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoria
              <select
                required
                value={draft.masterData.categoryId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    attributes: [],
                    masterData: {
                      ...draft.masterData,
                      categoryId: event.target.value,
                      magnitudeIds: [],
                      technologyIds: [],
                      installationIds: [],
                      monitoredElementIds: [],
                    },
                  })
                }
              >
                <option value="">Selecione</option>
                {options("category").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </label>
            <MultiSelect
              label="Grandezas"
              value={draft.masterData.magnitudeIds}
              options={options("magnitude", "magnitudes")}
              onChange={(ids) =>
                setDraft({ ...draft, masterData: { ...draft.masterData, magnitudeIds: ids } })
              }
            />
            <MultiSelect
              label="Tecnologias"
              value={draft.masterData.technologyIds}
              options={options("technology", "technologies")}
              onChange={(ids) =>
                setDraft({ ...draft, masterData: { ...draft.masterData, technologyIds: ids } })
              }
            />
            <MultiSelect
              label="Instalações"
              value={draft.masterData.installationIds}
              options={options("installation", "installations")}
              onChange={(ids) =>
                setDraft({ ...draft, masterData: { ...draft.masterData, installationIds: ids } })
              }
            />
            <MultiSelect
              label="Elementos monitorados"
              value={draft.masterData.monitoredElementIds}
              options={options("monitored_element", "monitored")}
              onChange={(ids) =>
                setDraft({ ...draft, masterData: { ...draft.masterData, monitoredElementIds: ids } })
              }
            />
          </div>
          <div className="admin-section-heading">
            <div>
              <h3>Modelos e variantes</h3>
              <p>Um modelo ativo deve ser o principal. Produtos simples não precisam de variante.</p>
            </div>
            <button type="button" onClick={() => setDraft(addPimModel(draft))}>
              Adicionar modelo
            </button>
          </div>
          {draft.models.map((model, modelIndex) => (
            <fieldset key={model.id}>
              <legend>Modelo {modelIndex + 1}</legend>
              <div className="admin-form-grid">
                <label>
                  Nome comercial
                  <input
                    required
                    value={model.name}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        models: draft.models.map((item) =>
                          item.id === model.id ? { ...item, name: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  MPN do fabricante
                  <input
                    value={model.mpn ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        models: draft.models.map((item) =>
                          item.id === model.id ? { ...item, mpn: event.target.value || undefined } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="admin-checkbox">
                  <input
                    type="radio"
                    name="primary-model"
                    checked={model.primary}
                    onChange={() => setDraft(setPrimaryPimModel(draft, model.id))}
                  />
                  Modelo principal
                </label>
              </div>
              <button type="button" onClick={() => setDraft(addPimVariant(draft, model.id))}>
                Adicionar variante
              </button>
              {model.variants.map((variant, variantIndex) => (
                <div key={variant.id} className="admin-form-grid">
                  <label>
                    Variante {variantIndex + 1}
                    <input
                      required
                      value={variant.name}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          models: draft.models.map((item) =>
                            item.id === model.id
                              ? {
                                  ...item,
                                  variants: item.variants.map((entry) =>
                                    entry.id === variant.id ? { ...entry, name: event.target.value } : entry,
                                  ),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Eixo
                    <input
                      value={variant.axes[0]?.axisLabel ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          models: draft.models.map((item) =>
                            item.id === model.id
                              ? {
                                  ...item,
                                  variants: item.variants.map((entry) =>
                                    entry.id === variant.id
                                      ? {
                                          ...entry,
                                          axes: [
                                            {
                                              ...entry.axes[0],
                                              axisLabel: event.target.value,
                                              axisKey:
                                                slugifyPimName(event.target.value).slice(0, 60) ||
                                                entry.axes[0].axisKey,
                                            },
                                          ],
                                        }
                                      : entry,
                                  ),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Opção
                    <input
                      value={variant.axes[0]?.optionLabel ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          models: draft.models.map((item) =>
                            item.id === model.id
                              ? {
                                  ...item,
                                  variants: item.variants.map((entry) =>
                                    entry.id === variant.id
                                      ? {
                                          ...entry,
                                          axes: [
                                            {
                                              ...entry.axes[0],
                                              optionLabel: event.target.value,
                                              optionKey:
                                                slugifyPimName(event.target.value).slice(0, 80) ||
                                                entry.axes[0].optionKey,
                                            },
                                          ],
                                        }
                                      : entry,
                                  ),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  {loadedVersion !== undefined && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateSku(model.id, variant.id)}
                    >
                      Gerar SKU desta variante
                    </button>
                  )}
                </div>
              ))}
              {loadedVersion !== undefined && !model.variants.length && (
                <button type="button" disabled={busy} onClick={() => void generateSku(model.id)}>
                  Gerar SKU do modelo
                </button>
              )}
            </fieldset>
          ))}
          {skus.length > 0 && (
            <div>
              <h3>SKUs imutáveis</h3>
              <ul>
                {skus.map((sku) => (
                  <li key={sku.id}>
                    <strong>{sku.sku}</strong> · {sku.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {attributeCatalog?.attributeSet && (
            <div>
              <h3>Especificações técnicas</h3>
              <p>
                {attributeCatalog.attributeSet.name} · versão {attributeCatalog.attributeSet.version}
              </p>
              {attributeCatalog.definitions.map((definition) => (
                <TechnicalAttributeField
                  key={definition.id}
                  definition={definition}
                  catalog={attributeCatalog}
                  entry={draft.attributes.find(
                    (entry) =>
                      entry.definitionId === definition.id &&
                      entry.scope === "product" &&
                      entry.ownerId === draft.id,
                  )}
                  onChange={(value, unitCode) => setProductAttribute(definition, value, unitCode)}
                />
              ))}
            </div>
          )}
          <label>
            Referência da fonte
            <input
              required
              value={draft.provenance[0]?.sourceRef ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  provenance: [{ ...draft.provenance[0], sourceRef: event.target.value }],
                })
              }
            />
          </label>
          <button className="admin-button" type="button" disabled={busy} onClick={() => void save()}>
            Salvar produto normalizado
          </button>
          {loadedVersion !== undefined && canArchive && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Arquivar o produto e aposentar seus SKUs ativos?")) return;
                void pimCommand(
                  session!,
                  {
                    action: "archive_product",
                    envelope: envelope(loadedVersion),
                    productId: draft.id,
                    reason: "Arquivamento governado do PIM",
                  },
                  crypto.randomUUID(),
                )
                  .then(() => load())
                  .catch((caught) =>
                    setError(caught instanceof Error ? caught.message : "Falha ao arquivar."),
                  );
              }}
            >
              Arquivar
            </button>
          )}
        </div>
      )}
    </section>
  );
}
