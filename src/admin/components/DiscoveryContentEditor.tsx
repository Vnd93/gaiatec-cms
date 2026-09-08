import { cloneElement, useEffect, useId, useState } from "react";
import type { ControlledVocabularyOption } from "../api/cms-api";
import { DamPicker, type DamPickerSelection } from "./DamPicker";
import { operatorErrorMessage } from "../operator-error-message";
import { urlSegmentFromText } from "../url-segment";

export type DiscoveryKind = "service" | "industry" | "application" | "solution";

type Props = {
  kind: DiscoveryKind;
  payload: any;
  slug: string;
  onChange: (payload: any) => void;
  onSlugChange: (slug: string) => void;
  contractValid: boolean;
  contractIssue?: string;
  serviceKindOptions?: ControlledVocabularyOption[];
  generateAddressFromTitle?: boolean;
  relationOptions?: DiscoveryRelationOption[];
};

export type DiscoveryRelationOption = {
  id: string;
  contentType: DiscoveryKind | "product";
  label: string;
};

const tabs = [
  ["content", "Conteúdo"],
  ["search", "Busca e divulgação"],
  ["connections", "Mídia e relações"],
  ["governance", "Aprovação"],
] as const;

const relationLabels: Record<string, string> = {
  productIds: "Produtos relacionados",
  serviceIds: "Serviços relacionados",
  industryIds: "Indústrias relacionadas",
  applicationIds: "Aplicações relacionadas",
  solutionIds: "Soluções relacionadas",
};

const relationKinds: Record<string, DiscoveryRelationOption["contentType"]> = {
  productIds: "product",
  serviceIds: "service",
  industryIds: "industry",
  applicationIds: "application",
  solutionIds: "solution",
};

const publicPrefixes: Record<DiscoveryKind, string> = {
  service: "servicos",
  industry: "industrias",
  application: "aplicacoes",
  solution: "solucoes",
};

const approvalLabels: Record<string, string> = {
  operationalOwner: "Responsável operacional",
  businessOwner: "Responsável pelo negócio",
  technicalReviewer: "Revisor técnico",
  commercialReviewer: "Revisor comercial",
  editorialReviewer: "Revisor editorial",
};

function setPath(source: any, path: string[], value: unknown) {
  const next = JSON.parse(JSON.stringify(source));
  let cursor = next;
  path.slice(0, -1).forEach((key) => {
    cursor[key] ??= {};
    cursor = cursor[key];
  });
  cursor[path.at(-1) as string] = value;
  return next;
}

function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  return (
    <div className={wide ? "admin-field admin-field--wide" : "admin-field"}>
      <label className="admin-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {hint && (
        <span className="admin-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {cloneElement(children, {
        id: fieldId,
        "aria-describedby": hint ? hintId : undefined,
      })}
    </div>
  );
}

