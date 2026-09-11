import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Contraste de texto do RDO, lido dos tokens do próprio CSS.
//
// Medição contra o alias publicado achou `color-contrast` serious no botão de entrar: branco sobre
// `--rdo-orange` dá 2.87:1, contra os 4.5:1 que a WCAG exige para texto normal. O hover herdava o
// mesmo defeito (`--rdo-orange-strong`, 3.73:1) e o StatusBadge também (3.40:1) — este último atrás
// de autenticação, onde o axe da suíte nunca chegaria. Foi o mesmo padrão das sete ocorrências de
// `aria-label` em src/admin: a varredura de uma rota pública não enxerga a classe inteira.
//
// Por isso a trava é de token, não de rota: ela cobre todo par declarado, independente de qual tela
// é renderizada em qual teste.

const CSS = readFileSync("src/app/rdo/rdo.css", "utf8");

function token(nome: string): string {
  const achado = new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(CSS);
  if (!achado) throw new Error(`token --${nome} não encontrado em src/app/rdo/rdo.css`);
  return achado[1].toLowerCase();
}

function canalLinear(valor: number): number {
  const c = valor / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

function contraste(a: string, b: string): number {
  const [alta, baixa] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (baixa + 0.05);
}

const BRANCO = "#ffffff";
const MINIMO_TEXTO_NORMAL = 4.5;

// Cada par é uma combinação que o código realmente renderiza com texto em cima.
const PARES = [
  { nome: "botão primário do RDO", fg: BRANCO, bg: () => token("rdo-orange-on-white") },
  { nome: "botão primário, hover", fg: BRANCO, bg: () => token("rdo-orange-on-white-hover") },
  {
    nome: "StatusBadge finalizado",
    fg: () => token("rdo-orange-ink-on-soft"),
    bg: () => token("rdo-orange-soft"),
  },
  { nome: "ação azul da marca", fg: BRANCO, bg: () => token("rdo-blue") },
  { nome: "ação azul, hover", fg: BRANCO, bg: () => token("rdo-blue-strong") },
];

const valor = (v: string | (() => string)) => (typeof v === "string" ? v : v());

describe("contraste de texto dos tokens do RDO", () => {
  for (const par of PARES) {
    it(`${par.nome} atinge ${MINIMO_TEXTO_NORMAL}:1`, () => {
      const fg = valor(par.fg);
      const bg = valor(par.bg);
      const razao = contraste(fg, bg);
      expect(
        razao,
        `${par.nome}: ${fg} sobre ${bg} dá ${razao.toFixed(2)}:1, abaixo de ${MINIMO_TEXTO_NORMAL}:1`,
      ).toBeGreaterThanOrEqual(MINIMO_TEXTO_NORMAL);
    });
  }

  it("o cálculo reproduz os valores medidos pelo axe no alias publicado", () => {
    // Âncora do método: se estes três mudarem, o cálculo deixou de bater com o que o axe faz.
    expect(contraste(BRANCO, "#f87010")).toBeCloseTo(2.87, 1);
    expect(contraste(BRANCO, "#d9600a")).toBeCloseTo(3.73, 1);
    expect(contraste("#d9600a", "#fff2e8")).toBeCloseTo(3.4, 1);
  });

  it("os tokens decorativos seguem existindo e não carregam texto no código", () => {
    // `--rdo-orange` continua servindo borda, foco, spinner e o ponto do StatusBadge. Se voltar a
    // ser fundo de texto branco, o teste de fonte abaixo reprova.
    expect(token("rdo-orange")).toBe("#f87010");
    for (const arquivo of [
      "src/app/rdo/pages/LoginPage.tsx",
      "src/app/rdo/pages/DefinirSenhaPage.tsx",
      "src/app/rdo/components/StatusBadge.tsx",
    ]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, `${arquivo} voltou a pôr texto branco sobre o laranja decorativo`).not.toMatch(
        /bg-\[var\(--rdo-orange\)\][^"]*text-white/,
      );
    }
  });
});
