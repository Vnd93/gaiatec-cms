import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import {
  campaignIndexableField,
  campaignPublishedFormField,
  campaignTemplateField,
  campaignTitleField,
} from "./cms-campaign-fields";

let markup: string;

test.beforeAll(async () => {
  const browserSource = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");
  for (const helper of [
    "campaignTemplateField",
    "campaignIndexableField",
    "campaignPublishedFormField",
    "campaignTitleField",
  ]) {
    expect(browserSource).toContain(`${helper}(page)`);
  }
  // Resolve the router and the page through the same Vite SSR module graph.
  // Effects do not run: no authentication, backend traffic or release approval.
  const entryId = "\0qa-campaign-locator-entry";
  const vite = await createServer({
    cacheDir: resolve("node_modules/.cache/qa-campaign-locators", String(test.info().workerIndex)),
    envFile: false,
    envPrefix: "QA_LOCATOR_TEST_",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: "qa-campaign-locator-entry",
        resolveId: (id) => (id === entryId ? id : undefined),
        load: (id) =>
          id === entryId
            ? `
              import { createElement } from "react";
              import { renderToStaticMarkup } from "react-dom/server";
              import { createMemoryRouter, RouterProvider } from "react-router";
              import Editor from "/src/admin/pages/AdminCampaignEditorPage.tsx";
              import { AdminAuthProvider } from "/src/admin/auth/AdminAuthContext.tsx";
              import { PageBlockEditor } from "/src/admin/components/PageBlockEditor.tsx";
              import { createPageBlock } from "/src/admin/page-builder-model.ts";
              export function render() {
                const router = createMemoryRouter([{
                  path: "/admin/marketing/campanhas/:id", element: createElement(Editor)
                }], { initialEntries: ["/admin/marketing/campanhas/novo"] });
                try {
                  const campaign = renderToStaticMarkup(createElement(AdminAuthProvider, null,
                    createElement(RouterProvider, { router })));
                  const block = renderToStaticMarkup(createElement(PageBlockEditor, {
                    block: createPageBlock("form"), index: 0, total: 1,
                    media: [], relations: [], forms: [], onChange() {}, onRemove() {},
                    onDuplicate() {}, onMove() {}
                  }));
                  return campaign + block;
                } finally { router.dispose(); }
              }
            `
            : undefined,
      },
    ],
  });
  try {
    const entry = (await vite.ssrLoadModule(entryId)) as { render(): string };
    markup = entry.render();
  } finally {
    await vite.close();
  }
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => route.abort());
  await page.setContent(markup);
});

test("campaign template selector reaches the current approved-model field", async ({ page }) => {
  expect(await campaignTemplateField(page).count()).toBe(1);
  await campaignTemplateField(page).selectOption("landing_conversion");
  await expect(campaignTemplateField(page)).toHaveValue("landing_conversion");
});

test("campaign title selector excludes identically named block fields", async ({ page }) => {
  expect(await page.getByLabel("Título", { exact: true }).count()).toBeGreaterThan(1);
  expect(await campaignTitleField(page).count()).toBe(1);
  await campaignTitleField(page).fill("Título QA");
  await expect(campaignTitleField(page)).toHaveValue("Título QA");
});

test("campaign noindex selector reaches the current search-visibility control", async ({ page }) => {
  expect(await campaignIndexableField(page).count()).toBe(1);
  await campaignIndexableField(page).setChecked(false);
  await expect(campaignIndexableField(page)).not.toBeChecked();
});

test("campaign form selector excludes identically named block selectors", async ({ page }) => {
  expect(await page.getByRole("combobox", { name: "Formulário publicado", exact: true }).count()).toBe(2);
  expect(await campaignPublishedFormField(page).count()).toBe(1);
  await expect(campaignPublishedFormField(page)).toHaveValue("");
});

test("remaining campaign creation labels each identify one real field", async ({ page }) => {
  const source = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8")
    .split("async function fillSyntheticCampaignForCreate(")[1]
    .split("async function createMandatoryEditorialSurfacesViaUi(")[0];
  const labels = Array.from(
    source.matchAll(/getByLabel\("([^"]+)"(?:,\s*\{\s*exact:\s*(true|false)\s*\})?\)/g),
    ([, label, exact]) => ({ label, exact: exact === "true" }),
  );
  expect(labels.length).toBeGreaterThan(20);
  for (const { label, exact } of labels) {
    // This field appears only after the already-covered customize-address action.
    if (label === "Nome personalizado do endereço") continue;
    await test.step(label, async () => {
      expect.soft(await page.getByLabel(label, { exact }).count(), label).toBe(1);
    });
  }
});