function ListField({
  label,
  hint = "Adicione, edite, ordene ou remova cada item separadamente.",
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value?: string[];
  onChange: (value: string[]) => void;
  rows?: number;
}) {
  const hintId = useId();
  const items = value?.length ? value : [""];
  const update = (index: number, nextValue: string) =>
    onChange(items.map((item, current) => (current === index ? nextValue : item)));
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <fieldset className="admin-field admin-field--wide admin-semantic-editor">
      <legend className="admin-field__label">{label}</legend>
      <span className="admin-field__hint" id={hintId}>
        {hint}
      </span>
      {items.map((item, index) => (
        <div className="admin-inline-fields" key={`${label}-${index}`}>
          <label>
            {index === 0 ? label : `${label} ${index + 1}`}
            <input
              value={item}
              maxLength={240}
              aria-describedby={hintId}
              onChange={(event) => update(index, event.target.value)}
            />
          </label>
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
            Mover para cima
          </button>
          <button type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
            Mover para baixo
          </button>
          <button
            type="button"
            onClick={() =>
              onChange(items.length === 1 ? [] : items.filter((_, current) => current !== index))
            }
          >
            Remover
          </button>
        </div>
      ))}
      <button type="button" disabled={items.length >= 30} onClick={() => onChange([...items, ""])}>
        Adicionar item em {label.toLocaleLowerCase("pt-BR")}
      </button>
    </fieldset>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="admin-editor-section__heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function DiscoveryContentEditor({
  kind,
  payload,
  slug,
  onChange,
  onSlugChange,
  contractValid,
  contractIssue,
  serviceKindOptions = [],
  generateAddressFromTitle = false,
  relationOptions = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>("content");
  const [mediaLabels, setMediaLabels] = useState<Record<string, DamPickerSelection>>({});

  useEffect(() => {
    setActiveTab("content");
  }, [kind]);

  const patch = (path: string[], value: unknown) => onChange(setPath(payload, path, value));
  const patchRichText = (text: string) => {
    const blocks = [...(payload.blocks ?? [])];
    const index = blocks.findIndex((block) => block.type === "rich_text");
    if (index >= 0) blocks[index] = { ...blocks[index], data: { ...blocks[index].data, text } };
    else blocks.unshift({ id: crypto.randomUUID(), type: "rich_text", data: { text } });
    patch(["blocks"], blocks);
  };
  const richText = payload.blocks?.find((block: any) => block.type === "rich_text")?.data?.text ?? "";
  const activeServiceKindOptions = serviceKindOptions.filter((option) => option.active);
  const selectedServiceKind = String(payload.serviceKind ?? "");
  const selectedServiceKindAvailable = activeServiceKindOptions.some(
    (option) => option.label === selectedServiceKind,
  );

  const updateMedia = (index: number, field: string, value: unknown) => {
    const media = [...(payload.media ?? [])];
    media[index] = { ...media[index], [field]: value };
    patch(["media"], media);
  };
  const removeMedia = (index: number) =>
    patch(
      ["media"],
      (payload.media ?? []).filter((_: unknown, current: number) => current !== index),
    );
  const selectedMedia: DamPickerSelection[] = (payload.media ?? []).map((media: any) =>
    mediaLabels[media.assetId]
      ? mediaLabels[media.assetId]
      : {
          id: media.assetId,
          originalFilename: "Arquivo selecionado",
          altText: media.alt ?? "",
          previewUrl: null,
        },
  );

  const selectMedia = (selection: DamPickerSelection[]) => {
    setMediaLabels((current) => ({
      ...current,
      ...Object.fromEntries(selection.map((asset) => [asset.id, asset])),
    }));
    const existing = new Map((payload.media ?? []).map((media: any) => [media.assetId, media]));
    patch(
      ["media"],
      selection.map((asset, index) => {
        const current = existing.get(asset.id) as Record<string, unknown> | undefined;
        return {
          assetId: asset.id,
          role: current?.role ?? (index === 0 ? "primary" : "gallery"),
          alt: current?.alt ?? asset.altText,
          ...(current?.caption ? { caption: current.caption } : {}),
          order: index,
        };
      }),
    );
  };

  const updatePoint = (index: number, field: string, value: unknown) => {
    const points = [...(payload.points ?? [])];
    points[index] = { ...points[index], [field]: value };
    patch(["points"], points);
  };
  const addPoint = () =>
    patch(
      ["points"],
      [
        ...(payload.points ?? []),
        {
          id: crypto.randomUUID(),
          title: "",
          need: "",
          variable: "",
          function: "",
          technicalBenefit: "",
          operationalBenefit: "",
          conditions: "",
          productIds: [],
          serviceIds: [],
        },
      ],
    );

  return (
    <div className="admin-discovery-editor">
      <div
        className={contractValid ? "admin-contract-status is-valid" : "admin-contract-status is-invalid"}
        role="status"
      >
        <strong>{contractValid ? "Cadastro completo e válido" : "Cadastro precisa de ajustes"}</strong>
        <span>
          {contractValid
            ? "Os campos obrigatórios estão prontos para salvar e seguir no fluxo editorial."
            : operatorErrorMessage(contractIssue, {
                fallback: "Revise os campos indicados antes de salvar.",
              })}
        </span>
      </div>

      <div className="admin-editor-tabs" role="tablist" aria-label="Seções do cadastro">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "content" && (
        <section className="admin-editor-section" role="tabpanel" aria-label="Conteúdo">
          <SectionHeading
            title="Identificação e conteúdo público"
            description="Informações principais exibidas nos cards, páginas e resultados de busca do site."
          />
          <div className="admin-field-grid">
            <Field label="Título público">
              <input
                value={payload.title ?? ""}
                onChange={(e) => {
                  const title = e.target.value;
                  let next = setPath(payload, ["title"], title);
                  if (generateAddressFromTitle) {
                    const nextSlug = urlSegmentFromText(title);
                    onSlugChange(nextSlug);
                    next = setPath(
                      next,
                      ["seo", "canonicalPath"],
                      nextSlug ? `/${publicPrefixes[kind]}/${nextSlug}` : "",
                    );
                  }
                  onChange(next);
                }}
              />
            </Field>
            <Field
              label="Endereço público gerado"
              hint="O endereço é criado a partir do título e permanece estável depois do cadastro."
            >
              <input readOnly value={slug ? `/${publicPrefixes[kind]}/${slug}` : "Aguardando o título"} />
            </Field>
            <Field label="Resumo" hint="Texto curto usado em cards e introduções." wide>
              <textarea
                rows={4}
                value={payload.summary ?? ""}
                onChange={(e) => patch(["summary"], e.target.value)}
              />
            </Field>
            <Field
              label="Texto editorial complementar"
              hint="Primeiro bloco de texto da página pública."
              wide
            >
              <textarea rows={6} value={richText} onChange={(e) => patchRichText(e.target.value)} />
            </Field>
          </div>

          {kind === "service" && (
            <div className="admin-form-card">
              <SectionHeading
                title="Detalhamento do serviço"
                description="Escopo comercial e operacional apresentado ao visitante."
              />
              <div className="admin-field-grid">
                <Field label="Categoria do serviço">
                  <select
                    value={selectedServiceKind}
                    onChange={(event) => {
                      const option = activeServiceKindOptions.find(
                        (entry) => entry.label === event.target.value,
                      );
                      if (!option) {
                        onChange(
                          setPath(setPath(payload, ["serviceKind"], ""), ["serviceKindRef"], undefined),
                        );
                        return;
                      }
                      onChange(
                        setPath(setPath(payload, ["serviceKind"], option.label), ["serviceKindRef"], {
                          id: option.id,
                          slug: option.slug,
                          label: option.label,
                        }),
                      );
                    }}
                  >
                    <option value="">Selecione uma categoria</option>
                    {selectedServiceKind && !selectedServiceKindAvailable && (
                      <option value={selectedServiceKind} disabled>
                        {selectedServiceKind} (indisponível para novos cadastros)
                      </option>
                    )}
                    {activeServiceKindOptions.map((option) => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Escopo" wide>
                  <textarea
                    rows={5}
                    value={payload.scope ?? ""}
                    onChange={(e) => patch(["scope"], e.target.value)}
                  />
                </Field>
                <ListField
                  label="Quando contratar"
                  value={payload.whenToHire}
                  onChange={(value) => patch(["whenToHire"], value)}
                />
                <ListField
                  label="Entregáveis"
                  value={payload.deliverables}
                  onChange={(value) => patch(["deliverables"], value)}
                />
                <ListField
                  label="Pré-requisitos"
                  value={payload.prerequisites}
                  onChange={(value) => patch(["prerequisites"], value)}
                />
                <ListField
                  label="Etapas de execução"
                  value={payload.executionSteps}
                  onChange={(value) => patch(["executionSteps"], value)}
                />
              </div>
            </div>
          )}

          {kind === "industry" && (
            <div className="admin-form-card">
              <SectionHeading
                title="Detalhamento da indústria"
                description="Contexto, desafios e áreas de processo atendidas."
              />
              <div className="admin-field-grid">
                <Field
                  label="Ordem no site"
                  hint="Menores números aparecem primeiro na listagem pública. Use de 0 a 999."
                >
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={payload.displayOrder ?? 999}
                    onChange={(e) => patch(["displayOrder"], Number(e.target.value))}
                  />
                </Field>
                <Field label="Nome do mercado">
                  <input
                    value={payload.marketName ?? ""}
                    onChange={(e) => patch(["marketName"], e.target.value)}
                  />
                </Field>
                <ListField
                  label="Desafios"
                  value={payload.challenges}
                  onChange={(value) => patch(["challenges"], value)}
                />
                <ListField
                  label="Evidências e diferenciais"
                  value={payload.evidence}
                  onChange={(value) => patch(["evidence"], value)}
                />
                <ListField
                  label="Áreas de processo"
                  value={payload.processAreas}
                  onChange={(value) => patch(["processAreas"], value)}
                />
              </div>
            </div>
          )}

          {kind === "application" && (
            <div className="admin-form-card">
              <SectionHeading
                title="Detalhamento da aplicação"
                description="Problema, benefícios e pontos de medição ou controle."
              />
              <div className="admin-field-grid">
                <Field label="Processo" wide>
                  <textarea
                    rows={4}
                    value={payload.process ?? ""}
                    onChange={(e) => patch(["process"], e.target.value)}
                  />
                </Field>
                <Field label="Problema atendido" wide>
                  <textarea
                    rows={4}
                    value={payload.problem ?? ""}
                    onChange={(e) => patch(["problem"], e.target.value)}
                  />
                </Field>
                <ListField
                  label="Benefícios"
                  value={payload.benefits}
                  onChange={(value) => patch(["benefits"], value)}
                />
              </div>
              <div className="admin-repeater-heading">
                <h3>Pontos da aplicação</h3>
                <button type="button" onClick={addPoint}>
                  Adicionar ponto
                </button>
              </div>
              {(payload.points ?? []).map((point: any, index: number) => (
                <fieldset className="admin-point-card" key={point.id}>
                  <legend>Ponto {index + 1}</legend>
                  <div className="admin-field-grid">
                    {[
                      ["title", "Título"],
                      ["variable", "Variável medida ou controlada"],
                      ["need", "Necessidade"],
                      ["function", "Função"],
                      ["technicalBenefit", "Benefício técnico"],
                      ["operationalBenefit", "Benefício operacional"],
                      ["conditions", "Condições adicionais"],
                    ].map(([field, label]) => (
                      <Field key={field} label={label} wide={!["title", "variable"].includes(field)}>
                        {["title", "variable"].includes(field) ? (
                          <input
                            value={point[field] ?? ""}
                            onChange={(e) => updatePoint(index, field, e.target.value)}
                          />
                        ) : (
                          <textarea
                            rows={3}
                            value={point[field] ?? ""}
                            onChange={(e) => updatePoint(index, field, e.target.value)}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="admin-danger-link"
                    onClick={() =>
                      patch(
                        ["points"],
                        payload.points.filter((_: unknown, current: number) => current !== index),
                      )
                    }
                  >
                    Remover ponto
                  </button>
                </fieldset>
              ))}
            </div>
          )}

          {kind === "solution" && (
            <div className="admin-form-card">
              <SectionHeading
                title="Detalhamento da solução"
                description="Problema, abordagem, benefícios e componentes integrados."
              />
              <div className="admin-field-grid">
                <Field label="Problema atendido" wide>
                  <textarea
                    rows={4}
                    value={payload.problem ?? ""}
                    onChange={(e) => patch(["problem"], e.target.value)}
                  />
                </Field>
                <Field label="Abordagem proposta" wide>
                  <textarea
                    rows={6}
                    value={payload.approach ?? ""}
                    onChange={(e) => patch(["approach"], e.target.value)}
                  />
                </Field>
                <ListField
                  label="Benefícios"
                  value={payload.benefits}
                  onChange={(value) => patch(["benefits"], value)}
                />
                <ListField
                  label="Componentes"
                  value={payload.components}
                  onChange={(value) => patch(["components"], value)}
                />
                <Field label="Modelo de detecção de gases">
                  <select
                    value={payload.gasDetectionModel ?? "not_applicable"}
                    onChange={(e) => patch(["gasDetectionModel"], e.target.value)}
                  >
                    <option value="not_applicable">Não aplicável</option>
                    <option value="integrated_master_catalog">Integrado ao catálogo principal</option>
                  </select>
                </Field>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === "search" && (
        <section className="admin-editor-section" role="tabpanel" aria-label="Busca e divulgação">
          <SectionHeading
            title="Busca interna e chamada para ação"
            description="Controle como o conteúdo é encontrado e qual ação o visitante deve realizar."
          />
          <div className="admin-field-grid">
            <ListField
              label="Palavras-chave"
              value={payload.search?.keywords}
              onChange={(value) => patch(["search", "keywords"], value)}
            />
            <ListField
              label="Sinônimos"
              value={payload.search?.synonyms}
              onChange={(value) => patch(["search", "synonyms"], value)}
            />
            <Field label="Texto do botão">
              <input
                value={payload.cta?.label ?? ""}
                onChange={(e) => patch(["cta", "label"], e.target.value)}
              />
            </Field>
            <Field label="Destino do botão" hint="Caminho interno iniciado por /.">
              <input
                value={payload.cta?.href ?? ""}
                onChange={(e) => patch(["cta", "href"], e.target.value)}
              />
            </Field>
          </div>
          <div className="admin-form-card">
            <SectionHeading
              title="Busca e compartilhamento"
              description="Defina o título, a descrição e o endereço principal usados em buscas e compartilhamentos."
            />
            <div className="admin-field-grid">
              <Field label="Título para busca" hint={`${(payload.seo?.title ?? "").length}/70 caracteres`}>
                <input
                  value={payload.seo?.title ?? ""}
                  onChange={(e) => patch(["seo", "title"], e.target.value)}
                />
              </Field>
              <Field label="Endereço principal">
                <input
                  value={payload.seo?.canonicalPath ?? ""}
                  onChange={(e) => patch(["seo", "canonicalPath"], e.target.value)}
                />
              </Field>
              <Field
                label="Descrição para busca"
                hint={`${(payload.seo?.description ?? "").length}/170 caracteres`}
                wide
              >
                <textarea
                  rows={4}
                  value={payload.seo?.description ?? ""}
                  onChange={(e) => patch(["seo", "description"], e.target.value)}
                />
              </Field>
              <label className="admin-checkbox admin-field--wide">
                <input
                  type="checkbox"
                  checked={payload.seo?.indexable === true}
                  onChange={(e) => patch(["seo", "indexable"], e.target.checked)}
                />
                Permitir indexação quando este conteúdo estiver em produção
              </label>
            </div>
          </div>
        </section>
      )}

      {activeTab === "connections" && (
        <section className="admin-editor-section" role="tabpanel" aria-label="Mídia e relações">
          <SectionHeading
            title="Relações com outros conteúdos"
            description="Selecione pelo nome os cadastros publicados que devem aparecer relacionados."
          />
          <div className="admin-form-grid">
            {Object.entries(payload.relations ?? {}).map(([key, value]) => {
              const selectedIds = value as string[];
              const choices = relationOptions.filter((option) => option.contentType === relationKinds[key]);
              const unavailableCount = selectedIds.filter(
                (selectedId) => !choices.some((option) => option.id === selectedId),
              ).length;
              return (
                <fieldset className="admin-check-grid" key={key}>
                  <legend>{relationLabels[key] ?? "Conteúdos relacionados"}</legend>
                  {choices.length ? (
                    choices.map((option) => (
                      <label className="admin-checkbox" key={option.id}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(option.id)}
                          onChange={(event) =>
                            patch(
                              ["relations", key],
                              event.target.checked
                                ? [...selectedIds, option.id]
                                : selectedIds.filter((id) => id !== option.id),
                            )
                          }
                        />
                        {option.label}
                      </label>
                    ))
                  ) : (
                    <p className="admin-help">Nenhum cadastro publicado disponível.</p>
                  )}
                  {unavailableCount > 0 && (
                    <p className="admin-help">
                      {unavailableCount} vínculo(s) anterior(es) indisponível(is); eles serão preservados até
                      uma revisão explícita.
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
          <div className="admin-form-card">
            <h2>Mídia</h2>
            <p>Escolha arquivos processados na biblioteca ou envie uma imagem com direitos registrados.</p>
            <DamPicker label="Imagens relacionadas" value={selectedMedia} multiple onChange={selectMedia} />
            {(payload.media ?? []).length === 0 && (
              <p className="admin-empty-inline">Nenhuma mídia associada.</p>
            )}
            {(payload.media ?? []).map((media: any, index: number) => (
              <fieldset className="admin-media-row" key={`${media.assetId}-${index}`}>
                <legend>{mediaLabels[media.assetId]?.originalFilename ?? `Imagem ${index + 1}`}</legend>
                <div className="admin-field-grid">
                  <Field label="Uso">
                    <select
                      value={media.role ?? "gallery"}
                      onChange={(e) => updateMedia(index, "role", e.target.value)}
                    >
                      <option value="primary">Principal</option>
                      <option value="gallery">Galeria</option>
                      <option value="diagram">Diagrama</option>
                    </select>
                  </Field>
                  <Field label="Texto alternativo" wide>
                    <input
                      value={media.alt ?? ""}
                      onChange={(e) => updateMedia(index, "alt", e.target.value)}
                    />
                  </Field>
                  <Field label="Legenda" wide>
                    <textarea
                      rows={2}
                      value={media.caption ?? ""}
                      onChange={(e) => updateMedia(index, "caption", e.target.value)}
                    />
                  </Field>
                  <Field label="Ordem">
                    <input
                      type="number"
                      min="0"
                      value={media.order ?? 0}
                      onChange={(e) => updateMedia(index, "order", Number(e.target.value))}
                    />
                  </Field>
                </div>
                <button type="button" className="admin-danger-link" onClick={() => removeMedia(index)}>
                  Remover mídia
                </button>
              </fieldset>
            ))}
          </div>
        </section>
      )}

      {activeTab === "governance" && (
        <section className="admin-editor-section" role="tabpanel" aria-label="Aprovação">
          <SectionHeading
            title="Aprovação e responsabilidade"
            description="Estas informações sustentam a revisão, a aprovação e a publicação."
          />
          <div className="admin-field-grid">
            <Field label="Situação da aprovação">
              <select
                value={payload.governanceState ?? "awaiting_owner"}
                onChange={(e) => patch(["governanceState"], e.target.value)}
              >
                <option value="synthetic_test">Validação controlada</option>
                <option value="awaiting_owner">Aguardando responsável</option>
                <option value="homologated">Homologado</option>
              </select>
            </Field>
            {Object.entries(payload.approval ?? {})
              .filter(([key]) => key !== "homologatedAt")
              .map(([key, value]) => (
                <Field key={key} label={approvalLabels[key] ?? "Outra responsabilidade"}>
                  <input
                    value={String(value ?? "")}
                    onChange={(e) => patch(["approval", key], e.target.value)}
                  />
                </Field>
              ))}
            <Field label="Data da homologação">
              <input
                type="datetime-local"
                value={payload.approval?.homologatedAt?.slice(0, 16) ?? ""}
                onChange={(e) =>
                  patch(
                    ["approval", "homologatedAt"],
                    e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  )
                }
              />
            </Field>
          </div>
          <div className="admin-form-card">
            <SectionHeading
              title="Origem e direitos"
              description="Registre de onde veio o conteúdo e quem confirmou o direito de uso."
            />
            <div className="admin-field-grid">
              <Field label="Tipo de fonte">
                <select
                  value={payload.provenance?.[0]?.sourceKind ?? "owner_authored"}
                  onChange={(e) => patch(["provenance", "0", "sourceKind"], e.target.value)}
                >
                  <option value="owner_authored">Conteúdo preparado pelo responsável</option>
                  <option value="official_company">Documento oficial da empresa</option>
                  <option value="official_manufacturer">Documento oficial do fabricante</option>
                </select>
              </Field>
              <Field label="Referência da autorização">
                <input
                  value={payload.provenance?.[0]?.authorizationReference ?? ""}
                  onChange={(e) => patch(["provenance", "0", "authorizationReference"], e.target.value)}
                />
              </Field>
              <Field label="Data da autorização">
                <input
                  type="date"
                  value={payload.provenance?.[0]?.authorizationDate ?? ""}
                  onChange={(e) => patch(["provenance", "0", "authorizationDate"], e.target.value)}
                />
              </Field>
              <Field label="Responsável comercial">
                <input
                  value={payload.provenance?.[0]?.commercialOwner ?? ""}
                  onChange={(e) => patch(["provenance", "0", "commercialOwner"], e.target.value)}
                />
              </Field>
              <Field label="Responsável técnico">
                <input
                  value={payload.provenance?.[0]?.technicalOwner ?? ""}
                  onChange={(e) => patch(["provenance", "0", "technicalOwner"], e.target.value)}
                />
              </Field>
              <Field label="Escopo dos direitos" wide>
                <textarea
                  rows={3}
                  value={payload.provenance?.[0]?.rightsScope ?? ""}
                  onChange={(e) => patch(["provenance", "0", "rightsScope"], e.target.value)}
                />
              </Field>
              <label className="admin-checkbox admin-field--wide">
                <input
                  type="checkbox"
                  checked={payload.provenance?.[0]?.rightsConfirmed === true}
                  onChange={(e) => patch(["provenance", "0", "rightsConfirmed"], e.target.checked)}
                />
                Direitos de uso confirmados
              </label>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
