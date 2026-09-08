import { useMemo } from "react";
import type { CmsProductContent } from "@/shared/contracts/cms-content";
import type { Ev2PimAttributeDefinition, Ev2PimUnit } from "@/shared/contracts/ev2-pim";
import { operatorErrorMessage } from "../operator-error-message";
import { DamPicker, type DamPickerSelection } from "./DamPicker";
import { EntityPicker } from "./EntityPicker";

type ProductSpecification = CmsProductContent["specifications"][number];
type ProductIdentifier = CmsProductContent["externalIdentifiers"][number];
type ProductModel = CmsProductContent["models"][number];
type ProductMedia = CmsProductContent["media"][number];
type ProductBlock = CmsProductContent["blocks"][number];
type ProductRedirect = CmsProductContent["redirects"][number];
type ProductProvenance = CmsProductContent["provenance"][number];
type EditableProductProvenance = Omit<ProductProvenance, "rightsConfirmed"> & {
  rightsConfirmed: boolean;
};

export type ProductRelationOption = {
  id: string;
  label: string;
  description: string;
  kind: "product" | "application" | "industry" | "service";
};

function parseArray<T>(value: string): T[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function encode(value: unknown[]) {
  return JSON.stringify(value, null, 2);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function move<T>(items: T[], index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function specificationType(dataType: Ev2PimAttributeDefinition["dataType"]): ProductSpecification["type"] {
  return dataType === "decimal" ? "number" : dataType;
}

function initialSpecificationValue(type: ProductSpecification["type"]): ProductSpecification["value"] {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "enum") return [];
  if (type === "range") return { min: 0, max: 0 };
  return "";
}

function compatibleUnits(
  definition: Ev2PimAttributeDefinition | undefined,
  units: Ev2PimUnit[],
): Ev2PimUnit[] {
  if (!definition?.canonicalUnitCode) return [];
  const canonical = units.find((unit) => unit.code === definition.canonicalUnitCode);
  return canonical
    ? units.filter((unit) => unit.dimensionKey === canonical.dimensionKey)
    : units.filter((unit) => unit.code === definition.canonicalUnitCode);
}

function BrokenStructure({ label, onRepair }: { label: string; onRepair(): void }) {
  return (
    <div className="admin-notice admin-notice--error" role="alert">
      <p>
        {label} não pôde ser aberto no editor visual. O rascunho foi preservado e nenhuma alteração foi
        gravada.
      </p>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(`Substituir somente a estrutura inválida de ${label.toLocaleLowerCase("pt-BR")}?`)
          )
            onRepair();
        }}
      >
        Iniciar estrutura vazia
      </button>
    </div>
  );
}

