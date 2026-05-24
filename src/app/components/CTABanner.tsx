import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { AnimateOnScroll } from "./useScrollAnimation";

interface CTABannerProps {
  text: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function CTABanner({
  text,
  primaryLabel = "Fale com um Especialista",
  primaryHref = "/contato",
  secondaryLabel = "Solicitar Proposta",
  secondaryHref = "/contato",
}: CTABannerProps) {
  return (
    <section
      style={{
        background: "linear-gradient(135deg, #0057DE 0%, #0046b3 100%)",
        padding: "60px 0",
      }}
    >
      <div style={{ maxWidth: 1440, marginLeft: "auto", marginRight: "auto", paddingLeft: 30, paddingRight: 30 }}>
        <AnimateOnScroll>
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-12">
            <p
              className="text-white text-[18px] md:text-[22px] leading-[1.5] flex-1 max-w-[600px]"
              style={{ fontWeight: 500 }}
            >
              {text}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to={primaryHref}
                className="inline-flex items-center gap-2 bg-white text-[#0057DE] px-7 py-3 text-[13px] tracking-wider hover:bg-[#0046b3] hover:text-white transition-all duration-300"
                style={{ fontWeight: 700 }}
              >
                {primaryLabel} <ChevronRight size={14} />
              </Link>
              <Link
                to={secondaryHref}
                className="inline-flex items-center gap-2 bg-transparent border-2 border-white text-white px-7 py-3 text-[13px] tracking-wider hover:bg-white hover:text-[#0057DE] transition-all duration-300"
                style={{ fontWeight: 700 }}
              >
                {secondaryLabel} <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  );
}
