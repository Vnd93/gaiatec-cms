// Avaliador da fracao de expressao SQL que as restricoes deste schema realmente usam.
//
// O contrato nao reimplementa o Postgres: ele interpreta a expressao literal que a migration
// declarou. Tudo que estiver fora da gramatica coberta levanta `UnsupportedExpressionError`, para
// que uma restricao nova apareca como falha explicita do contrato em vez de aprovacao silenciosa.
//
// A logica e de tres valores, como no Postgres: uma restricao CHECK e satisfeita quando avalia
// TRUE **ou** NULL, e violada apenas quando avalia FALSE.

export class UnsupportedExpressionError extends Error {
  constructor(detail, expression) {
    super(`SQL_EXPRESSION_NOT_COVERED: ${detail}`);
    this.name = "UnsupportedExpressionError";
    this.detail = detail;
    this.expression = expression;
  }
}

const KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "is",
  "null",
  "true",
  "false",
  "in",
  "between",
  "like",
  "ilike",
  "distinct",
  "from",
  "unknown",
]);

const SYMBOLS = [
  "::",
  "<>",
  "!=",
  "<=",
  ">=",
  "!~~",
  "!~",
  "||",
  "~~",
  "~",
  "=",
  "<",
  ">",
  "(",
  ")",
  ",",
  ".",
];

export function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'") {
      let value = "";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        value += sql[i];
        i += 1;
      }
      tokens.push({ type: "string", value });
      continue;
    }
    if (ch === '"') {
      const end = sql.indexOf('"', i + 1);
      if (end === -1) throw new UnsupportedExpressionError("identificador entre aspas nao fechado", sql);
      tokens.push({ type: "name", value: sql.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      let end = i;
      while (end < sql.length && /[0-9.]/.test(sql[end])) end += 1;
      tokens.push({ type: "number", value: Number(sql.slice(i, end)) });
      i = end;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let end = i;
      while (end < sql.length && /[a-zA-Z0-9_$]/.test(sql[end])) end += 1;
      const raw = sql.slice(i, end);
      const lower = raw.toLowerCase();
      tokens.push({
        type: KEYWORDS.has(lower) ? "keyword" : "name",
        value: KEYWORDS.has(lower) ? lower : raw,
      });
      i = end;
      continue;
    }
    const symbol = SYMBOLS.find((candidate) => sql.startsWith(candidate, i));
    if (!symbol) throw new UnsupportedExpressionError(`caractere inesperado ${JSON.stringify(ch)}`, sql);
    tokens.push({ type: "symbol", value: symbol });
    i += symbol.length;
  }
  return tokens;
}

// Precedencia crescente. `between`, `in`, `like` e `~` compartilham o nivel de comparacao.
const BINARY_PRECEDENCE = {
  or: 1,
  and: 2,
  "=": 4,
  "<>": 4,
  "!=": 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "~": 4,
  "!~": 4,
  "~~": 4,
  "!~~": 4,
  like: 4,
  ilike: 4,
  in: 4,
  between: 4,
  "||": 5,
};

class Parser {
  constructor(sql) {
    this.sql = sql;
    this.tokens = tokenize(sql);
    this.position = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }

