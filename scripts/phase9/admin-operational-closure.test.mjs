import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("admin navigation is grouped, permission-aware and uses friendly breadcrumbs", async () => {
  const [navigation, shell] = await Promise.all([
    read("src/admin/admin-navigation.ts"),
    read("src/admin/components/AdminShell.tsx"),
  ]);
  for (const group of ["Trabalho", "Catálogo", "Conteúdo", "Marketing", "Site", "Administração"])
    assert.match(navigation, new RegExp(`label: "${group}"`));
  assert.match(navigation, /canAccessNavigationItem/);
  assert.match(navigation, /resolveAdminBreadcrumbs/);
  assert.doesNotMatch(shell, /split\("\/"\).*decodeURIComponent/s);
  assert.match(shell, /aria-current/);
  assert.match(shell, /aria-expanded/);
});

test("every asynchronous CMS preview preserves the editor and has a popup fallback", async () => {
  const pagesDirectory = new URL("../../src/admin/pages/", import.meta.url);
  const pageNames = (await readdir(pagesDirectory)).filter((name) => name.endsWith(".tsx"));
  const pages = await Promise.all(
    pageNames.map(async (name) => [name, await read(`src/admin/pages/${name}`)]),
  );
  const combined = pages.map(([, source]) => source).join("\n");
  assert.doesNotMatch(combined, /window\.location\.(?:assign|reload)\s*\(/);
  assert.doesNotMatch(combined, /window\.open\s*\(/);

  const previewEditors = pages.filter(([, source]) => source.includes("issuePreview"));
  assert.equal(previewEditors.length, 6);
  for (const [name, source] of previewEditors) {
    assert.match(source, /openExternalAfterAsync/, `${name} must reserve a new tab synchronously`);
    assert.match(source, /previewFallback/, `${name} must expose a fallback link`);
    assert.match(source, /rel="noopener noreferrer"/, `${name} fallback must isolate the opener`);
  }

  const utility = await read("src/admin/open-external-preview.ts");
  assert.match(utility, /window\.open\("about:blank", "_blank"\)/);
  assert.match(utility, /target\.opener = null/);
  assert.match(utility, /target\.location\.replace\(url\)/);
});

test("governed editors protect unsaved work and expose operational context", async () => {
  const editors = [
    "AdminPageBuilderPage.tsx",
    "AdminProductEditorPage.tsx",
    "AdminCampaignEditorPage.tsx",
    "AdminEditorPage.tsx",
    "AdminDiscoveryPage.tsx",
    "AdminSiteConfigurationPage.tsx",
  ];
  for (const name of editors) {
    const source = await read(`src/admin/pages/${name}`);
    assert.match(source, /UnsavedChangesGuard/, `${name} must protect navigation`);
    assert.match(source, /admin-editor-context/, `${name} must identify the edited surface`);
    assert.match(source, /Alterações não salvas|alterações não salvas/i, `${name} must expose draft state`);
  }
});
