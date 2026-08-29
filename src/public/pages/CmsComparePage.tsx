import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { comparePublishedProducts, type PublishedProduct } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";

export default function CmsComparePage() {
  const [params] = useSearchParams();
  const productParam = params.get("produtos") ?? "";
  const slugs = productParam.split(",").filter(Boolean).slice(0, 4);
  const [products, setProducts] = useState<PublishedProduct[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    applyCatalogSeo({
      title: "Comparar produtos | GAIATEC",
      canonicalPath: "/produtos/comparador",
      indexable: false,
    });
    const requested = productParam.split(",").filter(Boolean).slice(0, 4);
    if (requested.length < 2) return;
    void comparePublishedProducts(requested)
      .then((data) => setProducts(data.items))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Falha no comparador."));
  }, [productParam]);
  const attributes = [
    ...new Set(
      products.flatMap((product) =>
        product.payload.specifications.filter((spec) => spec.comparable).map((spec) => spec.key),
      ),
    ),
  ];
  return (
    <main className="new-catalog">
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
                  <th key={product.item_id}>
                    {product.payload.title}
                    <small>{product.payload.models[0]?.model}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attributes.map((key) => (
                <tr key={key}>
                  <th>
                    {products
                      .flatMap((product) => product.payload.specifications)
                      .find((spec) => spec.key === key)?.label ?? key}
                  </th>
                  {products.map((product) => {
                    const spec = product.payload.specifications.find((entry) => entry.key === key);
                    return (
                      <td key={product.item_id}>
                        {spec
                          ? `${typeof spec.value === "object" ? JSON.stringify(spec.value) : String(spec.value)} ${spec.unit ?? ""}`
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
