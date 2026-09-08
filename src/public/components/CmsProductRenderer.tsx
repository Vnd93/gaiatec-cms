import type { CmsProductContent } from "@/shared/contracts/cms-content";
import { SUPABASE_URL } from "@/lib/supabase";
import type { CmsPublicProductContent } from "../catalog-api";
import type { CmsRelatedItem } from "./CmsPageRenderer";
import { formatProductSpecification } from "../format-product-spec";
import "../product-catalog.css";

function isPublicInternetHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::" ||
    host === "::1" ||
    /^(?:fc|fd|fe[89ab])/i.test(host)
  )
    return false;
  const ipv4 = host.split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [first, second] = ipv4;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function safeHttpHref(value: unknown, httpsOnly = false, allowGovernedPreview = false): string | undefined {
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value);
    const configured = new URL(SUPABASE_URL);
    const governedLocalAsset =
      parsed.origin === configured.origin &&
      parsed.pathname === "/functions/v1/cms-public" &&
      ["media", "document"].includes(parsed.searchParams.get("type") ?? "");
    const governedPreviewAsset =
      allowGovernedPreview &&
      parsed.origin === configured.origin &&
      /^\/storage\/v1\/object\/sign\/(?:cms-media-private|cms-documents-private)\//.test(parsed.pathname);
    const compatibilityType = parsed.searchParams.get("type");
    const compatibilityKeys = [...parsed.searchParams.keys()];
    const expectedCompatibilityKeys =
      compatibilityType === "media"
        ? ["type", "kind", "slug", "path", "slot"]
        : ["type", "kind", "slug", "path", "position"];
    const governedCompatibilityAsset =
      typeof window !== "undefined" &&
      parsed.origin === window.location.origin &&
      parsed.pathname === "/__cms-public-asset" &&
      ["media", "document"].includes(compatibilityType ?? "") &&
      compatibilityKeys.length === expectedCompatibilityKeys.length &&
      new Set(compatibilityKeys).size === compatibilityKeys.length &&
      expectedCompatibilityKeys.every((key) => compatibilityKeys.includes(key));
    if (
      parsed.username ||
      parsed.password ||
      (httpsOnly && parsed.protocol !== "https:") ||
      (!httpsOnly && !["http:", "https:"].includes(parsed.protocol)) ||
      (!isPublicInternetHostname(parsed.hostname) &&
        !governedLocalAsset &&
        !governedPreviewAsset &&
        !governedCompatibilityAsset) ||
      (!governedPreviewAsset &&
        [...parsed.searchParams.keys()].some((key) =>
          /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i.test(
            key,
          ),
        ))
    )
      return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

const safeInternalHref = (value: unknown) =>
  typeof value === "string" && /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(value) ? value : undefined;

function ProductContentBlock({
  block,
  mediaUrls,
  preview,
}: {
  block: CmsProductContent["blocks"][number];
  mediaUrls: Record<string, string>;
  preview: boolean;
}) {
  if (block.type === "rich_text") return <p>{block.data.text}</p>;
  if (block.type === "cta")
    return safeInternalHref(block.data.href) ? (
      <p>
        <a className="new-catalog__button" href={safeInternalHref(block.data.href)}>
          {block.data.label}
        </a>
      </p>
    ) : (
      <p>{block.data.label}</p>
    );
  if (block.type === "image") {
    const source = safeHttpHref(
      mediaUrls[`${block.data.assetId}:large.webp`] ?? mediaUrls[`${block.data.assetId}:medium.webp`],
      false,
      preview,
    );
    return source ? (
      <figure>
        <img src={source} alt={block.data.alt} />
        {block.data.caption && <figcaption>{block.data.caption}</figcaption>}
      </figure>
    ) : null;
  }
  return null;
}

const identifierLabels = {
  erp: "Código do ERP",
  gtin: "GTIN",
  ncm: "NCM",
  other: "Identificador",
} as const;

const documentLanguageLabels: Record<string, string> = {
  pt: "Português",
  "pt-BR": "Português (Brasil)",
  en: "Inglês",
  "en-US": "Inglês (Estados Unidos)",
  es: "Espanhol",
  "es-ES": "Espanhol (Espanha)",
};

const documentLanguageLabel = (language: string) => documentLanguageLabels[language] ?? "Outro idioma";

