import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("launch content is clean-room, governed and staging-only", async () => {
  const source = await read("scripts/phase8/publish-staging-launch-content.mjs");
  assert.match(source, /glcqsosxwgmlhzgcsnzv/);
  assert.match(source, /productionTouched: false/);
  assert.match(source, /GAIATEC-ADMIN-CHAT-2026-08-30/);
  assert.match(source, /sourceKind: "owner_authored"/);
  assert.match(source, /governanceState: "homologated"/);
  assert.match(source, /challengeAndVerify/);
  assert.match(source, /createActor\("super_admin"\)/);
  for (const action of ["create", "submit", "approve", "publish"]) {
    assert.match(source, new RegExp(`action: "${action}"`));
  }
  for (const title of [
    "Instalação de Medidores",
    "Monitoramento e Controle Remoto",
    "Saneamento",
    "Óleo e Gás",
    "Medição em Estações de Água e Esgoto",
    "Instrumentação e Monitoramento Remoto",
    "Detecção Integrada de Gases",
  ]) {
    assert.match(source, new RegExp(title));
  }
  assert.match(source, /contentType: "navigation"/);
  assert.match(source, /location: "footer"/);
  assert.match(source, /validatePublicProjection/);
  assert.doesNotMatch(source, /painel antigo|conteúdo legado|importa(?:r|ção) legado/i);
});
