import type { CmsProductContent } from "@/shared/contracts/cms-content";
import { formatProductSpecification } from "../format-product-spec";
import "../product-catalog.css";

function ProductContentBlock({
  block,
  mediaUrls,
}: {
  block: CmsProductContent["blocks"][number];
  mediaUrls: Record<string, string>;
}) {
  if (block.type === "rich_text") return <p>{block.data.text}</p>;
  if (block.type === "cta")
    return (
      <p>
        <a className="new-catalog__button" href={block.data.href}>
          {block.data.label}
        </a>
      </p>
    );
  if (block.type === "image") {
    const source =
      mediaUrls[`${block.data.assetId}:large.webp`] ?? mediaUrls[`${block.data.assetId}:medium.webp`];
    return source ? (
      <figure>
        <img src={source} alt={block.data.alt} />
        {block.data.caption && <figcaption>{block.data.caption}</figcaption>}
      </figure>
    ) : null;
  }
  return null;
}

export function CmsProductRenderer({
  payload: p,
  mediaUrls = {},
  documentUrls = {},
  preview = false,
}: {
  payload: CmsProductContent;
  mediaUrls?: Record<string, string>;
  documentUrls?: Record<string, string>;
  preview?: boolean;
}) {
  const image = mediaUrls["large.webp"] ?? mediaUrls["medium.webp"];
  const primaryMedia = p.media.find((entry) => entry.role === "primary");
  const galleryBlock = p.blocks.find((block) => block.type === "gallery");
  const galleryIds = (
    galleryBlock?.data.assetIds ??
    p.media.filter((entry) => entry.role !== "primary").map((entry) => entry.assetId)
  ).filter((assetId) => assetId !== primaryMedia?.assetId);
  const galleryMedia = galleryIds
    .map((assetId) => p.media.find((entry) => entry.assetId === assetId))
    .filter((entry): entry is (typeof p.media)[number] => Boolean(entry));
  const relationBlock = p.blocks.find((block) => block.type === "related_content");
  const visibleDocuments = preview
    ? p.documents
    : p.documents.filter((document) => document.visibility === "public");
  return (
    <article className="new-catalog product-detail" data-cms-renderer="catalog-product">
      {preview && (
        <p className="cms-preview-banner" role="status">
          Preview privado — usa o mesmo renderer do produto público
        </p>
      )}
      <nav aria-label="Breadcrumb">
        Início / Produtos / {p.classification.segment} / {p.classification.category} / {p.title}
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
          <p className="new-catalog__eyebrow">
            {p.brand.name} · {p.productLine.name}
          </p>
          <h1>{p.title}</h1>
          <span className="product-detail__status">
            {p.pilotState === "homologated"
              ? "Homologado"
              : p.pilotState === "synthetic_test"
                ? "Teste sintético"
                : "Conteúdo piloto em homologação"}
          </span>
          {p.summary && <p>{p.summary}</p>}
          <p className="new-catalog__lead">{p.commercial.shortDescription}</p>
          <dl className="product-detail__identity">
            <div>
              <dt>Marca comercial</dt>
              <dd>{p.brand.name}</dd>
            </div>
            <div>
              <dt>Modelo comercial GAIATEC</dt>
              <dd>{p.models[0]?.model}</dd>
            </div>
            <div>
              <dt>Referência do fabricante</dt>
              <dd>{p.models[0]?.manufacturerReference}</dd>
            </div>
            <div>
              <dt>Fabricante/OEM nominal</dt>
              <dd>
                {p.manufacturer.officialUrl ? (
                  <a href={p.manufacturer.officialUrl}>{p.manufacturer.name}</a>
                ) : (
                  p.manufacturer.name
                )}
              </dd>
            </div>
          </dl>
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
              const source =
                mediaUrls[`${entry.assetId}:large.webp`] ?? mediaUrls[`${entry.assetId}:medium.webp`];
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
        <a href="#especificacoes">Especificações</a>
        <a href="#modelos">Modelos</a>
        <a href="#aplicacoes">Relações</a>
        <a href="#downloads">Downloads</a>
      </nav>
      <section id="visao-geral">
        <h2>Visão geral</h2>
        <p>{p.commercial.valueProposition}</p>
        <dl className="product-detail__classification">
          <div>
            <dt>Segmento</dt>
            <dd>{p.classification.segment}</dd>
          </div>
          <div>
            <dt>Categoria</dt>
            <dd>{p.classification.category}</dd>
          </div>
          {p.classification.subcategory && (
            <div>
              <dt>Subcategoria</dt>
              <dd>{p.classification.subcategory}</dd>
            </div>
          )}
          <div>
            <dt>Família</dt>
            <dd>{p.classification.family}</dd>
          </div>
          <div>
            <dt>Função</dt>
            <dd>{p.function}</dd>
          </div>
          <div>
            <dt>Tecnologia</dt>
            <dd>{p.technology}</dd>
          </div>
        </dl>
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
          <ProductContentBlock key={block.id} block={block} mediaUrls={mediaUrls} />
        ))}
      </section>
      <section
        id="especificacoes"
        data-source={
          p.blocks.find((block) => block.type === "specifications")?.data.source ?? "typed-attributes"
        }
      >
        <h2>Especificações técnicas</h2>
        <div className="new-catalog__scroll">
          <table>
            <tbody>
              {p.specifications.map((spec) => (
                <tr key={spec.id}>
                  <th>{spec.label}</th>
                  <td>{formatProductSpecification(spec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section id="modelos">
        <h2>Modelos e variantes</h2>
        <div className="new-catalog__scroll">
          <table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Referência do fabricante</th>
                <th>SKU</th>
                <th>Variante</th>
                <th>Código</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {p.models.flatMap((model) =>
                model.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td>{model.model}</td>
                    <td>{model.manufacturerReference}</td>
                    <td>{model.sku}</td>
                    <td>{variant.name}</td>
                    <td>{variant.code}</td>
                    <td>{model.status === "active" ? "Ativo" : "Descontinuado"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section id="aplicacoes">
        <h2>Relações</h2>
        {Object.values(p.relations).every((ids) => ids.length === 0) ? (
          <p>{relationBlock?.data.state ?? "Nenhuma relação homologada para esta versão."}</p>
        ) : (
          <div className="new-catalog__chips">
            <span>{p.relations.productIds.length} produtos</span>
            <span>{p.relations.applicationIds.length} aplicações</span>
            <span>{p.relations.sectorIds.length} setores</span>
            <span>{p.relations.serviceIds.length} serviços</span>
          </div>
        )}
      </section>
      <section id="downloads">
        <h2>Documentos</h2>
        {visibleDocuments.length === 0 ? (
          <p>Nenhum documento público aprovado.</p>
        ) : (
          <ul>
            {visibleDocuments.map((document) => (
              <li key={document.id}>
                <a href={documentUrls[document.id] ?? document.officialUrl} rel="noreferrer">
                  {document.title} — revisão {document.revision} · {document.language}
                </a>
                {preview && (
                  <small>
                    {" "}
                    Tipo: {document.kind}; visibilidade: {document.visibility}; SHA-256: {document.sha256};
                    direitos: {document.rightsConfirmed ? "confirmados" : "não confirmados"}.
                  </small>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {preview && (
        <section id="governanca-preview" className="product-detail__governance">
          <h2>Governança, busca e SEO da revisão</h2>
          <p>
            <strong>Estado:</strong> {p.pilotState}. <strong>Owner:</strong> {p.approval.portfolioOwner}.{" "}
            <strong>Homologado em:</strong> {p.approval.homologatedAt ?? "não homologado"}.
          </p>
          <p>
            <strong>Revisores:</strong> técnico {p.approval.technicalReviewer}; comercial{" "}
            {p.approval.commercialReviewer}; editorial {p.approval.editorialReviewer}.
          </p>
          <p>
            <strong>Sinônimos:</strong> {p.search.synonyms.join(" · ") || "nenhum"}.{" "}
            <strong>Palavras-chave:</strong> {p.search.keywords.join(" · ") || "nenhuma"}.
          </p>
          <p>
            <strong>SEO:</strong> {p.seo.title}; {p.seo.description}; canonical {p.seo.canonicalPath};{" "}
            {p.seo.indexable ? "indexável" : "não indexável"}; OG {p.seo.ogImageId ?? "não definida"}.
          </p>
          <p>
            <strong>Redirects:</strong>{" "}
            {p.redirects.map((entry) => `${entry.statusCode} ${entry.sourcePath}`).join(" · ") || "nenhum"}.
          </p>
          <details>
            <summary>Proveniência completa ({p.provenance.length})</summary>
            <ul>
              {p.provenance.map((source, index) => (
                <li key={`${source.sourceSha256 ?? source.sourcePath ?? source.sourceUrl}-${index}`}>
                  {source.sourceKind}; {source.sourceUrl ?? source.sourcePath}; SHA-256{" "}
                  {source.sourceSha256 ?? "não aplicável"}; versão {source.documentVersion ?? "não declarada"}
                  ; data {source.documentDate ?? source.fileModifiedAt ?? "não declarada"}; autorização{" "}
                  {source.authorizationReference ?? "não declarada"} em{" "}
                  {source.authorizationDate ?? "data não declarada"}; escopo{" "}
                  {source.rightsScope ?? "não declarado"}; owner comercial {source.commercialOwner}; owner
                  técnico {source.technicalOwner}; verificado em {source.verifiedAt}.
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </article>
  );
}
