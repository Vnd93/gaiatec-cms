import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, GitCompare, Check } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useComparador } from "./produtos/ComparadorContext";

/* ────────────────────────────────────────────────────────
   FONTS
   ──────────────────────────────────────────────────────── */
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BODY_FONT = "Arial, sans-serif";

/* ────────────────────────────────────────────────────────
   PRODUCT DATA (expanded for carousel)
   ──────────────────────────────────────────────────────── */
const products = [
  { id: 1, name: "Medidor de Gás Ultrassônico", badge: "Medição", spec: "Alta precisão · Não intrusivo · Gás natural e biogás", image: "/images/pages/2.3.png", hoverImage: "/images/pages/2.10.png" },
  { id: 2, name: "Analisador de Biogás Portátil", badge: "Biogás", spec: "CH4, CO2, O2, H2S · Portátil · Tempo real", image: "/images/pages/2.4.png", hoverImage: "/images/pages/2.11.png" },
  { id: 3, name: "Controlador Lógico Programável (CLP)", badge: "Automação", spec: "Multi-protocolo · IoT ready · Modular", image: "/images/pages/2.5.png", hoverImage: "/images/pages/2.12.png" },
  { id: 4, name: "Retificador de Proteção Catódica", badge: "Proteção", spec: "Corrente impressa · Monitoramento · IP65", image: "/images/pages/2.6.png", hoverImage: "/images/pages/2.13.png" },
  { id: 5, name: "Sensores Agrícolas Inteligentes", badge: "Agronegócio", spec: "Solo, umidade, clima · IoT · Precisão", image: "/images/pages/2.7.png", hoverImage: "/images/pages/2.14.png" },
  { id: 6, name: "Unidade de Tratamento de Ar", badge: "HVAC", spec: "Temperatura · Umidade · Ambientes críticos", image: "/images/pages/2.8.png", hoverImage: "/images/pages/2.15.png" },
  { id: 7, name: "Medidor de Vazão Eletromagnético", badge: "Fluidos", spec: "Líquidos condutivos · Alta acurácia", image: "/images/pages/2.9.png", hoverImage: "/images/pages/2.16.png" },
  { id: 8, name: "Sistema de Telemetria Remota", badge: "IoT / Telemetria", spec: "Rádio ou celular · 24/7 · Multi-ponto", image: "/images/pages/2.3.png", hoverImage: "/images/pages/2.10.png" },
  { id: 9, name: "Transmissor de Pressão", badge: "Sensores", spec: "4-20 mA · HART · Diversas faixas", image: "/images/pages/2.4.png", hoverImage: "/images/pages/2.11.png" },
  { id: 10, name: "Válvula de Controle Automática", badge: "Válvulas", spec: "Elétricos/Pneumáticos · Fluxo preciso", image: "/images/pages/2.5.png", hoverImage: "/images/pages/2.12.png" },
];

/* ────────────────────────────────────────────────────────
   COMPACT PRODUCT CARD
   ──────────────────────────────────────────────────────── */
