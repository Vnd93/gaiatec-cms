// Objeto auto-descritivo de reprovacao de gate (Bloco 3, secao 5 da instrucao de otimizacao).
//
// Hoje os onze canarios emitem `{name, result, detail}` e, ao reprovar, lancam `name + ": " + detail`.
// Isso identifica o check, mas nao diz de que entidade se trata, qual era o valor exigido, nem qual e
// a acao minima suficiente — e obriga a abrir o log bruto para descobrir.
//
// Este emissor acrescenta os campos da secao 5 ao lado dos que ja existem, sem remover nenhum: um
// consumidor que le `name`, `result` ou `detail` continua funcionando exatamente como antes.
//
// LIMITE DECLARADO. `gate`, `cause`, `entity`, `observed`, `sha` e `runTag` sao derivados
// mecanicamente e nunca inventados. `expected` e `remediation` exigem autoria humana por check e so
// aparecem quando alguem os escreveu: preencher ~200 checks com texto generico produziria ruido com
// aparencia de cobertura, que e pior do que a ausencia honesta do campo.

// Formas de credencial que nunca podem viajar num relatorio, mesmo que alguem as coloque num detail
// por descuido. A lista e de formato, nao de nome: nomear campos nao pega valor colado no lugar
// errado.
const CREDENTIAL_SHAPES = [
  /\beyJ[A-Za-z0-9_-]{10,}/, // JWT
  /\bsbp_[A-Za-z0-9]{16,}/, // token de gestao Supabase
  /\bsb_secret_[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/, // token GitHub
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/, // endereco de e-mail
];

const SAFE_NAME = /^[a-z][a-z0-9_]*$/;

export function redactUnsafeDetail(detail) {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? null);
  if (typeof text !== "string") return text;
  return CREDENTIAL_SHAPES.some((shape) => shape.test(text))
    ? "[detalhe suprimido: formato de credencial]"
    : text;
}

export function causeCodeFor(phase, name) {
  return `CMS_${phase.toUpperCase()}_${name.toUpperCase()}`;
}

/**
 * Cria o `check` de um canario. A assinatura dos tres primeiros argumentos e identica a que os
 * canarios ja usam, para que a adocao seja uma troca de origem e nao uma reescrita de cada chamada.
 *
 * O quarto argumento e opcional e carrega o que so um humano sabe: o que era exigido e qual a
 * remediacao minima. Onde ele nao existe, o objeto sai sem esses campos em vez de invencao.
 */
export function createGateReporter({ phase, entity, sha, runTag, onEvent = console.log }) {
  if (!SAFE_NAME.test(phase ?? "")) throw new Error("GATE_REPORTER_PHASE_INVALID");
  if (!entity) throw new Error("GATE_REPORTER_ENTITY_REQUIRED");
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("GATE_REPORTER_SHA_INVALID");

  const checks = [];

  function check(name, condition, detail, guidance = {}) {
    if (!SAFE_NAME.test(name)) throw new Error("GATE_REPORTER_CHECK_NAME_INVALID");
    const result = condition ? "PASS" : "FAIL";
    const observed = redactUnsafeDetail(detail);

    // Os campos historicos vem primeiro e permanecem intactos: `name`, `result` e `detail` sao lidos
    // por consumidores que existem hoje, e o Bloco 5 acrescenta, nunca substitui.
    const event = {
      event: `${phase}.check`,
      name,
      result,
      detail: observed,
      gate: `${phase}.${name}`,
      sha,
      ...(runTag ? { runTag } : {}),
    };
    if (result === "FAIL") {
      event.cause = causeCodeFor(phase, name);
      event.entity = guidance.entity ?? entity;
      event.observed = observed;
      if (guidance.expected) event.expected = guidance.expected;
      if (guidance.remediation) event.remediation = guidance.remediation;
    }

    checks.push({ name, result, detail: observed });
    onEvent(JSON.stringify(event));

    // O codigo estavel entra na mensagem do erro tambem: quando o log e truncado, e ele que
    // sobrevive, e e por ele que a reprovacao se identifica sem leitura de log bruto.
    if (!condition) {
      const error = new Error(`${event.cause}: ${name}: ${observed}`);
      error.gateFailure = event;
      throw error;
    }
  }

  return { check, checks };
}
