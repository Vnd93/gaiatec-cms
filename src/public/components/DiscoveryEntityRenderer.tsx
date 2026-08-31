import type { PublishedDiscovery } from "../catalog-api";

const labels = {
  service: "Serviço",
  industry: "Indústria",
  application: "Aplicação",
  solution: "Solução",
} as const;

export function DiscoveryEntityCard({ entity }: { entity: PublishedDiscovery }) {
  return (
    <article className="discovery-card">
      <p className="new-catalog__eyebrow">{labels[entity.content_type]}</p>
      <h2>
        <a href={entity.path}>{entity.payload.title}</a>
      </h2>
      <p>{entity.payload.summary}</p>
      {entity.matched_by && <small>Encontrado por: {entity.matched_by}</small>}
    </article>
  );
}

export function DiscoveryEntityRenderer({
  entity,
  preview = false,
}: {
  entity: PublishedDiscovery;
  preview?: boolean;
}) {
  const p = entity.payload as any;
  const primary = p.media?.find((media: any) => media.role === "primary");
  const image =
    primary &&
    (entity.media_urls?.[`${primary.assetId}:large.avif`] ??
      entity.media_urls?.[`${primary.assetId}:large.webp`]);
  const sections: Array<[string, string[]]> = [];
  if (p.challenges) sections.push(["Desafios", p.challenges]);
  if (p.evidence) sections.push(["Evidências", p.evidence]);
  if (p.deliverables) sections.push(["Entregáveis", p.deliverables]);
  if (p.executionSteps) sections.push(["Etapas de execução", p.executionSteps]);
  if (p.benefits) sections.push(["Benefícios comprováveis", p.benefits]);
  if (p.components) sections.push(["Componentes", p.components]);
  return (
    <main className="new-catalog discovery-detail">
      {preview && <div className="new-catalog__state">Preview privado — conteúdo não publicado.</div>}
      <p className="new-catalog__eyebrow">
        {labels[entity.content_type]} ·{" "}
        {p.governanceState === "homologated" ? "homologado" : "aguardando owner"}
      </p>
      <h1>{p.title}</h1>
      {entity.content_type === "service" && p.serviceKindRef?.label && (
        <p className="new-catalog__chips" aria-label="Categoria do serviço">
          <span>{p.serviceKindRef.label}</span>
        </p>
      )}
      <p className="discovery-detail__lead">{p.summary}</p>
      {image && <img src={image} alt={primary.alt} className="discovery-detail__image" />}
      {p.scope && (
        <section>
          <h2>Escopo</h2>
          <p>{p.scope}</p>
        </section>
      )}
      {p.problem && (
        <section>
          <h2>Problema</h2>
          <p>{p.problem}</p>
        </section>
      )}
      {p.process && (
        <section>
          <h2>Processo</h2>
          <p>{p.process}</p>
        </section>
      )}
      {p.approach && (
        <section>
          <h2>Abordagem</h2>
          <p>{p.approach}</p>
        </section>
      )}
      {sections.map(([title, items]) => (
        <section key={title}>
          <h2>{title}</h2>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {p.points?.length > 0 && (
        <section>
          <h2>Pontos da aplicação</h2>
          <div className="discovery-points">
            {p.points.map((point: any) => (
              <article key={point.id}>
                <h3>{point.title}</h3>
                <p>
                  <strong>Necessidade:</strong> {point.need}
                </p>
                <p>
                  <strong>Variável:</strong> {point.variable}
                </p>
                <p>{point.function}</p>
                <p>
                  <strong>Benefício técnico:</strong> {point.technicalBenefit}
                </p>
                <p>
                  <strong>Benefício operacional:</strong> {point.operationalBenefit}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2>Relações publicadas</h2>
        <p>
          {Object.values(p.relations ?? {}).some((ids: any) => ids.length)
            ? "Produtos, serviços, indústrias, aplicações e soluções relacionados estão vinculados pela projeção publicada."
            : "Nenhuma relação homologada foi cadastrada."}
        </p>
      </section>
      <a className="discovery-detail__cta" href={p.cta?.href ?? "/contato"}>
        {p.cta?.label ?? "Falar com especialista"}
      </a>
    </main>
  );
}
