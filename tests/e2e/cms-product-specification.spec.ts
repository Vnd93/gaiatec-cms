import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import type { CmsProductContent } from "../../src/shared/contracts/cms-content";
import type { Ev2PimAttributeDefinition } from "../../src/shared/contracts/ev2-pim";
import { fillSyntheticProductSpecification } from "./cms-product-specification";

const dataTypes = ["text", "decimal", "enum", "range", "boolean"] as const;
const markup = new Map<(typeof dataTypes)[number], string>();

test.beforeAll(async () => {
  expect(readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8")).toContain(
    "await fillSyntheticProductSpecification(attribute);",
  );
  // Render the real editor, without credentials, HTTP listeners or a backend.
  // This verifies browser locators, not authenticated staging homologation.
  const vite = await createServer({
    cacheDir: resolve("node_modules/.cache/qa-product-locators", String(test.info().workerIndex)),
    envFile: false,
    envPrefix: "QA_LOCATOR_TEST_",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { ProductSpecificationsEditor } = (await vite.ssrLoadModule(
      "/src/admin/components/ProductSemanticEditors.tsx",
    )) as typeof import("../../src/admin/components/ProductSemanticEditors");
    for (const dataType of dataTypes) {
      const definition: Ev2PimAttributeDefinition = {
        id: "10000000-0000-4000-8000-000000000101",
        attributeKey: "atributo-qa",
        label: "Atributo QA",
        description: "Atributo sintético para regressão de seletores",
        dataType,
        canonicalUnitCode: null,
        enumOptions: dataType === "enum" ? ["Opção QA", "Outra opção"] : [],
        filterable: true,
        comparable: true,
        searchable: true,
        required: true,
        inherited: false,
        position: 1,
      };
      const specification: CmsProductContent["specifications"][number] = {
        id: "10000000-0000-4000-8000-000000000102",
        definitionId: definition.id,
        key: definition.attributeKey,
        label: definition.label,
        type: dataType === "decimal" ? "number" : dataType,
        value:
          dataType === "boolean"
            ? false
            : dataType === "decimal"
              ? 0
              : dataType === "enum"
                ? []
                : dataType === "range"
                  ? { min: 0, max: 0 }
                  : "",
        required: true,
        filterable: true,
        comparable: true,
        searchable: true,
        scope: "product",
        sourceType: "manual",
        confidence: 1,
        homologated: false,
      };
      markup.set(
        dataType,
        renderToStaticMarkup(
          createElement(ProductSpecificationsEditor, {
            value: JSON.stringify([specification]),
            definitions: [definition],
            onChange() {},
          }),
        ),
      );
    }
  } finally {
    await vite.close();
  }
});

for (const dataType of dataTypes) {
  test(`fills the real ${dataType} editor with the staging browser helper`, async ({ page }) => {
    await page.route("**/*", (route) => route.abort());
    page.setDefaultTimeout(1_000);
    await page.setContent(markup.get(dataType)!);
    const attribute = page.locator("fieldset.admin-semantic-card").filter({ hasText: "Atributo 1" });
    await expect(attribute).toHaveCount(1);
    if (dataType === "boolean") {
      // Playwright's label-text matching includes nested option text; RTL does not.
      await expect(attribute.getByLabel("Valor", { exact: true })).toHaveCount(0);
      await expect(attribute.getByRole("combobox", { name: "Valor", exact: true })).toHaveCount(1);
    }

    await fillSyntheticProductSpecification(attribute);

    if (dataType === "boolean") {
      await expect(attribute.getByRole("combobox", { name: "Valor", exact: true })).toHaveValue("true");
    } else if (dataType === "enum") {
      await expect(attribute.getByLabel("Valores aprovados")).toHaveValues(["Opção QA"]);
    } else if (dataType === "range") {
      await expect(attribute.getByLabel("Limite mínimo")).toHaveValue("1");
      await expect(attribute.getByLabel("Limite máximo")).toHaveValue("2");
    } else {
      await expect(attribute.getByLabel("Valor", { exact: true })).toHaveValue(
        dataType === "decimal" ? "1" : "Valor QA",
      );
    }
    await expect(attribute.getByLabel("Tipo de valor")).toBeDisabled();
    await expect(attribute.getByLabel("Tipo de valor")).toHaveValue(
      dataType === "decimal" ? "number" : dataType,
    );
    await expect(attribute.getByLabel("Origem do valor")).toHaveValue("manual");
    await expect(attribute.getByLabel("Valor técnico homologado")).not.toBeChecked();
  });
}
