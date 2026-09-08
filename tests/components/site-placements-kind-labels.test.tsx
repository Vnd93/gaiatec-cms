import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContextualPlacements } from "../../src/public/components/SitePlacements";

const mocks = vi.hoisted(() => ({
  placements: null as null | {
    placements: Array<{
      slot: string;
      label?: string;
      target: { kind: string; title: string; path: string; summary?: string };
    }>;
  },
  getCampaignPlacements: vi.fn(),
}));

vi.mock("../../src/public/site-shell-context", () => ({
  usePublishedSiteShell: () => ({ placements: mocks.placements }),
}));

vi.mock("../../src/public/catalog-api", () => ({
  getCampaignPlacements: mocks.getCampaignPlacements,
}));

describe("public placement kind labels", () => {
  beforeEach(() => {
    mocks.getCampaignPlacements.mockReset().mockResolvedValue({ items: [] });
    mocks.placements = {
      placements: [
        {
          slot: "home_hero",
          target: { kind: "solution", title: "Solução em destaque", path: "/solucoes/destaque" },
        },
        {
          slot: "home_hero",
          target: { kind: "future_internal_kind", title: "Conteúdo futuro", path: "/conteudo/futuro" },
        },
      ],
    };
  });

  it("maps known kinds and uses a generic fallback without exposing the enum", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ContextualPlacements position="before" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Solução", { exact: true })).toBeVisible();
    expect(screen.getByText("Conteúdo", { exact: true })).toBeVisible();
    expect(screen.queryByText("future_internal_kind")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getCampaignPlacements).toHaveBeenCalledWith("/"));
  });
});
