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
  const className = `cms-page-block cms-page-block--${block.type} cms-page-block--${block.tone} cms-page-block--${block.width}`;
  const common = { className, id: block.anchor };

  if (block.type === "hero") {
    const image = assetUrl(block.data.assetId, mediaUrls);
    return (
      <header
        {...common}
        style={
          image
            ? { backgroundImage: `linear-gradient(90deg, rgba(4,9,20,.94), rgba(4,9,20,.55)), url(${image})` }
            : undefined
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
        <div className={`${className} cms-page-form-embedded`}>
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
}

export function CmsPageRenderer({
  payload,
  mediaUrls = {},
  mediaAlt = {},
  relatedItems = [],
  leadContext,
  preview = false,
}: {
  payload: { blocks: CmsPageBlock[] };
  mediaUrls?: Record<string, string>;
  mediaAlt?: Record<string, string>;
  relatedItems?: CmsRelatedItem[];
  leadContext?: { campaignId?: string; productId?: string };
  preview?: boolean;
}) {
  return (
    <article className="cms-managed-page" data-cms-renderer="managed-page">
      {preview && (
        <div className="cms-page-preview-banner" role="status">
          Preview privado — alterações ainda não publicadas
        </div>
      )}
      {payload.blocks.map((block) => (
        <BlockRenderer
          block={block}
          mediaUrls={mediaUrls}
          mediaAlt={mediaAlt}
          relatedItems={relatedItems}
          leadContext={leadContext}
          key={block.id}
        />
      ))}
    </article>
  );
}
