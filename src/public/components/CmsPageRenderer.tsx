import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Quote } from "lucide-react";
import { Link } from "react-router";
import type { CmsPageBlock } from "@/shared/contracts/cms-content";
import { getPublishedForm, type PublicFormVersion } from "../catalog-api";
import { CmsLeadForm } from "./CmsLeadForm";
import "../site-builder.css";

export type CmsRelatedItem = {
  title: string;
  summary?: string;
  path: string;
  kind: string;
};

const relatedKindLabels: Record<string, string> = {
  product: "Produto",
  service: "Serviço",
  industry: "Setor",
  application: "Aplicação",
  solution: "Solução",
  page: "Página",
  homepage: "Página inicial",
  post: "Artigo",
  campaign: "Campanha",
};

const relatedKindLabel = (kind: string) => relatedKindLabels[kind] ?? "Conteúdo";
const publicCmsPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;

const assetUrl = (assetId: string | undefined, mediaUrls: Record<string, string>) => {
  if (!assetId) return "";
  return (
    mediaUrls[`${assetId}:large.avif`] ??
    mediaUrls[`${assetId}:large.webp`] ??
    mediaUrls[`${assetId}:medium.webp`] ??
    ""
  );
};

const isPublicInternetHostname = (hostname: string) => {
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
};

const safeCmsHref = (value: string): { href: string; external: boolean } | null => {
  if (publicCmsPathPattern.test(value)) return { href: value, external: false };
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !isPublicInternetHostname(parsed.hostname) ||
      [...parsed.searchParams.keys()].some((key) =>
        /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i.test(
          key,
        ),
      )
    )
      return null;
    return { href: parsed.href, external: true };
  } catch {
    return null;
  }
};