export function ProductSpecificationsEditor({
  value,
  modelsValue = "[]",
  definitions = [],
  units = [],
  catalogLoading = false,
  catalogError = "",
  onChange,
  disabled = false,
}: {
  value: string;
  modelsValue?: string;
  definitions?: Ev2PimAttributeDefinition[];
  units?: Ev2PimUnit[];
  catalogLoading?: boolean;
  catalogError?: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const specifications = useMemo(() => parseArray<ProductSpecification>(value), [value]);
  const models = useMemo(() => parseArray<ProductModel>(modelsValue) ?? [], [modelsValue]);
  const update = (next: ProductSpecification[]) => onChange(encode(next));
  if (!specifications) return <BrokenStructure label="As especificações" onRepair={() => update([])} />;

  const patch = (index: number, next: Partial<ProductSpecification>) =>
    update(specifications.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));

  return (
    <section className="admin-semantic-editor" aria-labelledby="product-specifications-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="product-specifications-title">Atributos técnicos</h3>
          <p>Escolha atributos aprovados e informe os valores que serão usados no catálogo.</p>
        </div>
        <button
          type="button"
          disabled={disabled || catalogLoading || definitions.length === 0 || specifications.length >= 200}
          onClick={() =>
            update([
              ...specifications,
              {
                id: crypto.randomUUID(),
                key: `atributo-${specifications.length + 1}`,
                label: "",
                type: "text",
                value: "",
                required: false,
                filterable: false,
                comparable: false,
                searchable: false,
                scope: "product",
                sourceType: "manual",
                confidence: 1,
                homologated: false,
              },
            ])
          }
        >
          Adicionar atributo
        </button>
      </div>
      {catalogLoading && (
        <p className="admin-notice" role="status">
          Carregando atributos controlados da categoria…
        </p>
      )}
      {catalogError && (
        <p className="admin-notice admin-notice--error" role="alert">
          {operatorErrorMessage(catalogError, {
            fallback: "Não foi possível carregar os atributos desta categoria.",
          })}
        </p>
      )}
      {!catalogLoading && !catalogError && definitions.length === 0 && (
        <p className="admin-notice">Selecione primeiro uma categoria com conjunto de atributos ativo.</p>
      )}
      {specifications.length === 0 && <p className="admin-empty-state">Nenhum atributo adicionado.</p>}
      {specifications.map((specification, index) => (
        <fieldset key={specification.id} className="admin-semantic-card">
          <legend>Atributo {index + 1}</legend>
          <div className="admin-form-grid">
            <label>
              Atributo controlado
              <select
                required
                value={specification.definitionId ?? ""}
                disabled={disabled || catalogLoading || definitions.length === 0}
                onChange={(event) => {
                  const definition = definitions.find((entry) => entry.id === event.target.value);
                  if (!definition) {
                    patch(index, { definitionId: undefined, homologated: false });
                    return;
                  }
                  const type = specificationType(definition.dataType);
                  patch(index, {
                    definitionId: definition.id,
                    key: definition.attributeKey,
                    label: definition.label,
                    type,
                    value: initialSpecificationValue(type),
                    unit: definition.canonicalUnitCode ?? undefined,
                    required: definition.required,
                    filterable: definition.filterable,
                    comparable: definition.comparable,
                    searchable: definition.searchable,
                    scope: specification.scope ?? "product",
                    sourceType: specification.sourceType ?? "manual",
                    confidence: specification.confidence ?? 1,
                    homologated: false,
                  });
                }}
              >
                <option value="">Selecione um atributo aprovado</option>
                {specification.definitionId &&
                  !definitions.some((definition) => definition.id === specification.definitionId) && (
                    <option value={specification.definitionId}>
                      Atributo não disponível nesta categoria
                    </option>
                  )}
                {definitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome exibido
              <input
                required
                maxLength={120}
                value={specification.label}
                disabled={disabled || Boolean(specification.definitionId)}
                onChange={(event) =>
                  patch(index, {
                    label: event.target.value,
                    key: slugify(event.target.value) || `atributo-${index + 1}`,
                  })
                }
              />
            </label>
            <label>
              Tipo de valor
              <select
                value={specification.type}
                disabled={disabled || Boolean(specification.definitionId)}
                onChange={(event) => {
                  const type = event.target.value as ProductSpecification["type"];
                  const nextValue: ProductSpecification["value"] =
                    type === "number"
                      ? 0
                      : type === "boolean"
                        ? false
                        : type === "enum"
                          ? []
                          : type === "range"
                            ? { min: 0, max: 0 }
                            : "";
                  patch(index, { type, value: nextValue });
                }}
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="boolean">Sim ou não</option>
                <option value="enum">Lista de valores</option>
                <option value="range">Faixa numérica</option>
              </select>
            </label>
            {specification.type === "text" && (
              <label>
                Valor
                <input
                  maxLength={500}
                  value={typeof specification.value === "string" ? specification.value : ""}
                  disabled={disabled}
                  onChange={(event) => patch(index, { value: event.target.value })}
                />
              </label>
            )}
            {specification.type === "number" && (
              <label>
                Valor
                <input
                  type="number"
                  step="any"
                  value={typeof specification.value === "number" ? specification.value : 0}
                  disabled={disabled}
                  onChange={(event) => patch(index, { value: Number(event.target.value) })}
                />
              </label>
            )}
            {specification.type === "boolean" && (
              <label>
                Valor
                <select
                  value={String(specification.value === true)}
                  disabled={disabled}
                  onChange={(event) => patch(index, { value: event.target.value === "true" })}
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
            )}
            {specification.type === "enum" && (
              <label>
                Valores aprovados
                <select
                  multiple
                  size={Math.min(
                    8,
                    Math.max(
                      2,
                      definitions.find((definition) => definition.id === specification.definitionId)
                        ?.enumOptions.length ?? 0,
                    ),
                  )}
                  value={Array.isArray(specification.value) ? specification.value : []}
                  disabled={disabled || !specification.definitionId}
                  onChange={(event) =>
                    patch(index, {
                      value: Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 30),
                    })
                  }
                >
                  {definitions
                    .find((definition) => definition.id === specification.definitionId)
                    ?.enumOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {specification.type === "range" && (
              <>
                <label>
                  Limite mínimo
                  <input
                    type="number"
                    step="any"
                    value={
                      typeof specification.value === "object" && !Array.isArray(specification.value)
                        ? specification.value.min
                        : 0
                    }
                    disabled={disabled}
                    onChange={(event) => {
                      const current =
                        typeof specification.value === "object" && !Array.isArray(specification.value)
                          ? specification.value
                          : { min: 0, max: 0 };
                      patch(index, { value: { ...current, min: Number(event.target.value) } });
                    }}
                  />
                </label>
                <label>
                  Limite máximo
                  <input
                    type="number"
                    step="any"
                    value={
                      typeof specification.value === "object" && !Array.isArray(specification.value)
                        ? specification.value.max
                        : 0
                    }
                    disabled={disabled}
                    onChange={(event) => {
                      const current =
                        typeof specification.value === "object" && !Array.isArray(specification.value)
                          ? specification.value
                          : { min: 0, max: 0 };
                      patch(index, { value: { ...current, max: Number(event.target.value) } });
                    }}
                  />
                </label>
              </>
            )}
            {(specification.type === "number" || specification.type === "range") && (
              <label>
                Unidade
                <select
                  value={specification.unit ?? ""}
                  disabled={
                    disabled ||
                    !specification.definitionId ||
                    compatibleUnits(
                      definitions.find((definition) => definition.id === specification.definitionId),
                      units,
                    ).length === 0
                  }
                  onChange={(event) => patch(index, { unit: event.target.value || undefined })}
                >
                  <option value="">Sem unidade</option>
                  {compatibleUnits(
                    definitions.find((definition) => definition.id === specification.definitionId),
                    units,
                  ).map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.label} ({unit.symbol})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Aplicação do atributo
              <select
                value={
                  specification.scope === "model" && specification.ownerId
                    ? `model:${specification.ownerId}`
                    : specification.scope === "variant" && specification.ownerId
                      ? `variant:${specification.ownerId}`
                      : "product"
                }
                disabled={disabled}
                onChange={(event) => {
                  const [scope, ownerId] = event.target.value.split(":", 2);
                  patch(index, {
                    scope: scope as NonNullable<ProductSpecification["scope"]>,
                    ownerId: ownerId || undefined,
                  });
                }}
              >
                <option value="product">Produto inteiro</option>
                {models.map((model, modelIndex) => (
                  <option key={model.id} value={`model:${model.id}`}>
                    Modelo {model.model || modelIndex + 1}
                  </option>
                ))}
                {models.flatMap((model, modelIndex) =>
                  model.variants.map((variant, variantIndex) => (
                    <option key={variant.id} value={`variant:${variant.id}`}>
                      Variante {variant.name || variantIndex + 1} ·{" "}
                      {model.model || `modelo ${modelIndex + 1}`}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              Origem do valor
              <select
                value={specification.sourceType ?? "manual"}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, {
                    sourceType: event.target.value as NonNullable<ProductSpecification["sourceType"]>,
                  })
                }
              >
                <option value="manual">Cadastro manual</option>
                <option value="import">Importação controlada</option>
                <option value="legacy">Base anterior conciliada</option>
              </select>
            </label>
            <label>
              Documento ou referência da origem
              <input
                maxLength={300}
                required={["import", "legacy"].includes(specification.sourceType ?? "")}
                value={specification.sourceRef ?? ""}
                disabled={disabled}
                onChange={(event) => patch(index, { sourceRef: event.target.value || undefined })}
              />
            </label>
            <label>
              Confiança da fonte (%)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round((specification.confidence ?? 1) * 100)}
                disabled={disabled}
                onChange={(event) => patch(index, { confidence: Number(event.target.value) / 100 })}
              />
            </label>
          </div>
          <div className="admin-checkbox-grid">
            {(
              [
                ["required", "Obrigatório para publicação"],
                ["filterable", "Disponível em filtros"],
                ["comparable", "Disponível na comparação"],
                ["searchable", "Usado na busca"],
                ["homologated", "Valor técnico homologado"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="admin-checkbox-row">
                <input
                  type="checkbox"
                  checked={specification[key]}
                  disabled={
                    disabled ||
                    (key !== "homologated" && Boolean(specification.definitionId)) ||
                    (key === "homologated" &&
                      !definitions.some((definition) => definition.id === specification.definitionId))
                  }
                  onChange={(event) => patch(index, { [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="admin-table-actions">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => update(move(specifications, index, -1))}
            >
              Mover acima
            </button>
            <button
              type="button"
              disabled={disabled || index === specifications.length - 1}
              onClick={() => update(move(specifications, index, 1))}
            >
              Mover abaixo
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (window.confirm("Remover este atributo do rascunho?"))
                  update(specifications.filter((_, itemIndex) => itemIndex !== index));
              }}
            >
              Remover
            </button>
          </div>
        </fieldset>
      ))}
    </section>
  );
}

function identifierKindLabel(kind: ProductIdentifier["kind"]) {
  return {
    erp: "Código do ERP",
    gtin: "GTIN / código de barras",
    ncm: "NCM",
    other: "Outro identificador",
  }[kind];
}

export function ProductIdentifiersEditor({
  value,
  modelsValue,
  onChange,
  disabled = false,
}: {
  value: string;
  modelsValue: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const identifiers = useMemo(() => parseArray<ProductIdentifier>(value), [value]);
  const models = useMemo(() => parseArray<ProductModel>(modelsValue) ?? [], [modelsValue]);
  const update = (next: ProductIdentifier[]) => onChange(encode(next));
  if (!identifiers)
    return <BrokenStructure label="Os identificadores comerciais e fiscais" onRepair={() => update([])} />;

  const owners = [
    { value: "product", label: "Produto" },
    ...models.flatMap((model, modelIndex) => [
      { value: `model:${model.id}`, label: `Modelo ${model.model || modelIndex + 1}` },
      ...model.variants.map((variant, variantIndex) => ({
        value: `variant:${variant.id}`,
        label: `Variante ${variant.name || variantIndex + 1} · ${model.model || `modelo ${modelIndex + 1}`}`,
      })),
    ]),
  ];
  const ownerValue = (identifier: ProductIdentifier) =>
    identifier.owner.type === "product" ? "product" : `${identifier.owner.type}:${identifier.owner.id}`;
  const parseOwner = (raw: string): ProductIdentifier["owner"] => {
    if (raw === "product") return { type: "product" };
    const [type, id] = raw.split(":", 2);
    return type === "variant" ? { type: "variant", id } : { type: "model", id };
  };
  const patch = (index: number, next: Partial<ProductIdentifier>) =>
    update(identifiers.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));

  return (
    <section className="admin-semantic-editor" aria-labelledby="product-identifiers-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="product-identifiers-title">Identificadores comerciais e fiscais</h3>
          <p>
            Associe ERP, GTIN e NCM pelo nome do produto, modelo ou variante. As identidades técnicas ficam
            ocultas.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || identifiers.length >= 100}
          onClick={() =>
            update([
              ...identifiers,
              {
                id: crypto.randomUUID(),
                owner: { type: "product" },
                kind: "erp",
                value: "",
                visibility: "internal",
                sourceType: "manual",
              },
            ])
          }
        >
          Adicionar identificador
        </button>
      </div>
      {identifiers.length === 0 && (
        <p className="admin-empty-state">Nenhum identificador adicional cadastrado.</p>
      )}
      {identifiers.map((identifier, index) => (
        <fieldset key={identifier.id} className="admin-semantic-card">
          <legend>
            {identifierKindLabel(identifier.kind)} {index + 1}
          </legend>
          <div className="admin-form-grid">
            <label>
              Tipo
              <select
                value={identifier.kind}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, { kind: event.target.value as ProductIdentifier["kind"], value: "" })
                }
              >
                <option value="erp">Código do ERP</option>
                <option value="gtin">GTIN / código de barras</option>
                <option value="ncm">NCM</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label>
              Pertence a
              <select
                value={ownerValue(identifier)}
                disabled={disabled}
                onChange={(event) => patch(index, { owner: parseOwner(event.target.value) })}
              >
                {owners.map((owner) => (
                  <option key={owner.value} value={owner.value}>
                    {owner.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor
              <input
                required
                maxLength={180}
                inputMode={identifier.kind === "gtin" || identifier.kind === "ncm" ? "numeric" : "text"}
                pattern={
                  identifier.kind === "gtin"
                    ? "(?:[0-9]{8}|[0-9]{12,14})"
                    : identifier.kind === "ncm"
                      ? "[0-9]{8}"
                      : undefined
                }
                value={identifier.value}
                disabled={disabled}
                onChange={(event) => patch(index, { value: event.target.value.trim() })}
              />
            </label>
            <label>
              Emissor ou sistema de origem
              <input
                maxLength={160}
                value={identifier.issuer ?? ""}
                disabled={disabled}
                onChange={(event) => patch(index, { issuer: event.target.value || undefined })}
              />
            </label>
            <label>
              Divulgação
              <select
                value={identifier.visibility}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, { visibility: event.target.value as ProductIdentifier["visibility"] })
                }
              >
                <option value="internal">Somente interno</option>
                <option value="public">Público no site</option>
              </select>
            </label>
            <label>
              Origem do dado
              <select
                value={identifier.sourceType}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, { sourceType: event.target.value as ProductIdentifier["sourceType"] })
                }
              >
                <option value="manual">Cadastro manual</option>
                <option value="import">Importação controlada</option>
                <option value="legacy">Base anterior conciliada</option>
              </select>
            </label>
            <label>
              Referência da origem
              <input
                maxLength={300}
                value={identifier.sourceRef ?? ""}
                disabled={disabled}
                onChange={(event) => patch(index, { sourceRef: event.target.value || undefined })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm("Remover este identificador do rascunho?"))
                update(identifiers.filter((_, itemIndex) => itemIndex !== index));
            }}
          >
            Remover identificador
          </button>
        </fieldset>
      ))}
    </section>
  );
}

export function ProductMediaEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const media = useMemo(() => parseArray<ProductMedia>(value), [value]);
  const update = (next: ProductMedia[]) => onChange(encode(next.map((item, order) => ({ ...item, order }))));
  if (!media) return <BrokenStructure label="As imagens" onRepair={() => update([])} />;
  const selections: DamPickerSelection[] = media.map((item) => ({
    id: item.assetId,
    originalFilename: item.caption || "Imagem selecionada",
    altText: item.alt,
    previewUrl: null,
  }));
  return (
    <section className="admin-semantic-editor" aria-labelledby="product-media-title">
      <h3 id="product-media-title">Imagens do produto</h3>
      <p className="admin-help">
        Selecione arquivos processados e com direitos válidos. Ponto focal e recortes são mantidos na
        biblioteca.
      </p>
      <DamPicker
        label="Selecionar imagens na biblioteca"
        value={selections}
        multiple
        disabled={disabled}
        onChange={(selected) => {
          const existing = new Map(media.map((item) => [item.assetId, item]));
          const hasPrimary = selected.some((item) => existing.get(item.id)?.role === "primary");
          update(
            selected.map(
              (item, index) =>
                existing.get(item.id) ?? {
                  assetId: item.id,
                  role: !hasPrimary && index === 0 ? "primary" : "gallery",
                  alt: item.altText || item.originalFilename,
                  caption: item.originalFilename,
                  order: index,
                },
            ),
          );
        }}
      />
      {media.map((item, index) => (
        <fieldset key={item.assetId} className="admin-semantic-card">
          <legend>Imagem {index + 1}</legend>
          <div className="admin-form-grid">
            <label>
              Uso da imagem
              <select
                value={item.role}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    media.map((entry, itemIndex) =>
                      itemIndex === index
                        ? { ...entry, role: event.target.value as ProductMedia["role"] }
                        : entry,
                    ),
                  )
                }
              >
                <option value="primary">Principal</option>
                <option value="gallery">Galeria</option>
                <option value="diagram">Diagrama</option>
              </select>
            </label>
            <label>
              Texto alternativo
              <textarea
                required
                maxLength={300}
                value={item.alt}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    media.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, alt: event.target.value } : entry,
                    ),
                  )
                }
              />
            </label>
            <label>
              Legenda
              <input
                maxLength={500}
                value={item.caption ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    media.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, caption: event.target.value || undefined } : entry,
                    ),
                  )
                }
              />
            </label>
          </div>
          <div className="admin-table-actions">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => update(move(media, index, -1))}
            >
              Mover acima
            </button>
            <button
              type="button"
              disabled={disabled || index === media.length - 1}
              onClick={() => update(move(media, index, 1))}
            >
              Mover abaixo
            </button>
          </div>
        </fieldset>
      ))}
    </section>
  );
}

