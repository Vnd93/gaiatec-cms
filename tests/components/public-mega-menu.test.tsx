import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MegaMenuPanel } from "../../src/app/components/header/MegaMenuPanel";

describe("public mega menu", () => {
  it("uses only published CMS links and does not expose inert hardcoded filters", () => {
    const { rerender } = render(
      <MegaMenuPanel
        item={{
          label: "Produtos",
          href: "/produtos",
          children: [
            {
              label: "Medição",
              href: "/produtos/medicao",
              children: [{ label: "Vazão", href: "/produtos/vazao" }],
            },
            {
              label: "Análise",
              href: "/produtos/analise",
              children: [{ label: "Gases", href: "/produtos/gases" }],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("tablist", { name: /filtro por setor/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Saneamento / Líquido")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Medição" })).toHaveAttribute("href", "/produtos/medicao");
    expect(screen.getByRole("menuitem", { name: "Análise" })).toHaveAttribute("href", "/produtos/analise");
    expect(screen.getByRole("link", { name: "Vazão" })).toHaveAttribute("href", "/produtos/vazao");

    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Análise" }));

    expect(screen.queryByRole("link", { name: "Vazão" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gases" })).toHaveAttribute("href", "/produtos/gases");

    rerender(
      <MegaMenuPanel
        item={{
          label: "Serviços",
          href: "/servicos",
          children: [{ label: "Calibração", href: "/servicos/calibracao" }],
        }}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Calibração" })).toHaveAttribute(
      "href",
      "/servicos/calibracao",
    );
  });
});
