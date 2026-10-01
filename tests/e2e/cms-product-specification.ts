import type { Locator } from "@playwright/test";

export async function fillSyntheticProductSpecification(attribute: Locator) {
  const valueType = await attribute.getByLabel("Tipo de valor").inputValue();
  if (valueType === "enum") {
    const approved = attribute.getByLabel("Valores aprovados");
    const option = await approved.locator("option").first().getAttribute("value");
    if (!option) throw new Error("Produto: atributo enum sem opção aprovada.");
    await approved.selectOption([option]);
  } else if (valueType === "range") {
    await attribute.getByLabel("Limite mínimo").fill("1");
    await attribute.getByLabel("Limite máximo").fill("2");
  } else if (valueType === "boolean") {
    await attribute.getByRole("combobox", { name: "Valor", exact: true }).selectOption("true");
  } else {
    await attribute.getByLabel("Valor", { exact: true }).fill(valueType === "number" ? "1" : "Valor QA");
  }
}
