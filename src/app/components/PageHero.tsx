interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeroProps {
  overline?: string;
  title: string;
  description?: string;
  image: string;
  breadcrumbs?: Breadcrumb[];
  ctaLabel?: string;
  ctaHref?: string;
}

export function PageHero({ overline, title, image }: PageHeroProps) {
  return (
    <>
    <section
      className="relative w-full overflow-hidden flex"
      style={{ height: 772, justifyContent: "flex-end", flexDirection: "column" }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${image})`,
          transform: "scale(1.05)",
          transition: "transform 8s ease-out",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
        }}
      />

      <div
        className="relative"
        style={{ maxWidth: 1440, margin: "0 auto", width: "100%", padding: "0 30px 100px 30px" }}
      >
        {overline && (
          <span
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#0057DE",
              marginBottom: 16,
            }}
          >
            {overline}
          </span>
        )}

        <h1
          style={{
            fontFamily: "'Knockout HTF68', sans-serif",
            fontSize: "clamp(41px, 6vw, 85px)",
            fontWeight: 500,
            lineHeight: 0.95,
            textTransform: "uppercase",
            color: "#fff",
            maxWidth: 800,
            margin: 0,
          }}
        >
          {title}
        </h1>
      </div>
    </section>

    {/* ── Vertical line connector ── */}
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative", height: 60, backgroundColor: "transparent", marginTop: -60, zIndex: 20 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
          <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#fff" }} />
        </div>
      </div>
      <div style={{ position: "relative", height: 60, backgroundColor: "#fff" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
          <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#000" }} />
        </div>
      </div>
    </div>
    </>
  );
}
