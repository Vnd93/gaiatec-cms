// Modelo de schema extraido das migrations, na ordem em que o Postgres as aplica.
//
// O objetivo nao e reconstruir o catalogo inteiro: e conhecer, para cada tabela sob contrato,
// exatamente quais restricoes valem HOJE e **qual migration as introduziu ou apertou pela ultima
// vez**. E esse ultimo dado que permite a falha nomear a migration, em vez de mandar ler log.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIRECTORY = "supabase/migrations";

/** Divide um arquivo em statements respeitando string, identificador, comentario e corpo $$. */
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === ch && sql[end + 1] === ch) {
          end += 2;
          continue;
        }
        if (sql[end] === ch) {
          end += 1;
          break;
        }
        end += 1;
      }
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    const dollar = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i, i + 40));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Divide por virgulas de primeiro nivel, respeitando parenteses e strings. */
export function splitTopLevel(body, separator = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      let end = i + 1;
      while (end < body.length) {
        if (body[end] === ch && body[end + 1] === ch) {
          end += 2;
          continue;
        }
        if (body[end] === ch) {
          end += 1;
          break;
        }
        end += 1;
      }
      current += body.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Extrai o conteudo do parenteses que abre na posicao `start`. */
export function readBalanced(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      let end = i + 1;
      while (end < text.length) {
        if (text[end] === ch && text[end + 1] === ch) {
          end += 2;
          continue;
        }
        if (text[end] === ch) {
          end += 1;
          break;
        }
        end += 1;
      }
      i = end;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(start + 1, i), end: i + 1 };
    }
    i += 1;
  }
  return null;
}

function qualify(name) {
  const clean = name.trim().replaceAll('"', "");
  return clean.includes(".") ? clean : `public.${clean}`;
}

const COLUMN_KEYWORDS = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);

function parseColumnDefinition(definition, table, migration) {
  const match = /^("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+([\s\S]+)$/.exec(definition.trim());
  if (!match) return null;
  const name = match[1].replaceAll('"', "");
  if (COLUMN_KEYWORDS.has(name.toLowerCase())) return null;
  const rest = match[2];
  const constraints = [];
  const lowered = rest.toLowerCase();

  const notNull = /\bnot\s+null\b/.test(lowered);
  const hasDefault = /\bdefault\b/.test(lowered);
  const primaryKey = /\bprimary\s+key\b/.test(lowered);
  const unique = /\bunique\b/.test(lowered) && !/\breferences\b[\s\S]*\bunique\b/.test(lowered);

  let checkIndex = lowered.indexOf("check");
  while (checkIndex !== -1) {
    const open = rest.indexOf("(", checkIndex);
    const balanced = open === -1 ? null : readBalanced(rest, open);
    if (balanced) {
      constraints.push({
        kind: "check",
        name: `${table}.${name}#inline${constraints.length}`,
        table,
        columns: [name],
        expression: balanced.body.trim(),
        migration,
      });
    }
    checkIndex = lowered.indexOf("check", checkIndex + 5);
  }

  const references = /\breferences\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(([^)]*)\)/i.exec(rest);
  if (references) {
    constraints.push({
      kind: "foreign key",
      name: `${table}.${name}#fk`,
      table,
      columns: [name],
      references: {
        table: qualify(references[1]),
        columns: references[2].split(",").map((column) => column.trim().replaceAll('"', "")),
      },
      migration,
    });
  }
  if (unique) {
    constraints.push({
      kind: "unique",
      name: `${table}.${name}#unique`,
      table,
      columns: [name],
      migration,
    });
  }
  if (primaryKey) {
    constraints.push({
      kind: "primary key",
      name: `${table}#pk`,
      table,
      columns: [name],
      migration,
    });
  }

  const type = rest
    .replace(
      /\s+(not\s+null|null|primary\s+key|unique|default[\s\S]*|check[\s\S]*|references[\s\S]*|generated[\s\S]*)$/i,
      "",
    )
    .trim();

  return {
    column: { name, type, notNull, hasDefault, introducedBy: migration },
    constraints,
  };
}

