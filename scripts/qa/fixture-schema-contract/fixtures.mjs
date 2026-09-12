// Declaracao do que cada fixture sintetica insere.
//
// Uma declaracao solta deriva da fonte em silencio. Por isso cada valor literal carrega uma
// **ancora**: um trecho que precisa existir na fonte da fixture. Se o canario mudar o valor sem
// atualizar a declaracao, a ancora quebra e o contrato reprova antes de olhar qualquer restricao.
//
// Valores gerados em tempo de execucao (uuid, hash, timestamp) entram como amostras canonicas
// deterministicas: o contrato verifica o formato e o vocabulario, que e onde as restricoes deste
// schema mordem. Amostra e sempre marcada como tal, nunca apresentada como valor observado.

// SHA candidato e run tag canonicos do run G11 que produziu os dois defeitos de origem.
export const SAMPLE_CANDIDATE_SHA = "ff2238df23ba00854b9e9c401376b3edcdc93f46";
export const SAMPLE_RUN_TAG = "QA-CMS-FINAL-20260910-ff2238df";
const SUFFIX = "3f9c1d2ea7";
const NONCE = "9a1c4d7e";

const UUID = {
  operator: "11111111-1111-4111-8111-111111111111",
  reviewer: "22222222-2222-4222-8222-222222222222",
  form: "33333333-3333-4333-8333-333333333333",
  formVersion: "44444444-4444-4444-8444-444444444444",
  lead: "55555555-5555-4555-8555-555555555555",
  outbox: "66666666-6666-4666-8666-666666666666",
  idempotency: "77777777-7777-4777-8777-777777777777",
  correlation: "88888888-8888-4888-8888-888888888888",
  corporateForm: "99999999-9999-4999-8999-999999999999",
  corporateVersion: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  corporateAuthor: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  bridgeActor: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  bridgeForm: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  bridgeVersion: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

const SAMPLE_SHA256 = "a".repeat(64);
const SAMPLE_TIMESTAMP = "2026-09-10T21:00:00.000Z";
const FUTURE_TIMESTAMP = "2026-09-11T21:00:00.000Z";

const G11_CANARY = "scripts/ev2/phase11/staging-canary.mjs";
const PUBLIC_BRIDGE = "scripts/qa/cms-public-bridge-fixture.mjs";
// A fonte da fixture de entrega e a propria migration que define a forma da linha. Nao ha canario
// escrevendo no livro ainda; quando houver, a fonte passa a ser ele e as ancoras acompanham.
const EV2_DELIVERY_MIGRATION = "supabase/migrations/0093_cms_ev2_delivery_ledger.sql";

const G11_ORIGIN_PATH = `/qa-cms-final/${SAMPLE_RUN_TAG.toLowerCase()}`;

/** Lease de QA do run: e ela que define o ator, o run tag e o ambiente que a fixture usa. */
const G11_LEASE = {
  actorId: UUID.operator,
  runTag: SAMPLE_RUN_TAG,
  candidateSha: SAMPLE_CANDIDATE_SHA,
  environment: "staging",
  status: "active",
};

/** Formulario que o proprio run cria, versiona e publica antes de capturar. */
const G11_FORM = {
  id: UUID.form,
  form_key: `qa-g11-${SUFFIX}`,
  title: `Formulário sintético G11 ${SAMPLE_RUN_TAG}`,
  purpose: "Captura sintética exclusiva do canário EV2.11, retirada no encerramento do lease.",
  status: "published",
  active_version_id: UUID.formVersion,
  created_by: UUID.operator,
  updated_by: UUID.operator,
  qa_actor_id: UUID.operator,
  qa_run_tag: SAMPLE_RUN_TAG,
  qa_candidate_sha: SAMPLE_CANDIDATE_SHA,
  qa_environment: "staging",
};

export const FIXTURES = [
  {
    id: "g11-canary-synthetic-lead",
    description: "Lead sintetico do canario G11, capturado no formulario que o proprio run possui.",
    source: G11_CANARY,
    environment: "staging",
    lease: G11_LEASE,
    form: G11_FORM,
    rows: [
      {
        role: "form",
        table: "public.cms_form_definitions",
        values: {
          id: G11_FORM.id,
          form_key: G11_FORM.form_key,
          title: G11_FORM.title,
          purpose: G11_FORM.purpose,
          status: "published",
          active_version_id: G11_FORM.active_version_id,
          created_by: G11_FORM.created_by,
          updated_by: G11_FORM.updated_by,
        },
        // 0072 grava a proveniencia de QA a partir da lease ativa do ator que cria o formulario.
        derived: {
          qa_actor_id: G11_FORM.qa_actor_id,
          qa_run_tag: G11_FORM.qa_run_tag,
          qa_candidate_sha: G11_FORM.qa_candidate_sha,
          qa_environment: G11_FORM.qa_environment,
        },
        anchors: [
          { pattern: 'formKey: "qa-g11-" \\+ suffix,', describes: "form_key" },
          { pattern: 'action: "publish_form"', describes: "status" },
          { pattern: "form\\?\\.qa_actor_id === operator\\.id", describes: "qa_actor_id" },
          { pattern: "form\\?\\.qa_run_tag === qaRunTag", describes: "qa_run_tag" },
        ],
      },
      {
        role: "formVersion",
        table: "public.cms_form_versions",
        values: {
          id: UUID.formVersion,
          form_id: UUID.form,
          version: 1,
          definition: { fields: [], successMessage: "Captura sintética registrada.", submitLabel: "Enviar" },
          consent_text: "Consentimento exclusivamente sintético do canário G11.",
          consent_version: "g11-synthetic-v1",
          privacy_path: "/politica-de-privacidade",
          sla_minutes: 30,
          retention_days: 1,
          status: "published",
          reason: `Formulário sintético do canário G11 ${SAMPLE_RUN_TAG}`,
          created_by: UUID.operator,
          published_at: SAMPLE_TIMESTAMP,
        },
        anchors: [
          { pattern: "slaMinutes: 30,", describes: "sla_minutes" },
          { pattern: "retentionDays: 1,", describes: "retention_days" },
          { pattern: 'privacyPath: "/politica-de-privacidade",', describes: "privacy_path" },
          { pattern: 'consentVersion: "g11-synthetic-v1",', describes: "consent_version" },
        ],
      },
      {
        role: "lead",
        table: "public.cms_leads",
        values: {
          id: UUID.lead,
          reference_code: `LD-G11-${SUFFIX.toUpperCase()}`,
          form_id: UUID.form,
          form_version_id: UUID.formVersion,
          idempotency_key: UUID.idempotency,
          payload: { synthetic: true, contact: "g11@example.invalid" },
          origin_path: G11_ORIGIN_PATH,
          origin_source: "qa_fixture",
          utm: {},
          status: "new",
          sla_due_at: SAMPLE_TIMESTAMP,
          retention_until: FUTURE_TIMESTAMP,
        },
        // O gatilho de 0072 calcula o hash de captura e copia a proveniencia do formulario.
        derived: {
          capture_hash: SAMPLE_SHA256,
          qa_actor_id: G11_FORM.qa_actor_id,
          qa_run_tag: G11_FORM.qa_run_tag,
          qa_candidate_sha: G11_FORM.qa_candidate_sha,
          qa_environment: G11_FORM.qa_environment,
        },
        origin: { path: G11_ORIGIN_PATH, source: "qa_fixture", campaignId: null, productId: null },
        anchors: [
          {
            pattern: 'reference_code: "LD-G11-" \\+ suffix\\.toUpperCase\\(\\),',
            describes: "reference_code",
          },
          { pattern: "form_id: qaFormId,", describes: "form_id" },
          { pattern: "origin_path: qaFixtureOriginPath,", describes: "origin_path" },
          { pattern: 'origin_source: "qa_fixture",', describes: "origin_source" },
          {
            pattern: 'const qaFixtureOriginPath = "/qa-cms-final/" \\+ qaRunTag\\.toLowerCase\\(\\);',
            describes: "origin_path",
          },
          { pattern: 'status: "new",', describes: "status" },
        ],
      },
      {
        role: "consent",
        table: "public.cms_lead_consents",
        values: {
          lead_id: UUID.lead,
          accepted: true,
          consent_text: "Consentimento exclusivamente sintético do G11.",
          consent_version: "g11-synthetic-v1",
          policy_path: "/privacidade",
          evidence_hash: SAMPLE_SHA256,
          technical_evidence: { synthetic: true },
        },
        anchors: [
          { pattern: "accepted: true,", describes: "accepted" },
          { pattern: 'policy_path: "/privacidade",', describes: "policy_path" },
        ],
      },
      {
        role: "statusHistory",
        table: "public.cms_lead_status_history",
        values: {
          lead_id: UUID.lead,
          to_status: "new",
          reason: "Fixture sintética persistida antes da entrega",
        },
        anchors: [
          { pattern: 'to_status: "new", reason: "Fixture sintética persistida', describes: "reason" },
        ],
      },
      {
        role: "outbox",
        table: "public.cms_lead_outbox",
        values: {
          id: UUID.outbox,
          lead_id: UUID.lead,
          event_type: "lead_received",
          status: "processing",
          idempotency_key: UUID.correlation,
          attempts: 1,
          locked_at: SAMPLE_TIMESTAMP,
          correlation_id: UUID.correlation,
        },
        anchors: [
          { pattern: 'event_type: "lead_received",', describes: "event_type" },
          { pattern: 'status: "processing",', describes: "status" },
          { pattern: "attempts: 1,", describes: "attempts" },
        ],
      },
    ],
  },
  {
    id: "public-bridge-synthetic-form",
    description: "Formulario sintetico da ponte publica, inserido por SQL direto sob ator de QA proprio.",
    source: PUBLIC_BRIDGE,
    environment: "staging",
    lease: {
      actorId: UUID.bridgeActor,
      runTag: SAMPLE_RUN_TAG,
      candidateSha: SAMPLE_CANDIDATE_SHA,
      environment: "staging",
      status: "active",
    },
    form: {
      id: UUID.bridgeForm,
      form_key: `qa-bridge-ff2238df-${NONCE}`,
      status: "published",
      active_version_id: UUID.bridgeVersion,
      created_by: UUID.bridgeActor,
      updated_by: UUID.bridgeActor,
      qa_actor_id: UUID.bridgeActor,
      qa_run_tag: SAMPLE_RUN_TAG,
      qa_candidate_sha: SAMPLE_CANDIDATE_SHA,
      qa_environment: "staging",
    },
    rows: [
      {
        role: "form",
        table: "public.cms_form_definitions",
        values: {
          id: UUID.bridgeForm,
          form_key: `qa-bridge-ff2238df-${NONCE}`,
          title: "Formulário ponte QA ff2238df",
          purpose: "Captação sintética controlada para validar a ponte pública.",
          status: "published",
          active_version_id: UUID.bridgeVersion,
          created_by: UUID.bridgeActor,
          updated_by: UUID.bridgeActor,
        },
        derived: {
          qa_actor_id: UUID.bridgeActor,
          qa_run_tag: SAMPLE_RUN_TAG,
          qa_candidate_sha: SAMPLE_CANDIDATE_SHA,
          qa_environment: "staging",
        },
        anchors: [
          {
            pattern: "key: `qa-bridge-\\$\\{candidateSha\\.slice\\(0, 8\\)\\}-\\$\\{nonce\\}`",
            describes: "form_key",
          },
          {
            pattern: "formTitle: `Formulário ponte QA \\$\\{candidateSha\\.slice\\(0, 8\\)\\}`",
            describes: "title",
          },
          {
            pattern: "'Captação sintética controlada para validar a ponte pública\\.','draft'",
            describes: "purpose",
          },
        ],
      },
      {
        role: "formVersion",
        table: "public.cms_form_versions",
        values: {
          id: UUID.bridgeVersion,
          form_id: UUID.bridgeForm,
          version: 1,
          definition: { fields: [] },
          consent_text: "Autorizo exclusivamente o processamento desta submissão sintética.",
          consent_version: SAMPLE_RUN_TAG,
          privacy_path: "/politica-de-privacidade",
          sla_minutes: 60,
          retention_days: 1,
          status: "published",
          reason: "QA synthetic public bridge fixture",
          created_by: UUID.bridgeActor,
          published_at: SAMPLE_TIMESTAMP,
        },
        anchors: [
          {
            pattern: "'/politica-de-privacidade',60,1,'published','QA synthetic public bridge fixture'",
            describes: "sla_minutes",
          },
          {
            pattern: "'Autorizo exclusivamente o processamento desta submissão sintética\\.'",
            describes: "consent_text",
          },
        ],
      },
    ],
  },
  {
    id: "ev2-delivery-ledger-row",
    description:
      "Linha de entrega EV2: a forma que uma declaracao de entrega precisa ter para satisfazer as " +
      "restricoes da 0093. Nenhum canario escreve nesta tabela ainda — a fixture existe para que a " +
      "restricao seja reproduzivel sem banco, que e o motivo de o contrato existir.",
    source: EV2_DELIVERY_MIGRATION,
    environment: "staging",
    rows: [
      {
        role: "delivery",
        table: "private.cms_ev2_delivery_ledger",
        values: {
          id: UUID.correlation,
          flag_key: "ev2.draft_v2",
          environment: "staging",
          state: "delivered",
          reason: "Entrega declarada em homologacao antes da janela de 24 horas exigida em producao.",
          candidate_sha: SAMPLE_CANDIDATE_SHA,
          workflow_run_id: "34668856304",
          approval_record_sha256: SAMPLE_SHA256,
          idempotency_key: UUID.idempotency,
          correlation_id: UUID.correlation,
          review_due_at: FUTURE_TIMESTAMP,
        },
        anchors: [
          {
            pattern: "check \\(flag_key in \\('ev2\\.draft_v2', 'ev2\\.master_data', 'ev2\\.pim_v2'\\)\\)",
            describes: "flag_key",
          },
          { pattern: "check \\(state in \\('delivered', 'suspended'\\)\\)", describes: "state" },
          {
            pattern: "cms_ev2_delivery_ledger_revisao_em_producao",
            describes: "review_due_at",
          },
        ],
      },
    ],
  },
];

/**
 * Defeitos ja conhecidos, reproduzidos com os valores exatos que as fixtures usavam antes da
 * correcao. Cada caso declara qual restricao tem de recusa-lo e qual migration a introduziu: o
 * contrato falha se o defeito passar **e** se ele for recusado pela restricao errada.
 */
export const KNOWN_DEFECTS = [
  {
    id: "g11-lead-origin-refused-by-0084",
    description:
      "Origem `ev2-g11-canary` em /g11-synthetic, num formulario corporativo publicado: fora do " +
      "vocabulario fechado que 0084 aceita. Recusada com CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN antes de " +
      "qualquer verificacao do canario.",
    historicalSource: `${G11_CANARY} em fd63dd3^`,
    expect: {
      guard: "origin-0084",
      migration: "0084_cms_lead_origin_form_binding.sql",
      column: "origin_source",
    },
    environment: "staging",
    // O canario tomava o primeiro formulario corporativo publicado que encontrasse.
    form: {
      id: UUID.corporateForm,
      form_key: "contato-institucional",
      status: "published",
      active_version_id: UUID.corporateVersion,
      created_by: UUID.corporateAuthor,
      updated_by: UUID.corporateAuthor,
      qa_actor_id: null,
      qa_run_tag: null,
      qa_candidate_sha: null,
      qa_environment: null,
    },
    lease: G11_LEASE,
    row: {
      role: "lead",
      table: "public.cms_leads",
      values: {
        id: UUID.lead,
        reference_code: `LD-G11-${SUFFIX.toUpperCase()}`,
        form_id: UUID.corporateForm,
        form_version_id: UUID.corporateVersion,
        idempotency_key: UUID.idempotency,
        payload: { synthetic: true, contact: "g11@example.invalid" },
        origin_path: "/g11-synthetic",
        origin_source: "ev2-g11-canary",
        utm: {},
        status: "new",
        sla_due_at: SAMPLE_TIMESTAMP,
        retention_until: FUTURE_TIMESTAMP,
      },
      derived: { capture_hash: SAMPLE_SHA256 },
      origin: { path: "/g11-synthetic", source: "ev2-g11-canary", campaignId: null, productId: null },
    },
  },
  {
    id: "g11-lead-provenance-refused-by-0072",
    description:
      "Lead capturado num formulario corporativo enquanto o operador detem lease de QA. 0072 copia " +
      "do formulario a proveniencia do lead, e um formulario sem ator de QA nunca satisfaz o escopo " +
      "do chamador com lease: o proprio operador que criou a fixture nao a encontra, e reprocessar a " +
      "entrega responde CMS_LEAD_DELIVERY_NOT_FOUND e anonimizar responde CMS_LEAD_NOT_FOUND.",
    historicalSource: `${G11_CANARY} em c59232d^ e ff2238d^`,
    expect: {
      guard: "scope-0072",
      migration: "0072_cms_forms_leads_authoritative_scope.sql",
      column: "qa_actor_id",
    },
    environment: "staging",
    form: {
      id: UUID.corporateForm,
      form_key: "contato-institucional",
      status: "published",
      active_version_id: UUID.corporateVersion,
      created_by: UUID.corporateAuthor,
      updated_by: UUID.corporateAuthor,
      qa_actor_id: null,
      qa_run_tag: null,
      qa_candidate_sha: null,
      qa_environment: null,
    },
    lease: G11_LEASE,
    row: {
      role: "lead",
      table: "public.cms_leads",
      values: {
        id: UUID.lead,
        reference_code: `LD-G11-${SUFFIX.toUpperCase()}`,
        form_id: UUID.corporateForm,
        form_version_id: UUID.corporateVersion,
        idempotency_key: UUID.idempotency,
        payload: { synthetic: true, contact: "g11@example.invalid" },
        // Origem ja corrigida para uma que 0084 aceita: o que sobra e exatamente o segundo defeito.
        origin_path: "/g11-synthetic",
        origin_source: "site",
        utm: {},
        status: "new",
        // A fixture declarava o ator de QA, mas o gatilho de 0072 sobrescreve com o do formulario.
        qa_actor_id: UUID.operator,
        sla_due_at: SAMPLE_TIMESTAMP,
        retention_until: FUTURE_TIMESTAMP,
      },
      derived: { capture_hash: SAMPLE_SHA256 },
      origin: { path: "/g11-synthetic", source: "site", campaignId: null, productId: null },
    },
  },
];

/** Tabelas que o contrato cobre hoje. Serve tambem de prova de cobertura do extrator. */
export const CONTRACTED_TABLES = [
  "public.cms_form_definitions",
  "public.cms_form_versions",
  "public.cms_leads",
  "public.cms_lead_consents",
  "public.cms_lead_status_history",
  "public.cms_lead_outbox",
];
