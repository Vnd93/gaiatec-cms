// Guardas que nao sao restricao declarativa.
//
// Nem toda regra que recusa uma fixture e uma CHECK. As duas que consumiram seis candidatos sao
// funcoes `plpgsql`: a origem aceita por `0084` e o escopo de formulario e lead de `0072`. O
// avaliador de expressao nao alcanca `plpgsql`, entao aqui a regra e reimplementada em JavaScript.
//
// Reimplementacao sem trava deriva em silencio. Por isso cada guarda declara o **digest do trecho
// exato** da migration que ela representa. Se a migration mudar um byte naquele trecho, o contrato
// reprova com `CONTRACT_GUARD_ANCHOR_STALE` e exige revisao da regra antes de voltar a aprovar
// qualquer fixture. A trava e mecanica: a deriva fica barulhenta, nunca silenciosa.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const ORIGIN_MIGRATION = "0084_cms_lead_origin_form_binding.sql";
export const SCOPE_MIGRATION = "0072_cms_forms_leads_authoritative_scope.sql";

/** Recorta a regiao ancorada de uma migration entre dois marcadores literais. */
export function sliceAnchor(sql, { from, to }) {
  const start = sql.indexOf(from);
  if (start === -1) return null;
  const end = to ? sql.indexOf(to, start + from.length) : sql.length;
  if (end === -1) return null;
  return sql.slice(start, to ? end + to.length : end);
}

export function digestOf(text) {
  // Normaliza apenas espaco em branco: qualquer mudanca de conteudo muda o digest.
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim(), "utf8").digest("hex");
}

export const GUARD_ANCHORS = [
  {
    id: "origin-0084-cms_form_capture_origin_allowed",
    migration: ORIGIN_MIGRATION,
    from: "create or replace function private.cms_form_capture_origin_allowed(",
    to: "revoke all on function private.cms_projection_binds_exact_form(",
    digest: "c56502a6b198f612499f5dab217cf7234036e0c5102b555f1723807464ef1d24",
  },
  {
    id: "scope-0072-cms_form_scope_allowed",
    migration: SCOPE_MIGRATION,
    from: "create or replace function private.cms_form_public_allowed(",
    to: "create or replace function private.cms_lead_assignee_allowed(",
    digest: "500400dd6e1d3df5487c4739c0a6665e7b6917060a9730b6ea6f33d87606f9b7",
  },
  {
    id: "scope-0072-lead-provenance-copy",
    migration: SCOPE_MIGRATION,
    from: "    new.qa_actor_id := v_form.qa_actor_id;",
    to: "raise exception 'CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN' using errcode = '42501';",
    digest: "f1a51f6970a48f5d2dc4fb33c6092e9bcf0e7ea0cef87761d0f3e49dce2afdaf",
  },
];

/** Recalcula os digests das ancoras a partir das migrations atuais. */
export function computeAnchorDigests({ repositoryRoot = process.cwd() } = {}) {
  const computed = [];
  for (const anchor of GUARD_ANCHORS) {
    const sql = readFileSync(path.join(repositoryRoot, "supabase/migrations", anchor.migration), "utf8");
    const region = sliceAnchor(sql, anchor);
    computed.push({ id: anchor.id, migration: anchor.migration, digest: region ? digestOf(region) : null });
  }
  return computed;
}

/** Ancoras cujo trecho de migration mudou (ou sumiu) desde que a regra foi escrita. */
export function staleAnchors({ repositoryRoot = process.cwd() } = {}) {
  return computeAnchorDigests({ repositoryRoot })
    .map((computed) => {
      const declared = GUARD_ANCHORS.find((anchor) => anchor.id === computed.id);
      if (computed.digest === null)
        return { ...computed, expected: declared.digest, reason: "trecho ancorado nao encontrado" };
      if (computed.digest !== declared.digest)
        return { ...computed, expected: declared.digest, reason: "trecho ancorado mudou" };
      return null;
    })
    .filter(Boolean);
}

const SITE_SOURCES = ["site", "contact", "newsletter", "website"];
const ENVIRONMENTS = ["local", "staging", "production"];

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * `private.cms_form_public_allowed` de 0072, restrito ao que uma fixture pode apresentar.
 * Um formulario de QA so e publicamente alcancavel quando pertence ao ator que o criou e esse ator
 * detem lease ativa do mesmo run; um formulario corporativo, quando ninguem de QA o tocou.
 */
export function formPublicAllowed({ form, lease, environment }) {
  if (!ENVIRONMENTS.includes(environment)) return false;
  const corporate =
    form.qa_actor_id == null &&
    form.qa_run_tag == null &&
    form.qa_candidate_sha == null &&
    form.qa_environment == null;
  if (corporate)
    return lease == null || (lease.actorId !== form.created_by && lease.actorId !== form.updated_by);
  return (
    lease != null &&
    lease.status === "active" &&
    lease.actorId === form.qa_actor_id &&
    form.qa_actor_id === form.created_by &&
    form.qa_run_tag === lease.runTag &&
    form.qa_candidate_sha === lease.candidateSha &&
    form.qa_environment === lease.environment &&
    lease.environment === environment
  );
}

/**
 * `private.cms_form_capture_origin_allowed` de 0084.
 * Devolve `{ allowed, cause }`; `cause` nomeia o ramo exato que recusou a origem.
 */
