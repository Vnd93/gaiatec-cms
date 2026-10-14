import { expect, type Page } from "@playwright/test";

export function campaignTitleField(page: Page) {
  return page
    .getByRole("group", { name: "Identificação da campanha", exact: true })
    .getByRole("textbox", { name: "Título", exact: true });
}

export function campaignTemplateField(page: Page) {
  return page.getByRole("combobox", { name: "Modelo aprovado", exact: true });
}

export function campaignIndexableField(page: Page) {
  return page.getByRole("checkbox", { name: "Permitir exibição nos mecanismos de busca", exact: true });
}

export function campaignPublishedFormField(page: Page) {
  return page
    .getByRole("group", { name: "Identificação da campanha", exact: true })
    .getByRole("combobox", { name: "Formulário publicado", exact: true });
}

export async function fillSyntheticCampaignBlocks(page: Page, runTag: string) {
  const blocks = page.locator("details.admin-page-block");
  const hero = blocks.filter({
    has: page.locator("summary strong").filter({ hasText: /^\d+\.\s*Hero$/ }),
  });
  const text = blocks.filter({
    has: page.locator("summary strong").filter({ hasText: /^\d+\.\s*Texto$/ }),
  });
  for (const block of [hero, text]) {
    await expect(block).toHaveCount(1);
    if ((await block.getAttribute("open")) === null) await block.locator("summary").click();
  }
  await hero.getByLabel("Título", { exact: true }).fill(`${runTag} destaque sintético`);
  await text
    .getByLabel("Texto", { exact: true })
    .fill(`${runTag} conteúdo sintético temporário, sem dados comerciais reais.`);
}
