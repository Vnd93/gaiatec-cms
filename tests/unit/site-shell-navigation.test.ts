import { describe, expect, it } from "vitest";
import { publishedNavigationItems } from "@/public/site-shell-navigation";

describe("navegação governada do shell público", () => {
  it("não inventa conteúdo quando nenhuma navegação foi publicada", () => {
    expect(publishedNavigationItems(undefined)).toEqual([]);
    expect(publishedNavigationItems(null)).toEqual([]);
    expect(publishedNavigationItems([])).toEqual([]);
  });

  it("preserva exatamente a navegação recebida da projeção publicada", () => {
    const published = [
      {
        id: "00000000-0000-4000-8000-000000000301",
        parentId: null,
        location: "header" as const,
        label: "Catálogo publicado",
        href: "/catalogo",
        order: 10,
        newTab: false,
        visible: true,
      },
    ];

    expect(publishedNavigationItems(published)).toBe(published);
  });
});
