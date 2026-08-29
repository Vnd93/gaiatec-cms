import type { CmsProductContent } from "@/shared/contracts/cms-content";
import { formatProductSpecification } from "../format-product-spec";
import "../product-catalog.css";

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
          {image && <img src={image} alt={p.media.find((entry) => entry.role === "primary")?.alt ?? ""} />}
        </div>
        <div>
          <p className="new-catalog__eyebrow">
            {p.manufacturer.name} · {p.productLine.name}
          </p>
          <h1>{p.title}</h1>
          <span className="product-detail__status">
            {p.pilotState === "homologated"
              ? "Homologado"
              : p.pilotState === "synthetic_test"
                ? "Teste sintético"
                : "Conteúdo piloto em homologação"}
          </span>
          <p className="new-catalog__lead">{p.commercial.shortDescription}</p>
          <p>
            <strong>Modelo:</strong> {p.models[0]?.model}
          </p>
          <a className="new-catalog__button" href="/contato">
            Solicitar avaliação técnica
          </a>
        </div>
      </header>
      {p.media.length > 1 && (
        <section aria-labelledby="galeria-produto">
          <h2 id="galeria-produto">Galeria</h2>
          <div className="product-detail__gallery">
            {p.media.slice(1).map((entry) => {
              const source =
                mediaUrls[`${entry.assetId}:large.webp`] ?? mediaUrls[`${entry.assetId}:medium.webp`];
              return source ? <img key={entry.assetId} src={source} alt={entry.alt} /> : null;
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
        <h3>Benefícios</h3>
        <ul>
          {p.commercial.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        {p.blocks
          .filter((block) => block.type === "rich_text")
          .map((block) => (
            <p key={block.id}>{String(block.data.text ?? "")}</p>
          ))}
      </section>
      <section id="especificacoes">
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
                <th>SKU</th>
                <th>Variante</th>
                <th>Código</th>
              </tr>
            </thead>
            <tbody>
              {p.models.flatMap((model) =>
                model.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td>{model.model}</td>
                    <td>{model.sku}</td>
                    <td>{variant.name}</td>
                    <td>{variant.code}</td>
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
          <p>Nenhuma relação homologada para esta versão.</p>
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
        {p.documents.filter((document) => document.visibility === "public").length === 0 ? (
          <p>Nenhum documento público aprovado.</p>
        ) : (
          <ul>
            {p.documents
              .filter((document) => document.visibility === "public")
              .map((document) => (
                <li key={document.id}>
                  <a href={documentUrls[document.id] ?? document.officialUrl} rel="noreferrer">
                    {document.title} — revisão {document.revision}
                  </a>
                </li>
              ))}
          </ul>
        )}
      </section>
    </article>
  );
}