  next() {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  expect(value) {
    const token = this.next();
    if (!token || token.value !== value)
      throw new UnsupportedExpressionError(`esperava ${JSON.stringify(value)}`, this.sql);
    return token;
  }

  parse() {
    const node = this.parseExpression(0);
    if (this.position !== this.tokens.length)
      throw new UnsupportedExpressionError("sobra de tokens apos a expressao", this.sql);
    return node;
  }

  parseExpression(minimumPrecedence) {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (!token) break;
      let operator = null;
      let negated = false;
      let consumed = 0;
      if (token.type === "keyword" && token.value === "not") {
        const after = this.peek(1);
        if (after && (after.value === "in" || after.value === "like" || after.value === "between")) {
          operator = after.value;
          negated = true;
          consumed = 2;
        }
      } else if (token.type === "keyword" && token.value === "is") {
        this.position += 1;
        left = this.parseIs(left);
        continue;
      } else if (BINARY_PRECEDENCE[token.value] !== undefined) {
        operator = token.value;
        consumed = 1;
      }
      if (operator === null) break;
      const precedence = BINARY_PRECEDENCE[operator];
      if (precedence < minimumPrecedence) break;
      this.position += consumed;
      if (operator === "between") {
        const low = this.parseExpression(BINARY_PRECEDENCE.and + 1);
        this.expect("and");
        const high = this.parseExpression(BINARY_PRECEDENCE.and + 1);
        left = { kind: "between", value: left, low, high, negated };
        continue;
      }
      if (operator === "in") {
        this.expect("(");
        const items = [];
        if (this.peek()?.value !== ")") {
          items.push(this.parseExpression(0));
          while (this.peek()?.value === ",") {
            this.position += 1;
            items.push(this.parseExpression(0));
          }
        }
        this.expect(")");
        left = { kind: "in", value: left, items, negated };
        continue;
      }
      const right = this.parseExpression(precedence + 1);
      left = { kind: "binary", operator, left, right, negated };
    }
    return left;
  }

  parseIs(left) {
    let negated = false;
    if (this.peek()?.value === "not") {
      negated = true;
      this.position += 1;
    }
    const token = this.next();
    if (!token) throw new UnsupportedExpressionError("`is` sem operando", this.sql);
    if (token.value === "null") return { kind: "isNull", value: left, negated };
    if (token.value === "true" || token.value === "false" || token.value === "unknown")
      return { kind: "isBoolean", value: left, expected: token.value, negated };
    if (token.value === "distinct") {
      this.expect("from");
      const right = this.parseExpression(BINARY_PRECEDENCE["="] + 1);
      return { kind: "isDistinct", left, right, negated };
    }
    throw new UnsupportedExpressionError(`\`is ${token.value}\` nao coberto`, this.sql);
  }

  parseUnary() {
    const token = this.peek();
    if (token && token.type === "keyword" && token.value === "not") {
      this.position += 1;
      return { kind: "not", value: this.parseExpression(3) };
    }
    return this.parsePostfix(this.parsePrimary());
  }

  parsePostfix(node) {
    let current = node;
    while (this.peek()?.value === "::") {
      this.position += 1;
      const type = this.next();
      if (!type) throw new UnsupportedExpressionError("cast sem tipo", this.sql);
      current = { kind: "cast", value: current, type: String(type.value).toLowerCase() };
    }
    return current;
  }

  parsePrimary() {
    const token = this.next();
    if (!token) throw new UnsupportedExpressionError("expressao vazia", this.sql);
    if (token.type === "string") return { kind: "literal", value: token.value };
    if (token.type === "number") return { kind: "literal", value: token.value };
    if (token.type === "keyword") {
      if (token.value === "null") return { kind: "literal", value: null };
      if (token.value === "true") return { kind: "literal", value: true };
      if (token.value === "false") return { kind: "literal", value: false };
      throw new UnsupportedExpressionError(`palavra-chave inesperada \`${token.value}\``, this.sql);
    }
    if (token.type === "symbol" && token.value === "(") {
      const items = [this.parseExpression(0)];
      while (this.peek()?.value === ",") {
        this.position += 1;
        items.push(this.parseExpression(0));
      }
      this.expect(")");
      return items.length === 1 ? items[0] : { kind: "row", items };
    }
    if (token.type === "name") {
      let name = token.value;
      // Nome qualificado: `tabela.coluna`. Só a última parte identifica a coluna da linha.
      while (this.peek()?.value === "." && this.peek(1)?.type === "name") {
        this.position += 1;
        name = this.next().value;
      }
      if (this.peek()?.value === "(") {
        this.position += 1;
        const args = [];
        if (this.peek()?.value !== ")") {
          args.push(this.parseExpression(0));
          while (this.peek()?.value === ",") {
            this.position += 1;
            args.push(this.parseExpression(0));
          }
        }
        this.expect(")");
        return { kind: "call", name: name.toLowerCase(), args };
      }
      return { kind: "column", name };
    }
    throw new UnsupportedExpressionError(`token inesperado ${JSON.stringify(token.value)}`, this.sql);
  }
}

