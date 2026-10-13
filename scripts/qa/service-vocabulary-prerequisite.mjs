import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function buildServiceVocabularyPlan(runTag, actorId, candidateSha, optionId = randomUUID()) {
  if (
    typeof actorId !== "string" ||
    typeof optionId !== "string" ||
    typeof candidateSha !== "string" ||
    typeof runTag !== "string" ||
    !UUID.test(actorId) ||
    !UUID.test(optionId) ||
    !/^[0-9a-f]{40}$/.test(candidateSha) ||
    !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(runTag) ||
    !runTag.endsWith(`-${candidateSha.slice(0, 8)}`)
  )
    throw new Error("QA_CMS_SERVICE_PLAN_INVALID");
  const namespace = actorId.replaceAll("-", "").slice(0, 12);
  const slug = `${runTag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${namespace}-service-category`;
  const label = `${runTag} ${namespace} categoria-servico`;
  if (slug.length > 120 || label.length > 160) throw new Error("QA_CMS_SERVICE_PLAN_INVALID");
  return { status: "planned", runTag, candidateSha, namespace, optionId, slug, label };
}

export function validateServiceVocabularyPlan(plan, actorId, runTag, candidateSha) {
  try {
    if (!UUID.test(plan?.optionId ?? "")) return false;
    const expected = buildServiceVocabularyPlan(runTag, actorId, candidateSha, plan?.optionId);
    return (
      ["planned", "ready"].includes(plan?.status) &&
      Object.entries(expected).every(([key, value]) => key === "status" || plan[key] === value) &&
      (plan.status !== "ready" || (plan.controlledOptions === 1 && plan.scopeVerified === true))
    );
  } catch {
    return false;
  }
}

export async function provisionServiceVocabulary(actor, plan, { invokeCms, environment }) {
  if (
    environment !== "staging" ||
    typeof invokeCms !== "function" ||
    !validateServiceVocabularyPlan(plan, actor?.actorId, plan?.runTag, plan?.candidateSha)
  )
    throw new Error("QA_CMS_SERVICE_CONTEXT_INVALID");
  const list = async () => {
    const reply = await invokeCms(
      actor.token,
      "cms-controlled-vocabularies",
      { action: "list", entityType: "service", includeInactive: false },
      "QA_CMS_SERVICE_LIST_FAILED",
    );
    if (!Array.isArray(reply?.items)) throw new Error("QA_CMS_SERVICE_LIST_INVALID");
    const matches = reply.items.filter(
      (entry) => entry.list_key === "service.category" && entry.active === true,
    );
    if (matches.length !== 1 || !UUID.test(matches[0].id ?? "") || !Array.isArray(matches[0].options))
      throw new Error("QA_CMS_SERVICE_CONTAINER_UNAVAILABLE");
    return matches[0];
  };
  const container = await list();
  if (container.options.length !== 0) throw new Error("QA_CMS_SERVICE_SCOPE_NOT_EMPTY");
  const exact = (option) =>
    option?.id === plan.optionId &&
    option.slug === plan.slug &&
    option.label === plan.label &&
    option.active === true &&
    option.public_visible === false;
  try {
    const reply = await invokeCms(
      actor.token,
      "cms-controlled-vocabularies",
      {
        action: "upsert_option",
        option: {
          id: plan.optionId,
          listId: container.id,
          slug: plan.slug,
          label: plan.label,
          description: "Categoria sintetica temporaria da homologacao isolada",
          publicVisible: false,
          active: true,
          sortOrder: 9999,
        },
      },
      "QA_CMS_SERVICE_OPTION_FAILED",
    );
    if (reply?.optionId !== plan.optionId) throw new Error("QA_CMS_SERVICE_OPTION_FAILED");
  } catch {
    // No blind retry: only an exact authoritative reread can resolve an ambiguous write.
    const observed = await list();
    if (observed.options.length !== 1 || !exact(observed.options[0]))
      throw new Error("QA_CMS_SERVICE_OPTION_UNPROVEN");
  }
  const observed = await list();
  if (observed.id !== container.id || observed.options.length !== 1 || !exact(observed.options[0]))
    throw new Error("QA_CMS_SERVICE_SCOPE_UNPROVEN");
  return { ...plan, status: "ready", controlledOptions: 1, scopeVerified: true };
}
