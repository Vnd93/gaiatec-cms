import assert from "node:assert/strict";
import test from "node:test";

import { extractRestoreFailureDetail } from "./restore-failure-detail.mjs";

test("only the PostgreSQL diagnostic lines survive, and the noise around them does not", () => {
  const log = [
    "SET",
    "CREATE EXTENSION",
    'psql:/tmp/restore/schema.sql:912: ERROR:  role "app_reader" does not exist',
    "STATEMENT:  ALTER TABLE public.cms_forms OWNER TO app_reader;",
    "CREATE TABLE",
  ].join("\n");
  const detail = extractRestoreFailureDetail(log);

  // O objetivo e nomear a causa. Despejar o log inteiro carregaria DDL sem necessidade e ainda
  // esconderia a linha que importa no meio de centenas de "CREATE TABLE".
  assert.equal(detail.lines.length, 2);
  assert.match(detail.lines[0], /ERROR: {2}role "app_reader" does not exist/);
  assert.match(detail.lines[1], /^STATEMENT:/);
  assert.equal(detail.diagnosticLines, 2);
  assert.equal(detail.truncated, false);
});

test("a credential shape pasted into a diagnostic line never reaches the run log", () => {
  const detail = extractRestoreFailureDetail(
    "ERROR:  invalid input for token sbp_0123456789abcdef0123456789abcdef",
  );
  assert.equal(detail.lines[0], "[detalhe suprimido: formato de credencial]");
  assert.ok(!detail.lines[0].includes("sbp_"));

  // E o mesmo vale para e-mail, que e a forma que mais aparece por descuido em DDL restaurada.
  assert.equal(
    extractRestoreFailureDetail("DETAIL:  Key (email)=(operador@gaiatecsistemas.com.br) exists.").lines[0],
    "[detalhe suprimido: formato de credencial]",
  );
});

test("a long failure is capped and says that it was", () => {
  const log = Array.from({ length: 90 }, (_, index) => `ERROR:  falha ${index}`).join("\n");
  const detail = extractRestoreFailureDetail(log, { maxLines: 10 });
  assert.equal(detail.lines.length, 10);
  assert.equal(detail.diagnosticLines, 90);
  assert.equal(detail.truncated, true);
  // O fim do log e onde esta a falha que derrubou o passo; o comeco e ruido de progresso.
  assert.match(detail.lines.at(-1), /falha 89/);
});

test("an absent or silent log produces an empty detail instead of an exception", () => {
  for (const input of ["", null, undefined, "CREATE TABLE\nALTER TABLE"]) {
    const detail = extractRestoreFailureDetail(input);
    assert.deepEqual(detail.lines, []);
    assert.equal(detail.truncated, false);
  }
});