function blockLabel(block: ProductBlock) {
  return {
    rich_text: "Texto",
    image: "Imagem",
    gallery: "Galeria",
    cta: "Chamada para ação",
    specifications: "Especificações técnicas",
    related_content: "Conteúdo relacionado",
  }[block.type];
}

export function ProductBlocksEditor({
  value,
  onChange,
  onPrimaryTextChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  onPrimaryTextChange(value: string): void;
  disabled?: boolean;
}) {
  const blocks = useMemo(() => parseArray<ProductBlock>(value), [value]);
  const update = (next: ProductBlock[]) => onChange(encode(next));
  if (!blocks) return <BrokenStructure label="Os blocos comerciais" onRepair={() => update([])} />;
  const patch = (index: number, block: ProductBlock) =>
    update(blocks.map((item, itemIndex) => (itemIndex === index ? block : item)));

  function add(type: ProductBlock["type"]) {
    const id = crypto.randomUUID();
    const block: ProductBlock =
      type === "rich_text"
        ? { id, type, data: { text: "" } }
        : type === "image"
          ? ({ id, type, data: { assetId: "", alt: "" } } as ProductBlock)
          : type === "gallery"
            ? { id, type, data: { assetIds: [] } }
            : type === "cta"
              ? { id, type, data: { label: "", href: "/contato" } }
              : type === "specifications"
                ? { id, type, data: { source: "typed-attributes" } }
                : { id, type, data: {} };
    update([...(blocks ?? []), block]);
  }

  return (
    <section className="admin-semantic-editor" aria-labelledby="product-blocks-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="product-blocks-title">Blocos comerciais</h3>
          <p>Monte o conteúdo sem código ou estrutura técnica.</p>
        </div>
        <label>
          Adicionar bloco
          <select
            value=""
            disabled={disabled || blocks.length >= 80}
            onChange={(event) => {
              if (event.target.value) add(event.target.value as ProductBlock["type"]);
              event.target.value = "";
            }}
          >
            <option value="">Escolha o tipo</option>
            <option value="rich_text">Texto</option>
            <option value="image">Imagem</option>
            <option value="gallery">Galeria</option>
            <option value="cta">Chamada para ação</option>
            <option value="specifications">Especificações técnicas</option>
            <option value="related_content">Conteúdo relacionado</option>
          </select>
        </label>
      </div>
      {blocks.map((block, index) => (
        <fieldset key={block.id} className="admin-semantic-card">
          <legend>{blockLabel(block)}</legend>
          {block.type === "rich_text" && (
            <label>
              Texto
              <textarea
                required
                rows={7}
                maxLength={10000}
                value={block.data.text}
                disabled={disabled}
                onChange={(event) => {
                  patch(index, { ...block, data: { text: event.target.value } });
                  if (blocks.findIndex((item) => item.type === "rich_text") === index)
                    onPrimaryTextChange(event.target.value);
                }}
              />
            </label>
          )}
          {block.type === "image" && (
            <>
              <DamPicker
                label="Escolher imagem"
                value={
                  block.data.assetId
                    ? [
                        {
                          id: block.data.assetId,
                          originalFilename: "Imagem selecionada",
                          altText: block.data.alt,
                          previewUrl: null,
                        },
                      ]
                    : []
                }
                disabled={disabled}
                onChange={(selection) => {
                  const selected = selection[0];
                  if (selected)
                    patch(index, {
                      ...block,
                      data: { ...block.data, assetId: selected.id, alt: selected.altText || block.data.alt },
                    });
                }}
              />
              <label>
                Texto alternativo
                <textarea
                  required
                  maxLength={300}
                  value={block.data.alt}
                  disabled={disabled}
                  onChange={(event) =>
                    patch(index, { ...block, data: { ...block.data, alt: event.target.value } })
                  }
                />
              </label>
              <label>
                Legenda
                <input
                  maxLength={500}
                  value={block.data.caption ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    patch(index, {
                      ...block,
                      data: { ...block.data, caption: event.target.value || undefined },
                    })
                  }
                />
              </label>
            </>
          )}
          {block.type === "gallery" && (
            <DamPicker
              label="Escolher imagens da galeria"
              value={block.data.assetIds.map((assetId) => ({
                id: assetId,
                originalFilename: "Imagem selecionada",
                altText: "",
                previewUrl: null,
              }))}
              multiple
              disabled={disabled}
              onChange={(selection) =>
                patch(index, { ...block, data: { assetIds: selection.map((item) => item.id) } })
              }
            />
          )}
          {block.type === "cta" && (
            <div className="admin-form-grid">
              <label>
                Texto do botão
                <input
                  required
                  maxLength={120}
                  value={block.data.label}
                  disabled={disabled}
                  onChange={(event) =>
                    patch(index, { ...block, data: { ...block.data, label: event.target.value } })
                  }
                />
              </label>
              <label>
                Destino no site
                <input
                  required
                  maxLength={300}
                  value={block.data.href}
                  disabled={disabled}
                  onChange={(event) =>
                    patch(index, { ...block, data: { ...block.data, href: event.target.value } })
                  }
                />
              </label>
            </div>
          )}
          {block.type === "specifications" && (
            <p>Este bloco usa os atributos tipados e homologados deste produto.</p>
          )}
          {block.type === "related_content" && (
            <p>Este bloco usa os vínculos selecionados na etapa Mídia e relações.</p>
          )}
          <div className="admin-table-actions">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => update(move(blocks, index, -1))}
            >
              Mover acima
            </button>
            <button
              type="button"
              disabled={disabled || index === blocks.length - 1}
              onClick={() => update(move(blocks, index, 1))}
            >
              Mover abaixo
            </button>
            <button
              type="button"
              disabled={
                disabled ||
                (block.type === "rich_text" &&
                  blocks.filter((item) => item.type === "rich_text").length === 1)
              }
              onClick={() => {
                if (window.confirm("Remover este bloco do rascunho?"))
                  update(blocks.filter((_, itemIndex) => itemIndex !== index));
              }}
            >
              Remover bloco
            </button>
          </div>
        </fieldset>
      ))}
    </section>
  );
}

