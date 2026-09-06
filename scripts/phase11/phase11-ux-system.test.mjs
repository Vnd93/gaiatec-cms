import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const routes = read("src/app/routes.tsx");
const shell = read("src/admin/components/AdminShell.tsx");
const ui = read("src/admin/components/AdminUI.tsx");
const css = read("src/admin/admin-f11.css") + read("src/admin/admin.css");
const guidance = read("src/admin/admin-route-guidance.ts");
const forms = read("src/admin/pages/AdminFormsPage.tsx");

test("todas as superfícies administrativas continuam registradas", () => {
  for (const path of [
    "login",
    "recuperar-senha",
    "definir-senha",
    "mfa",
    "conteudo",
    "produtos",
    "produtos/importacao",
    "descoberta/:contentType",
    "busca",
    "listas-mestras",
    "paginas",
    "site",
    "marketing",
    "marketing/formularios",
    "leads",
    "midia",
    "perfil",
    "usuarios",
    "diagnosticos",
  ])
    assert.ok(routes.includes(`path: "${path}"`), `rota ${path} ausente`);
  assert.match(routes, /preview\/:token/);
  assert.match(routes, /AdminNotFoundPage/);
});

test("biblioteca compartilhada cobre cabeçalho, formulário, estados, tabela e confirmação", () => {
  for (const component of [
    "PageHeader",
    "ActionBar",
    "SectionCard",
    "FieldGroup",
    "FieldHelp",
    "StepTabs",
    "StatusRail",
    "EmptyState",
    "ErrorState",
    "LoadingSkeleton",
    "FilterBar",
    "DataTable",
    "Badge",
    "AdminAlert",
    "ConfirmDialog",
    "StickyFooter",
  ])
    assert.match(ui, new RegExp(`export (?:function|const) ${component}`));
  assert.match(ui, /role="alertdialog"/);
  assert.match(ui, /ArrowRight/);
});

test("shell oferece busca real, conta, localização, recolhimento e navegação mobile", () => {
  assert.match(shell, /admin-skip-link/);
  assert.match(shell, /Control\+K Meta\+K/);
  assert.match(shell, /admin-account__profile/);
  assert.match(shell, /sidebarCollapsed/);
  assert.match(shell, /aria-current/);
  assert.match(shell, /Fechar menu administrativo/);
  assert.match(shell, /resolveAdminRouteGuidance/);
});

test("orientação operacional cobre tarefa, impacto, interno e próximo passo", () => {
  for (const field of ["task", "publicImpact", "internal", "nextStep"])
    assert.match(guidance, new RegExp(`${field}:`));
  assert.ok((guidance.match(/match: \//g) ?? []).length >= 20);
});

test("design system define foco, breakpoints, reduced motion e overflow contido", () => {
  for (const token of [
    "--admin-blue",
    "--admin-orange",
    "--admin-space-4",
    "--admin-radius-md",
    "--admin-shadow-sm",
  ])
    assert.ok(css.includes(token));
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 899px/);
  assert.match(css, /max-width: 680px/);
  assert.match(css, /overflow: auto/);
});

test("F11 preserva proteção de campos internos e continuidade da F10", () => {
  const projection = read("supabase/functions/_shared/cms-public-projection.ts");
  const auth = read("src/admin/auth/AdminAuthContext.tsx");
  assert.match(projection, /manufacturerReference|manufacturer_reference/);
  assert.match(projection, /sku/i);
  assert.match(auth, /refreshSameUserInBackground/);
  assert.match(auth, /TOKEN_REFRESHED/);
});

test("interface não adiciona sino ou notificação decorativa", () => {
  assert.doesNotMatch(shell, /\b(?:Bell|Notification|sino)\b/i);
  assert.doesNotMatch(ui, /\b(?:Bell|Notification|sino)\b/i);
});

test("formulários resolvem a relação versionada e oferecem recuperação acionável", () => {
  assert.match(forms, /cms_form_versions!cms_form_versions_form_id_fkey/);
  assert.match(forms, /<ErrorState/);
  assert.match(forms, /Tentar novamente/);
});
