import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { invalidateCloudflareCache } from "../../supabase/functions/_shared/cloudflare-cache.ts";
import {
  loadPublishedProjection,
  PUBLISHED_PROJECTION_PAGE_SIZE,
} from "../../supabase/functions/_shared/published-projection.ts";

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

test("publication is atomic, versioned, revalidated and restorable", async () => {
  const [commands, workers, publicApi, outboxWorker] = await Promise.all([
    read("supabase/migrations/0015_fase3_cms_editorial_commands.sql"),
    read("supabase/migrations/0016_fase3_cms_workers_and_media_usage.sql"),
    read("supabase/functions/cms-public/index.ts"),
    read("supabase/functions/cms-outbox-worker/index.ts"),
  ]);
  assert.match(commands, /cms_published_projection/);
  assert.match(commands, /cms_publication_outbox/);
  assert.match(commands, /p_action = 'restore'/);
  assert.match(commands, /content_version/);
  assert.match(workers, /cms_finish_outbox/);
  assert.match(workers, /cms\.outbox\.failed/);
  assert.match(outboxWorker, /invalidateCloudflareCache/);
  assert.match(outboxWorker, /cacheInvalidation\.ok/);
  assert.match(publicApi, /PUBLIC_REVALIDATE = "public, max-age=0, must-revalidate"/);
  assert.match(publicApi, /sanitizePublicPayload/);
  assert.doesNotMatch(publicApi, /\.limit\(1000\)/);
});

test("public projection pagination never truncates after the first PostgREST page", async () => {
  const rows = Array.from({ length: PUBLISHED_PROJECTION_PAGE_SIZE * 2 + 37 }, (_, index) => ({
    item_id: String(index).padStart(5, "0"),
  }));
  const ranges = [];
  const client = {
    from(table) {
      assert.equal(table, "cms_published_projection");
      const query = {
        select() {
          return query;
        },
        in() {
          return query;
        },
        order() {
          return query;
        },
        async range(from, to) {
          ranges.push([from, to]);
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };

  const result = await loadPublishedProjection(client, ["product", "page"]);
  assert.equal(result.error, null);
  assert.equal(result.data.length, rows.length);
  assert.deepEqual(ranges, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

test("cache invalidation works without a new secret and never returns Cloudflare credentials", async () => {
  let called = false;
  const skipped = await invalidateCloudflareCache({
    environment: "staging",
    fetchImpl: async () => {
      called = true;
      return Response.json({ success: true });
    },
  });
  assert.deepEqual(skipped, {
    ok: true,
    required: false,
    attempted: false,
    code: null,
    strategy: "origin-revalidation",
  });
  assert.equal(called, false);

  const missing = await invalidateCloudflareCache({ environment: "production" });
  assert.equal(missing.ok, true);
  assert.equal(missing.required, false);
  assert.equal(missing.strategy, "origin-revalidation");

  let request;
  const token = "t".repeat(40);
  const zoneId = "a".repeat(32);
  const purged = await invalidateCloudflareCache({
    environment: "production",
    zoneId,
    apiToken: token,
    fetchImpl: async (input, init) => {
      request = { input: String(input), init };
      return Response.json({ success: true });
    },
  });
  assert.equal(purged.ok, true);
  assert.equal(request.input, `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`);
  assert.equal(request.init.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(request.init.body), { purge_everything: true });
  assert.doesNotMatch(JSON.stringify(purged), new RegExp(token));

  const rejected = await invalidateCloudflareCache({
    environment: "production",
    zoneId,
    apiToken: token,
    fetchImpl: async () => Response.json({ success: false }, { status: 403 }),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "cloudflare_cache_invalidation_rejected");
  assert.equal(rejected.httpStatus, 403);
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
  assert.match(api, /raster-metadata-v3/);
  assert.match(api, /\["thumbnail", "webp"\]/);
  assert.match(api, /\["large", "avif"\]/);
  assert.doesNotMatch(api, /site-content|produtos atuais/i);
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
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(list, /Carregando conteúdo/);
  assert.match(list, /Biblioteca editorial vazia/);
  assert.match(list, /Não foi possível carregar/);
  assert.match(editor, /controle de versão/);
  assert.match(editor, /Restaurar como nova revisão/);
  assert.match(dashboard, /Sem permissão de edição/);
  assert.match(profile, /Perfil e acesso/);
  assert.match(profile, /Encerrar esta sessão/);
});
