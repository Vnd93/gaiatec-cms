import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { comparePublishedProducts, type PublishedProduct } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import { formatProductSpecification } from "../format-product-spec";
import "../product-catalog.css";

export default function CmsComparePage() {
  const [params] = useSearchParams();
  const productParam = params.get("produtos") ?? "";
  const slugs = productParam.split(",").filter(Boolean).slice(0, 4);
  const [products, setProducts] = useState<PublishedProduct[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setProducts([]);
    setError("");
    applyCatalogSeo({
      title: "Comparar produtos | GAIATEC",
      description: "Compare especificações técnicas dos produtos disponíveis no catálogo GAIATEC.",
      canonicalPath: "/produtos/comparador",
      indexable: false,
    });
    const requested = productParam.split(",").filter(Boolean).slice(0, 4);
    if (requested.length < 2) return;
    void comparePublishedProducts(requested)
      .then((data) => active && setProducts(data.items))
      .catch(
        (caught) => active && setError(caught instanceof Error ? caught.message : "Falha no comparador."),
      );
    return () => {
      active = false;
    };
  }, [productParam]);
  const attributes = [
    ...new Set(
      products.flatMap((product) =>
        product.payload.specifications
          .filter((spec) => spec.comparable)
          .map((spec) => `${spec.key}:${spec.scope}:${spec.ownerLabel ?? ""}`),
      ),
    ),
  ];
  const controlledAttributes = [
    ["productCategory", "Categoria de produto"],
    ["applicationMagnitude", "Aplicação / grandeza"],
    ["technology", "Tecnologia"],
    ["installationOperation", "Instalação / operação"],
    ["monitoredElement", "Elemento monitorado"],
  ] as const;
  return (
    <section className="new-catalog">
      <p className="new-catalog__eyebrow">COMPARADOR</p>
      <h1>Comparar produtos</h1>
      <p className="new-catalog__lead">
        Somente atributos tipados marcados como comparáveis entram nesta tabela.
      </p>
      {slugs.length < 2 ? (
        <div className="new-catalog__state">
          <h2>Selecione pelo menos dois produtos</h2>
          <a href="/produtos">Abrir catálogo</a>
        </div>
      ) : error ? (
        <div className="new-catalog__state" role="alert">
          {error}
        </div>
      ) : products.length < 2 ? (
        <div className="new-catalog__state" aria-busy="true">
          Carregando comparação…
        </div>
      ) : (
        <div className="new-catalog__scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Atributo</th>
                {products.map((product) => (
                  <th key={product.key}>
                    {product.payload.title}
                    <small>{product.payload.models[0]?.model}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controlledAttributes.map(([key, label]) => (
                <tr key={key}>
                  <th>{label}</th>
                  {products.map((product) => (
                    <td key={product.key}>{product.payload.controlledClassification?.[key]?.label ?? "—"}</td>
                  ))}
                </tr>
              ))}
              {attributes.map((identity) => (
                <tr key={identity}>
                  <th>
                    {products
                      .flatMap((product) => product.payload.specifications)
                      .filter((spec) => `${spec.key}:${spec.scope}:${spec.ownerLabel ?? ""}` === identity)
                      .map((spec) =>
                        spec.ownerLabel ? `${spec.label} — ${spec.ownerLabel}` : spec.label,
                      )[0] ?? identity}
                  </th>
                  {products.map((product) => {
                    const spec = product.payload.specifications.find(
                      (entry) => `${entry.key}:${entry.scope}:${entry.ownerLabel ?? ""}` === identity,
                    );
                    return <td key={product.key}>{spec ? formatProductSpecification(spec) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
