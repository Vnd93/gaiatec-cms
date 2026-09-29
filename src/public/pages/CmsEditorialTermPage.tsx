import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import {
  getCatalogCapability,
  getPublishedCatalogEditorialTerm,
  type PublishedCatalogEditorialTerm,
} from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import {
  isCatalogEditorialPublicTermIndexable,
  isCatalogFeatureEnabled,
  type CatalogEditorialTermKind,
} from "@/shared/contracts/catalog-release";
import "../catalog-editorial.css";

const routeKinds: Record<string, CatalogEditorialTermKind> = {
  tecnologia: "technology",
  industria: "industry",
  aplicacao: "application",
};

function unavailableSeo(path: string) {
  applyCatalogSeo({
    title: "Conteúdo editorial indisponível | GAIATEC",
    description: "O conteúdo editorial solicitado não está disponível.",
    canonicalPath: path,
    indexable: false,
  });
}

export default function CmsEditorialTermPage() {
  const navigate = useNavigate();
  const { slug = "" } = useParams();
  const termKind = useLocation().pathname.split("/")[2] ?? "";
  const [term, setTerm] = useState<PublishedCatalogEditorialTerm | null>(null);
  const [state, setState] = useState<"loading" | "disabled" | "error" | "ready">("loading");
  const path = `/catalogo/${termKind}/${slug}`;

  useEffect(() => {
    let active = true;
    setTerm(null);
    setState("loading");
    unavailableSeo(path);
    const kind = routeKinds[termKind];
    if (!kind || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      if (active) setState("error");
      return () => {
        active = false;
      };
    }

    void getCatalogCapability()
      .then((capability) => {
        const enabled = isCatalogFeatureEnabled({
          buildFlag: import.meta.env.VITE_CATALOG_V1,
          capabilityEnabled: capability.enabled,
          capabilitySource: capability.source,
        });
        if (!enabled) {
          if (active) setState("disabled");
          return null;
        }
        return getPublishedCatalogEditorialTerm(kind, slug).then((data) => ({ data, enabled }));
      })
      .then((result) => {
        if (!active || !result) return;
        if (result.data.kind === "redirect") {
          void navigate(result.data.path, { replace: true });
          return;
        }
        setTerm(result.data);
        applyCatalogSeo({
          title: `${result.data.title} | GAIATEC`,
          description: result.data.summary,
          canonicalPath: result.data.seo.canonicalPath,
          indexable: isCatalogEditorialPublicTermIndexable(result.data, result.enabled),
        });
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        unavailableSeo(path);
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [path, slug, termKind, navigate]);

  if (state === "loading")
    return (
      <section className="catalog-editorial" aria-busy="true">
        <div className="catalog-editorial__state">Carregando conteúdo editorial…</div>
      </section>
    );

  if (state === "disabled" || state === "error" || !term)
    return (
      <section className="catalog-editorial">
        <div className="catalog-editorial__state" role={state === "error" ? "alert" : undefined}>
          <p className="catalog-editorial__eyebrow">CONTEÚDO EDITORIAL</p>
          <h1>Conteúdo não disponível</h1>
          <p>Esta página permanece fechada até a aprovação e ativação controlada do catálogo.</p>
          <Link to="/">Voltar ao início</Link>
        </div>
      </section>
    );

  return (
    <article className="catalog-editorial" aria-labelledby="catalog-editorial-title">
      <header className="catalog-editorial__hero">
        <p className="catalog-editorial__eyebrow">GUIA TÉCNICO GAIATEC</p>
        <h1 id="catalog-editorial-title">{term.title}</h1>
        <p>{term.summary}</p>
      </header>
      <div className="catalog-editorial__body">
        {term.blocks.map((block) => (
          <section key={block.heading}>
            <h2>{block.heading}</h2>
            {block.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        {term.products.length > 0 && (
          <section aria-label="Produtos publicados relacionados">
            <h2>Produtos relacionados</h2>
            <ul>
              {term.products.map((product) => (
                <li key={product.path}>
                  <Link to={product.path}>{product.title}</Link>
                  <p>{product.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link className="catalog-editorial__cta" to="/contato">
          Solicitar orçamento
        </Link>
      </div>
    </article>
  );
}
