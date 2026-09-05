import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Quote } from "lucide-react";
import { Link } from "react-router";
import type { CmsPageBlock } from "@/shared/contracts/cms-content";
import type { CmsFormVersion } from "@/shared/contracts/cms-content";
import { getPublishedForm } from "../catalog-api";
import { CmsLeadForm } from "./CmsLeadForm";
import { ContactSection } from "../../app/components/ContactSection";
import "../site-builder.css";

export type CmsRelatedItem = {
  item_id: string;
  title: string;
  summary?: string;
  path: string;
  content_type: string;
};

const assetUrl = (assetId: string | undefined, mediaUrls: Record<string, string>) => {
  if (!assetId) return "";
  return (
    mediaUrls[`${assetId}:large.avif`] ??
    mediaUrls[`${assetId}:large.webp`] ??
    mediaUrls[`${assetId}:medium.webp`] ??
    ""
  );
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
  if (!href.startsWith("/") && !/^https?:\/\//i.test(href))
    return <span className={className}>{children}</span>;
  return /^https?:\/\//i.test(href) ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
};

function GovernedForm({
  formKey,
  heading,
  campaignId,
  productId,
}: {
  formKey: string;
  heading: string;
  campaignId?: string;
  productId?: string;
}) {
  const [form, setForm] = useState<CmsFormVersion | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void getPublishedForm(formKey)
      .then((value) => {
        if (!active) return;
        setForm(value);
        setUnavailable(value === null);
      })
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, [formKey]);
  if (unavailable)
    return <p role="status">Formulário temporariamente indisponível. Use a página de contato.</p>;
  if (!form) return <p aria-busy="true">Carregando formulário…</p>;
  return <CmsLeadForm form={form} heading={heading} campaignId={campaignId} productId={productId} />;
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
}: {
  block: CmsPageBlock;
  mediaUrls: Record<string, string>;
  mediaAlt: Record<string, string>;
  relatedItems: CmsRelatedItem[];
  leadContext?: { campaignId?: string; productId?: string };
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
    "data-component-version": block.componentVersion,
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
            <div className="cms-page-media-missing">Imagem ainda não publicada</div>
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
    const selected = relatedItems.filter((item) => block.data.itemIds.includes(item.item_id));
    return (
      <section {...common}>
        <div className="cms-page-block__inner">
          <h2>{block.data.heading}</h2>
          {selected.length ? (
            <div
              className={block.data.presentation === "cards" ? "cms-page-card-grid" : "cms-page-related-list"}
            >
              {selected.map((item) => (
                <CmsLink className="cms-page-content-card" href={item.path} key={item.item_id}>
                  <small>{item.content_type}</small>
                  <h3>{item.title}</h3>
                  {item.summary && <p>{item.summary}</p>}
                  <span>
                    Ver conteúdo <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </CmsLink>
              ))}
            </div>
          ) : (
            <p>Nenhum conteúdo relacionado está publicado.</p>
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
              <div className="cms-page-media-missing">Imagem ainda não publicada</div>
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
    if (block.data.formId && block.data.formVersionId)
      return (
        <section {...common}>
          <div className="cms-page-block__inner">
            <GovernedForm
              formKey={block.data.formKey}
              heading={block.data.heading}
              campaignId={leadContext?.campaignId}
              productId={leadContext?.productId}
            />
          </div>
        </section>
      );
    if (block.data.formKey !== "newsletter")
      return (
        <div {...common} id={undefined} className={`${className} cms-page-form-embedded`}>
          <ContactSection
            variant={block.tone === "brand" || block.tone === "dark" ? "brand" : "light"}
            heading={block.data.heading}
            introduction={block.data.text}
            submitLabel={block.data.buttonLabel}
            sectionId={block.anchor || `form-${block.id}`}
            initialEnquiryType={block.data.formKey === "lead" ? "Orçamento" : ""}
            formKey={block.data.formKey === "lead" ? "contato-principal" : block.data.formKey}
          />
        </div>
      );
    const href = block.data.formKey === "newsletter" ? "/#newsletter" : "/contato";
    return (
      <section {...common}>
        <div className="cms-page-block__inner cms-page-form-placeholder">
          <div>
            <p className="cms-page-eyebrow">FORMULÁRIO</p>
            <h2>{block.data.heading}</h2>
            {block.data.text && <p>{block.data.text}</p>}
          </div>
          <CmsLink className="cms-page-button" href={href}>
            {block.data.buttonLabel} <ArrowRight size={17} aria-hidden="true" />
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
  preview = false,
  viewport,
  themeStyle,
}: {
  payload: { blocks: CmsPageBlock[] };
  mediaUrls?: Record<string, string>;
  mediaAlt?: Record<string, string>;
  relatedItems?: CmsRelatedItem[];
  leadContext?: { campaignId?: string; productId?: string };
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
    <article
      className="cms-managed-page"
      data-cms-renderer="managed-page"
      data-cms-breakpoint={viewport}
      style={themeStyle}
    >
      {preview && (
        <div className="cms-page-preview-banner" role="status">
          Preview privado — alterações ainda não publicadas
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
            key={block.id}
          />
        ));
        return unit.groupId ? (
          <div className="cms-page-visual-group" data-visual-group={unit.groupId} key={unit.id}>
            {rendered}
          </div>
        ) : (
          rendered
        );
      })}
    </article>
  );
}