function parseTableConstraint(definition, table, migration) {
  const text = definition.trim();
  const named = /^constraint\s+("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+([\s\S]+)$/i.exec(text);
  const name = named ? named[1].replaceAll('"', "") : null;
  const body = named ? named[2] : text;
  const lowered = body.toLowerCase();

  if (lowered.startsWith("check")) {
    const open = body.indexOf("(");
    const balanced = open === -1 ? null : readBalanced(body, open);
    if (!balanced) return null;
    return {
      kind: "check",
      name: name ?? `${table}#check@${migration}#${balanced.body.length}`,
      table,
      columns: [],
      expression: balanced.body.trim(),
      migration,
    };
  }
  if (lowered.startsWith("unique")) {
    const open = body.indexOf("(");
    const balanced = open === -1 ? null : readBalanced(body, open);
    if (!balanced) return null;
    const columns = splitTopLevel(balanced.body).map((column) => column.replaceAll('"', ""));
    return {
      kind: "unique",
      name: name ?? `${table}#unique(${columns.join(",")})`,
      table,
      columns,
      migration,
    };
  }
  if (lowered.startsWith("primary key")) {
    const open = body.indexOf("(");
    const balanced = open === -1 ? null : readBalanced(body, open);
    if (!balanced) return null;
    const columns = splitTopLevel(balanced.body).map((column) => column.replaceAll('"', ""));
    return { kind: "primary key", name: name ?? `${table}#pk`, table, columns, migration };
  }
  if (lowered.startsWith("foreign key")) {
    const open = body.indexOf("(");
    const balanced = open === -1 ? null : readBalanced(body, open);
    if (!balanced) return null;
    const columns = splitTopLevel(balanced.body).map((column) => column.replaceAll('"', ""));
    const references = /references\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(([^)]*)\)/i.exec(body.slice(balanced.end));
    return {
      kind: "foreign key",
      name: name ?? `${table}#fk(${columns.join(",")})`,
      table,
      columns,
      references: references
        ? {
            table: qualify(references[1]),
            columns: references[2].split(",").map((column) => column.trim().replaceAll('"', "")),
          }
        : null,
      migration,
    };
  }
  return null;
}

function ensureTable(model, name) {
  if (!model.tables.has(name)) {
    model.tables.set(name, { name, columns: new Map(), constraints: new Map() });
  }
  return model.tables.get(name);
}

function applyCreateTable(model, statement, migration) {
  const header = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][a-zA-Z0-9_."]*)\s*\(/i.exec(
    statement,
  );
  if (!header) return;
  const table = qualify(header[1]);
  const balanced = readBalanced(statement, statement.indexOf("(", header[0].length - 1));
  if (!balanced) return;
  const entry = ensureTable(model, table);
  entry.introducedBy ??= migration;
  for (const definition of splitTopLevel(balanced.body)) {
    const tableConstraint = parseTableConstraint(definition, table, migration);
    if (tableConstraint) {
      entry.constraints.set(tableConstraint.name, tableConstraint);
      continue;
    }
    const parsed = parseColumnDefinition(definition, table, migration);
    if (!parsed) continue;
    entry.columns.set(parsed.column.name, parsed.column);
    if (parsed.column.notNull) {
      entry.constraints.set(`${table}.${parsed.column.name}#notnull`, {
        kind: "not null",
        name: `${table}.${parsed.column.name}#notnull`,
        table,
        columns: [parsed.column.name],
        migration,
      });
    }
    for (const constraint of parsed.constraints) entry.constraints.set(constraint.name, constraint);
  }
}

