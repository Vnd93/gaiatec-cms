import { describe, expect, it } from "vitest";

import {
  isAllowedThirdPartyConsoleOrigin,
  relevantConsoleErrors,
  THIRD_PARTY_CONSOLE_ORIGINS,
} from "../e2e/console-origins";

// A metade que resolve a flakiness é fácil; a que impede cegueira é a que importa. Erro de primeira
// parte tem de continuar reprovando, e origem parecida com a da lista não pode passar.
describe("filtro de erro de console por origem de terceiro", () => {
  it("não reprova o ruído do Turnstile, que chega em toda rota depois do load", () => {
    const turnstile = {
      text: "%c%d font-size:0;color:transparent NaN",
      url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/av0/rch/x/y",
    };
    expect(relevantConsoleErrors([turnstile])).toEqual([]);
  });

  it("continua reprovando erro de primeira parte", () => {
    const proprio = {
      text: "TypeError: undefined is not a function",
      url: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev/assets/index-abc123.js",
    };
    expect(relevantConsoleErrors([proprio])).toEqual([
      "TypeError: undefined is not a function @ https://ev2-g17-canary.gaiatec-cms-staging.pages.dev/assets/index-abc123.js",
    ]);
  });

  it("preserva o erro de primeira parte quando ele vem junto do ruído de terceiro", () => {
    const misturado = [
      { text: "ruído", url: "https://challenges.cloudflare.com/x" },
      { text: "falha real", url: "https://gaiatecsistemas.com.br/assets/app.js" },
      { text: "mais ruído", url: "https://challenges.cloudflare.com/y" },
    ];
    expect(relevantConsoleErrors(misturado)).toEqual([
      "falha real @ https://gaiatecsistemas.com.br/assets/app.js",
    ]);
  });

  it("não reprova por texto: a decisão é só pela origem", () => {
    // O mesmo texto do Turnstile, vindo do nosso próprio bundle, continua reprovando.
    const disfarcado = {
      text: "%c%d font-size:0;color:transparent NaN",
      url: "https://gaiatecsistemas.com.br/assets/app.js",
    };
    expect(relevantConsoleErrors([disfarcado])).toHaveLength(1);
  });

  it("compara origem inteira, então domínio parecido não passa", () => {
    for (const url of [
      "https://challenges.cloudflare.com.exemplo.test/x",
      "https://evil-challenges.cloudflare.com/x",
      "http://challenges.cloudflare.com/x",
      "https://cloudflare.com/x",
    ]) {
      expect(isAllowedThirdPartyConsoleOrigin(url), url).toBe(false);
    }
    expect(isAllowedThirdPartyConsoleOrigin("https://challenges.cloudflare.com/qualquer/caminho")).toBe(true);
  });

  it("erro sem URL é de primeira parte por omissão e continua reprovando", () => {
    expect(isAllowedThirdPartyConsoleOrigin(undefined)).toBe(false);
    expect(isAllowedThirdPartyConsoleOrigin("")).toBe(false);
    expect(isAllowedThirdPartyConsoleOrigin("não é uma url")).toBe(false);
    expect(relevantConsoleErrors([{ text: "erro sem origem", url: undefined }])).toEqual(["erro sem origem"]);
  });

  it("toda origem liberada é https e traz o motivo declarado", () => {
    expect(THIRD_PARTY_CONSOLE_ORIGINS.length).toBeGreaterThan(0);
    for (const entry of THIRD_PARTY_CONSOLE_ORIGINS) {
      expect(entry.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      expect(new URL(entry.origin).origin).toBe(entry.origin);
      expect(entry.motivo.length).toBeGreaterThan(40);
    }
  });
});
