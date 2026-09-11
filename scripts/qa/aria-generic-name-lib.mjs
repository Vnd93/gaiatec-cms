// Varredura de nome acessivel em elemento de role generico.
//
// `aria-label` e `aria-labelledby` nomeiam um elemento, e so valem onde existe papel que aceite
// nome. `div` e `span` tem role `generic`; `p` tem role `paragraph`. Nenhum dos tres aceita nome
// acessivel, entao a axe reprova com `aria-prohibited-attr`, impacto serious.
//
// A trava precisa ser mecanica porque a axe so enxerga o que a rota testada renderiza NAQUELE
// instante: no passe 5 ela pegou uma ocorrencia de dez, e as outras nove so apareceriam quando outro
// estado fosse renderizado. Varrer a fonte fecha a classe inteira, nao a instancia.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Elementos cujo role implicito nao aceita nome acessivel. */
export const GENERIC_ELEMENTS = ["div", "span", "p"];

const NAMING_ATTRIBUTES = ["aria-label", "aria-labelledby"];

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
      continue;
    }
    if (/\.(tsx|jsx)$/.test(entry)) files.push(full);
  }
  return files;
}

/**
 * Recorta as tags de abertura dos elementos genericos, inclusive as que quebram em varias linhas.
 * Um recorte por linha perderia justamente os casos longos, que sao os que costumam acumular ARIA.
 */
export function openingTags(source, element) {
  const tags = [];
  const pattern = new RegExp(`<${element}(?=[\\s/>])`, "g");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 0;
    let index = match.index;
    let end = -1;
    while (index < source.length) {
      const character = source[index];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === '"' || character === "'") {
        const close = source.indexOf(character, index + 1);
        index = close === -1 ? source.length : close;
      } else if (character === ">" && depth === 0) {
        end = index + 1;
        break;
      }
      index += 1;
    }
    if (end === -1) continue;
    const text = source.slice(match.index, end);
    tags.push({ text, index: match.index, line: source.slice(0, match.index).split("\n").length });
  }
  return tags;
}

/** `role` presente e com valor -- `role={undefined}` ou `role=""` nao conta como papel declarado. */
export function hasExplicitRole(tag) {
  const literal = /\brole\s*=\s*"([^"]*)"/.exec(tag);
  if (literal) return literal[1].trim().length > 0;
  const expression = /\brole\s*=\s*\{([^}]*)\}/.exec(tag);
  if (expression) return !/^\s*(undefined|null|""|''|false)\s*$/.test(expression[1]);
  return false;
}

export function namingAttribute(tag) {
  return NAMING_ATTRIBUTES.find((attribute) => new RegExp(`\\b${attribute}\\s*=`).test(tag)) ?? null;
}

/**
 * Ocorrencias de nome acessivel em elemento generico sem `role` explicito.
 * Devolve `{ file, line, element, attribute, tag }`, em ordem estavel.
 */
export function findGenericNamedElements({ repositoryRoot = process.cwd(), roots = ["src"] } = {}) {
  const findings = [];
  for (const root of roots) {
    const base = path.join(repositoryRoot, root);
    for (const file of walk(base)) {
      const source = readFileSync(file, "utf8");
      for (const element of GENERIC_ELEMENTS) {
        for (const tag of openingTags(source, element)) {
          const attribute = namingAttribute(tag.text);
          if (!attribute || hasExplicitRole(tag.text)) continue;
          findings.push({
            file: path.relative(repositoryRoot, file).replaceAll("\\", "/"),
            line: tag.line,
            element,
            attribute,
            tag: tag.text.replace(/\s+/g, " ").slice(0, 160),
          });
        }
      }
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function formatFinding(finding) {
  return [
    `[aria-prohibited-attr] ${finding.file}:${finding.line}`,
    `  elemento:  <${finding.element}> tem role generico e nao aceita nome acessivel`,
    `  atributo:  ${finding.attribute}`,
    `  trecho:    ${finding.tag}`,
    `  remediacao: declarar \`role\` que aceite nome (ex.: role="status" para carregamento com ` +
      `aria-busy), trocar por elemento com role implicito, ou remover o nome quando nao acrescenta.`,
  ].join("\n");
}
