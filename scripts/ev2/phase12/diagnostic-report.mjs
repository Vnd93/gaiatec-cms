// Relatorio consolidado do passe de diagnostico (Bloco 2, secao 4 da instrucao de otimizacao).
//
// O passe de diagnostico existe para colher TODAS as falhas de um candidato em uma unica passada,
// para que a correcao seja feita em lote num unico SHA. Este materializador transforma o desfecho de
// cada gate no objeto auto-descritivo do Bloco 3, secao 5, para que nenhuma reprovacao exija leitura
// de log bruto: cada uma nomeia causa, entidade, observado, exigido e remediacao minima.
//
// O relatorio e marcado `diagnostic: true` e `approvable: false`. Nenhum verificador de evidencia
// pode aceita-lo, nenhum gate e satisfeito por ele e ele nao pode ser citado em matriz terminal.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SHA_PATTERN = /^[a-f0-9]{40}$/;

// Catalogo estavel dos gates. A chave e o sufixo de `OUTCOME_<CHAVE>` no ambiente do step.
// `cause` e um codigo estavel: ele nao muda quando a mensagem do script muda.
const GATES = [
  {
    key: "LOCAL_CHECK",
    gate: "diagnostic.local_check",
    cause: "CMS_DIAGNOSTIC_LOCAL_CHECK_REPROVED",
    entity: "npm run check, npm audit --audit-level=high",
    expected: "cadeia local integral aprovada no SHA candidato",
    remediation:
      "Reproduzir localmente com a versao do .nvmrc e corrigir a primeira etapa vermelha da cadeia.",
  },
  {
    key: "COVERAGE_MATRIX",
    gate: "diagnostic.coverage_matrix",
    cause: "CMS_DIAGNOSTIC_COVERAGE_MATRIX_REPROVED",
    entity: "scripts/qa/cms-coverage-inventory.mjs",
    expected: "matriz de cobertura materializada a partir do codigo-fonte, sem elemento nao classificado",
    remediation: "Classificar a superficie que a matriz recusou; nao usar N/A para elemento existente.",
  },
  {
    key: "BACKEND_COMPATIBILITY",
    gate: "diagnostic.backend_compatibility",
    cause: "CMS_DIAGNOSTIC_BACKEND_COMPATIBILITY_REPROVED",
    entity: "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs",
    expected: "backend append-only e compativel com o frontend de rollback aprovado",
    remediation:
      "Restaurar o contrato removido ou apertado; migration que aperta restricao exige fixture atualizada no mesmo commit.",
  },
  {
    key: "STAGING_DATABASE",
    gate: "diagnostic.staging_database",
    cause: "CMS_DIAGNOSTIC_STAGING_DATABASE_DIVERGENT",
    entity: "scripts/ev2/phase12/verify-staging-database.mjs",
    expected: "banco de staging vivo compativel com as migrations do candidato",
    remediation:
      "Se o candidato traz migration nova, esta divergencia e esperada no diagnostico e so o run canonico a resolve; caso contrario, investigar a diferenca nomeada pelo verificador.",
  },
  {
    key: "MIGRATIONS_CANARY",
    gate: "diagnostic.migrations_canary",
    cause: "CMS_DIAGNOSTIC_MIGRATIONS_CANARY_REPROVED",
    entity: "scripts/ev2/phase12/staging-migrations-canary.mjs",
    expected: "cenarios pos-baseline aprovados com dado sintetico isolado e residuo zero",
    remediation:
      "Ler o codigo CMS_ do erro: ele nomeia a restricao ou o escopo que a fixture violou, e a fixture deve ser ajustada no mesmo commit da migration que apertou.",
  },
  {
    key: "G11_CANARY",
    gate: "diagnostic.g11_canary",
    cause: "CMS_DIAGNOSTIC_G11_CANARY_REPROVED",
    entity: "scripts/ev2/phase11/staging-canary.mjs",
    expected: "canario de sistema G11 aprovado de ponta a ponta com encerramento limpo",
    remediation:
      "Ler o nome do check reprovado no relatorio do canario; ele nomeia a fixture e a restricao envolvidas.",
  },
  {
    key: "LIVE_PROBE",
    gate: "diagnostic.live_probe",
    cause: "CMS_DIAGNOSTIC_PUBLIC_PROBE_REPROVED",
    entity: "scripts/ev2/phase12/rollout-probe.mjs",
    expected: "disponibilidade, taxa de 5xx e p95 publico dentro do orcamento declarado",
    remediation:
      "Comparar p50 e p95 do relatorio: cauda alta com p50 saudavel indica prazo de saida de dependencia, nao carga.",
  },
  {
    key: "BOUNDARY",
    gate: "diagnostic.boundary",
    cause: "CMS_DIAGNOSTIC_BOUNDARY_REPROVED",
    entity: "scripts/ev2/phase12/probe-supabase-boundary.mjs",
    expected: "fronteira publica, anonima, CORS e de segredo fechada",
    remediation: "Fechar a fronteira que o probe abriu; nunca afrouxar a assercao para passar o gate.",
  },
  {
    key: "LIFECYCLE",
    gate: "diagnostic.lifecycle",
    cause: "CMS_DIAGNOSTIC_LIFECYCLE_REPROVED",
    entity: "scripts/phase7/staging-roundtrip.mjs",
    expected: "ciclo editorial governado completo, com persistencia e auditoria comprovadas",
    remediation: "Corrigir a etapa do ciclo que nao persistiu ou nao auditou; tela renderizada nao basta.",
  },
  {
    key: "PHASE17_CANARY",
    gate: "diagnostic.phase17_canary",
    cause: "CMS_DIAGNOSTIC_PHASE17_CANARY_REPROVED",
    entity: "scripts/ev2/phase17/staging-canary.mjs",
    expected: "canario operacional do CMS aprovado com ator sintetico isolado",
    remediation: "Ler o check reprovado do canario operacional e corrigir a causa nomeada por ele.",
  },
  {
    key: "BROWSER_FIXTURE",
    gate: "diagnostic.browser_fixture",
    cause: "CMS_DIAGNOSTIC_BROWSER_FIXTURE_REPROVED",
    entity: "scripts/qa/cms-browser-fixture.mjs setup",
    expected: "ator MFA isolado provisionado com lease exata do run",
    remediation: "Corrigir o provisionamento do ator sintetico; nenhuma etapa autenticada roda sem ele.",
  },
  {
    key: "DIAGNOSTIC_CLEANUP",
    gate: "diagnostic.cleanup",
    cause: "CMS_DIAGNOSTIC_CLEANUP_REPROVED",
    entity: "scripts/qa/cms-browser-fixture.mjs cleanup",
    expected: "lease concluida, ator revogado e residuo ativo zero",
    remediation:
      "A conclusao de lease deve dizer a causa retornada pelo banco; se ela falhou em silencio, esse silencio e o defeito a corrigir primeiro.",
  },
];

