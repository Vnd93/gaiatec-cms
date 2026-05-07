import { Outlet, useLocation } from "react-router";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CookieBanner } from "./CookieBanner";
import { BackToTop } from "./BackToTop";
import { ComparadorProvider } from "./produtos/ComparadorContext";
import { ComparadorFloating } from "./produtos/ComparadorFloating";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function Layout() {
  return (
    <ComparadorProvider>
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        <ScrollToTop />
        <Header />
        <main>
          <Outlet />
        </main>
        <Footer />
        <CookieBanner />
        <BackToTop />
        <ComparadorFloating />
      </div>
    </ComparadorProvider>
  );
}