function ProductCard({ product }: { product: (typeof products)[0] }) {
  const [hovered, setHovered] = useState(false);
  const { add, has, isFull } = useComparador();
  const isComparing = has(product.id);
  const disabled = !isComparing && isFull;

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    add({
      id: product.id,
      name: product.name,
      category: product.badge,
      image: product.image,
      badge: product.badge,
      spec: product.spec,
    });
  };

  return (
    <a
      href="/produtos"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        boxShadow: "rgba(0,0,0,0.08) 0px 8px 24px -4px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 16,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.3s, transform 0.3s",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        position: "relative",
      }}
    >
      {/* Botão "+ Comparar" no canto superior direito */}
      <button
        type="button"
        onClick={handleCompareClick}
        disabled={disabled}
        title={
          isComparing
            ? "Remover do comparador"
            : disabled
              ? "Limite de 3 produtos atingido"
              : "Adicionar ao comparador"
        }
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 5,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 999,
          border: isComparing ? "1px solid #0057DE" : "1px solid #e2e8f0",
          backgroundColor: isComparing ? "#0057DE" : "rgba(255,255,255,0.95)",
          color: isComparing ? "#ffffff" : disabled ? "#94a3b8" : "#475569",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          backdropFilter: "blur(4px)",
          transition: "all 0.2s ease",
        }}
        aria-label={isComparing ? `Remover ${product.name} do comparador` : `Adicionar ${product.name} ao comparador`}
      >
        {isComparing ? (
          <>
            <Check size={12} strokeWidth={2.5} />
            Comparando
          </>
        ) : (
          <>
            <GitCompare size={12} strokeWidth={2} />
            Comparar
          </>
        )}
      </button>

      {/* Image container */}
      <div
        style={{
          marginBottom: 16,
          marginTop: 12,
          paddingTop: "70%",
          position: "relative",
        }}
      >
        <ImageWithFallback
          src={product.image}
          alt={product.name}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transition: "opacity 0.3s, transform 0.3s",
            opacity: hovered ? 0 : 1,
            transform: hovered ? "scale(1.05)" : "scale(1)",
          }}
        />
        <ImageWithFallback
          src={product.hoverImage}
          alt={`${product.name} alt`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transition: "opacity 0.3s, transform 0.3s",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "scale(1.05)" : "scale(1)",
          }}
        />
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: KNOCKOUT,
          fontSize: 28,
          fontWeight: 500,
          lineHeight: "26px",
          textTransform: "uppercase",
          color: "#000",
          marginBottom: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {product.name}
      </h3>

      {/* Specs row */}
      <div
        style={{
          marginBottom: 14,
          flexGrow: 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            backgroundColor: "#0057DE",
            color: "#000",
            fontFamily: BODY_FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          {product.badge}
        </span>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 12,
            lineHeight: "18px",
            color: "#666",
            marginTop: 4,
          }}
        >
          {product.spec}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <span
          onClick={(e) => e.preventDefault()}
          className="sec3-btn-price"
          style={{
            backgroundColor: "rgb(0, 87, 222)",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "12px",
            padding: "10px 8px",
            textAlign: "center",
            flex: 1.2,
            cursor: "pointer",
            transition: "background-color 0.3s",
            color: "#000",
          }}
        >
          Solicitar Orçamento
        </span>
        <span
          className="sec3-btn-view"
          style={{
            backgroundColor: "#000",
            borderRadius: 8,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "12px",
            padding: "10px 8px",
            textAlign: "center",
            flex: 1,
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
        >
          Ver
        </span>
      </div>
    </a>
  );
}

/* ────────────────────────────────────────────────────────
   CAROUSEL CONFIG
   ──────────────────────────────────────────────────────── */
const AUTO_SCROLL_INTERVAL = 4000; // ms
const CARD_GAP = 20; // px

/* ────────────────────────────────────────────────────────
   PRODUCTS CAROUSEL SECTION
   ──────────────────────────────────────────────────────── */
