import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const reportPath = resolve("docs/validacao-local/ULTIMA_VALIDACAO.md");

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "indisponivel";
}

const commit = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const initialStatus = git("status", "--porcelain");
const startedAt = new Date();
const environment = {
  ...process.env,
  GITHUB_SHA: commit,
  VITE_RELEASE: commit,
};

const steps = [
  ["Formatacao", ["run", "format:check"]],
  ["Lint", ["run", "lint"]],
  ["TypeScript", ["run", "typecheck"]],
  ["Testes unitarios", ["run", "test"]],
  ["Testes de integracao", ["run", "test:integration"]],
  ["Contencoes da Fase 1", ["run", "test:phase1"]],
  ["Fundacao da Fase 3", ["run", "test:phase3"]],
  ["Auditoria de dependencias", ["audit", "--audit-level=high"]],
  ["Build de staging", ["run", "build:staging"]],
  ["Manifesto do artefato", ["run", "artifact:manifest"]],
  ["Testes de navegador", ["run", "test:e2e"]],
];

const results = [];
let failed = false;

for (const [name, args] of steps) {
  const stepStartedAt = Date.now();
  console.log(`\n=== ${name} ===`);
  const commandArguments = isWindows ? ["/d", "/s", "/c", ["npm", ...args].join(" ")] : args;
  const result = spawnSync(npmCommand, commandArguments, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  const status = result.status ?? 1;
  results.push({ name, status, durationSeconds: Math.ceil((Date.now() - stepStartedAt) / 1000) });
  if (status !== 0) {
    failed = true;
    break;
  }
}

const finishedAt = new Date();
const rows = results
  .map(
    ({ name, status, durationSeconds }) =>
      `| ${name} | ${status === 0 ? "APROVADO" : "FALHOU"} | ${durationSeconds}s |`,
  )
  .join("\n");
const skippedRows = steps
  .slice(results.length)
  .map(([name]) => `| ${name} | NAO EXECUTADO | - |`)
  .join("\n");

const report = `# Ultima validacao local

**Resultado geral:** ${failed ? "FALHOU" : "APROVADO"}

**Inicio:** ${startedAt.toISOString()}

**Fim:** ${finishedAt.toISOString()}

**Branch:** \`${branch}\`

**Commit-base:** \`${commit}\`

**Estado inicial:** ${initialStatus ? "com alteracoes locais ainda nao commitadas" : "arvore Git limpa"}

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
${rows}
${skippedRows}

## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute \`supabase start\`, \`supabase db reset --local --no-seed\`, \`npm run test:rls\` e \`supabase stop --no-backup\`.

Esta evidencia complementa os checks automaticos do GitHub Actions e permanece disponivel como contingencia. Ela nao autoriza deploy de producao.
`;

await mkdir(resolve("docs/validacao-local"), { recursive: true });
await writeFile(reportPath, report, "utf8");
console.log(`\nRelatorio salvo em ${reportPath}`);

if (failed) process.exitCode = 1;
