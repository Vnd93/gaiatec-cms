import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { CmsPageContent } from "@/shared/contracts/cms-content";
import { getPublishedPageByPath, type PublishedPage } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import { CmsPageRenderer } from "../components/CmsPageRenderer";

export function CmsManagedPageRoute({ fallback }: { fallback?: React.ReactNode }) {
  const { pathname } = useLocation();
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [resolved, setResolved] = useState(false);
  const [retiredStatus, setRetiredStatus] = useState<404 | 410 | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setResolved(false);
    setPage(null);
    setRetiredStatus(null);
    setFailed(false);
    void getPublishedPageByPath(pathname)
      .then((resolution) => {
        if (!active) return;
        if (resolution.kind === "route") {
          if (
            (resolution.rule.status === 301 || resolution.rule.status === 302) &&
            resolution.rule.destinationPath
          ) {
            window.location.replace(resolution.rule.destinationPath);
            return;
          }
          applyCatalogSeo({
            title:
              resolution.rule.status === 410
                ? "Conteúdo retirado | GAIATEC"
                : "Página não encontrada | GAIATEC",
            description: "O conteúdo solicitado não está disponível.",
            canonicalPath: pathname,
            indexable: false,
          });
          setRetiredStatus(resolution.rule.status === 410 ? 410 : 404);
          setResolved(true);
          return;
        }
        if (resolution.kind === "fallback") {
          if (fallback === undefined) setRetiredStatus(404);
          setResolved(true);
          return;
        }
        const result = resolution.page;
        setPage(result);
        setResolved(true);
        applyCatalogSeo({
          title: result.seo.title,
          description: result.seo.description,
          canonicalPath: result.payload.route.path,
          indexable: result.seo.indexable,
          ogImage: result.seo.socialImage,
        });
      })
      .catch(() => {
        if (active) {
          applyCatalogSeo({
            title: "Conteúdo indisponível | GAIATEC",
            description: "A publicação segura não pôde ser carregada neste momento.",
            canonicalPath: pathname,
            indexable: false,
          });
          setFailed(true);
          setResolved(true);
        }
      });
    return () => {
      active = false;
    };
  }, [fallback, pathname]);

  if (!resolved)
    return (
      <div className="cms-managed-page__loading" aria-busy="true">
        Carregando página…
      </div>
    );
  if (page)
    return (
      <CmsPageRenderer
        payload={page.payload as CmsPageContent}
        mediaUrls={page.mediaUrls}
        mediaAlt={page.mediaAlt}
        relatedItems={page.relatedItems}
      />
    );
  if (retiredStatus)
    return (
      <section className="cms-managed-page__gone">
        <p>{retiredStatus === 410 ? "PÁGINA RETIRADA" : "PÁGINA NÃO ENCONTRADA"}</p>
        <h1>
          {retiredStatus === 410
            ? "Este conteúdo não está mais disponível"
            : "Não encontramos o conteúdo solicitado"}
        </h1>
        <a href="/">Voltar para a página inicial</a>
      </section>
    );
  if (failed)
    return (
      <section className="cms-managed-page__gone" role="alert">
        <p>CONTEÚDO TEMPORARIAMENTE INDISPONÍVEL</p>
        <h1>Não foi possível carregar a publicação segura</h1>
        <p>Tente novamente em instantes.</p>
      </section>
    );
  return fallback ?? null;
}