const relationGroups = [
  ["productIds", "product", "Produtos relacionados"],
  ["applicationIds", "application", "Aplicações"],
  ["sectorIds", "industry", "Indústrias"],
  ["serviceIds", "service", "Serviços"],
] as const;

export function ProductRelationsEditor({
  values,
  options,
  onChange,
  disabled = false,
}: {
  values: Record<(typeof relationGroups)[number][0], string>;
  options: ProductRelationOption[];
  onChange(key: (typeof relationGroups)[number][0], value: string): void;
  disabled?: boolean;
}) {
  return (
    <section className="admin-semantic-editor" aria-labelledby="product-relations-title">
      <h3 id="product-relations-title">Relações com o catálogo</h3>
      <p className="admin-help">
        Pesquise pelo nome. O sistema preserva automaticamente os vínculos necessários.
      </p>
      {relationGroups.map(([key, kind, label]) => {
        const selectedIds = values[key]
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
        const groupOptions = options.filter((item) => item.kind === kind);
        return (
          <fieldset key={key} className="admin-semantic-card">
            <legend>{label}</legend>
            <EntityPicker
              label={`Adicionar em ${label.toLocaleLowerCase("pt-BR")}`}
              value=""
              disabled={disabled}
              options={groupOptions
                .filter((option) => !selectedIds.includes(option.id))
                .map((option) => ({
                  id: option.id,
                  label: option.label,
                  secondaryLabel: option.description,
                }))}
              onChange={(option) => {
                if (option) onChange(key, [...selectedIds, option.id].join("\n"));
              }}
            />
            {selectedIds.length === 0 && <p className="admin-empty-state">Nenhum vínculo selecionado.</p>}
            <ul className="admin-chip-list">
              {selectedIds.map((selectedId) => {
                const selected = groupOptions.find((option) => option.id === selectedId);
                return (
                  <li key={selectedId}>
                    <span>{selected?.label ?? "Cadastro indisponível"}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remover ${selected?.label ?? "vínculo"}`}
                      onClick={() => onChange(key, selectedIds.filter((id) => id !== selectedId).join("\n"))}
                    >
                      Remover
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </section>
  );
}

export function ProductRedirectsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const redirects = useMemo(() => parseArray<ProductRedirect>(value), [value]);
  const update = (next: ProductRedirect[]) => onChange(encode(next));
  if (!redirects) return <BrokenStructure label="Os redirecionamentos" onRepair={() => update([])} />;
  return (
    <section className="admin-semantic-editor" aria-labelledby="product-redirects-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="product-redirects-title">Endereços anteriores</h3>
          <p>Cadastre somente caminhos antigos. O sistema impede ciclos e cadeias inválidas na publicação.</p>
        </div>
        <button
          type="button"
          disabled={disabled || redirects.length >= 30}
          onClick={() => update([...redirects, { sourcePath: "/", statusCode: "301" }])}
        >
          Adicionar endereço anterior
        </button>
      </div>
      {redirects.map((redirect, index) => (
        <div className="admin-form-grid" key={`${redirect.sourcePath}-${index}`}>
          <label>
            Caminho anterior
            <input
              required
              maxLength={200}
              value={redirect.sourcePath}
              disabled={disabled}
              onChange={(event) =>
                update(
                  redirects.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, sourcePath: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Comportamento
            <select
              value={redirect.statusCode}
              disabled={disabled}
              onChange={(event) =>
                update(
                  redirects.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, statusCode: event.target.value as "301" | "302" } : item,
                  ),
                )
              }
            >
              <option value="301">Encaminhamento permanente</option>
              <option value="302">Encaminhamento temporário</option>
            </select>
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => update(redirects.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remover
          </button>
        </div>
      ))}
    </section>
  );
}

export function ProductProvenanceEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const sources = useMemo(() => parseArray<EditableProductProvenance>(value), [value]);
  const update = (next: EditableProductProvenance[]) => onChange(encode(next));
  if (!sources) return <BrokenStructure label="As fontes" onRepair={() => update([])} />;
  const patch = (index: number, next: Partial<EditableProductProvenance>) =>
    update(sources.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));
  return (
    <section className="admin-semantic-editor" aria-labelledby="product-provenance-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="product-provenance-title">Fontes, autorização e direitos</h3>
          <p>O documento de comprovação é verificado sem expor informações técnicas no uso cotidiano.</p>
        </div>
        <button
          type="button"
          disabled={disabled || sources.length >= 30}
          onClick={() =>
            update([
              ...sources,
              {
                sourceKind: "owner_authored",
                rightsConfirmed: false,
                commercialOwner: "",
                technicalOwner: "",
                verifiedAt: new Date().toISOString(),
              },
            ])
          }
        >
          Adicionar fonte
        </button>
      </div>
      {sources.length === 0 && (
        <p className="admin-empty-state">Adicione ao menos uma fonte antes da revisão.</p>
      )}
      {sources.map((source, index) => (
        <fieldset key={`${source.verifiedAt}-${index}`} className="admin-semantic-card">
          <legend>Fonte {index + 1}</legend>
          <div className="admin-form-grid">
            <label>
              Origem
              <select
                value={source.sourceKind}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, { sourceKind: event.target.value as EditableProductProvenance["sourceKind"] })
                }
              >
                <option value="owner_authored">Conteúdo preparado pelo responsável</option>
                <option value="official_company">Documento oficial da GAIATEC</option>
                <option value="official_manufacturer">Documento oficial do fabricante</option>
              </select>
            </label>
            {source.sourceKind !== "owner_authored" && (
              <>
                <label>
                  Página oficial da fonte
                  <input
                    type="url"
                    maxLength={500}
                    value={source.sourceUrl ?? ""}
                    disabled={disabled}
                    onChange={(event) => patch(index, { sourceUrl: event.target.value || undefined })}
                  />
                </label>
                <label>
                  Documento de comprovação
                  <input
                    type="file"
                    disabled={disabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void file.arrayBuffer().then(async (buffer) => {
                        const digest = await crypto.subtle.digest("SHA-256", buffer);
                        const hash = Array.from(new Uint8Array(digest), (byte) =>
                          byte.toString(16).padStart(2, "0"),
                        ).join("");
                        patch(index, {
                          sourcePath: file.name,
                          sourceSha256: hash,
                          fileModifiedAt: new Date(file.lastModified).toISOString(),
                        });
                      });
                    }}
                  />
                </label>
              </>
            )}
            <label>
              Referência de autorização
              <input
                maxLength={300}
                value={source.authorizationReference ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch(index, { authorizationReference: event.target.value || undefined })
                }
              />
            </label>
            <label>
              Escopo dos direitos
              <input
                maxLength={300}
                value={source.rightsScope ?? ""}
                disabled={disabled}
                onChange={(event) => patch(index, { rightsScope: event.target.value || undefined })}
              />
            </label>
            <label>
              Responsável comercial
              <input
                required
                maxLength={120}
                value={source.commercialOwner}
                disabled={disabled}
                onChange={(event) => patch(index, { commercialOwner: event.target.value })}
              />
            </label>
            <label>
              Responsável técnico
              <input
                required
                maxLength={120}
                value={source.technicalOwner}
                disabled={disabled}
                onChange={(event) => patch(index, { technicalOwner: event.target.value })}
              />
            </label>
            <label>
              Data da autorização
              <input
                type="date"
                value={source.authorizationDate ?? ""}
                disabled={disabled}
                onChange={(event) => patch(index, { authorizationDate: event.target.value || undefined })}
              />
            </label>
          </div>
          <label className="admin-checkbox-row">
            <input
              type="checkbox"
              checked={source.rightsConfirmed}
              disabled={disabled}
              onChange={(event) => patch(index, { rightsConfirmed: event.target.checked })}
            />
            Confirmo que a fonte e os direitos foram verificados
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => update(sources.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remover fonte
          </button>
        </fieldset>
      ))}
    </section>
  );
}

export function ProductOgImagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  return (
    <DamPicker
      label="Imagem de compartilhamento social"
      value={
        value ? [{ id: value, originalFilename: "Imagem selecionada", altText: "", previewUrl: null }] : []
      }
      disabled={disabled}
      onChange={(selection) => onChange(selection[0]?.id ?? "")}
    />
  );
}