export function formCaptureOriginAllowed({ form, formVersionId, origin, lease, environment }) {
  const reject = (cause) => ({ allowed: false, cause });
  if (!origin || typeof origin !== "object") return reject("origem nao e objeto");
  const { path: originPath, source, campaignId = null, productId = null } = origin;
  if (!nonEmpty(originPath) || !/^\//.test(originPath)) return reject("origin_path vazio ou fora de `^/`");
  if (!nonEmpty(source)) return reject("origin_source vazio");
  if (!ENVIRONMENTS.includes(environment))
    return reject(`ambiente \`${environment}\` fora de local/staging/production`);
  if ([campaignId, productId].filter((value) => value != null).length > 1)
    return reject("campanha e produto simultaneos");

  if (form.status !== "published" || form.active_version_id !== formVersionId)
    return reject("formulario nao publicado ou versao inativa");
  if (!formPublicAllowed({ form, lease, environment }))
    return reject("formulario fora do escopo publico de 0072");

  if (form.qa_actor_id == null) {
    if (source === "qa_fixture") return reject("origem `qa_fixture` recusada para formulario sem ator de QA");
    if (/^\/qa-cms-final\//.test(originPath) || /^\/campanhas\/qa-lead-qa-cms-final-/.test(originPath))
      return reject("rota reservada a fixtures de QA recusada para formulario sem ator de QA");
  } else {
    const runTag = String(form.qa_run_tag).toLowerCase();
    if (source === "qa_fixture") {
      if (campaignId != null || productId != null)
        return reject("origem `qa_fixture` nao aceita campanha nem produto");
      if (originPath !== `/qa-cms-final/${runTag}`)
        return reject(`origem \`qa_fixture\` so aceita a rota /qa-cms-final/${runTag}`);
    } else if (source !== "campaign" || campaignId == null) {
      return reject("formulario de QA so aceita `qa_fixture` na rota do run ou `campaign` com campanha");
    } else if (!new RegExp(`^/campanhas/qa-lead-${runTag}-[0-9a-f]{8}$`).test(originPath)) {
      return reject("rota de campanha fora do padrao do run");
    }
  }

  // A fixture sob contrato nao declara campanha nem produto, entao o ramo de projecao de 0084
  // (`cms_projection_binds_exact_form`) nao e alcancado. Se uma fixture passar a declarar um dos
  // dois, o contrato precisa recusar por falta de prova de vinculo com a projecao publicada.
  if (campaignId != null || productId != null)
    return reject("vinculo com a projecao publicada nao e verificavel localmente");

  if (form.qa_actor_id == null && !SITE_SOURCES.includes(source))
    return reject(`origin_source \`${source}\` fora do vocabulario fechado ${SITE_SOURCES.join(", ")}`);

  return { allowed: true, cause: null };
}

/**
 * Proveniencia de QA que o gatilho de 0072 grava no lead: ela e **copiada do formulario**, nunca
 * aceita do cliente. Uma fixture que declara `qa_actor_id` proprio nao muda o que fica gravado.
 */
export function leadProvenanceFromForm(form) {
  return {
    qa_actor_id: form.qa_actor_id ?? null,
    qa_run_tag: form.qa_run_tag ?? null,
    qa_candidate_sha: form.qa_candidate_sha ?? null,
    qa_environment: form.qa_environment ?? null,
  };
}

/**
 * `private.cms_lead_scope_allowed` de 0072, no recorte que uma fixture consegue apresentar.
 * Um chamador com lease de QA so alcanca o lead quando o formulario pertence a um ator do mesmo
 * run e o lead herdou dele a mesma proveniencia.
 */
export function leadScopeAllowed({ form, lead, lease, environment }) {
  const reject = (cause) => ({ allowed: false, cause });
  const stored = { ...lead, ...leadProvenanceFromForm(form) };

  if (lease == null) {
    const clean =
      stored.qa_actor_id == null &&
      stored.qa_run_tag == null &&
      stored.qa_candidate_sha == null &&
      stored.qa_environment == null;
    return clean
      ? { allowed: true, cause: null }
      : reject("lead com proveniencia de QA e chamador sem lease");
  }

  if (form.qa_actor_id == null)
    return reject("chamador com lease de QA nao alcanca formulario sem ator de QA (escopo de 0072)");
  if (form.qa_actor_id !== form.created_by)
    return reject("formulario de QA precisa ter sido criado pelo proprio ator de QA");
  if (form.qa_run_tag !== lease.runTag)
    return reject(`formulario do run \`${form.qa_run_tag}\` fora do run do chamador \`${lease.runTag}\``);
  if (form.qa_candidate_sha !== lease.candidateSha) return reject("formulario de outro SHA candidato");
  if (form.qa_environment !== lease.environment) return reject("formulario de outro ambiente");
  if (lease.status !== "active") return reject("lease do chamador nao esta ativa");
  if (lease.environment !== environment) return reject("lease de ambiente diferente do da captura");
  if (stored.qa_actor_id !== form.qa_actor_id || stored.qa_run_tag !== form.qa_run_tag)
    return reject("lead sem o vinculo de proveniencia que 0072 exige com o formulario");

  return { allowed: true, cause: null };
}
