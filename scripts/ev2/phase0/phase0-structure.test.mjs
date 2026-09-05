import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const phaseDocuments = [
  "docs/ev2/fase-0/README.md",
  "docs/ev2/fase-0/BACKLOG_EXECUTAVEL.md",
  "docs/ev2/fase-0/BASELINE_TECNICO.md",
  "docs/ev2/fase-0/BASELINE_TAREFAS.md",
  "docs/ev2/fase-0/THREAT_MODEL.md",
  "docs/ev2/fase-0/PLANO_FLAGS_ROLLBACK.md",
  "docs/ev2/fase-0/GATE_G0.md",
];

const phaseAdrs = [
  "docs/adr/ADR-015-multisite-preparado-e-ativacao-posterior.md",
  "docs/adr/ADR-016-compatibilidade-v1-v2-e-command-envelope.md",
  "docs/adr/ADR-017-feature-flags-seguras.md",
  "docs/adr/ADR-018-release-bundle-e-rollback.md",
  "docs/adr/ADR-019-rascunho-publicacao-e-concorrencia.md",
  "docs/adr/ADR-020-identidade-pim-e-proveniencia.md",
  "docs/adr/ADR-021-baseline-humano-incremental-por-gate.md",
];

test("EV2.0 has every required, versioned gate artifact", async () => {
  for (const path of [...phaseDocuments, ...phaseAdrs]) await access(path);

  const adrs = await Promise.all(phaseAdrs.map(read));
  for (const adr of adrs) {
    assert.match(adr, /\*\*Status:\*\* aprovada para EV2/);
    assert.match(adr, /## Decisão/);
    assert.match(adr, /## (Consequências|Verificação)/);
  }
});

test("pilot stays inside the approved 20-50 products and 5-8 tasks", async () => {
  const pilot = await read("docs/ev2/LOTE_PILOTO_EV2_0.md");
  const products = pilot.match(/^\|\s*\d+\s*\|\s*`GAI-\d{4}`/gm) ?? [];
  const tasks = pilot.match(/^\|\s*`EV2-T\d{2}`/gm) ?? [];

  assert.equal(products.length, 20);
  assert.equal(tasks.length, 8);
  assert.equal(new Set(products).size, products.length);
  assert.match(pilot, /não autoriza importação automática/i);
});

test("human baseline stays observed, incremental and free of estimates", async () => {
  const baseline = await read("docs/ev2/fase-0/BASELINE_TAREFAS.md");
  for (let index = 1; index <= 8; index += 1) {
    assert.match(baseline, new RegExp(`EV2-T${String(index).padStart(2, "0")}`));
  }
  assert.match(baseline, /T01 recebeu duas tentativas humanas v1 e duas v2/i);
  assert.match(baseline, /não existe mediana quantitativa válida/i);
  assert.match(baseline, /T02–T08 recebem baseline e comparação no gate/i);
  assert.match(baseline, /mediana v1 observada/i);
});

test("feature rollout fails closed and keeps production gated", async () => {
  const [flags, gate, readiness] = await Promise.all([
    read("docs/ev2/fase-0/PLANO_FLAGS_ROLLBACK.md"),
    read("docs/ev2/fase-0/GATE_G0.md"),
    read("docs/ev2/GATE_DE_PRONTIDAO.md"),
  ]);

  assert.match(flags, /Toda capacidade EV2 nasce `disabled`/);
  assert.match(flags, /Ausência, erro, timeout ou payload inválido resulta em desligado/);
  assert.match(flags, /`ev2\.multisite`.+off e não ativável antes do G9/);
  assert.match(flags, /Produção requer autorização explícita/);
  assert.match(gate, /Não autoriza.+produção/i);
  assert.match(readiness, /Não aprovado por este gate.+produção/i);
});

test("G0 backlog is ordered, reversible and traceable through EV2.12", async () => {
  const backlog = await read("docs/ev2/fase-0/BACKLOG_EXECUTAVEL.md");
  for (let index = 0; index <= 12; index += 1) {
    assert.match(backlog, new RegExp(`EV2\\.${index}`));
  }
  assert.match(backlog, /Definition of Done/);
  assert.match(backlog, /rollback/i);
  assert.match(backlog, /sem deploy ou ativação fora do gate/i);
});

test("threat model covers STRIDE and EV2 critical boundaries", async () => {
  const threatModel = await read("docs/ev2/fase-0/THREAT_MODEL.md");
  for (const term of [
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information disclosure",
    "Denial of service",
    "Elevation",
    "RLS",
    "tenant escape",
    "prompt injection",
    "release parcial",
  ]) {
    assert.match(threatModel, new RegExp(term, "i"));
  }
});

test("EV2.0 verification is part of local and CI quality gates", async () => {
  const [packageJson, ci] = await Promise.all([read("package.json"), read(".github/workflows/ci.yml")]);
  assert.match(packageJson, /"test:ev2:phase0": "node --test scripts\/ev2\/phase0\/\*\.test\.mjs"/);
  assert.match(packageJson, /"check"[^\n]+npm run test:ev2:phase0/);
  assert.match(ci, /"ev2\/\*\*"/);
  assert.match(ci, /npm run check/);
});
