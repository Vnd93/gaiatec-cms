import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("configuração de mapas do RDO", () => {
  it("não mantém chave Google incorporada como fallback", async () => {
    const source = await readFile("src/app/rdo/lib/maps.ts", "utf8");

    expect(source).toContain("import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim()");
    expect(source).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it("injeta a variável protegida nos builds oficiais", async () => {
    const workflows = await Promise.all(
      ["promote-staging-frontend-bridge.yml", "promote-production-frontend-bridge.yml"].map((name) =>
        readFile(`.github/workflows/${name}`, "utf8"),
      ),
    );

    for (const workflow of workflows) {
      expect(workflow).toContain("VITE_GOOGLE_MAPS_KEY: ${{ vars.GOOGLE_MAPS_BROWSER_KEY }}");
    }
  });
});