export function parseSqlExpression(sql) {
  return new Parser(sql).parse();
}

function isNullish(value) {
  return value === null || value === undefined;
}

function toComparable(value) {
  if (value instanceof Date) return value.getTime();
  return value;
}

function compare(operator, left, right, expression) {
  if (isNullish(left) || isNullish(right)) return null;
  const a = toComparable(left);
  const b = toComparable(right);
  switch (operator) {
    case "=":
      return a === b;
    case "<>":
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    default:
      throw new UnsupportedExpressionError(`comparacao \`${operator}\` nao coberta`, expression);
  }
}

// `~` do Postgres e regex POSIX. As construcoes usadas neste schema (`^`, `$`, `[0-9a-f]`, `{n}`,
// `(?:...)`, `+`, `*`, `?`) tem o mesmo significado em RegExp de JavaScript.
function matchesRegex(value, pattern) {
  return new RegExp(pattern).test(value);
}

function likeToRegex(pattern) {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "%") out += "[\\s\\S]*";
    else if (ch === "_") out += "[\\s\\S]";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return `${out}$`;
}

function jsonbTypeOf(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return null;
}

const FUNCTIONS = {
  char_length: (args) => (isNullish(args[0]) ? null : String(args[0]).length),
  length: (args) => (isNullish(args[0]) ? null : String(args[0]).length),
  btrim: (args) => (isNullish(args[0]) ? null : String(args[0]).trim()),
  trim: (args) => (isNullish(args[0]) ? null : String(args[0]).trim()),
  lower: (args) => (isNullish(args[0]) ? null : String(args[0]).toLowerCase()),
  upper: (args) => (isNullish(args[0]) ? null : String(args[0]).toUpperCase()),
  left: (args) => (isNullish(args[0]) || isNullish(args[1]) ? null : String(args[0]).slice(0, args[1])),
  right: (args) => (isNullish(args[0]) || isNullish(args[1]) ? null : String(args[0]).slice(-args[1])),
  abs: (args) => (isNullish(args[0]) ? null : Math.abs(Number(args[0]))),
  coalesce: (args) => args.find((value) => !isNullish(value)) ?? null,
  nullif: (args) => (args[0] === args[1] ? null : args[0]),
  num_nonnulls: (args) => args.filter((value) => !isNullish(value)).length,
  num_nulls: (args) => args.filter((value) => isNullish(value)).length,
  jsonb_typeof: (args) => jsonbTypeOf(args[0]),
  json_typeof: (args) => jsonbTypeOf(args[0]),
  jsonb_array_length: (args) => (Array.isArray(args[0]) ? args[0].length : null),
};

