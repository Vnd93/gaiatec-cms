// Origens de terceiro cujo ruído de console não pode reprovar um gate.
//
// O smoke de rotas exige zero erro de console. Contra o alias publicado, uma varredura local mediu
// erro em 23 de 23 rotas, todos vindos de `https://challenges.cloudflare.com` — o widget Turnstile,
// que emite literalmente:
//
//     %c%d font-size:0;color:transparent NaN
//
// O spec só reprovava em `/contato` porque o erro chega depois do evento `load`: com 1200 ms a mais
// de espera, ele aparece em toda rota. Ou seja, o veredito do gate dependia da latência do runner.
// É a mesma classe do `networkidle` — proxy não determinista decidindo aprovação — e é pior aqui,
// porque vermelho intermitente ensina a ignorar vermelho.
//
// A filtragem é por ORIGEM, nunca por texto: texto de terceiro muda sem aviso, origem é contrato.
// E a lista é explícita e nomeada, não padrão genérico: qualquer origem fora dela continua
// reprovando, e erro de primeira parte continua reprovando sempre.

export const THIRD_PARTY_CONSOLE_ORIGINS = [
  {
    origin: "https://challenges.cloudflare.com",
    motivo:
      "Cloudflare Turnstile. Emite `%c%d font-size:0;color:transparent NaN` como erro de console " +
      "em toda página que carrega o widget, depois do evento load. Ruído do fornecedor, não do CMS.",
  },
] as const;

const ALLOWED: ReadonlySet<string> = new Set<string>(
  THIRD_PARTY_CONSOLE_ORIGINS.map((entry) => entry.origin),
);

/**
 * Verdadeiro somente quando a URL tem origem exatamente igual a uma da lista.
 * Comparação por origem completa, não por substring: `challenges.cloudflare.com.exemplo.test`
 * não passa, e `http://` de uma origem declarada em `https://` também não.
 */
export function isAllowedThirdPartyConsoleOrigin(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return ALLOWED.has(new URL(url).origin);
  } catch {
    return false;
  }
}

export type ConsoleEntry = { text: string; url: string | undefined };

export function formatConsoleEntry(entry: ConsoleEntry): string {
  return entry.url ? `${entry.text} @ ${entry.url}` : entry.text;
}

/**
 * Erros que o gate deve considerar. Remove apenas o que veio de origem de terceiro declarada;
 * tudo que é de primeira parte, ou de origem não declarada, permanece e reprova.
 */
export function relevantConsoleErrors(entries: ConsoleEntry[]): string[] {
  return entries
    .filter((entry) => !isAllowedThirdPartyConsoleOrigin(entry.url))
    .map((entry) => formatConsoleEntry(entry));
}
