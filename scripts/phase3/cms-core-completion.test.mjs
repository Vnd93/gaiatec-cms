import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("F3 core registers consumers and rejects orphan blocks", async () => {
  const [schema, commands, contract] = await Promise.all([
    read("supabase/migrations/0014_fase3_cms_capabilities_media_projection.sql"),
    read("supabase/migrations/0015_fase3_cms_editorial_commands.sql"),
    read("src/shared/contracts/cms-content.ts"),
  ]);
  assert.match(schema, /create table public\.cms_capability_registry/i);
  assert.match(schema, /cms\.synthetic-article\.v1/);
  assert.match(commands, /CMS_CONSUMER_UNAVAILABLE/);
  assert.match(commands, /CMS_BLOCK_WITHOUT_RENDERER/);
  assert.match(contract, /CmsConsumerIdSchema/);
});

test("publication is atomic, versioned, cached and restorable", async () => {
  const [commands, workers, publicApi] = await Promise.all([
    read("supabase/migrations/0015_fase3_cms_editorial_commands.sql"),
    read("supabase/migrations/0016_fase3_cms_workers_and_media_usage.sql"),
    read("supabase/functions/cms-public/index.ts"),
  ]);
  assert.match(commands, /cms_published_projection/);
  assert.match(commands, /cms_publication_outbox/);
  assert.match(commands, /p_action = 'restore'/);
  assert.match(commands, /content_version/);
  assert.match(workers, /cms_finish_outbox/);
  assert.match(workers, /cms\.outbox\.failed/);
  assert.match(publicApi, /If-None-Match/);
  assert.match(publicApi, /stale-while-revalidate/);
});

test("preview and admin routes are private no-store consumers of the real renderer", async () => {
  const [worker, previewApi, previewPage, publishedPage] = await Promise.all([
    read("cloudflare/_worker.js"),
    read("supabase/functions/cms-preview/index.ts"),
    read("src/admin/pages/CmsPreviewPage.tsx"),
    read("src/admin/pages/CmsPublishedPage.tsx"),
  ]);
  assert.match(worker, /ADMIN_ROUTES/);
  assert.match(worker, /PREVIEW_ROUTES/);
  assert.match(previewApi, /noindex, nofollow, noarchive/);
  assert.match(previewApi, /private, no-store/);
  assert.match(previewPage, /CmsStructuredArticle/);
  assert.match(publishedPage, /CmsStructuredArticle/);
});

test("media stays private and requires real MIME, variants and a usage guard", async () => {
  const [schema, api] = await Promise.all([
    read("supabase/migrations/0014_fase3_cms_capabilities_media_projection.sql"),
    read("supabase/functions/cms-media/index.ts"),
  ]);
  assert.match(schema, /'cms-media-private'.*false/s);
  assert.match(schema, /CMS_MEDIA_IN_USE/);
  assert.match(schema, /cms_media_usages/);
  assert.match(api, /safe-raster-magic-v1/);
  assert.match(api, /\["thumbnail", "webp"\]/);
  assert.match(api, /\["large", "avif"\]/);
  assert.doesNotMatch(api, /legacy|site-content|produtos atuais/i);
});

test("admin shell covers search, profile, operational and denied states", async () => {
  const [shell, list, editor, dashboard, profile] = await Promise.all([
    read("src/admin/components/AdminShell.tsx"),
    read("src/admin/pages/AdminContentPage.tsx"),
    read("src/admin/pages/AdminEditorPage.tsx"),
    read("src/admin/pages/AdminHomePage.tsx"),
    read("src/admin/pages/AdminProfilePage.tsx"),
  ]);
  assert.match(shell, /Breadcrumb/);
  assert.match(shell, /Busca global no CMS/);
  assert.match(shell, /event\.key !== "Escape"/);
  assert.match(list, /Carregando conteúdo/);
  assert.match(list, /Biblioteca editorial vazia/);
  assert.match(list, /Não foi possível carregar/);
  assert.match(editor, /controle de versão/);
  assert.match(editor, /Restaurar como nova revisão/);
  assert.match(dashboard, /Sem permissão de edição/);
  assert.match(profile, /Perfil e sessão/);
  assert.match(profile, /Encerrar esta sessão/);
});