const CmsLink = ({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const destination = safeCmsHref(href);
  if (!destination) return <span className={className}>{children}</span>;
  return destination.external ? (
    <a className={className} href={destination.href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link className={className} to={destination.href}>
      {children}
    </Link>
  );
};

function GovernedForm({
  formKey,
  formVersion,
  exactForm,
  heading,
  campaignPath,
  productSlug,
}: {
  formKey: string;
  formVersion?: number;
  exactForm?: PublicFormVersion;
  heading: string;
  campaignPath?: string;
  productSlug?: string;
}) {
  const safeFormVersion =
    Number.isSafeInteger(formVersion) && Number(formVersion) >= 1 ? Number(formVersion) : null;
  const binding = safeFormVersion === null ? null : `${formKey}:${safeFormVersion}`;
  const [resolution, setResolution] = useState<{
    binding: string;
    form: PublicFormVersion | null;
    unavailable: boolean;
  } | null>(null);
  const exactFormMatches =
    binding !== null && exactForm?.key === formKey && exactForm.version === safeFormVersion;
  useEffect(() => {
    let active = true;
    if (exactFormMatches) return undefined;
    if (!binding || safeFormVersion === null) return undefined;
    void getPublishedForm(formKey, safeFormVersion)
      .then((value) => {
        if (!active) return;
        const compatible = value?.key === formKey && value.version === safeFormVersion ? value : null;
        setResolution({ binding, form: compatible, unavailable: compatible === null });
      })
      .catch(() => active && setResolution({ binding, form: null, unavailable: true }));
    return () => {
      active = false;
    };
  }, [binding, exactFormMatches, formKey, safeFormVersion]);
  if (exactFormMatches)
    return (
      <CmsLeadForm form={exactForm} heading={heading} campaignPath={campaignPath} productSlug={productSlug} />
    );
  if (!binding) return <p role="status">Formulário temporariamente indisponível. Use a página de contato.</p>;
  const current = resolution?.binding === binding ? resolution : null;
  if (current?.unavailable)
    return <p role="status">Formulário temporariamente indisponível. Use a página de contato.</p>;
  if (!current?.form) return <p aria-busy="true">Carregando formulário…</p>;
  return (
    <CmsLeadForm
      form={current.form}
      heading={heading}
      campaignPath={campaignPath}
      productSlug={productSlug}
    />
  );
}

function TabsBlock({ block }: { block: Extract<CmsPageBlock, { type: "tabs" }> }) {
  const [selected, setSelected] = useState(block.data.items[0]?.id ?? "");
  const active = block.data.items.find((item) => item.id === selected) ?? block.data.items[0];
  if (!active) return null;
  return (
    <div className="cms-page-tabs">
      <div role="tablist" aria-label={block.data.heading ?? "Conteúdo em abas"}>
        {block.data.items.map((item) => (
          <button
            key={item.id}
            id={`tab-${block.id}-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item.id === active.id}
            aria-controls={`panel-${block.id}-${item.id}`}
            tabIndex={item.id === active.id ? 0 : -1}
            onClick={() => setSelected(item.id)}
            onKeyDown={(event) => {
              const current = block.data.items.findIndex((candidate) => candidate.id === active.id);
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset) return;
              event.preventDefault();
              const next =
                block.data.items[(current + offset + block.data.items.length) % block.data.items.length];
              setSelected(next.id);
              document.getElementById(`tab-${block.id}-${next.id}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section
        id={`panel-${block.id}-${active.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${block.id}-${active.id}`}
        tabIndex={0}
      >
        <h3>{active.heading}</h3>
        <p>{active.text}</p>
      </section>
    </div>
  );
}

function BlockRenderer({
  block,
  mediaUrls,
  mediaAlt,
  relatedItems,
  leadContext,
  governedForm,
}: {
  block: CmsPageBlock;
  mediaUrls: Record<string, string>;
  mediaAlt: Record<string, string>;
  relatedItems: CmsRelatedItem[];
  leadContext?: { campaignPath?: string; productSlug?: string };
  governedForm?: PublicFormVersion;
}) {
  if (block.hidden) return null;
  const className = `cms-page-block cms-page-block--${block.type} cms-page-block--${block.tone} cms-page-block--${block.width}${block.layout ? " cms-page-block--visual" : ""}`;
  const layoutStyle = block.layout
    ? ({
        "--cms-span-desktop": block.layout.desktop.span,
        "--cms-span-tablet": block.layout.tablet.span,
        "--cms-span-mobile": block.layout.mobile.span,
        "--cms-start-desktop":
          block.layout.desktop.start ?? Math.floor((12 - block.layout.desktop.span) / 2) + 1,
        "--cms-start-tablet": block.layout.tablet.start ?? Math.floor((8 - block.layout.tablet.span) / 2) + 1,
        "--cms-start-mobile": block.layout.mobile.start ?? Math.floor((4 - block.layout.mobile.span) / 2) + 1,
      } as React.CSSProperties)
    : undefined;
  const common = {
    className,
    id: block.anchor,
    style: layoutStyle,
    "data-hidden-desktop": block.layout?.desktop.hidden || undefined,
    "data-hidden-tablet": block.layout?.tablet.hidden || undefined,
    "data-hidden-mobile": block.layout?.mobile.hidden || undefined,
  };

  if (block.type === "hero") {
    const image = assetUrl(block.data.assetId, mediaUrls);
    return (
      <header
        {...common}
        style={
          image
            ? {
                ...layoutStyle,
                backgroundImage: `linear-gradient(90deg, rgba(4,9,20,.94), rgba(4,9,20,.55)), url(${image})`,
              }
            : layoutStyle
        }
      >
        <div className={`cms-page-block__inner is-${block.data.alignment}`}>
          {block.data.eyebrow && <p className="cms-page-eyebrow">{block.data.eyebrow}</p>}
          <h1>{block.data.title}</h1>
          {block.data.text && <p className="cms-page-lead">{block.data.text}</p>}
          {(block.data.primaryCta || block.data.secondaryCta) && (
            <div className="cms-page-actions">
              {block.data.primaryCta && (
                <CmsLink className="cms-page-button" href={block.data.primaryCta.href}>
                  {block.data.primaryCta.label} <ArrowRight size={17} aria-hidden="true" />
                </CmsLink>
              )}
              {block.data.secondaryCta && (
                <CmsLink
                  className="cms-page-button cms-page-button--secondary"
                  href={block.data.secondaryCta.href}
                >
                  {block.data.secondaryCta.label}
                </CmsLink>
              )}
            </div>
          )}
        </div>
      </header>
    );
  }

  if (block.type === "rich_text")
    return (
      <section {...common}>
        <div className="cms-page-block__inner cms-page-prose">
          {block.data.eyebrow && <p className="cms-page-eyebrow">{block.data.eyebrow}</p>}
          {block.data.heading && <h2>{block.data.heading}</h2>}
          {block.data.text.split(/\n{2,}/).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    );

  if (block.type === "image") {
    const image = assetUrl(block.data.assetId, mediaUrls);
    return (
      <section {...common}>
        <figure className="cms-page-block__inner cms-page-figure">
          {image ? (
            <img src={image} alt={block.data.alt} style={{ objectFit: block.data.fit }} />
          ) : (
            <div className="cms-page-media-missing">Imagem indisponível</div>
          )}
          {block.data.caption && <figcaption>{block.data.caption}</figcaption>}
        </figure>
      </section>
    );
  }

  if (block.type === "gallery")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {block.data.heading && <h2>{block.data.heading}</h2>}
          <div
            className="cms-page-gallery"
            style={{ "--cms-columns": block.data.columns } as React.CSSProperties}
          >
            {block.data.assetIds.map((assetId) => {
              const image = assetUrl(assetId, mediaUrls);
              return image ? (
                <img key={assetId} src={image} alt={mediaAlt[assetId] ?? ""} loading="lazy" />
              ) : (
                <div key={assetId} className="cms-page-media-missing">
                  Mídia indisponível
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );

  if (block.type === "benefit_grid" || block.type === "steps") {
    const items = block.data.items;
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {"eyebrow" in block.data && block.data.eyebrow && (
            <p className="cms-page-eyebrow">{block.data.eyebrow}</p>
          )}
          <h2>{block.data.heading}</h2>
          <div className={block.type === "steps" ? "cms-page-steps" : "cms-page-card-grid"}>
            {items.map((item, index) => (
              <article key={item.id}>
                {block.type === "steps" ? (
                  <span>{String(index + 1).padStart(2, "0")}</span>
                ) : (
                  <CheckCircle2 size={22} aria-hidden="true" />
                )}
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "content_grid")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {block.data.eyebrow && <p className="cms-page-eyebrow">{block.data.eyebrow}</p>}
          <h2>{block.data.heading}</h2>
          <div
            className="cms-page-card-grid"
            style={{ "--cms-columns": block.data.columns } as React.CSSProperties}
          >
            {block.data.items.map((item) => {
              const image = assetUrl(item.assetId, mediaUrls);
              const content = (
                <>
                  {image && <img src={image} alt={mediaAlt[item.assetId ?? ""] ?? ""} loading="lazy" />}
                  <h3>{item.title}</h3>
                  {item.text && <p>{item.text}</p>}
                  {item.href && (
                    <span>
                      Saiba mais <ArrowRight size={15} aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return item.href ? (
                <CmsLink className="cms-page-content-card" href={item.href} key={item.id}>
                  {content}
                </CmsLink>
              ) : (
                <article className="cms-page-content-card" key={item.id}>
                  {content}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );

  if (block.type === "metrics")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {block.data.heading && <h2>{block.data.heading}</h2>}
          <dl className="cms-page-metrics">
            {block.data.items.map((item) => (
              <div key={item.id}>
                <dd>{item.value}</dd>
                <dt>{item.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );

  if (block.type === "testimonial")
    return (
      <section {...common}>
        <figure className="cms-page-block__inner cms-page-quote">
          <Quote size={36} aria-hidden="true" />
          <blockquote>{block.data.quote}</blockquote>
          <figcaption>
            {block.data.author}
            {block.data.role ? ` — ${block.data.role}` : ""}
          </figcaption>
        </figure>
      </section>
    );

  if (block.type === "faq")
    return (
      <section {...common}>
        <div className="cms-page-block__inner cms-page-faq">
          <h2>{block.data.heading}</h2>
          {block.data.items.map((item) => (
            <details key={item.id}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    );

  if (block.type === "related_content") {
    const relatedByPath = new Map(relatedItems.map((item) => [item.path, item]));
    const selected = [...new Set(block.data.itemIds)]
      .filter((path) => publicCmsPathPattern.test(path))
      .flatMap((path) => {
        const item = relatedByPath.get(path);
        return item ? [item] : [];
      });
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          {selected.length ? (
            <div
              className={block.data.presentation === "cards" ? "cms-page-card-grid" : "cms-page-related-list"}
            >
              {selected.map((item) => (
                <CmsLink className="cms-page-content-card" href={item.path} key={item.path}>
                  <small>{relatedKindLabel(item.kind)}</small>
                  <h3>{item.title}</h3>
                  {item.summary && <p>{item.summary}</p>}
                  <span>
                    Ver conteúdo <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </CmsLink>
              ))}
            </div>
          ) : (
            <p>Nenhum conteúdo relacionado está disponível.</p>
          )}
        </div>
      </section>
    );
  }

  if (block.type === "split_content") {
    const image = assetUrl(block.data.assetId, mediaUrls);
    return (
      <section {...common}>
        <div className={`cms-page-block__inner cms-page-split is-image-${block.data.imagePosition}`}>
          <div className="cms-page-split__media">
            {image ? (
              <img src={image} alt={block.data.alt} loading="lazy" />
            ) : (
              <div className="cms-page-media-missing">Imagem indisponível</div>
            )}
          </div>
          <div className="cms-page-split__copy">
            {block.data.eyebrow && <p className="cms-page-eyebrow">{block.data.eyebrow}</p>}
            <h2>{block.data.heading}</h2>
            <p>{block.data.text}</p>
            {block.data.link && (
              <CmsLink className="cms-page-button" href={block.data.link.href}>
                {block.data.link.label} <ArrowRight size={17} aria-hidden="true" />
              </CmsLink>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "logo_cloud")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {block.data.heading && <h2>{block.data.heading}</h2>}
          <ul className="cms-page-logo-cloud" aria-label={block.data.heading ?? "Marcas e parceiros"}>
            {block.data.items.map((item) => {
              const image = assetUrl(item.assetId, mediaUrls);
              const logo = image ? (
                <img src={image} alt={item.alt} loading="lazy" />
              ) : (
                <span className="cms-page-media-missing">{item.alt}</span>
              );
              return <li key={item.id}>{item.href ? <CmsLink href={item.href}>{logo}</CmsLink> : logo}</li>;
            })}
          </ul>
        </div>
      </section>
    );

  if (block.type === "tabs")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          {block.data.heading && <h2>{block.data.heading}</h2>}
          <TabsBlock block={block} />
        </div>
      </section>
    );

  if (block.type === "comparison_table")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          <div className="cms-page-comparison" tabIndex={0} role="region" aria-label={block.data.caption}>
            <table>
              <caption>{block.data.caption}</caption>
              <thead>
                <tr>
                  <th scope="col">Característica</th>
                  {block.data.columns.map((column, index) => (
                    <th scope="col" key={`${index}-${column}`}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.data.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td key={`${row.id}-${index}-${block.data.columns[index]}`}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );

  if (block.type === "alert")
    return (
      <section {...common}>
        <aside className={`cms-page-block__inner cms-page-alert is-${block.data.severity}`} role="note">
          <div>
            <h2>{block.data.heading}</h2>
            <p>{block.data.text}</p>
          </div>
          {block.data.link && (
            <CmsLink href={block.data.link.href}>
              {block.data.link.label} <ArrowRight size={16} aria-hidden="true" />
            </CmsLink>
          )}
        </aside>
      </section>
    );

  if (block.type === "timeline")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          <ol className="cms-page-timeline">
            {block.data.items.map((item) => (
              <li key={item.id}>
                <p className="cms-page-eyebrow">{item.label}</p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );

  if (block.type === "link_list")
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          <ul className="cms-page-link-list">
            {block.data.items.map((item) => (
              <li key={item.id}>
                <CmsLink href={item.href}>
                  <span>
                    <strong>{item.label}</strong>
                    {item.description && <small>{item.description}</small>}
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </CmsLink>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );

  if (block.type === "form") {
    if (
      (block.data.formId && block.data.formVersionId) ||
      ("governed" in block.data && block.data.governed === true)
    )
      return (
        <section {...common}>
          <div className="cms-page-block__inner">
            <GovernedForm
              formKey={block.data.formKey}
              formVersion={
                "formVersion" in block.data && Number.isSafeInteger(block.data.formVersion)
                  ? Number(block.data.formVersion)
                  : undefined
              }
              exactForm={governedForm}
              heading={block.data.heading}
              campaignPath={leadContext?.campaignPath}
              productSlug={leadContext?.productSlug}
            />
          </div>
        </section>
      );
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          <p role="status">
            Formulário temporariamente indisponível. Use a página de contato para falar com a GAIATEC.
          </p>
          <CmsLink className="cms-page-button" href="/contato">
            Abrir página de contato <ArrowRight size={17} aria-hidden="true" />
          </CmsLink>
        </div>
      </section>
    );
  }

  if (block.type === "cta")
    return (
      <section {...common}>
        <div className="cms-page-block__inner cms-page-cta">
          <div>
            <h2>{block.data.heading}</h2>
            {block.data.text && <p>{block.data.text}</p>}
          </div>
          <CmsLink className="cms-page-button" href={block.data.link.href}>
            {block.data.link.label} <ArrowRight size={17} aria-hidden="true" />
          </CmsLink>
        </div>
      </section>
    );

  return null;
}

export function CmsPageRenderer({
  payload,
  mediaUrls = {},
  mediaAlt = {},
  relatedItems = [],
  leadContext,
  governedForm,
  preview = false,
  viewport,
  themeStyle,
}: {
  payload: { blocks: CmsPageBlock[] };
  mediaUrls?: Record<string, string>;
  mediaAlt?: Record<string, string>;
  relatedItems?: CmsRelatedItem[];
  leadContext?: { campaignPath?: string; productSlug?: string };
  governedForm?: PublicFormVersion;
  preview?: boolean;
  viewport?: "desktop" | "tablet" | "mobile";
  themeStyle?: React.CSSProperties;
}) {
  const units: Array<{ id: string; groupId?: string; blocks: CmsPageBlock[] }> = [];
  for (const block of payload.blocks) {
    const previous = units.at(-1);
    if (block.groupId && previous?.groupId === block.groupId) previous.blocks.push(block);
    else units.push({ id: block.groupId ?? block.id, groupId: block.groupId, blocks: [block] });
  }
  return (
    <article className="cms-managed-page" data-cms-breakpoint={viewport} style={themeStyle}>
      {preview && (
        <div className="cms-page-preview-banner" role="status">
          Preview privado — visualização restrita para revisão
        </div>
      )}
      {units.map((unit) => {
        const rendered = unit.blocks.map((block) => (
          <BlockRenderer
            block={block}
            mediaUrls={mediaUrls}
            mediaAlt={mediaAlt}
            relatedItems={relatedItems}
            leadContext={leadContext}
            governedForm={governedForm}
            key={block.id}
          />
        ));
        return unit.groupId ? (
          <div className="cms-page-visual-group" key={unit.id}>
            {rendered}
          </div>
        ) : (
          rendered
        );
      })}
    </article>
  );
}
