/**
 * Renderiza qualquer bloco do CMS visualmente, baseado no `tipo`.
 * Usar:
 *   <DynamicBlocks slug="biodigestor" />
 *   <BlockRenderer bloco={blocoFromApi} />
 *
 * Os componentes desenhados aqui são versões **simples e responsáveis**
 * dos blocos — fontes/cores seguem o tema do site mas não copiam pixel
 * a pixel as seções estilizadas (hardcoded) que existem em HomePage.
 * Quando a página tem layout fixo, prefere chamar os componentes
 * específicos (HeroBanner, ContactSection, etc.) com hook dedicado.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { usePagina } from "../hooks/useSiteData";
import type { SiteBloco } from "../../lib/supabase";

const SITE_BASE = "https://gaiatecsistemas.com.br";

function resolveImg(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${SITE_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function Wrapper({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`py-16 md:py-24 ${className}`}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">{children}</div>
    </section>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

interface HeroSlide {
  titulo?: string;
  subtitulo?: string;
  label?: string;
  descricao?: string;
  imagem_url?: string;
  cta_texto?: string;
  cta_link?: string;
}

function HeroBlock({ dados }: { dados: { slides: HeroSlide[] } }) {
  const slide = dados.slides?.[0];
  if (!slide) return null;
  return (
    <section
      className="relative bg-cover bg-center text-white"
      style={{
        backgroundImage: slide.imagem_url
          ? `url(${resolveImg(slide.imagem_url)})`
          : "linear-gradient(135deg, #111, #333)",
        minHeight: "55vh",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className="relative max-w-[1400px] mx-auto px-4 md:px-6 py-20 md:py-32 flex items-end min-h-[55vh]">
        <div className="max-w-2xl">
          {slide.label && (
            <div className="text-xs font-bold uppercase tracking-widest text-[#0057DE] mb-3">
              {slide.label}
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">{slide.titulo}</h1>
          {slide.descricao && (
            <p className="text-base md:text-lg text-white/85 mb-6">{slide.descricao}</p>
          )}
          {slide.cta_texto && slide.cta_link && (
            <a
              href={slide.cta_link}
              className="inline-flex items-center gap-2 bg-[#0057DE] text-white px-6 py-3 text-sm font-semibold hover:bg-[#0046b3] transition-colors"
            >
              {slide.cta_texto}
              <ChevronRight size={16} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function StatsBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; items: Array<{ valor?: string; label?: string }> } }) {
  return (
    <Wrapper className="bg-white">
      {dados.titulo && (
        <h2 className="text-2xl md:text-3xl font-bold text-black mb-2 text-center">{dados.titulo}</h2>
      )}
      {dados.subtitulo && (
        <p className="text-[#666] text-center mb-12">{dados.subtitulo}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {(dados.items ?? []).map((it, i) => (
          <div key={i} className="text-center p-6 bg-[#f7f7f7] border border-[#e0e0e0]">
            <div className="text-3xl md:text-5xl font-bold text-[#0057DE] leading-none">
              {it.valor || "—"}
            </div>
            <div className="text-sm text-[#666] mt-2 uppercase tracking-wide">{it.label}</div>
          </div>
        ))}
      </div>
    </Wrapper>
  );
}

// ─── CTA Banner ──────────────────────────────────────────────────────────────

function CtaBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; descricao?: string; cta_texto?: string; cta_link?: string; imagem_fundo?: string } }) {
  return (
    <section
      className="relative py-20 md:py-32 text-white text-center"
      style={{
        backgroundImage: dados.imagem_fundo
          ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${resolveImg(dados.imagem_fundo)})`
          : "linear-gradient(135deg, #0057DE, #0046b3)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="max-w-3xl mx-auto px-4">
        {dados.titulo && <h2 className="text-3xl md:text-5xl font-bold mb-4">{dados.titulo}</h2>}
        {(dados.subtitulo || dados.descricao) && (
          <p className="text-lg md:text-xl text-white/90 mb-8">{dados.subtitulo || dados.descricao}</p>
        )}
        {dados.cta_texto && dados.cta_link && (
          <a
            href={dados.cta_link}
            className="inline-flex items-center gap-2 bg-white text-black px-8 py-4 font-semibold hover:bg-gray-100 transition-colors"
          >
            {dados.cta_texto}
            <ChevronRight size={18} />
          </a>
        )}
      </div>
    </section>
  );
}

// ─── Rich Text ───────────────────────────────────────────────────────────────

function RichTextBlock({ dados }: { dados: { titulo?: string; paragrafo_1?: string; paragrafo_2?: string; imagem_url?: string } }) {
  return (
    <Wrapper className="bg-white">
      <div className={`grid ${dados.imagem_url ? "md:grid-cols-2 gap-12" : "max-w-3xl mx-auto"} items-start`}>
        {dados.imagem_url && (
          <img
            src={resolveImg(dados.imagem_url)}
            alt={dados.titulo ?? ""}
            className="w-full object-cover"
            loading="lazy"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        )}
        <div>
          {dados.titulo && (
            <h2 className="text-2xl md:text-4xl font-bold text-black mb-6">{dados.titulo}</h2>
          )}
          {dados.paragrafo_1 && (
            <p className="text-[#444] leading-relaxed mb-4 whitespace-pre-line">{dados.paragrafo_1}</p>
          )}
          {dados.paragrafo_2 && (
            <p className="text-[#444] leading-relaxed whitespace-pre-line">{dados.paragrafo_2}</p>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

// ─── Feature Grid ────────────────────────────────────────────────────────────

function FeatureGridBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; items: Array<{ icone?: string; titulo?: string; descricao?: string }> } }) {
  return (
    <Wrapper className="bg-[#f7f7f7]">
      {dados.titulo && (
        <h2 className="text-2xl md:text-3xl font-bold text-black mb-2 text-center">{dados.titulo}</h2>
      )}
      {dados.subtitulo && (
        <p className="text-[#666] text-center mb-12">{dados.subtitulo}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(dados.items ?? []).map((it, i) => (
          <div key={i} className="bg-white p-8 border border-[#e0e0e0]">
            {it.icone && <div className="text-3xl mb-4">{it.icone}</div>}
            {it.titulo && <h3 className="text-lg font-bold text-black mb-2">{it.titulo}</h3>}
            {it.descricao && <p className="text-[#666] text-sm leading-relaxed">{it.descricao}</p>}
          </div>
        ))}
      </div>
    </Wrapper>
  );
}

// ─── Gallery ─────────────────────────────────────────────────────────────────

function GalleryBlock({ dados }: { dados: { titulo?: string; items: Array<{ imagem_url?: string; legenda?: string }> } }) {
  return (
    <Wrapper className="bg-white">
      {dados.titulo && <h2 className="text-2xl md:text-3xl font-bold text-black mb-8 text-center">{dados.titulo}</h2>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {(dados.items ?? []).map((it, i) =>
          it.imagem_url ? (
            <figure key={i} className="relative group overflow-hidden">
              <img
                src={resolveImg(it.imagem_url)}
                alt={it.legenda ?? ""}
                className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
              {it.legenda && (
                <figcaption className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2">
                  {it.legenda}
                </figcaption>
              )}
            </figure>
          ) : null
        )}
      </div>
    </Wrapper>
  );
}

// ─── Contact info card grid ─────────────────────────────────────────────────

function ContactInfoBlock({ dados }: { dados: Record<string, string | undefined> }) {
  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <div className="flex justify-between border-b border-[#e0e0e0] py-3 text-sm">
        <span className="text-[#999]">{label}</span>
        <span className="text-black">{value}</span>
      </div>
    ) : null;
  return (
    <Wrapper className="bg-white">
      <h2 className="text-2xl md:text-3xl font-bold text-black mb-8 text-center">Dados de Contato</h2>
      <div className="max-w-2xl mx-auto">
        <Row label="Telefone" value={dados.telefone} />
        <Row label="Fax" value={dados.fax} />
        <Row label="WhatsApp" value={dados.whatsapp} />
        <Row label="Atendimento" value={dados.whatsapp_horario} />
        <Row label="E-mail" value={dados.email} />
        <Row label="Endereço" value={dados.endereco} />
        <Row label="Bairro / Cidade" value={dados.bairro_cidade} />
        {dados.lgpd && (
          <p className="mt-8 text-xs text-[#999] leading-relaxed text-center">{dados.lgpd}</p>
        )}
      </div>
    </Wrapper>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function BlockRenderer({ bloco }: { bloco: SiteBloco }) {
  switch (bloco.tipo) {
    case "hero_slides":
      return <HeroBlock dados={bloco.dados as { slides: HeroSlide[] }} />;
    case "stats_grid":
      return <StatsBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; items: Array<{ valor?: string; label?: string }> }} />;
    case "cta_banner":
      return <CtaBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; descricao?: string; cta_texto?: string; cta_link?: string; imagem_fundo?: string }} />;
    case "rich_text":
      return <RichTextBlock dados={bloco.dados as { titulo?: string; paragrafo_1?: string; paragrafo_2?: string; imagem_url?: string }} />;
    case "feature_grid":
      return <FeatureGridBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; items: Array<{ icone?: string; titulo?: string; descricao?: string }> }} />;
    case "gallery":
      return <GalleryBlock dados={bloco.dados as { titulo?: string; items: Array<{ imagem_url?: string; legenda?: string }> }} />;
    case "contact_info":
      return <ContactInfoBlock dados={bloco.dados as Record<string, string | undefined>} />;
    case "linked_list":
      // Linked lists referenciam tabelas externas (servicos_site, blog_posts...).
      // Por enquanto deixamos o componente fixo da página renderizar isso —
      // o BlockRenderer só serve para conteúdo livre.
      return null;
    case "timeline":
      return <TimelineBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; items: Array<{ ano?: string; titulo?: string; descricao?: string }> }} />;
    case "news_grid":
      return <NewsGridBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; fonte?: 'auto' | 'manual'; limit?: number; items: Array<{ titulo?: string; resumo?: string; imagem_url?: string; link?: string; categoria?: string }> }} />;
    case "partners_logos":
      return <PartnersLogosBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; items: Array<{ nome?: string; label?: string; imagem_url?: string | null }> }} />;
    case "text_block":
      return <TextBlockBlock dados={bloco.dados as { titulo?: string; subtitulo?: string; paragrafo?: string; alinhamento?: 'left' | 'center' | 'right' }} />;
    default:
      return null;
  }
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; items: Array<{ ano?: string; titulo?: string; descricao?: string }> } }) {
  return (
    <Wrapper className="bg-[#f7f7f7]">
      {dados.titulo && (
        <h2 className="text-2xl md:text-4xl font-bold text-black mb-2 text-center">{dados.titulo}</h2>
      )}
      {dados.subtitulo && (
        <p className="text-[#666] text-center mb-12">{dados.subtitulo}</p>
      )}
      <div className="relative max-w-3xl mx-auto pl-8 md:pl-12">
        {/* vertical line */}
        <div className="absolute left-3 md:left-4 top-2 bottom-2 w-px bg-[#e0e0e0]" />
        {(dados.items ?? []).map((it, i) => (
          <div key={i} className="relative mb-10 last:mb-0">
            <div className="absolute -left-7 md:-left-9 top-1 w-4 h-4 rounded-full bg-[#0057DE] border-4 border-white shadow-[0_0_0_1px_#0057DE]" />
            <div className="text-sm font-bold text-[#0057DE] uppercase tracking-wide">{it.ano}</div>
            {it.titulo && <h3 className="text-lg md:text-xl font-bold text-black mt-1">{it.titulo}</h3>}
            {it.descricao && <p className="text-[#666] mt-2 leading-relaxed">{it.descricao}</p>}
          </div>
        ))}
      </div>
    </Wrapper>
  );
}