export function CmsProductRenderer({
  payload: p,
  mediaUrls = {},
  documentUrls = {},
  relatedItems = [],
  preview = false,
}: {
  payload: CmsProductContent | CmsPublicProductContent;
  mediaUrls?: Record<string, string>;
  documentUrls?: Record<string, string>;
  relatedItems?: CmsRelatedItem[];
  preview?: boolean;
}) {
  const visibility = preview && "fieldVisibility" in p ? p.fieldVisibility : null;
  const isPublicField = (field: keyof CmsProductContent["fieldVisibility"]) =>
    visibility === null || visibility[field] === "public";
  const visibleBrand = isPublicField("brand") ? p.brand : undefined;
  const visibleManufacturer = isPublicField("manufacturer") ? p.manufacturer : undefined;
  const visibleProductLine = isPublicField("productLine") ? p.productLine : undefined;
  const visibleClassification = isPublicField("classification") ? p.classification : undefined;
  const visibleControlledClassification = isPublicField("classification")
    ? p.controlledClassification
    : undefined;
  const primaryMedia = p.media.find((entry) => entry.role === "primary");
  const image = primaryMedia
    ? safeHttpHref(
        mediaUrls[`${primaryMedia.assetId}:large.webp`] ?? mediaUrls[`${primaryMedia.assetId}:medium.webp`],
        false,
        preview,
      )
    : undefined;
  const galleryBlock = p.blocks.find((block) => block.type === "gallery");
  const galleryIds = (
    galleryBlock?.data.assetIds ??
    p.media.filter((entry) => entry.role !== "primary").map((entry) => entry.assetId)
  ).filter((assetId) => assetId !== primaryMedia?.assetId);
  const galleryMedia = galleryIds
    .map((assetId) => p.media.find((entry) => entry.assetId === assetId))
    .filter((entry): entry is (typeof p.media)[number] => Boolean(entry));
  const identityVisible = Boolean(
    visibleBrand ||
    visibleManufacturer ||
    (isPublicField("commercialModel") && p.models[0]?.model) ||
    (isPublicField("manufacturerReference") && p.models[0]?.manufacturerReference),
  );
  const modelColumnsVisible = Boolean(
    p.models.some(
      (model) =>
        (isPublicField("commercialModel") && model.model) ||
        (isPublicField("manufacturerReference") && model.manufacturerReference) ||
        (isPublicField("sku") && model.sku) ||
        model.variants.length,
    ),
  );
  const variantCodeColumnVisible =
    isPublicField("sku") && p.models.some((model) => model.variants.some((variant) => Boolean(variant.code)));
  const visibleIdentifiers = (p.externalIdentifiers ?? []).filter(
    (identifier) => !("visibility" in identifier) || identifier.visibility === "public",
  );
  const documentHref = (document: (typeof p.documents)[number]) => {
    const governed = safeHttpHref(documentUrls[document.id.toLowerCase()], false, preview);
    return governed;
  };
  const manufacturerHref = safeHttpHref(visibleManufacturer?.officialUrl, true);
  const visibleDocuments = (isPublicField("documents") ? p.documents : [])
    .filter((document) => document.visibility === "public")
    .filter((document) => Boolean(documentHref(document)));
  const visibleSpecifications = (isPublicField("specifications") ? p.specifications : []).filter(
    (specification) => !preview || !("homologated" in specification) || specification.homologated === true,
  );
  return (
    <article className="new-catalog product-detail">
      {preview && (
        <p className="cms-preview-banner" role="status">
          Preview privado — usa o mesmo renderer do produto público
        </p>
      )}
      <nav aria-label="Breadcrumb">
        Início / Produtos{visibleClassification?.segment ? ` / ${visibleClassification.segment}` : ""} /{" "}
        {p.title}
      </nav>
      <header className="product-detail__hero">
        <div>
          {image && (
            <figure>
              <img src={image} alt={primaryMedia?.alt ?? ""} />
              {primaryMedia?.caption && <figcaption>{primaryMedia.caption}</figcaption>}
            </figure>
          )}
        </div>
        <div>
          {(visibleBrand || visibleProductLine) && (
            <p className="new-catalog__eyebrow">
              {[visibleBrand?.name, visibleProductLine?.name].filter(Boolean).join(" · ")}
            </p>
          )}
          <h1>{p.title}</h1>
          <span className="product-detail__status">
            {preview ? "Pré-visualização editorial" : "Produto GAIATEC"}
          </span>
          {p.summary && <p>{p.summary}</p>}
          <p className="new-catalog__lead">{p.commercial.shortDescription}</p>
          {identityVisible && (
            <dl className="product-detail__identity">
              {visibleBrand && (
                <div>
                  <dt>Marca comercial</dt>
                  <dd>{visibleBrand.name}</dd>
                </div>
              )}
              {isPublicField("commercialModel") && p.models[0]?.model && (
                <div>
                  <dt>Modelo comercial GAIATEC</dt>
                  <dd>{p.models[0].model}</dd>
                </div>
              )}
              {isPublicField("manufacturerReference") && p.models[0]?.manufacturerReference && (
                <div>
                  <dt>Referência do fabricante</dt>
                  <dd>{p.models[0].manufacturerReference}</dd>
                </div>
              )}
              {visibleManufacturer && (
                <div>
                  <dt>Fabricante/OEM nominal</dt>
                  <dd>
                    {manufacturerHref ? (
                      <a href={manufacturerHref}>{visibleManufacturer.name}</a>
                    ) : (
                      visibleManufacturer.name
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {visibleIdentifiers.length > 0 && (
            <dl className="product-detail__identity" aria-label="Identificadores do produto">
              {visibleIdentifiers.map((identifier, index) => (
                <div key={`${identifier.kind}:${identifier.value}:${index}`}>
                  <dt>
                    {identifierLabels[identifier.kind]}
                    {"ownerLabel" in identifier && identifier.ownerLabel ? ` — ${identifier.ownerLabel}` : ""}
                  </dt>
                  <dd>
                    {identifier.value}
                    {identifier.issuer ? ` · ${identifier.issuer}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <a className="new-catalog__button" href="/contato">
            Solicitar avaliação técnica
          </a>
        </div>
      </header>
      {galleryMedia.length > 0 && (
        <section aria-labelledby="galeria-produto">
          <h2 id="galeria-produto">Galeria</h2>
          <div className="product-detail__gallery">
            {galleryMedia.map((entry) => {
              const source = safeHttpHref(
                mediaUrls[`${entry.assetId}:large.webp`] ?? mediaUrls[`${entry.assetId}:medium.webp`],
                false,
                preview,
              );
              return source ? (
                <figure key={entry.assetId}>
                  <img src={source} alt={entry.alt} />
                  {entry.caption && <figcaption>{entry.caption}</figcaption>}
                </figure>
              ) : null;
            })}
          </div>
        </section>
      )}
      <nav className="product-detail__nav" aria-label="Conteúdo do produto">
        <a href="#visao-geral">Visão geral</a>
        {visibleSpecifications.length > 0 && <a href="#especificacoes">Especificações</a>}
        {modelColumnsVisible && <a href="#modelos">Modelos</a>}
        {isPublicField("relations") && relatedItems.length > 0 && <a href="#aplicacoes">Relações</a>}
        {visibleDocuments.length > 0 && <a href="#downloads">Downloads</a>}
      </nav>
      <section id="visao-geral">
        <h2>Visão geral</h2>
        <p>{p.commercial.valueProposition}</p>
        {(visibleControlledClassification || visibleClassification) && (
          <dl className="product-detail__classification">
            {(visibleControlledClassification?.productCategory?.label ?? visibleClassification?.segment) && (
              <div>
                <dt>Categoria de produto</dt>
                <dd>
                  {visibleControlledClassification?.productCategory?.label ?? visibleClassification?.segment}
                </dd>
              </div>
            )}
            {(visibleControlledClassification?.applicationMagnitude?.label ??
              visibleClassification?.category) && (
              <div>
                <dt>Aplicação / grandeza</dt>
                <dd>
                  {visibleControlledClassification?.applicationMagnitude?.label ??
                    visibleClassification?.category}
                </dd>
              </div>
            )}
            {visibleClassification?.subcategory && (
              <div>
                <dt>Subcategoria</dt>
                <dd>{visibleClassification.subcategory}</dd>
              </div>
            )}
            {isPublicField("technology") &&
              (visibleControlledClassification?.technology?.label ?? p.technology) && (
                <div>
                  <dt>Tecnologia</dt>
                  <dd>{visibleControlledClassification?.technology?.label ?? p.technology}</dd>
                </div>
              )}
            {(visibleControlledClassification?.installationOperation?.label ??
              visibleClassification?.family) && (
              <div>
                <dt>Instalação / operação</dt>
                <dd>
                  {visibleControlledClassification?.installationOperation?.label ??
                    visibleClassification?.family}
                </dd>
              </div>
            )}
            {visibleControlledClassification?.monitoredElement?.label && (
              <div>
                <dt>Elemento monitorado</dt>
                <dd>{visibleControlledClassification.monitoredElement.label}</dd>
              </div>
            )}
            {isPublicField("function") && p.function && (
              <div>
                <dt>Função</dt>
                <dd>{p.function}</dd>
              </div>
            )}
          </dl>
        )}
        <h3>Benefícios</h3>
        <ul>
          {p.commercial.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        {p.commercial.differentiators.length > 0 && (
          <>
            <h3>Diferenciais</h3>
            <ul>
              {p.commercial.differentiators.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
        {p.blocks.map((block) => (
          <ProductContentBlock key={block.id} block={block} mediaUrls={mediaUrls} preview={preview} />
        ))}
      </section>
      {visibleSpecifications.length > 0 && (
        <section id="especificacoes">
          <h2>Especificações técnicas</h2>
          <div className="new-catalog__scroll">
            <table>
              <tbody>
                {visibleSpecifications.map((spec) => (
                  <tr
                    key={`${spec.key}:${spec.scope ?? "product"}:${"ownerLabel" in spec ? spec.ownerLabel : ""}`}
                  >
                    <th>
                      {spec.label}
                      {"ownerLabel" in spec && spec.ownerLabel ? ` — ${spec.ownerLabel}` : ""}
                    </th>
                    <td>{formatProductSpecification(spec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {modelColumnsVisible && (
        <section id="modelos">
          <h2>Modelos e variantes</h2>
          <div className="new-catalog__scroll">
            <table>
              <thead>
                <tr>
                  {isPublicField("commercialModel") && p.models.some((model) => model.model) && (
                    <th>Modelo</th>
                  )}
                  {isPublicField("manufacturerReference") &&
                    p.models.some((model) => model.manufacturerReference) && (
                      <th>Referência do fabricante</th>
                    )}
                  {isPublicField("sku") &&
                    p.models.some((model) => model.sku || model.variants.some((variant) => variant.sku)) && (
                      <th>SKU</th>
                    )}
                  <th>Variante</th>
                  {variantCodeColumnVisible && <th>Código</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.models.flatMap((model) =>
                  model.variants.map((variant) => (
                    <tr key={variant.id}>
                      {isPublicField("commercialModel") && p.models.some((entry) => entry.model) && (
                        <td>{model.model}</td>
                      )}
                      {isPublicField("manufacturerReference") &&
                        p.models.some((entry) => entry.manufacturerReference) && (
                          <td>{model.manufacturerReference}</td>
                        )}
                      {isPublicField("sku") &&
                        p.models.some(
                          (entry) => entry.sku || entry.variants.some((variant) => variant.sku),
                        ) && <td>{variant.sku ?? model.sku}</td>}
                      <td>{variant.name}</td>
                      {variantCodeColumnVisible && <td>{variant.code}</td>}
                      <td>{model.status === "active" ? "Ativo" : "Descontinuado"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {isPublicField("relations") && relatedItems.length > 0 && (
        <section id="aplicacoes">
          <h2>Relações</h2>
          <div className="new-catalog__chips">
            {relatedItems.map((item) => {
              const href = safeInternalHref(item.path);
              return href ? (
                <a href={href} key={item.path}>
                  {item.title}
                </a>
              ) : (
                <span key={item.path}>{item.title}</span>
              );
            })}
          </div>
        </section>
      )}
      {visibleDocuments.length > 0 && (
        <section id="downloads">
          <h2>Documentos</h2>
          {visibleDocuments.length === 0 ? (
            <p>Nenhum documento disponível para download.</p>
          ) : (
            <ul>
              {visibleDocuments.map((document) => (
                <li key={document.id}>
                  <a href={documentHref(document)} rel="noreferrer">
                    {document.title} — revisão {document.revision} ·{" "}
                    {documentLanguageLabel(document.language)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {preview && (
        <section id="governanca-preview" className="product-detail__governance">
          <h2>Resumo da pré-visualização</h2>
          <ul>
            <li>
              {p.seo.indexable
                ? "A página poderá aparecer nos mecanismos de busca depois da publicação."
                : "A página permanecerá fora dos mecanismos de busca."}
            </li>
            <li>
              {visibleDocuments.length === 0
                ? "Nenhum documento ficará disponível para download."
                : `${visibleDocuments.length} documento(s) ficará(ão) disponível(is) para download.`}
            </li>
            <li>Informações restritas e registros de governança permanecem nas áreas autorizadas do CMS.</li>
          </ul>
        </section>
      )}
    </article>
  );
}
