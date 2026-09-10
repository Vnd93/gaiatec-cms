// Motor do contrato fixture x schema (secao 3.1 da instrucao de otimizacao de entrega).
//
// Valida cada valor que uma fixture sintetica insere contra as restricoes vigentes do schema --
// CHECK, NOT NULL, FOREIGN KEY, UNIQUE, enums -- e contra as predicacoes de RLS aplicaveis ao ator
// que a fixture usa. Executa local, sem rede.
//
// Toda reprovacao emite o objeto auto-descritivo do Bloco 5: nomeia a fixture, a coluna, o valor
// recusado, a restricao violada e a migration que a introduziu. Nenhum campo carrega segredo,
// credencial ou dado pessoal.

import { readFileSync } from "node:fs";
import path from "node:path";

import { CONTRACTED_TABLES, FIXTURES, KNOWN_DEFECTS } from "./fixtures.mjs";
import {
  formCaptureOriginAllowed,
  leadProvenanceFromForm,
  leadScopeAllowed,
  ORIGIN_MIGRATION,
  SCOPE_MIGRATION,
  staleAnchors,
} from "./guards.mjs";
import { auditConstraintCoverage, buildSchemaModel, getTable } from "./schema-model.mjs";
import { evaluateCheck, UnsupportedExpressionError } from "./sql-expression.mjs";

export const GATE = "cms-fixture-schema-contract";

