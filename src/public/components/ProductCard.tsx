import type { CSSProperties } from "react";
import { ArrowRight, Check, GitCompareArrows, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router";
import type { PublishedProduct } from "../catalog-api";
import { formatProductSpecification } from "../format-product-spec";

export function ProductCard({
  product,
  index = 0,
  selected,
  selectionDisabled = false,
  showCompare = true,
  featuredLabel,
  onSelect,
}: {
  product: PublishedProduct;
  index?: number;
  selected: boolean;
  selectionDisabled?: boolean;
  showCompare?: boolean;
  featuredLabel?: string;
  onSelect: (checked: boolean) => void;
}) {
  const p = product.payload;
  const image = product.media_urls?.["medium.webp"] ?? product.media_urls?.["thumbnail.webp"];
  const primaryMedia = p.media.find((entry) => entry.role === "primary");
  const model = p.models[0];
  const facts = [
    model?.model ? { label: "Modelo", value: model.model } : null,
    model?.manufacturerReference ? { label: "Referência", value: model.manufacturerReference } : null,
    ...p.specifications.slice(0, 2).map((spec) => ({
      label: spec.label,
      value: formatProductSpecification(spec),
    })),
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));

  return (
    <article
      className={`catalog-product-card${featuredLabel ? " is-featured" : ""}`}
      style={{ "--card-order": index } as CSSProperties}
    >
      <div className="catalog-product-card__media">
        <span className="catalog-product-card__status">
          {featuredLabel || (p.pilotState === "homologated" ? "Produto homologado" : "Em homologação")}
        </span>
        {image ? (
          <Link to={`/produtos/${product.slug}`} tabIndex={-1} aria-hidden="true">
            <img
              src={image}
              alt={primaryMedia?.alt ?? ""}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </Link>
        ) : (
          <span className="catalog-product-card__image-empty" aria-label="Produto sem imagem publicada">
            <ImageIcon size={38} aria-hidden="true" />
          </span>
        )}
        {showCompare && (
          <button
            type="button"
            className="catalog-product-card__compare"
            aria-pressed={selected}
            disabled={selectionDisabled}
            onClick={() => onSelect(!selected)}
            aria-label={selected ? `Remover ${p.title} da comparação` : `Adicionar ${p.title} à comparação`}
          >
            {selected ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <GitCompareArrows size={15} aria-hidden="true" />
            )}
            {selected ? "Comparando" : "Comparar"}
          </button>
        )}
      </div>

      <div className="catalog-product-card__body">
        <p className="catalog-product-card__meta">
          <span>{p.classification.category}</span>
          <span>{p.brand.name}</span>
        </p>
        <h3>
          <Link to={`/produtos/${product.slug}`}>{p.title}</Link>
        </h3>
        <p className="catalog-product-card__description">{p.commercial.shortDescription}</p>

        <dl className="catalog-product-card__facts">
          {facts.slice(0, 4).map((fact) => (
            <div key={`${fact.label}-${fact.value}`}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <Link className="catalog-product-card__link" to={`/produtos/${product.slug}`}>
          Ver detalhes técnicos <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
