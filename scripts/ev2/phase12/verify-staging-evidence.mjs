// Verifica o CONTEUDO das evidencias de staging, nao o tamanho do arquivo.
//
// POR QUE ISSO EXISTE. O gate final percorria os arquivos com `test -s`, que mede bytes. Isso aprova
// duas coisas que nao deveriam passar:
//
//  1. Evidencia reprovada. `staging-roundtrip.mjs` grava `{"status":"failed", ...}` no catch, entao o
//     arquivo fica NAO VAZIO e sobe como se estivesse aprovado, dizendo `failed` por dentro.
//  2. Arquivo que nem chegou a ser evidencia. `npm run canary | tee` escreve o banner do npm
//     (`> pacote@versao ...`) em stdout antes de o script rodar, entao o arquivo e nao-vazio POR
//     CONSTRUCAO, mesmo que o canario estoure no primeiro check.
//
// O segundo caso e o mais traicoeiro, e e tambem o mais barato de pegar: banner mais JSON nao e JSON
// valido, entao exigir que o arquivo faca parse ja o elimina.
//
// LIMITE DECLARADO. Isto nao valida o esquema de cada relatorio, que difere entre eles. Recusa o que
// consegue reconhecer como reprovacao explicita e o que nao e JSON. Um relatorio com veredito
// proprio e nome de campo novo passa por aqui sem ser interpretado — o gate especifico dele e que
// tem de existir.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FAILED_STATUS = new Set(["failed", "failure", "cleanup-failed", "error", "refused"]);
const FAILED_OUTCOME = new Set(["fail", "failed", "failure", "reproved", "refused", "blocked"]);

export function evaluateStagingEvidence(file, contents) {
  const violations = [];
  if (typeof contents !== "string" || contents.trim() === "") {
    violations.push("evidence_empty");
    return { file, valid: false, violations };
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    // Pega exatamente o caso do banner do npm impresso antes do JSON do canario.
    violations.push("evidence_not_json");
    return { file, valid: false, violations };
  }

  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const status = typeof record.status === "string" ? record.status.toLowerCase() : "";
  const outcome = typeof record.outcome === "string" ? record.outcome.toLowerCase() : "";
  if (FAILED_STATUS.has(status)) violations.push(`evidence_status_failed:${status}`);
  if (FAILED_OUTCOME.has(outcome)) violations.push(`evidence_outcome_failed:${outcome}`);
  // `ok: false` e `passed: false` sao a mesma afirmacao escrita de outro jeito.
  if (record.ok === false) violations.push("evidence_not_ok");
  if (record.passed === false) violations.push("evidence_not_passed");

  return { file, valid: violations.length === 0, violations };
}

async function main() {
  const files = process.argv.slice(2).filter(Boolean);
  if (!files.length) throw new Error("STAGING_EVIDENCE_FILES_REQUIRED");

  const results = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8").catch(() => null);
    if (contents === null) {
      results.push({ file, valid: false, violations: ["evidence_missing"] });
      continue;
    }
    results.push(evaluateStagingEvidence(file, contents));
  }

  const refused = results.filter((result) => !result.valid);
  console.log(
    JSON.stringify({
      event: "g12.staging.evidence.verified",
      files: results.length,
      refused: refused.length,
      violations: refused.map((result) => `${result.file}:${result.violations.join(",")}`),
    }),
  );
  if (refused.length) throw new Error("G12_STAGING_EVIDENCE_REFUSED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