/** Valor exibido na falha: recortado e sem qualquer conteudo de payload de contato. */
function present(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return `<${Array.isArray(value) ? "array" : "object"}>`;
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function failure({ cause, entity, observed, expected, remediation, fixture, table, column, migration }) {
  return {
    gate: GATE,
    cause,
    entity,
    observed,
    expected,
    remediation,
    fixture,
    table,
    column: column ?? null,
    migration: migration ?? null,
  };
}

/**
 * Linha efetiva: o que a fixture envia, mais o que default e gatilho preenchem.
 *
 * Para `cms_leads` a proveniencia de QA nao e negociavel: o gatilho de 0072 a copia do formulario e
 * descarta o que o cliente enviou. Modelar isso importa -- sem ele o contrato acusaria violacoes de
 * CHECK que o Postgres nunca levantaria, e um gate que reporta causa falsa deixa de ser confiavel.
 */
function effectiveRow(model, row, fixture) {
  const table = getTable(model, row.table);
  const result = { ...row.values, ...(row.derived ?? {}) };
  if (row.table === "public.cms_leads" && fixture?.form) {
    Object.assign(result, leadProvenanceFromForm(fixture.form));
  }
  if (!table) return result;
  for (const column of table.columns.values()) {
    if (!(column.name in result)) result[column.name] = null;
  }
  return result;
}

function checkNotNull(model, fixture, row, effective, failures) {
  const table = getTable(model, row.table);
  for (const column of table.columns.values()) {
    if (!column.notNull) continue;
    const supplied = column.name in row.values || column.name in (row.derived ?? {});
    if (supplied && effective[column.name] !== null && effective[column.name] !== undefined) continue;
    if (!supplied && column.hasDefault) continue;
    failures.push(
      failure({
        cause: "FIXTURE_COLUMN_NOT_NULL_VIOLATED",
        entity: `${row.table}.${column.name}`,
        observed: supplied ? "null" : "coluna nao enviada e sem default",
        expected: "valor nao nulo",
        remediation: `Enviar \`${column.name}\` na fixture \`${fixture.id}\` ou declarar quem o preenche em \`derived\`.`,
        fixture: fixture.id,
        table: row.table,
        column: column.name,
        migration: column.introducedBy,
      }),
    );
  }
}

function checkUnknownColumns(model, fixture, row, failures) {
  const table = getTable(model, row.table);
  for (const column of Object.keys(row.values)) {
    if (table.columns.has(column)) continue;
    failures.push(
      failure({
        cause: "FIXTURE_COLUMN_UNKNOWN",
        entity: `${row.table}.${column}`,
        observed: present(row.values[column]),
        expected: `coluna existente em ${row.table}`,
        remediation: `Remover \`${column}\` da fixture \`${fixture.id}\` ou confirmar a migration que a cria.`,
        fixture: fixture.id,
        table: row.table,
        column,
      }),
    );
  }
}

function checkConstraints(model, fixture, row, effective, failures) {
  const table = getTable(model, row.table);
  for (const constraint of table.constraints.values()) {
    if (constraint.kind !== "check") continue;
    let result;
    try {
      result = evaluateCheck(constraint.expression, effective);
    } catch (error) {
      if (!(error instanceof UnsupportedExpressionError)) throw error;
      failures.push(
        failure({
          cause: "CONTRACT_CONSTRAINT_NOT_COVERED",
          entity: `${row.table} :: ${constraint.name}`,
          observed: error.detail,
          expected: "expressao dentro da gramatica coberta pelo contrato",
          remediation:
            "Estender `scripts/qa/fixture-schema-contract/sql-expression.mjs` para cobrir a expressao " +
            "antes de aceitar a migration. Restricao nao avaliada nao pode ser aprovada por omissao.",
          fixture: fixture.id,
          table: row.table,
          migration: constraint.migration,
        }),
      );
      continue;
    }
    if (result !== false) continue;
    const columns = [...table.columns.keys()].filter((column) =>
      new RegExp(`\\b${column}\\b`).test(constraint.expression),
    );
    const column = constraint.columns[0] ?? columns[0] ?? null;
    failures.push(
      failure({
        cause: "FIXTURE_CHECK_CONSTRAINT_VIOLATED",
        entity: `${row.table} :: ${constraint.name}`,
        observed: columns.map((name) => `${name}=${present(effective[name])}`).join(", ") || "linha completa",
        expected: constraint.expression.replace(/\s+/g, " ").trim(),
        remediation: `Ajustar a fixture \`${fixture.id}\` ou atualizar a restricao em ${constraint.migration}.`,
        fixture: fixture.id,
        table: row.table,
        column,
        migration: constraint.migration,
      }),
    );
  }
}

function checkUniqueAndForeignKeys(model, fixture, failures) {
  const seen = new Map();
  for (const row of fixture.rows) {
    const effective = effectiveRow(model, row, fixture);
    const table = getTable(model, row.table);
    for (const constraint of table.constraints.values()) {
      if (constraint.kind !== "unique" && constraint.kind !== "primary key") continue;
      const values = constraint.columns.map((column) => effective[column]);
      if (values.some((value) => value === null || value === undefined)) continue;
      const identity = `${constraint.name}#${values.join("|")}`;
      if (seen.has(identity)) {
        failures.push(
          failure({
            cause: "FIXTURE_UNIQUE_CONSTRAINT_VIOLATED",
            entity: `${row.table} :: ${constraint.name}`,
            observed: constraint.columns
              .map((column, index) => `${column}=${present(values[index])}`)
              .join(", "),
            expected: "valor distinto dentro da propria fixture",
            remediation: `Diferenciar ${constraint.columns.join(", ")} entre as linhas da fixture \`${fixture.id}\`.`,
            fixture: fixture.id,
            table: row.table,
            column: constraint.columns[0],
            migration: constraint.migration,
          }),
        );
      }
      seen.set(identity, true);
    }
  }

  // FK interna a fixture: quando a linha referenciada e declarada aqui, o vinculo tem de fechar.
  const byTable = new Map();
  for (const row of fixture.rows) {
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push(effectiveRow(model, row, fixture));
  }
  for (const row of fixture.rows) {
    const effective = effectiveRow(model, row, fixture);
    const table = getTable(model, row.table);
    for (const constraint of table.constraints.values()) {
      if (constraint.kind !== "foreign key" || !constraint.references) continue;
      const target = byTable.get(constraint.references.table);
      if (!target) continue;
      const values = constraint.columns.map((column) => effective[column]);
      if (values.some((value) => value === null || value === undefined)) continue;
      const matched = target.some((candidate) =>
        constraint.references.columns.every((column, index) => candidate[column] === values[index]),
      );
      if (matched) continue;
      failures.push(
        failure({
          cause: "FIXTURE_FOREIGN_KEY_UNRESOLVED",
          entity: `${row.table} :: ${constraint.name}`,
          observed: constraint.columns
            .map((column, index) => `${column}=${present(values[index])}`)
            .join(", "),
          expected: `linha correspondente em ${constraint.references.table}(${constraint.references.columns.join(",")})`,
          remediation: `Declarar na fixture \`${fixture.id}\` a linha de ${constraint.references.table} que o vinculo exige.`,
          fixture: fixture.id,
          table: row.table,
          column: constraint.columns[0],
          migration: constraint.migration,
        }),
      );
    }
  }
}

/** Predicacoes que nao sao restricao declarativa: origem de 0084 e escopo de 0072. */
function checkGuards(fixture, row, failures) {
  if (row.table !== "public.cms_leads") return;
  const form = fixture.form;
  const lease = fixture.lease ?? null;
  const environment = fixture.environment;

  const origin = formCaptureOriginAllowed({
    form,
    formVersionId: row.values.form_version_id,
    origin: row.origin,
    lease,
    environment,
  });
  if (!origin.allowed) {
    failures.push(
      failure({
        cause: "FIXTURE_LEAD_ORIGIN_SCOPE_FORBIDDEN",
        entity: `${ORIGIN_MIGRATION} :: private.cms_form_capture_origin_allowed`,
        observed: `origin_source=${present(row.origin?.source)}, origin_path=${present(row.origin?.path)}`,
        expected: origin.cause,
        remediation:
          "Alinhar a origem da fixture ao formulario que recebe a captura, ou atualizar 0084 e a " +
          "fixture no mesmo commit.",
        fixture: fixture.id,
        table: row.table,
        column: "origin_source",
        migration: ORIGIN_MIGRATION,
      }),
    );
  }

  // Valor que a fixture envia e o gatilho descarta. Foi essa a armadilha da primeira tentativa de
  // corrigir o segundo defeito: declarar `qa_actor_id` no lead nao muda o que fica gravado, porque
  // 0072 copia do formulario. Uma fixture que confia nesse envio esta correta so na aparencia.
  const written = leadProvenanceFromForm(form);
  for (const column of Object.keys(written)) {
    if (!(column in row.values)) continue;
    if (row.values[column] === written[column]) continue;
    failures.push(
      failure({
        cause: "FIXTURE_VALUE_DISCARDED_BY_TRIGGER",
        entity: `${SCOPE_MIGRATION} :: cms_leads.${column}`,
        observed: `enviado=${present(row.values[column])}, gravado=${present(written[column])}`,
        expected: "nao enviar a coluna, ou possuir o formulario de onde 0072 copia a proveniencia",
        remediation:
          "0072 copia a proveniencia de QA do formulario e descarta o valor do cliente. Remover o " +
          "envio da fixture ou fazer o run possuir o formulario que recebe a captura.",
        fixture: fixture.id,
        table: row.table,
        column,
        migration: SCOPE_MIGRATION,
      }),
    );
  }

  const stored = { ...row.values, ...written };
  const scope = leadScopeAllowed({ form, lead: row.values, lease, environment });
  if (!scope.allowed) {
    failures.push(
      failure({
        cause: "FIXTURE_LEAD_SCOPE_UNREACHABLE",
        entity: `${SCOPE_MIGRATION} :: private.cms_lead_scope_allowed`,
        observed: `qa_actor_id gravado=${present(stored.qa_actor_id)}, qa_run_tag gravado=${present(stored.qa_run_tag)}`,
        expected: scope.cause,
        remediation:
          "Fazer o run possuir o formulario que captura, para que 0072 copie ao lead a proveniencia " +
          "do proprio run, ou atualizar 0072 e a fixture no mesmo commit.",
        fixture: fixture.id,
        table: row.table,
        column: "qa_actor_id",
        migration: SCOPE_MIGRATION,
      }),
    );
  }
}

/** Ancoras: prova de que o valor declarado ainda e o valor que a fonte da fixture usa. */
function checkAnchors(fixture, repositoryRoot, failures) {
  let source;
  try {
    source = readFileSync(path.join(repositoryRoot, fixture.source), "utf8");
  } catch {
    failures.push(
      failure({
        cause: "FIXTURE_SOURCE_UNREADABLE",
        entity: fixture.source,
        observed: "arquivo ausente",
        expected: "fonte da fixture legivel",
        remediation: `Corrigir o caminho declarado em \`${fixture.id}\`.`,
        fixture: fixture.id,
        table: null,
      }),
    );
    return;
  }
  for (const row of fixture.rows) {
    for (const anchor of row.anchors ?? []) {
      if (new RegExp(anchor.pattern).test(source)) continue;
      failures.push(
        failure({
          cause: "FIXTURE_DECLARATION_OUT_OF_SYNC",
          entity: `${fixture.source} :: ${anchor.describes}`,
          observed: "ancora nao encontrada na fonte",
          expected: anchor.pattern,
          remediation:
            "A fixture mudou sem atualizar a declaracao do contrato. Atualizar " +
            "`scripts/qa/fixture-schema-contract/fixtures.mjs` para o valor que a fonte usa hoje.",
          fixture: fixture.id,
          table: row.table,
          column: anchor.describes,
        }),
      );
    }
  }
}

/** Executa o contrato inteiro. Devolve as falhas em ordem estavel. */
export function runContract({ repositoryRoot = process.cwd(), fixtures = FIXTURES } = {}) {
  const model = buildSchemaModel({ repositoryRoot });
  const failures = [];

  for (const anchor of staleAnchors({ repositoryRoot })) {
    failures.push(
      failure({
        cause: "CONTRACT_GUARD_ANCHOR_STALE",
        entity: `${anchor.migration} :: ${anchor.id}`,
        observed: anchor.digest ?? "trecho ausente",
        expected: anchor.expected,
        remediation:
          "A migration mudou o trecho que a regra do contrato representa. Revisar a regra em " +
          "`scripts/qa/fixture-schema-contract/guards.mjs` e so entao atualizar o digest.",
        fixture: null,
        table: null,
        migration: anchor.migration,
      }),
    );
  }

  for (const missing of auditConstraintCoverage(model, CONTRACTED_TABLES)) {
    failures.push(
      failure({
        cause: "CONTRACT_CONSTRAINT_NOT_EXTRACTED",
        entity: `${missing.table} :: ${missing.constraint}`,
        observed: "restricao declarada na migration e ausente do modelo do contrato",
        expected: "restricao presente no modelo",
        remediation:
          "Estender `scripts/qa/fixture-schema-contract/schema-model.mjs` para extrair a restricao. " +
          "Restricao nao extraida nao pode ser aprovada por omissao.",
        fixture: null,
        table: missing.table,
        migration: missing.migration,
      }),
    );
  }

  for (const fixture of fixtures) {
    checkAnchors(fixture, repositoryRoot, failures);
    for (const row of fixture.rows) {
      if (!getTable(model, row.table)) {
        failures.push(
          failure({
            cause: "FIXTURE_TABLE_UNKNOWN",
            entity: row.table,
            observed: "tabela ausente do modelo",
            expected: "tabela criada por alguma migration",
            remediation: `Conferir o nome da tabela declarado na fixture \`${fixture.id}\`.`,
            fixture: fixture.id,
            table: row.table,
          }),
        );
        continue;
      }
      const effective = effectiveRow(model, row, fixture);
      checkUnknownColumns(model, fixture, row, failures);
      checkNotNull(model, fixture, row, effective, failures);
      checkConstraints(model, fixture, row, effective, failures);
      checkGuards(fixture, row, failures);
    }
    checkUniqueAndForeignKeys(model, fixture, failures);
  }

  return failures;
}

/** Executa o contrato sobre um defeito conhecido, isolando a linha que ele descreve. */
export function runKnownDefect(defect, { repositoryRoot = process.cwd() } = {}) {
  return runContract({
    repositoryRoot,
    fixtures: [
      {
        id: defect.id,
        source: null,
        environment: defect.environment,
        lease: defect.lease,
        form: defect.form,
        rows: [defect.row],
      },
    ],
  }).filter((entry) => entry.cause !== "FIXTURE_SOURCE_UNREADABLE");
}

export function formatFailure(entry) {
  return [
    `[${entry.gate}] ${entry.cause}`,
    `  fixture:     ${entry.fixture ?? "-"}`,
    `  entidade:    ${entry.entity}`,
    `  coluna:      ${entry.column ?? "-"}`,
    `  observado:   ${entry.observed}`,
    `  exigido:     ${entry.expected}`,
    `  migration:   ${entry.migration ?? "-"}`,
    `  remediacao:  ${entry.remediation}`,
  ].join("\n");
}

export { KNOWN_DEFECTS };