function applyAlterTable(model, statement, migration) {
  const header = /^alter\s+table\s+(?:only\s+)?([a-zA-Z_][a-zA-Z0-9_."]*)\s+([\s\S]+)$/i.exec(statement);
  if (!header) return;
  const table = qualify(header[1]);
  const entry = ensureTable(model, table);
  for (const action of splitTopLevel(header[2])) {
    const lowered = action.toLowerCase();

    if (lowered.startsWith("add column")) {
      const definition = action.replace(/^add\s+column\s+(?:if\s+not\s+exists\s+)?/i, "");
      const parsed = parseColumnDefinition(definition, table, migration);
      if (!parsed) continue;
      entry.columns.set(parsed.column.name, parsed.column);
      if (parsed.column.notNull) {
        entry.constraints.set(`${table}.${parsed.column.name}#notnull`, {
          kind: "not null",
          name: `${table}.${parsed.column.name}#notnull`,
          table,
          columns: [parsed.column.name],
          migration,
        });
      }
      for (const constraint of parsed.constraints) entry.constraints.set(constraint.name, constraint);
      continue;
    }

    if (lowered.startsWith("add constraint")) {
      const constraint = parseTableConstraint(action.replace(/^add\s+/i, ""), table, migration);
      if (constraint) entry.constraints.set(constraint.name, constraint);
      continue;
    }
    if (/^add\s+(check|unique|primary\s+key|foreign\s+key)/i.test(action)) {
      const constraint = parseTableConstraint(action.replace(/^add\s+/i, ""), table, migration);
      if (constraint) entry.constraints.set(constraint.name, constraint);
      continue;
    }

    const dropped = /^drop\s+constraint\s+(?:if\s+exists\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)/i.exec(action);
    if (dropped) {
      entry.constraints.delete(dropped[1].replaceAll('"', ""));
      continue;
    }

    const setNotNull = /^alter\s+column\s+("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+set\s+not\s+null/i.exec(action);
    if (setNotNull) {
      const column = setNotNull[1].replaceAll('"', "");
      const existing = entry.columns.get(column);
      if (existing) existing.notNull = true;
      entry.constraints.set(`${table}.${column}#notnull`, {
        kind: "not null",
        name: `${table}.${column}#notnull`,
        table,
        columns: [column],
        migration,
      });
      continue;
    }

    const dropNotNull = /^alter\s+column\s+("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+drop\s+not\s+null/i.exec(action);
    if (dropNotNull) {
      const column = dropNotNull[1].replaceAll('"', "");
      const existing = entry.columns.get(column);
      if (existing) existing.notNull = false;
      entry.constraints.delete(`${table}.${column}#notnull`);
      continue;
    }

    const dropColumn = /^drop\s+column\s+(?:if\s+exists\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)/i.exec(action);
    if (dropColumn) {
      const column = dropColumn[1].replaceAll('"', "");
      entry.columns.delete(column);
      for (const [name, constraint] of entry.constraints) {
        if (constraint.columns?.includes(column)) entry.constraints.delete(name);
      }
    }
  }
}

function applyCreateType(model, statement, migration) {
  const header = /^create\s+type\s+([a-zA-Z_][a-zA-Z0-9_."]*)\s+as\s+enum\s*\(/i.exec(statement);
  if (!header) return;
  const balanced = readBalanced(statement, statement.indexOf("(", header[0].length - 1));
  if (!balanced) return;
  model.enums.set(qualify(header[1]), {
    name: qualify(header[1]),
    values: splitTopLevel(balanced.body).map((value) => value.trim().replace(/^'|'$/g, "")),
    migration,
  });
}

/** Le todas as migrations, na ordem lexicografica que o Postgres aplica, e devolve o modelo. */
export function buildSchemaModel({ repositoryRoot = process.cwd() } = {}) {
  const directory = path.join(repositoryRoot, MIGRATIONS_DIRECTORY);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const model = { tables: new Map(), enums: new Map(), migrations: files, statementsByMigration: new Map() };
  for (const file of files) {
    const sql = readFileSync(path.join(directory, file), "utf8");
    const statements = splitStatements(sql);
    model.statementsByMigration.set(file, statements);
    for (const statement of statements) {
      const lowered = statement.toLowerCase();
      if (lowered.startsWith("create table")) applyCreateTable(model, statement, file);
      else if (lowered.startsWith("alter table")) applyAlterTable(model, statement, file);
      else if (lowered.startsWith("create type")) applyCreateType(model, statement, file);
    }
  }
  return model;
}

export function getTable(model, name) {
  return model.tables.get(qualify(name)) ?? null;
}

export function constraintsFor(model, tableName) {
  const table = getTable(model, tableName);
  return table ? [...table.constraints.values()] : [];
}

/**
 * Prova de cobertura: toda restricao nomeada que as migrations declaram para as tabelas sob
 * contrato tem de estar no modelo. Uma restricao que o extrator nao capturou seria um furo
 * silencioso, e o contrato precisa reprova-la em vez de aprovar por omissao.
 */
export function auditConstraintCoverage(model, tableNames) {
  const wanted = new Set(tableNames.map((name) => qualify(name)));
  const missing = [];
  for (const [migration, statements] of model.statementsByMigration) {
    for (const statement of statements) {
      const header =
        /^alter\s+table\s+(?:only\s+)?([a-zA-Z_][a-zA-Z0-9_."]*)\s+add\s+constraint\s+("?[a-zA-Z_][a-zA-Z0-9_]*"?)/i.exec(
          statement,
        );
      if (!header) continue;
      const table = qualify(header[1]);
      if (!wanted.has(table)) continue;
      const name = header[2].replaceAll('"', "");
      if (!model.tables.get(table)?.constraints.has(name))
        missing.push({ migration, table, constraint: name });
    }
  }
  return missing;
}