export function ProductsGrid() {
  const trackRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);

  /* ── Compute cards per view on resize ── */
  const updateCardsPerView = useCallback(() => {
    const w = window.innerWidth;
    if (w < 640) setCardsPerView(1);
    else if (w < 1024) setCardsPerView(2);
    else setCardsPerView(3);
  }, []);

  useEffect(() => {
    updateCardsPerView();
    window.addEventListener("resize", updateCardsPerView);
    return () => window.removeEventListener("resize", updateCardsPerView);
  }, [updateCardsPerView]);

  const maxIndex = Math.max(0, products.length - cardsPerView);

  /* ── Navigation ── */
  const goTo = useCallback(
    (idx: number) => {
      setCurrentIndex(Math.max(0, Math.min(idx, maxIndex)));
    },
    [maxIndex]
  );

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
  }, [maxIndex]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev <= 0 ? maxIndex : prev - 1));
  }, [maxIndex]);

  /* ── Auto-scroll ── */
  const startAutoScroll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(next, AUTO_SCROLL_INTERVAL);
  }, [next]);

  const stopAutoScroll = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoScroll();
    return stopAutoScroll;
  }, [startAutoScroll, stopAutoScroll]);

  /* ── Translate calculation ── */
  const cardWidthPercent = 100 / cardsPerView;
  const translateX = -(currentIndex * cardWidthPercent);

  return (
    <>
      <style>{`
        .sec3-btn-price:hover {
          background-color: rgb(0, 70, 179) !important;
        }
        .sec3-btn-view:hover {
          background-color: rgb(51, 51, 51) !important;
        }
        .sec3-viewall-link {
          position: relative;
          text-decoration: none;
          cursor: pointer;
          color: #000;
          transition: color 0.25s;
        }
        .sec3-viewall-link::after {
          content: "";
          position: absolute;
          bottom: -2px;
          left: 0;
          height: 1px;
          width: 0%;
          background: #000;
          transition: width 0.25s linear;
        }
        .sec3-viewall-link:hover::after {
          width: 100%;
        }
        .sec3-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1.5px solid #000;
          background: transparent;
          cursor: pointer;
          transition: background 0.25s, color 0.25s;
          color: #000;
        }
        .sec3-nav-btn:hover {
          background: #000;
          color: #fff;
        }
        .sec3-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          transition: background 0.3s, transform 0.3s;
          padding: 0;
        }
      `}</style>

      <div
        id="products"
        style={{
          backgroundColor: "rgb(242, 242, 242)",
          paddingBottom: 80,
          paddingTop: 80,
          fontFamily: BODY_FONT,
          fontSize: 14,
        }}
      >
        <div
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 1440,
            paddingLeft: 30,
            paddingRight: 30,
            width: "100%",
          }}
        >
          {/* ─── HEADER ─── */}
          <AnimateOnScroll>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 28,
              }}
            >
              <h2
                style={{
                  fontFamily: "'Knockout HTF68', sans-serif",
                  fontSize: 44,
                  fontWeight: 500,
                  lineHeight: "42px",
                  textTransform: "uppercase",
                  color: "#000",
                }}
              >
                Produtos em Destaque
              </h2>

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <a
                  href="/produtos"
                  className="sec3-viewall-link"
                  style={{
                    fontSize: 14,
                    lineHeight: "20px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Ver Todos os Produtos →
                </a>

                {/* Nav arrows */}
                <button className="sec3-nav-btn" onClick={() => { prev(); stopAutoScroll(); startAutoScroll(); }} aria-label="Previous">
                  <ChevronLeft size={16} />
                </button>
                <button className="sec3-nav-btn" onClick={() => { next(); stopAutoScroll(); startAutoScroll(); }} aria-label="Next">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </AnimateOnScroll>

          {/* ─── CAROUSEL ─── */}
          <div
            style={{ overflow: "hidden", padding: "8px 4px" }}
            onMouseEnter={stopAutoScroll}
            onMouseLeave={startAutoScroll}
          >
            <div
              ref={trackRef}
              style={{
                display: "flex",
                gap: CARD_GAP,
                transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateX(calc(${translateX}% - ${currentIndex * CARD_GAP}px))`,
              }}
            >
              {products.map((product) => (
                <div
                  key={product.id}
                  style={{
                    flex: `0 0 calc(${cardWidthPercent}% - ${((cardsPerView - 1) * CARD_GAP) / cardsPerView}px - 8px)`,
                    minWidth: 0,
                  }}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>

          {/* ─── DOTS ─── */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              marginTop: 20,
            }}
          >
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                className="sec3-dot"
                onClick={() => { goTo(i); stopAutoScroll(); startAutoScroll(); }}
                style={{
                  background: i === currentIndex ? "#000" : "#ccc",
                  transform: i === currentIndex ? "scale(1.3)" : "scale(1)",
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}