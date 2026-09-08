import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { createPublicBridgeContentBlocks } from "../../scripts/qa/cms-public-bridge-fixture-content.mjs";
import { CmsPageRenderer } from "../../src/public/components/CmsPageRenderer";
import { CmsPageBlockSchema } from "../../src/shared/contracts/cms-content";

const fixtureSource = readFileSync("scripts/qa/cms-public-bridge-fixture.mjs", "utf8");
const cases = [
  ["page", "Ponte pública QA 8af1df81"],
  ["campaign", "Campanha ponte QA 8af1df81"],
] as const;

describe("CMS public bridge fixture titles", () => {
  it("wires page and campaign titles into their synthetic content blocks", () => {
    expect(fixtureSource).toMatch(/blocks: createPublicBridgeContentBlocks\(state\.page\.title\)/);
    expect(fixtureSource).toMatch(/blocks: createPublicBridgeContentBlocks\(state\.campaign\.title\)/);
  });

  it.each(cases)("renders the exact %s title as an H1 followed by valid rich text", (_kind, title) => {
    let sequence = 1;
    const blocks = createPublicBridgeContentBlocks(
      title,
      () => `93000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "hero", data: { title } });
    expect(blocks[1]).toMatchObject({ type: "rich_text" });
    for (const block of blocks) expect(CmsPageBlockSchema.safeParse(block).success).toBe(true);

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={{ blocks }} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(screen.getByText("Conteúdo complementar sintético e descartável para homologação.")).toBeVisible();
  });
});
