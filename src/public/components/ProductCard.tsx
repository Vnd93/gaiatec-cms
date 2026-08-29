import { Link } from "react-router";
import type { PublishedProduct } from "../catalog-api";

export function ProductCard({
  product,
  selected,
  onSelect,
}: {
  product: PublishedProduct;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const p = product.payload;
  const image = product.media_urls?.["medium.webp"] ?? product.media_urls?.["thumbnail.webp"];
  return (
    <article className="product-card">
      {image && (
        <img src={image} alt={p.media.find((entry) => entry.role === "primary")?.alt ?? ""} loading="lazy" />
      )}
      <p className="product-card__meta">
        {p.classification.category} · {p.manufacturer.name}
      </p>
      <h2>{p.title}</h2>
      <p>{p.commercial.shortDescription}</p>
      <dl>
        <div>
          <dt>Modelo</dt>
          <dd>{p.models[0]?.model}</dd>
        </div>
        {p.specifications.slice(0, 3).map((spec) => (
          <div key={spec.id}>
            <dt>{spec.label}</dt>
            <dd>
              {typeof spec.value === "object" ? JSON.stringify(spec.value) : String(spec.value)} {spec.unit}
            </dd>
          </div>
        ))}
      </dl>
      <div className="product-card__actions">
        <Link to={`/produtos/${product.slug}`}>Ver produto</Link>
        <label>
          <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} />{" "}
          Comparar
        </label>
      </div>
    </article>
  );
}