export function evaluateSqlExpression(node, row, expression) {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "column": {
      if (!(node.name in row))
        throw new UnsupportedExpressionError(`coluna \`${node.name}\` ausente do contexto`, expression);
      return row[node.name] ?? null;
    }
    case "cast": {
      const value = evaluateSqlExpression(node.value, row, expression);
      if (isNullish(value)) return null;
      if (node.type === "text" || node.type === "uuid" || node.type === "citext") return String(value);
      if (node.type === "integer" || node.type === "int" || node.type === "bigint" || node.type === "numeric")
        return Number(value);
      if (node.type === "boolean") return Boolean(value);
      return value;
    }
    case "not": {
      const value = evaluateSqlExpression(node.value, row, expression);
      return isNullish(value) ? null : !value;
    }
    case "isNull": {
      const value = evaluateSqlExpression(node.value, row, expression);
      const result = isNullish(value);
      return node.negated ? !result : result;
    }
    case "isBoolean": {
      const value = evaluateSqlExpression(node.value, row, expression);
      const expected = node.expected === "unknown" ? null : node.expected === "true";
      const result = expected === null ? isNullish(value) : value === expected;
      return node.negated ? !result : result;
    }
    case "isDistinct": {
      const left = evaluateSqlExpression(node.left, row, expression);
      const right = evaluateSqlExpression(node.right, row, expression);
      const distinct =
        isNullish(left) || isNullish(right) ? isNullish(left) !== isNullish(right) : left !== right;
      return node.negated ? !distinct : distinct;
    }
    case "between": {
      const value = evaluateSqlExpression(node.value, row, expression);
      const low = evaluateSqlExpression(node.low, row, expression);
      const high = evaluateSqlExpression(node.high, row, expression);
      const lower = compare(">=", value, low, expression);
      const upper = compare("<=", value, high, expression);
      const result = lower === null || upper === null ? null : lower && upper;
      return node.negated && result !== null ? !result : result;
    }
    case "in": {
      const value = evaluateSqlExpression(node.value, row, expression);
      if (isNullish(value)) return null;
      let sawNull = false;
      for (const item of node.items) {
        const candidate = evaluateSqlExpression(item, row, expression);
        if (isNullish(candidate)) {
          sawNull = true;
          continue;
        }
        if (toComparable(candidate) === toComparable(value)) return !node.negated;
      }
      if (sawNull) return null;
      return node.negated;
    }
    case "row":
      return node.items.map((item) => evaluateSqlExpression(item, row, expression));
    case "call": {
      const handler = FUNCTIONS[node.name];
      if (!handler) throw new UnsupportedExpressionError(`funcao \`${node.name}\` nao coberta`, expression);
      return handler(node.args.map((arg) => evaluateSqlExpression(arg, row, expression)));
    }
    case "binary": {
      const { operator } = node;
      if (operator === "and" || operator === "or") {
        const left = evaluateSqlExpression(node.left, row, expression);
        const right = evaluateSqlExpression(node.right, row, expression);
        if (operator === "and") {
          if (left === false || right === false) return false;
          if (isNullish(left) || isNullish(right)) return null;
          return true;
        }
        if (left === true || right === true) return true;
        if (isNullish(left) || isNullish(right)) return null;
        return false;
      }
      const left = evaluateSqlExpression(node.left, row, expression);
      const right = evaluateSqlExpression(node.right, row, expression);
      if (operator === "||") {
        if (isNullish(left) || isNullish(right)) return null;
        return String(left) + String(right);
      }
      if (operator === "~" || operator === "!~") {
        if (isNullish(left) || isNullish(right)) return null;
        const matched = matchesRegex(String(left), String(right));
        return operator === "~" ? matched : !matched;
      }
      if (operator === "like" || operator === "ilike" || operator === "~~" || operator === "!~~") {
        if (isNullish(left) || isNullish(right)) return null;
        const flags = operator === "ilike" ? "i" : "";
        const matched = new RegExp(likeToRegex(String(right)), flags).test(String(left));
        const result = operator === "!~~" ? !matched : matched;
        return node.negated ? !result : result;
      }
      const result = compare(operator, left, right, expression);
      if (result === null) return null;
      return node.negated ? !result : result;
    }
    default:
      throw new UnsupportedExpressionError(`no \`${node.kind}\` nao coberto`, expression);
  }
}

/**
 * Avalia a expressao de uma restricao CHECK sobre uma linha.
 * Retorna `true`, `false` ou `null` (desconhecido), exatamente como o Postgres.
 * Uma restricao CHECK e violada apenas quando o resultado e `false`.
 */
export function evaluateCheck(expression, row) {
  return evaluateSqlExpression(parseSqlExpression(expression), row, expression);
}

export function checkIsSatisfied(expression, row) {
  return evaluateCheck(expression, row) !== false;
}