// ─── News Grid ──────────────────────────────────────────────────────────────

function NewsGridBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; fonte?: 'auto' | 'manual'; limit?: number; items: Array<{ titulo?: string; resumo?: string; imagem_url?: string; link?: string; categoria?: string }> } }) {
  // 'auto' mode: fetch from blog API. Done by the consumer page (HomePage)
  // — here we only render the manual items to avoid double fetch coupling.
  // For 'auto', the consumer should compose with NewsSection (legacy) or use
  // useBlogPosts() + pass items into a manual-style block.
  const items = dados.items ?? [];
  if (items.length === 0) return null;
  return (
    <Wrapper className="bg-white">
      {dados.titulo && (
        <h2 className="text-2xl md:text-4xl font-bold text-black mb-2 text-center">{dados.titulo}</h2>
      )}
      {dados.subtitulo && (
        <p className="text-[#666] text-center mb-12">{dados.subtitulo}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((it, i) => {
          const card = (
            <article className="group flex flex-col bg-white border border-[#e0e0e0] hover:border-[#0057DE] transition-colors h-full">
              {it.imagem_url && (
                <div className="aspect-[16/9] overflow-hidden">
                  <img
                    src={resolveImg(it.imagem_url)}
                    alt={it.titulo ?? ""}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="p-6 flex-1 flex flex-col">
                {it.categoria && (
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#0057DE] mb-2">{it.categoria}</div>
                )}
                {it.titulo && <h3 className="text-lg font-bold text-black mb-2 leading-tight">{it.titulo}</h3>}
                {it.resumo && <p className="text-sm text-[#666] leading-relaxed">{it.resumo}</p>}
                {it.link && (
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0057DE]">
                    Ler mais <ChevronRight size={14} />
                  </span>
                )}
              </div>
            </article>
          );
          return it.link ? (
            <a key={i} href={it.link} className="block">
              {card}
            </a>
          ) : (
            <div key={i}>{card}</div>
          );
        })}
      </div>
    </Wrapper>
  );
}

// ─── Partners Logos ─────────────────────────────────────────────────────────

function PartnersLogosBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; items: Array<{ nome?: string; label?: string; imagem_url?: string | null }> } }) {
  return (
    <Wrapper className="bg-[#f7f7f7]">
      {dados.titulo && (
        <h2 className="text-2xl md:text-3xl font-bold text-black mb-2 text-center">{dados.titulo}</h2>
      )}
      {dados.subtitulo && (
        <p className="text-[#666] text-center mb-10">{dados.subtitulo}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
        {(dados.items ?? []).map((it, i) => (
          <div key={i} className="flex flex-col items-center text-center min-w-[120px]">
            {it.imagem_url ? (
              <img loading="lazy" src={resolveImg(it.imagem_url)} alt={it.nome ?? ""} className="h-12 md:h-16 object-contain mb-2" loading="lazy" />
            ) : (
              <div
                className="text-3xl md:text-4xl font-bold text-[#0057DE] mb-2 leading-none"
                style={{ fontFamily: "'Knockout HTF68', 'Barlow Condensed', sans-serif" }}
              >
                {it.nome}
              </div>
            )}
            {it.label && <div className="text-xs uppercase tracking-wide text-[#666]">{it.label}</div>}
          </div>
        ))}
      </div>
    </Wrapper>
  );
}

// ─── Text Block ─────────────────────────────────────────────────────────────

function TextBlockBlock({ dados }: { dados: { titulo?: string; subtitulo?: string; paragrafo?: string; alinhamento?: 'left' | 'center' | 'right' } }) {
  const alignMap = { left: 'text-left', center: 'text-center', right: 'text-right' };
  const align = alignMap[(dados.alinhamento ?? 'left') as keyof typeof alignMap];
  return (
    <Wrapper className="bg-white">
      <div className={`max-w-4xl mx-auto ${align}`}>
        {dados.subtitulo && (
          <div className="text-sm font-semibold uppercase tracking-widest text-[#0057DE] mb-3">
            {dados.subtitulo}
          </div>
        )}
        {dados.titulo && (
          <h2 className="text-2xl md:text-4xl font-bold text-black mb-6 leading-tight">
            {dados.titulo}
          </h2>
        )}
        {dados.paragrafo && (
          <p className="text-base md:text-lg text-[#444] leading-relaxed whitespace-pre-line">
            {dados.paragrafo}
          </p>
        )}
      </div>
    </Wrapper>
  );
}

// ─── Full page renderer (busca + ordena) ────────────────────────────────────

interface DynamicBlocksProps {
  slug: string;
  /** Render extra acima dos blocos do CMS (ex: hero hardcoded). */
  before?: ReactNode;
  /** Render extra abaixo dos blocos do CMS (ex: contato fixo). */
  after?: ReactNode;
  /** Mostra placeholder enquanto carrega (default: nada). */
  loadingFallback?: ReactNode;
  /**
   * Tipos de bloco a NÃO renderizar (já têm componente fixo na página).
   * Útil pra evitar duplicar conteúdo: ex: HeroBanner já usa hero_slides
   * via useHeroSlides; aqui passamos `skip={['hero_slides']}` pra
   * <DynamicBlocks> não renderizar o mesmo bloco.
   */
  skip?: string[];
}

/**
 * Componente "drop-in" que carrega uma página inteira do CMS e renderiza
 * todos os blocos visíveis em ordem. Reflete edits do painel
 * /marketing/site no próximo carregamento.
 */
export function DynamicBlocks({ slug, before, after, loadingFallback, skip }: DynamicBlocksProps) {
  const { pagina, loading } = usePagina(slug);
  const skipSet = new Set(skip ?? []);

  // Sync document title and meta when SEO data is provided.
  const lastTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pagina?.pagina) return;
    const seoTitle = pagina.pagina.seo_title || pagina.pagina.titulo;
    if (seoTitle && document.title !== seoTitle) {
      lastTitleRef.current = document.title;
      document.title = seoTitle;
    }
    const meta = document.querySelector('meta[name="description"]');
    const seoDesc = pagina.pagina.seo_description || pagina.pagina.descricao;
    if (meta && seoDesc) {
      meta.setAttribute("content", seoDesc);
    }
  }, [pagina]);

  if (loading && !pagina) {
    return <>{loadingFallback ?? null}</>;
  }
  if (!pagina) {
    // No page found in CMS — render only the static frame (caller's
    // `before`/`after`).
    return (
      <>
        {before}
        {after}
      </>
    );
  }

  return (
    <>
      {before}
      {pagina.blocos
        .filter((b) => !skipSet.has(b.tipo))
        .map((b) => (
          <BlockRenderer key={b.id} bloco={b} />
        ))}
      {after}
    </>
  );
}
