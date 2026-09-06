import { Outlet, useLocation } from "react-router";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CookieBanner } from "./CookieBanner";
import { BackToTop } from "./BackToTop";
import { ComparadorProvider } from "./produtos/ComparadorContext";
import { ComparadorFloating } from "./produtos/ComparadorFloating";
import { SiteShellProvider } from "../../public/site-shell-context";
import { ContextualPlacements, GlobalAnnouncement } from "../../public/components/SitePlacements";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Skip-to-content link (a11y) — TASK 28.
 *
 * Hidden por padrão, vira visível quando recebe focus via Tab.
 * Permite usuários de teclado/leitor de tela pular menu repetitivo.
 */
function SkipToContent() {
  return (
    <a
      href="#main-content"
      onClick={(event) => {
        const main = document.getElementById("main-content");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({ block: "start" });
        window.history.replaceState(null, "", "#main-content");
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-[#0057DE] focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold focus:shadow-lg focus:outline-2 focus:outline-white"
    >
      Pular para o conteúdo principal
    </a>
  );
}

export function Layout() {
  return (
    <ComparadorProvider>
      <SiteShellProvider>
        <div className="public-site min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <SkipToContent />
          <ScrollToTop />
          <Header />
          <GlobalAnnouncement />
          <main id="main-content" tabIndex={-1}>
            <ContextualPlacements position="before" />
            <Outlet />
            <ContextualPlacements position="after" />
          </main>
          <Footer />
          <CookieBanner />
          <BackToTop />
          <ComparadorFloating />
        </div>
      </SiteShellProvider>
    </ComparadorProvider>
  );
}
