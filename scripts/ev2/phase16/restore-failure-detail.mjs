// Faz o motivo de uma reprovacao de restauracao sobreviver ao teardown.
//
// POR QUE ISSO EXISTE. `run_restore_psql` manda toda a saida do psql para um log dentro do diretorio
// de trabalho e, na falha, emite so o codigo do passo: `BACKUP_RESTORE_APPLICATION_SCHEMA_FAILED`
// diz ONDE quebrou e nunca POR QUE. O passo seguinte apaga o diretorio inteiro, entao a causa e
// destruida junto com o material em claro. Quem le o run fica com um codigo e nenhuma linha de erro.
//
// O QUE ELE IMPRIME. Somente as linhas de diagnostico do PostgreSQL, ja passadas pelo mesmo redator
// de formato de credencial que os canarios usam. Nao e o log inteiro: DDL restaurada pode carregar
// literal dentro de corpo de funcao, e o objetivo aqui e nomear a causa, nao despejar o arquivo.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { redactUnsafeDetail } from "../gate-failure.mjs";

const DIAGNOSTIC_LINE = /^(?:psql:|ERROR|FATAL|PANIC|WARNING|DETAIL|HINT|CONTEXT|STATEMENT|LINE \d+)/;
const MAX_LINES = 40;
const MAX_LINE_LENGTH = 500;

export function extractRestoreFailureDetail(log, { maxLines = MAX_LINES } = {}) {
  const lines = String(log ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => DIAGNOSTIC_LINE.test(line));
  const kept = lines.slice(-maxLines);
  return {
    // Uma linha de diagnostico que carregue forma de credencial e suprimida inteira: o valor de
    // nomear a causa nunca justifica publicar um segredo colado no lugar errado.
    lines: kept.map((line) => redactUnsafeDetail(line.slice(0, MAX_LINE_LENGTH))),
    diagnosticLines: lines.length,
    truncated: lines.length > kept.length,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? "" : process.argv[index + 1];
}

async function main() {
  const logPath = argument("--log");
  const failureCode = argument("--code");
  if (!logPath || !failureCode) throw new Error("RESTORE_FAILURE_DETAIL_ARGUMENTS_REQUIRED");
  // Log ausente e um fato a relatar, nao um motivo para mascarar a falha que trouxe ate aqui: o
  // detalhe sai vazio e o passo continua reprovando pelo codigo que ja tinha.
  const log = await readFile(logPath, "utf8").catch(() => "");
  const detail = extractRestoreFailureDetail(log);
  console.log(JSON.stringify({ event: "supabase.restore.failure-detail", failureCode, ...detail }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
