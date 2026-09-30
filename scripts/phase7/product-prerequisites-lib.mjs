import { randomUUID } from "node:crypto";

export const PRODUCT_PREREQUISITE_FLAGS = Object.freeze(["ev2.master_data", "ev2.pim_v2"]);

const dimensions = Object.freeze({
  productCategory: "product.category",
  applicationMagnitude: "product.application_magnitude",
  technology: "product.technology",
  installationOperation: "product.installation_operation",
  monitoredElement: "product.monitored_element",
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildGovernedProductFields(ready) {
  if (
    ready?.status !== "ready" ||
    ready.catalogVerified !== true ||
    !/^QA-CMS-FINAL-\d{8}-[a-f0-9]{8}$/.test(ready.runTag ?? "") ||
    !/^[0-9a-f]{12}$/.test(ready.namespace ?? "") ||
    !uuid.test(ready.attributeDefinitionId ?? "") ||
    !uuid.test(ready.attributeSetId ?? "") ||
    !uuid.test(ready.attributeSetVersionId ?? "") ||
    ready.attributeKey !== `qa-${ready.runTag.slice(-8)}-${ready.namespace}` ||
    ready.controlledOptions !== 5 ||
    ready.masterEntities !== 5 ||
    ready.attributeDefinitions !== 1 ||
    ready.attributeSets !== 1 ||
    !Array.isArray(ready.dimensions) ||
    ready.dimensions.length !== 5 ||
    new Set(ready.dimensions.map((dimension) => dimension.field)).size !== 5 ||
    new Set(ready.dimensions.map((dimension) => dimension.optionId)).size !== 5 ||
    !Array.isArray(ready.masterEntityIds) ||
    ready.masterEntityIds.length !== 5 ||
    new Set(ready.masterEntityIds).size !== 5 ||
    !ready.masterEntityIds.every((id) => uuid.test(id)) ||
    !ready.dimensions.every(
      (dimension) =>
        dimensions[dimension.field] === dimension.listKey &&
        uuid.test(dimension.optionId ?? "") &&
        dimension.slug === `${ready.runTag.toLowerCase()}-${ready.namespace}-${dimension.suffix}` &&
        dimension.label === `${ready.runTag} ${ready.namespace} ${dimension.suffix}`,
    )
  )
    throw new Error("G7_PIM_VERIFIED_PREREQUISITES_REQUIRED");

  return {
    controlledClassification: Object.fromEntries(
      ready.dimensions.map((dimension) => [
        dimension.field,
        { id: dimension.optionId, slug: dimension.slug, label: dimension.label },
      ]),
    ),
    specifications: [
      {
        id: randomUUID(),
        definitionId: ready.attributeDefinitionId,
        key: ready.attributeKey,
        label: `${ready.namespace} validação técnica`,
        type: "boolean",
        value: true,
        scope: "product",
        sourceType: "manual",
        confidence: 1,
        homologated: true,
        required: true,
        filterable: false,
        comparable: true,
        searchable: false,
      },
    ],
  };
}
