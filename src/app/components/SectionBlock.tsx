import { type ReactNode } from "react";
import { AnimateOnScroll } from "./useScrollAnimation";

interface SectionBlockProps {
  children: ReactNode;
  bg?: "white" | "black" | "gray" | "yellow";
  id?: string;
  className?: string;
}

const bgMap = {
  white: "#FFFFFF",
  black: "#000000",
  gray: "#f7f7f7",
  yellow: "#0057DE",
};

export function SectionBlock({ children, bg = "white", id, className = "" }: SectionBlockProps) {
  const isLight = bg === "white" || bg === "gray" || bg === "yellow";
  return (
    <section
      id={id}
      className={className}
      style={{
        backgroundColor: bgMap[bg],
        color: isLight ? "#000" : "#fff",
        paddingTop: 80,
        paddingBottom: 80,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1440, marginLeft: "auto", marginRight: "auto", paddingLeft: 30, paddingRight: 30, width: "100%" }}>
        {children}
      </div>
    </section>
  );
}

interface SectionTitleProps {
  overline?: string;
  title: string;
  description?: string;
  light?: boolean;
}

export function SectionTitle({ overline, title, description, light }: SectionTitleProps) {
  return (
    <AnimateOnScroll>
      <div className="mb-12 max-w-[700px]">
        {overline && (
          <span
            className="text-[#0057DE] text-[11px] tracking-[0.2em] uppercase block mb-3"
            style={{ fontWeight: 500 }}
          >
            {overline}
          </span>
        )}
        <h2
          className="text-[28px] md:text-[40px] leading-[1.1] mb-4"
          style={{
            fontFamily: "'Knockout HTF68', sans-serif",
            fontWeight: 400,
            color: light ? "#fff" : "#000",
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            className="text-[16px] leading-[1.7]"
            style={{ color: light ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)" }}
          >
            {description}
          </p>
        )}
      </div>
    </AnimateOnScroll>
  );
}
