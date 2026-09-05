import { createContext, useContext, useEffect, useState } from "react";
import type { CmsNavigationContent, CmsSiteSettingsContent } from "@/shared/contracts/cms-content";
import { getPublishedSiteShell, type PublishedSiteShell } from "./catalog-api";

type SiteShellState = {
  navigation: CmsNavigationContent | null;
  settings: CmsSiteSettingsContent | null;
  placements: PublishedSiteShell["placements"];
  loading: boolean;
};

const empty: SiteShellState = { navigation: null, settings: null, placements: null, loading: true };
const SiteShellContext = createContext<SiteShellState>(empty);

export function SiteShellProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SiteShellState>(empty);
  useEffect(() => {
    let active = true;
    void getPublishedSiteShell()
      .then((shell) => {
        if (active) setState({ ...shell, loading: false });
      })
      .catch(() => {
        if (active) setState({ ...empty, loading: false });
      });
    return () => {
      active = false;
    };
  }, []);
  return <SiteShellContext.Provider value={state}>{children}</SiteShellContext.Provider>;
}

export function usePublishedSiteShell() {
  return useContext(SiteShellContext);
}
