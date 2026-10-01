import type { Page } from "@playwright/test";

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
