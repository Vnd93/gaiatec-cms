import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../../cloudflare/_worker.js";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("unprepared worker fails closed and private/staging headers remain enforced", async () => {
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/")
          return new Response("<!doctype html><title>app</title>", {
            headers: { "Content-Type": "text/html" },
          });
        return new Response("missing", { status: 404, headers: { "Content-Type": "text/plain" } });
      },
    },
  };

  const valid = await worker.fetch(
    new Request("https://staging.example.com/servicos/medicoes-em-campo"),
    env,
  );
  assert.equal(valid.status, 503);
  assert.match(valid.headers.get("x-robots-tag") ?? "", /noindex/);

  const invalidEntity = await worker.fetch(
    new Request("https://staging.example.com/produtos/nao-existe"),
    env,
  );
  assert.equal(invalidEntity.status, 404);
  assert.match(invalidEntity.headers.get("x-robots-tag") ?? "", /noindex/);

  const invalidPrivate = await worker.fetch(
    new Request("https://staging.example.com/relatorio-de-obra/inexistente"),
    env,
  );
  assert.equal(invalidPrivate.status, 404);
  assert.match(invalidPrivate.headers.get("cache-control") ?? "", /no-store/);

  const privateRoute = await worker.fetch(
    new Request("https://staging.example.com/relatorio-de-obra/login"),
    env,
  );
  assert.equal(privateRoute.status, 200);
  assert.match(privateRoute.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(privateRoute.headers.get("cache-control") ?? "", /no-store/);

  const missingAsset = await worker.fetch(new Request("https://staging.example.com/assets/missing.js"), env);
  assert.equal(missingAsset.status, 404);

  const staging = await worker.fetch(new Request("https://gaiatec-cms-staging.pages.dev/contato"), env);
  assert.match(staging.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("RDO access, immutability and private storage are fail-closed", async () => {
  const migration = await read("supabase/migrations/0008_fase1_contencao_p0.sql");
  assert.match(migration, /rdo_user_access/);
  assert.match(migration, /RDO_IMMUTABLE/);
  assert.match(migration, /values \('rdo-fotos', 'rdo-fotos', false\)/);
  assert.match(migration, /values \('rdo-assinados', 'rdo-assinados', false\)/);
  assert.match(migration, /rdo_storage_assinados_read/);
  assert.doesNotMatch(migration, /create policy "rdo_fotos_public_read"/);

  const otp = await read("supabase/functions/rdo-otp/index.ts");
  assert.doesNotMatch(otp, /createUser\s*\(/);
  assert.match(otp, /rdo_user_access/);

  const command = await read("supabase/functions/rdo-command/index.ts");
  const signing = await read("supabase/functions/rdo-sign/index.ts");
  assert.match(command, /if \(!url \|\| !anonKey \|\| !serviceRole \|\| !evidenceSalt\)/);
  assert.match(signing, /if \(!url \|\| !serviceRole \|\| !resendKey \|\| !evidenceSalt\)/);
  assert.doesNotMatch(command + signing, /missing-salt/);
});

test("client sends identifiers only and legacy CMS remains disabled", async () => {
  const notify = await read("src/app/rdo/lib/notify.ts");
  assert.match(notify, /body: \{ reportId: report\.id, action, idempotencyKey:/);
  assert.doesNotMatch(notify, /pdfBase64|clienteEmail|resumo:/);

  const hooks = await read("src/app/hooks/useSiteData.ts");
  assert.match(hooks, /return \{ data: fallback, loading: false \}/);

  const contact = await read("supabase/functions/submit-contact/index.ts");
  assert.match(contact, /16_384/);
  assert.match(contact, /idempotency/);
  assert.match(contact, /turnstile/i);
});

test("frontend and server hash the identical versioned signature terms", async () => {
  const client = await read("src/app/rdo/lib/terms.ts");
  const server = await read("supabase/functions/rdo-command/index.ts");
  const clientVersion = client.match(/TERMOS_VERSAO = "([^"]+)"/)?.[1];
  const serverVersion = server.match(/TERMS_VERSION = "([^"]+)"/)?.[1];
  const clientText = client.match(/TERMOS_TEXTO = `([\s\S]*?)`;/)?.[1];
  const serverText = server.match(/TERMS_TEXT = `([\s\S]*?)`;/)?.[1];
  assert.equal(serverVersion, clientVersion);
  assert.equal(serverText, clientText);
});