// Limites que o passe de diagnostico nao pode ultrapassar, declarados no proprio relatorio para que
// ninguem leia este arquivo como aprovacao parcial.
const LIMITS = [
  "Nao aplica migration, nao configura secret e nao faz deploy de Edge Function.",
  "Nao publica bytes, nao sela artefato, nao promove e nao toca o alias canonico.",
  "Nao valida migration nova nem funcao nova do candidato; isso e exclusividade do run canonico.",
  "Nao satisfaz gate, nao produz evidencia e nao pode ser citado em matriz terminal ou aprovacao.",
  "Mutacao permitida exclusivamente em fixture sintetica, com ator e run_tag proprios deste run.",
];

function readOutput(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function qaRunTag(candidateSha) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `QA-CMS-FINAL-${today}-${candidateSha.slice(0, 8)}`;
}

const output = readOutput("--output");
if (!output) throw new Error("CMS_DIAGNOSTIC_REPORT_OUTPUT_REQUIRED");

const candidateSha = process.env.CANDIDATE_SHA ?? "";
if (!SHA_PATTERN.test(candidateSha)) throw new Error("CMS_DIAGNOSTIC_REPORT_CANDIDATE_SHA_INVALID");

const runTag = qaRunTag(candidateSha);
const gates = GATES.map((entry) => {
  // Um step que nunca chegou a rodar reporta cadeia vazia; isso e ausencia de sinal, e ausencia de
  // sinal e tratada como reprovacao, nunca como pendencia.
  const observed = process.env[`OUTCOME_${entry.key}`] || "not_reached";
  const passed = observed === "success";
  const skipped = observed === "skipped";
  return {
    gate: entry.gate,
    result: passed ? "PASS" : skipped ? "SKIPPED" : "FAIL",
    cause: passed || skipped ? null : entry.cause,
    entity: entry.entity,
    observed,
    expected: entry.expected,
    remediation: passed || skipped ? null : entry.remediation,
    sha: candidateSha,
    runTag,
  };
});

const failed = gates.filter((gate) => gate.result === "FAIL");
const report = {
  schemaVersion: 1,
  diagnostic: true,
  approvable: false,
  candidateSha,
  liveReleases: {
    "ev2-g12-canary": process.env.LIVE_G12_SHA || null,
    "ev2-g17-canary": process.env.LIVE_G17_SHA || null,
  },
  runId: process.env.RUN_ID || null,
  runAttempt: process.env.RUN_ATTEMPT || null,
  runTag,
  generatedAt: new Date().toISOString(),
  limits: LIMITS,
  totalGates: gates.length,
  failedGates: failed.length,
  gates,
};

mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8" });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `failed_gates=${failed.length}\n`, { encoding: "utf8" });

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## Passe de diagnostico — ${candidateSha}`,
    "",
    `Gates reprovados: **${failed.length}** de ${gates.length}. Este relatorio nao aprova nada.`,
    "",
    "| Gate | Resultado | Causa | Remediacao |",
    "| ---- | --------- | ----- | ---------- |",
    ...gates.map(
      (gate) => `| \`${gate.gate}\` | ${gate.result} | ${gate.cause ?? "—"} | ${gate.remediation ?? "—"} |`,
    ),
    "",
    "### Limites deste passe",
    "",
    ...LIMITS.map((limit) => `- ${limit}`),
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, { encoding: "utf8" });
}
