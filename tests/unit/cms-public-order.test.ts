import { describe, expect, it } from "vitest";
import { comparePublicCollectionEntries } from "../../supabase/functions/_shared/cms-public-order";

const entry = (title: string, displayOrder?: number, score = 0, rawTitle = title) => ({
  score,
  payload: { title, ...(displayOrder === undefined ? {} : { displayOrder }) },
  row: {
    slug: title.toLocaleLowerCase(),
    payload: { title: rawTitle },
  },
});

describe("public discovery ordering", () => {
  it("uses governed order and a deterministic title fallback in unfiltered collections", () => {
    const rows = [entry("Zulu", 20), entry("Beta"), entry("Alfa", 20), entry("Primeiro", 0)];
    rows.sort((left, right) => comparePublicCollectionEntries(left, right, false));
    expect(rows.map((item) => item.payload.title)).toEqual(["Primeiro", "Alfa", "Zulu", "Beta"]);
  });

  it("keeps search relevance ahead of editorial order", () => {
    const rows = [entry("Editorial", 0, 5), entry("Mais relevante", 999, 100)];
    rows.sort((left, right) => comparePublicCollectionEntries(left, right, true));
    expect(rows[0].payload.title).toBe("Mais relevante");
  });

  it("never lets the unsanitized source title influence public ordering", () => {
    const rows = [entry("Zulu público", 20, 0, "Alfa interno"), entry("Alfa público", 20, 0, "Zulu interno")];
    rows.sort((left, right) => comparePublicCollectionEntries(left, right, false));
    expect(rows.map((item) => item.payload.title)).toEqual(["Alfa público", "Zulu público"]);
  });
});
