const ids = { block: "11111111-1111-4111-8111-111111111111", point: "22222222-2222-4222-8222-222222222222" };
const common = {
  schemaVersion: 1,
  title: "Entidade sintética F5",
  summary: "Resumo sintético para teste campo consumidor.",
  blocks: [{ id: ids.block, type: "rich_text" as const, data: { text: "Texto sintético renderizável." } }],
  seo: {
    title: "Entidade sintética F5 | GAIATEC",
    description: "Descrição sintética da entidade da Fase 5 para teste de contrato e consumidor.",
    canonicalPath: "/sintetico-f5",
    indexable: false,
  },
  provenance: [
    {
      sourceKind: "owner_authored" as const,
      authorizationReference: "F5-TEST",
      authorizationDate: "2026-08-29",
      rightsScope: "Fixture descartável",
      rightsConfirmed: true as const,
      commercialOwner: "Owner sintético",
      technicalOwner: "Owner sintético",
      verifiedAt: "2026-08-29T12:00:00.000Z",
    },
  ],
  governanceState: "synthetic_test" as const,
  media: [],
  relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  search: { synonyms: ["sinônimo sintético"], keywords: ["f5"] },
  approval: {
    businessOwner: "Owner sintético",
    technicalReviewer: "Técnico sintético",
    commercialReviewer: "Comercial sintético",
    editorialReviewer: "Editorial sintético",
  },
  cta: { label: "CTA sintético", href: "/contato" },
};
export const industryPayload = {
  ...common,
  consumerId: "cms.industry.v1",
  contentType: "industry" as const,
  marketName: "Mercado sintético",
  challenges: ["Desafio visível"],
  evidence: ["Evidência visível"],
  processAreas: ["Processo visível"],
};
export const applicationPayload = {
  ...common,
  consumerId: "cms.application.v1",
  contentType: "application" as const,
  process: "Processo sintético visível",
  problem: "Problema sintético visível",
  benefits: ["Benefício visível"],
  points: [
    {
      id: ids.point,
      title: "Ponto visível",
      need: "Necessidade visível",
      variable: "Variável visível",
      function: "Função visível",
      technicalBenefit: "Benefício técnico visível",
      operationalBenefit: "Benefício operacional visível",
      productIds: [],
      serviceIds: [],
    },
  ],
};
export const solutionPayload = {
  ...common,
  consumerId: "cms.solution.v1",
  contentType: "solution" as const,
  problem: "Problema sintético visível",
  approach: "Abordagem sintética visível",
  benefits: ["Benefício visível"],
  components: ["Componente visível"],
  gasDetectionModel: "integrated_master_catalog" as const,
};
export const servicePayload = {
  ...common,
  consumerId: "cms.service.v1",
  contentType: "service" as const,
  approval: {
    operationalOwner: "Owner sintético",
    technicalReviewer: "Técnico sintético",
    commercialReviewer: "Comercial sintético",
    editorialReviewer: "Editorial sintético",
  },
  relations: { productIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  serviceKind: "Categoria sintética",
  scope: "Escopo visível",
  whenToHire: ["Cenário visível"],
  deliverables: ["Entregável visível"],
  prerequisites: ["Pré-requisito visível"],
  executionSteps: ["Etapa visível"],
};
