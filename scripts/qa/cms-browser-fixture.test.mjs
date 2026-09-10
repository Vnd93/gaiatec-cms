import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CmsContentPayloadSchema } from "../../src/shared/contracts/cms-content.ts";
import {
  bindUiCreatedStateToFixture,
  buildEditorialCleanupSql,
  buildFixtureAuditSql,
  buildOwnedContentCleanupSql,
  buildRecoveredFormRetirementSql,
  buildRouteDefinitions,
  capabilityManifestReady,
  recoverInterruptedUiResourceBinding,
  resolveTarget,
  retireRecoveredFormResources,
  validateScopedRoleCleanupAssignments,
  validateFixtureState,
} from "./cms-browser-fixture.mjs";

const source = readFileSync(new URL("./cms-browser-fixture.mjs", import.meta.url), "utf8");
const finalCoverageSource = readFileSync(
  new URL("../../tests/e2e/cms-final-coverage.spec.ts", import.meta.url),
  "utf8",
);
const watchdogMigration = readFileSync(
  new URL("../../supabase/migrations/0061_cms_qa_actor_lease_watchdog.sql", import.meta.url),
  "utf8",
);
const leaseWindowMigration = readFileSync(
  new URL("../../supabase/migrations/0091_cms_qa_actor_lease_window.sql", import.meta.url),
  "utf8",
);
const stagingWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
);
const productionWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);
const sha = "a".repeat(40);
const runTag = "QA-CMS-FINAL-20260907-aaaaaaaa";
const featureKeys = [
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
  "ev2.system_assurance",
];

function createAdminMock(initialTables) {
  const tables = structuredClone(initialTables);
  const mutations = [];

  class Query {
    constructor(table) {
      this.table = table;
      this.action = "select";
      this.value = null;
      this.filters = [];
    }

    select() {
      return this;
    }

    update(value) {
      this.action = "update";
      this.value = value;
      return this;
    }

    insert(value) {
      this.action = "insert";
      this.value = value;
      return this;
    }

    eq(column, value) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    neq(column, value) {
      this.filters.push((row) => row[column] !== value);
      return this;
    }

    like(column, value) {
      const prefix = value.endsWith("%") ? value.slice(0, -1) : value;
      this.filters.push((row) =>
        value.endsWith("%") ? String(row[column] ?? "").startsWith(prefix) : row[column] === value,
      );
      return this;
    }

    async execute() {
      const rows = tables[this.table] ?? [];
      const matches = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.action === "select") return { data: structuredClone(matches), error: null };
      if (this.action === "update") {
        for (const row of matches) Object.assign(row, structuredClone(this.value));
        mutations.push({ table: this.table, action: "update", count: matches.length });
        return { data: null, error: null };
      }
      const inserted = Array.isArray(this.value) ? this.value : [this.value];
      rows.push(...structuredClone(inserted));
      tables[this.table] = rows;
      mutations.push({ table: this.table, action: "insert", count: inserted.length });
      return { data: null, error: null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    admin: { from: (table) => new Query(table) },
    mutations,
    tables,
  };
}

test("the staging and production targets are exact and production is literally SHA-authorized", () => {
  assert.deepEqual(resolveTarget("staging", sha), {
    environment: "staging",
    ref: "glcqsosxwgmlhzgcsnzv",
    name: "GAIATEC CMS Staging",
    region: "us-east-2",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  });
  assert.throws(() => resolveTarget("production", sha), /QA_CMS_FIXTURE_PRODUCTION_AUTHORIZATION_REQUIRED/);
  assert.throws(
    () => resolveTarget("production", sha, `AUTORIZO-G12-PRODUCAO:${"b".repeat(40)}`),
    /QA_CMS_FIXTURE_PRODUCTION_AUTHORIZATION_REQUIRED/,
  );
  assert.deepEqual(resolveTarget("production", sha, `AUTORIZO-G12-PRODUCAO:${sha}`), {
    environment: "production",
    ref: "chfuhctnhqgyjowkvllv",
    name: "GAIATEC CMS Production",
    origin: "https://gaiatecsistemas.com.br",
  });
  assert.throws(() => resolveTarget("local", sha), /QA_CMS_FIXTURE_ENVIRONMENT_INVALID/);
  assert.throws(() => resolveTarget("staging", "short"), /QA_CMS_FIXTURE_SHA_INVALID/);
});

test("all eight route payloads satisfy the real strict CMS content contract", () => {
  const definitions = buildRouteDefinitions(runTag, "deadbeef");
  assert.equal(definitions.length, 8);
  assert.deepEqual(
    definitions.map(({ contentType }) => contentType),
    ["post", "product", "service", "industry", "application", "solution", "page", "campaign"],
  );
  assert.equal(new Set(definitions.map(({ slug }) => slug)).size, 8);
  for (const definition of definitions) {
    assert.equal(CmsContentPayloadSchema.parse(definition.payload).contentType, definition.contentType);
    assert.equal(definition.payload.seo.indexable, false);
    const keys = Object.keys(definition.payload.blocks[0]).sort();
    if (["page", "campaign"].includes(definition.contentType))
      assert.deepEqual(keys, ["data", "hidden", "id", "tone", "type", "width"]);
    else assert.deepEqual(keys, ["data", "id", "type"]);
  }
});

test("the capability gate requires a complete ready override manifest", () => {
  const evaluatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    status: "ready",
    environment: "production",
    siteKey: "main",
    evaluatedAt,
    capabilities: Object.fromEntries(
      featureKeys.map((key) => [
        key,
        { schemaVersion: 1, key, enabled: true, source: "override", evaluatedAt },
      ]),
    ),
  };
  assert.equal(capabilityManifestReady(manifest, "production"), true);
  assert.equal(capabilityManifestReady({ ...manifest, status: "unavailable" }, "production"), false);
  manifest.capabilities[featureKeys[0]].enabled = false;
  assert.equal(capabilityManifestReady(manifest, "production"), false);
});

test("actor-only fixture state is bound to environment, project, SHA and synthetic lease", () => {
  const state = {
    schemaVersion: 1,
    environment: "staging",
    projectRef: "glcqsosxwgmlhzgcsnzv",
    expectedSha: sha,
    runTag,
    status: "ready",
    setupAudited: true,
    authLifecycleEnabled: false,
    actorId: "10000000-0000-4000-8000-000000000001",
    managedActorId: "10000000-0000-4000-8000-000000000002",
    existingIdentityActorId: "10000000-0000-4000-8000-000000000007",
    recoveryActorId: null,
    invitedActorId: null,
    leadId: null,
    leadOutboxId: null,
    leadFormId: null,
    leadCampaignId: null,
    leadReference: null,
    leadStatus: null,
    leadCampaignPath: null,
    itemIds: [],
    terminalArchivedTombstone: null,
    documentIds: [],
  };
  assert.equal(validateFixtureState(state, "staging", state.projectRef, sha), state);
  assert.throws(
    () => validateFixtureState({ ...state, environment: "production" }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  const uiRegistered = {
    ...state,
    leadFormId: "10000000-0000-4000-8000-000000000005",
    leadCampaignId: "10000000-0000-4000-8000-000000000006",
    leadReference: "LD-QATEST",
    leadStatus: "responded",
    leadCampaignPath: "/campanhas/qa-lead-qa-cms-final-20260907-aaaaaaaa-deadbeef",
    itemIds: Array.from(
      { length: 8 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ),
  };
  assert.equal(validateFixtureState(uiRegistered, "staging", state.projectRef, sha), uiRegistered);
  const uiState = {
    schemaVersion: 1,
    status: "ready",
    environment: "staging",
    candidateSha: sha,
    runTag,
    lease: {
      actorId: state.actorId,
      source: "cms-browser-fixture",
      resourceIdsCaptured: true,
    },
    ids: {
      contentId: "20000000-0000-4000-8000-000000000001",
      productId: "20000000-0000-4000-8000-000000000002",
      serviceId: "20000000-0000-4000-8000-000000000003",
      industryId: "20000000-0000-4000-8000-000000000004",
      applicationId: "20000000-0000-4000-8000-000000000005",
      solutionId: "20000000-0000-4000-8000-000000000006",
      pageId: "20000000-0000-4000-8000-000000000007",
      campaignId: "20000000-0000-4000-8000-000000000008",
    },
    form: {
      id: "10000000-0000-4000-8000-000000000005",
      versionId: "10000000-0000-4000-8000-000000000006",
      key: `qa-ops-${runTag.toLowerCase()}-deadbeef`,
      status: "published",
    },
    lead: {
      reference: "LD-QATEST",
      status: "responded",
      campaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    },
  };
  const bound = bindUiCreatedStateToFixture(state, uiState, "staging", sha);
  assert.deepEqual(bound.itemIds, Object.values(uiState.ids));
  assert.equal(bound.leadFormId, uiState.form.id);
  assert.equal(bound.leadCampaignId, uiState.ids.campaignId);
  assert.equal(bound.leadStatus, "responded");
  assert.deepEqual(bound.terminalArchivedTombstone, { itemId: uiState.ids.pageId });
  assert.throws(
    () =>
      validateFixtureState(
        {
          ...bound,
          terminalArchivedTombstone: {
            itemId: uiState.ids.pageId,
            path: "/qa-cms-final-gone-aaaaaaaa",
          },
        },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () =>
      bindUiCreatedStateToFixture(
        state,
        { ...uiState, lease: { ...uiState.lease, actorId: state.managedActorId } },
        "staging",
        sha,
      ),
    /QA_CMS_FIXTURE_UI_STATE_REFUSED/,
  );
  assert.throws(
    () => validateFixtureState({ ...uiRegistered, leadReference: null }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () => validateFixtureState({ ...state, existingIdentityActorId: null }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () =>
      validateFixtureState(
        {
          ...state,
          authLifecycleEnabled: true,
          recoveryActorId: null,
          invitedActorId: null,
        },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.equal(
    validateFixtureState(
      {
        ...state,
        authLifecycleEnabled: true,
        recoveryActorId: "10000000-0000-4000-8000-000000000008",
        invitedActorId: "10000000-0000-4000-8000-000000000009",
      },
      "staging",
      state.projectRef,
      sha,
    ).authLifecycleEnabled,
    true,
  );
  assert.throws(
    () =>
      validateFixtureState(
        { ...state, itemIds: ["20000000-0000-4000-8000-000000000002", "not-a-uuid"] },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.equal(
    validateFixtureState(
      { ...state, leadFormId: "10000000-0000-4000-8000-000000000005" },
      "staging",
      state.projectRef,
      sha,
    ).leadFormId,
    "10000000-0000-4000-8000-000000000005",
  );
});

test("interrupted UI cleanup rediscovers and neutralizes the exact actor-owned form, lead and outbox", async () => {
  const actorId = "10000000-0000-4000-8000-000000000001";
  const formId = "10000000-0000-4000-8000-000000000005";
  const versionId = "10000000-0000-4000-8000-000000000006";
  const leadId = "10000000-0000-4000-8000-000000000007";
  const campaignId = "20000000-0000-4000-8000-000000000008";
  const outboxOneId = "10000000-0000-4000-8000-000000000008";
  const outboxTwoId = "10000000-0000-4000-8000-000000000009";
  const campaignPath = `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`;
  const qaProvenance = {
    qa_actor_id: actorId,
    qa_run_tag: runTag,
    qa_candidate_sha: sha,
    qa_environment: "staging",
  };
  const state = {
    schemaVersion: 1,
    environment: "staging",
    projectRef: "glcqsosxwgmlhzgcsnzv",
    expectedSha: sha,
    runTag,
    status: "ready",
    setupAudited: true,
    authLifecycleEnabled: false,
    actorId,
    managedActorId: "10000000-0000-4000-8000-000000000002",
    existingIdentityActorId: "10000000-0000-4000-8000-000000000003",
    recoveryActorId: null,
    invitedActorId: null,
    leadId: null,
    leadOutboxId: null,
    leadFormId: null,
    leadCampaignId: null,
    leadReference: null,
    leadStatus: null,
    leadCampaignPath: null,
    itemIds: [],
    terminalArchivedTombstone: null,
    documentIds: [],
  };
  const mock = createAdminMock({
    cms_form_definitions: [
      {
        id: formId,
        form_key: `qa-ops-${runTag.toLowerCase()}-deadbeef`,
        status: "published",
        active_version_id: versionId,
        created_by: actorId,
        updated_by: actorId,
        ...qaProvenance,
      },
    ],
    cms_form_versions: [{ id: versionId, form_id: formId, status: "published", created_by: actorId }],
    cms_leads: [
      {
        id: leadId,
        reference_code: "LD-QAINTERRUPTED",
        form_id: formId,
        form_version_id: versionId,
        status: "responded",
        anonymized_at: null,
        origin_path: campaignPath,
        origin_source: "campaign",
        campaign_id: campaignId,
        product_id: null,
        payload: { email: "synthetic@example.invalid" },
        utm: { source: "qa" },
        ...qaProvenance,
      },
    ],
    cms_content_items: [
      {
        id: campaignId,
        content_type: "campaign",
        slug: campaignPath.slice("/campanhas/".length),
        workflow_status: "published",
        created_by: actorId,
        updated_by: actorId,
      },
    ],
    cms_content_drafts: [
      {
        item_id: campaignId,
        updated_by: actorId,
        payload: {
          contentType: "campaign",
          title: `${runTag} CAMPANHA`,
          route: { path: campaignPath },
        },
      },
    ],
    cms_lead_outbox: [
      { id: outboxOneId, lead_id: leadId, status: "failed" },
      { id: outboxTwoId, lead_id: leadId, status: "pending" },
    ],
    cms_lead_status_history: [],
  });
  let persisted = 0;

  const recovered = await recoverInterruptedUiResourceBinding(state, mock.admin, {
    environment: "staging",
    candidateSha: sha,
    persist: () => {
      persisted += 1;
    },
  });

  assert.equal(recovered.leadFormId, formId);
  assert.equal(recovered.leadId, leadId);
  assert.equal(recovered.leadCampaignId, campaignId);
  assert.equal(recovered.leadReference, "LD-QAINTERRUPTED");
  assert.equal(recovered.leadCampaignPath, campaignPath);
  assert.equal(recovered.leadOutboxId, null, "multiple valid events are cleaned by lead, not guessed");
  assert.equal(persisted, 1);
  assert.equal(mock.tables.cms_leads.filter((lead) => !lead.anonymized_at).length, 1);
  assert.equal(mock.tables.cms_lead_outbox.filter((entry) => entry.status !== "completed").length, 2);
  assert.equal(mock.tables.cms_form_definitions.filter((form) => form.status !== "retired").length, 1);

  const now = "2026-09-08T12:00:00.000Z";
  let retirementSql = "";
  await retireRecoveredFormResources(recovered, async (sql) => {
    retirementSql = sql;
    for (const version of mock.tables.cms_form_versions) {
      if (version.form_id === recovered.leadFormId) version.status = "retired";
    }
    const form = mock.tables.cms_form_definitions.find(({ id }) => id === recovered.leadFormId);
    Object.assign(form, { status: "retired", active_version_id: null, updated_by: recovered.actorId });
    const lead = mock.tables.cms_leads[0];
    Object.assign(lead, {
      payload: {},
      utm: {},
      assigned_to: null,
      status: "anonymized",
      anonymized_at: now,
      last_activity_at: now,
    });
    if (mock.tables.cms_lead_status_history.length === 0) {
      mock.tables.cms_lead_status_history.push({
        lead_id: lead.id,
        from_status: recovered.leadStatus,
        to_status: "anonymized",
        reason: "QA synthetic fixture cleanup",
        actor_id: recovered.actorId,
      });
    }
    for (const outbox of mock.tables.cms_lead_outbox) {
      Object.assign(outbox, { status: "completed", locked_at: null, completed_at: now });
    }
    return [{ retired: true }];
  });
  assert.match(retirementSql, /QA_CMS_FIXTURE_FORM_VERSION_AFFECTED_IDS_MISMATCH/);
  assert.match(retirementSql, /QA_CMS_FIXTURE_LEAD_AFFECTED_IDS_MISMATCH/);
  assert.match(retirementSql, /QA_CMS_FIXTURE_LEAD_OUTBOX_AFFECTED_IDS_MISMATCH/);
  assert.ok(
    retirementSql.indexOf("update public.cms_form_definitions") <
      retirementSql.indexOf("update public.cms_leads"),
    "the form is retired while locked before the lead is neutralized",
  );

  assert.deepEqual(mock.tables.cms_leads[0].payload, {});
  assert.deepEqual(mock.tables.cms_leads[0].utm, {});
  assert.equal(mock.tables.cms_leads[0].status, "anonymized");
  assert.equal(mock.tables.cms_leads[0].anonymized_at, now);
  assert.equal(mock.tables.cms_lead_status_history.length, 1, "cleanup audit history is preserved");
  await retireRecoveredFormResources(recovered, async (sql) => {
    assert.equal(sql, retirementSql, "idempotent retry uses the same bound transaction");
    return [{ retired: true }];
  });
  assert.equal(mock.tables.cms_lead_status_history.length, 1, "idempotent retry does not duplicate history");
  assert.equal(
    mock.tables.cms_lead_outbox.every((entry) => entry.status === "completed"),
    true,
  );
  assert.equal(
    mock.tables.cms_form_versions.every((version) => version.status === "retired"),
    true,
  );
  assert.equal(mock.tables.cms_form_definitions[0].status, "retired");
  assert.equal(mock.tables.cms_form_definitions[0].active_version_id, null);
});

test("interrupted UI recovery refuses ambiguous forms before any mutation", async () => {
  const actorId = "10000000-0000-4000-8000-000000000001";
  const state = {
    schemaVersion: 1,
    environment: "staging",
    projectRef: "glcqsosxwgmlhzgcsnzv",
    expectedSha: sha,
    runTag,
    status: "ready",
    setupAudited: true,
    authLifecycleEnabled: false,
    actorId,
    managedActorId: "10000000-0000-4000-8000-000000000002",
    existingIdentityActorId: "10000000-0000-4000-8000-000000000003",
    recoveryActorId: null,
    invitedActorId: null,
    leadId: null,
    leadOutboxId: null,
    leadFormId: null,
    leadCampaignId: null,
    leadReference: null,
    leadStatus: null,
    leadCampaignPath: null,
    itemIds: [],
    terminalArchivedTombstone: null,
    documentIds: [],
  };
  const exactProvenance = {
    status: "published",
    active_version_id: null,
    created_by: actorId,
    updated_by: actorId,
    qa_actor_id: actorId,
    qa_run_tag: runTag,
    qa_candidate_sha: sha,
    qa_environment: "staging",
  };
  const mock = createAdminMock({
    cms_form_definitions: [
      {
        id: "10000000-0000-4000-8000-000000000005",
        form_key: `qa-ops-${runTag.toLowerCase()}-deadbeef`,
        ...exactProvenance,
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        form_key: `qa-ops-${runTag.toLowerCase()}-cafebabe`,
        ...exactProvenance,
      },
    ],
  });

  await assert.rejects(
    recoverInterruptedUiResourceBinding(state, mock.admin, {
      environment: "staging",
      candidateSha: sha,
    }),
    /QA_CMS_FIXTURE_OPERATIONAL_FORM_AMBIGUOUS/,
  );
  assert.deepEqual(mock.mutations, []);
});

test("form retirement validates ownership and affected IDs in the same locked transaction", async () => {
  const state = {
    actorId: "10000000-0000-4000-8000-000000000001",
    leadFormId: "10000000-0000-4000-8000-000000000005",
    runTag,
    expectedSha: sha,
    environment: "staging",
  };
  const sql = buildRecoveredFormRetirementSql(state);
  const firstMutation = sql.indexOf("update public.cms_form_versions");
  for (const preflight of [
    "from auth.users actor",
    "from private.cms_qa_actor_leases lease",
    "from public.cms_profiles profile",
    "from public.cms_form_definitions form",
    "from public.cms_form_versions version",
    "QA_CMS_FIXTURE_FORM_CARDINALITY_MISMATCH",
    "QA_CMS_FIXTURE_FORM_PROVENANCE_MISMATCH",
    "QA_CMS_FIXTURE_FORM_VERSION_PROVENANCE_MISMATCH",
  ]) {
    const position = sql.indexOf(preflight);
    assert.ok(position >= 0 && position < firstMutation, `${preflight} must precede mutation`);
  }
  assert.match(sql, /^begin;/);
  assert.match(sql, /order by form\.id for update/);
  assert.match(sql, /order by version\.id for update/);
  assert.match(
    sql,
    /where form\.id='10000000-0000-4000-8000-000000000005'::uuid or \(\s*form\.created_by='10000000-0000-4000-8000-000000000001'::uuid and \(/,
  );
  assert.doesNotMatch(sql, /where form\.id=.* or form\.form_key~/);
  assert.match(sql, /\^qa-ops-qa-cms-final-20260907-aaaaaaaa-\[a-f0-9\]\{8\}\$/);
  assert.match(sql, /row\(form\.qa_actor_id,form\.qa_run_tag,form\.qa_candidate_sha,form\.qa_environment\)/);
  assert.match(sql, /version\.created_by is distinct from '10000000-0000-4000-8000-000000000001'::uuid/);
  assert.match(sql, /returning version\.id/);
  assert.match(sql, /v_changed_ids is distinct from v_mutable_version_ids/);
  assert.match(sql, /returning form\.id/);
  assert.match(sql, /v_changed_ids is distinct from v_mutable_form_ids/);
  assert.match(sql, /QA_CMS_FIXTURE_FORM_TERMINAL_STATE_INVALID/);
  assert.match(sql, /commit;\s*select true as retired;$/);

  let calls = 0;
  await retireRecoveredFormResources(state, async (statement) => {
    calls += 1;
    assert.equal(statement, sql);
    return [{ retired: true }];
  });
  assert.equal(calls, 1, "preflight and mutation use one management transaction");
  await assert.rejects(
    retireRecoveredFormResources(state, async () => [{ retired: false }]),
    /QA_CMS_FIXTURE_FORM_RETIREMENT_FAILED/,
  );
});

test("form retirement refuses an unbound target before issuing a database query", async () => {
  let calls = 0;
  await assert.rejects(
    retireRecoveredFormResources(
      {
        actorId: "10000000-0000-4000-8000-000000000001",
        leadFormId: "10000000-0000-4000-8000-000000000005",
        runTag,
        expectedSha: "b".repeat(40),
        environment: "staging",
      },
      async () => {
        calls += 1;
        return [{ retired: true }];
      },
    ),
    /QA_CMS_FIXTURE_FORM_RETIREMENT_BINDING_INVALID/,
  );
  assert.equal(calls, 0);
});

test("form retirement recognizes the exact lease-sweeper terminal history on recovery", () => {
  const sql = buildRecoveredFormRetirementSql({
    actorId: "10000000-0000-4000-8000-000000000001",
    leadId: "10000000-0000-4000-8000-000000000006",
    leadOutboxId: "10000000-0000-4000-8000-000000000007",
    leadFormId: "10000000-0000-4000-8000-000000000005",
    leadCampaignId: "10000000-0000-4000-8000-000000000008",
    leadReference: "LD-QASWEEPER",
    leadStatus: "anonymized",
    leadCampaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    runTag,
    expectedSha: sha,
    environment: "staging",
  });
  assert.match(sql, /history\.reason in \('QA synthetic fixture cleanup','QA synthetic lease expired'\)/);
  assert.match(
    sql,
    /history\.from_status in \('new','assigned','in_service','responded','converted','disqualified','archived'\)/,
  );
  assert.match(sql, /if 'anonymized'='anonymized' or\s+v_lead\.status is distinct from 'anonymized'/);
});

test("same-SHA retired forms from another actor are outside the retirement candidate set", () => {
  const sql = buildRecoveredFormRetirementSql({
    actorId: "10000000-0000-4000-8000-000000000001",
    leadFormId: "10000000-0000-4000-8000-000000000005",
    runTag,
    expectedSha: sha,
    environment: "staging",
  });
  const actorScopedCandidates =
    sql.match(
      /form\.id='10000000-0000-4000-8000-000000000005'::uuid or \(\s*form\.created_by='10000000-0000-4000-8000-000000000001'::uuid and \(\s*form\.form_key~/g,
    ) ?? [];
  assert.equal(actorScopedCandidates.length, 2);
});

test("editorial cleanup is one locked transaction with exact graph bindings and form-first mutation", () => {
  const actorIds = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
  const itemIds = ["10000000-0000-4000-8000-000000000020", "10000000-0000-4000-8000-000000000021"];
  const state = {
    actorId: actorIds[0],
    leadId: "10000000-0000-4000-8000-000000000006",
    leadOutboxId: "10000000-0000-4000-8000-000000000007",
    leadFormId: "10000000-0000-4000-8000-000000000005",
    leadCampaignId: itemIds[1],
    leadReference: "LD-QAEDITORIAL",
    leadStatus: "new",
    leadCampaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    runTag,
    expectedSha: sha,
    environment: "staging",
  };
  const contentSql = buildOwnedContentCleanupSql(state, actorIds, itemIds);
  for (const preflight of [
    "from auth.users actor",
    "from private.cms_qa_actor_leases lease",
    "from public.cms_content_items item",
    "from public.cms_content_drafts draft",
    "from public.cms_publications publication",
    "from public.cms_published_projection projection",
    "from public.cms_route_rules route",
    "from public.cms_publication_outbox outbox",
    "QA_CMS_FIXTURE_CONTENT_CARDINALITY_MISMATCH",
    "QA_CMS_FIXTURE_CONTENT_PROVENANCE_MISMATCH",
  ]) {
    const position = contentSql.indexOf(preflight);
    assert.ok(
      position >= 0 && position < contentSql.indexOf("update public.cms_content_items"),
      `${preflight} must precede mutation`,
    );
  }
  for (const exactMutation of [
    "QA_CMS_FIXTURE_CONTENT_AFFECTED_IDS_MISMATCH",
    "QA_CMS_FIXTURE_PUBLICATION_AFFECTED_IDS_MISMATCH",
    "QA_CMS_FIXTURE_PROJECTION_AFFECTED_IDS_MISMATCH",
    "QA_CMS_FIXTURE_ROUTE_AFFECTED_IDS_MISMATCH",
    "QA_CMS_FIXTURE_PUBLICATION_OUTBOX_AFFECTED_IDS_MISMATCH",
    "QA_CMS_FIXTURE_CONTENT_TERMINAL_STATE_INVALID",
  ]) {
    assert.match(contentSql, new RegExp(exactMutation));
  }
  assert.match(contentSql, /returning item\.id/);
  assert.match(contentSql, /returning publication\.item_id/);
  assert.match(contentSql, /returning projection\.item_id/);
  assert.match(contentSql, /returning route\.id/);
  assert.match(contentSql, /returning outbox\.id/);

  const combined = buildEditorialCleanupSql(state, actorIds, itemIds);
  assert.match(combined, /^begin;/);
  assert.equal((combined.match(/^commit;$/gm) ?? []).length, 1);
  assert.equal((combined.match(/^select true as cleaned;$/gm) ?? []).length, 1);
  assert.ok(
    combined.indexOf("update public.cms_form_definitions") < combined.indexOf("update public.cms_leads") &&
      combined.indexOf("update public.cms_leads") < combined.indexOf("update public.cms_content_items"),
    "form, lead and content cleanup must remain ordered inside the same transaction",
  );
  assert.throws(
    () => buildOwnedContentCleanupSql(state, [actorIds[1]], itemIds),
    /QA_CMS_FIXTURE_CONTENT_CLEANUP_BINDING_INVALID/,
  );
});

test("scoped-role cleanup rejects cross-user targets and accepts only exact QA provenance", () => {
  const actorIds = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
  const assignment = {
    id: "10000000-0000-4000-8000-000000000010",
    user_id: actorIds[1],
    role_key: "reviewer",
    site_key: "main",
    environment: "staging",
    grant_type: "delegated",
    reason: `${runTag} concessão restaurada para teardown.`,
    expires_at: "2026-09-08T13:00:00.000Z",
    granted_by: actorIds[0],
    revoked_at: null,
    lock_version: 2,
  };
  assert.deepEqual(
    validateScopedRoleCleanupAssignments([assignment], actorIds, { runTag, environment: "staging" }),
    [assignment],
  );
  assert.throws(
    () =>
      validateScopedRoleCleanupAssignments(
        [{ ...assignment, user_id: "10000000-0000-4000-8000-000000000099" }],
        actorIds,
        { runTag, environment: "staging" },
      ),
    /QA_CMS_FIXTURE_SCOPED_ROLE_CLEANUP_PROVENANCE_MISMATCH/,
  );
  assert.throws(
    () =>
      validateScopedRoleCleanupAssignments([{ ...assignment, reason: "foreign" }], actorIds, {
        runTag,
        environment: "staging",
      }),
    /QA_CMS_FIXTURE_SCOPED_ROLE_CLEANUP_PROVENANCE_MISMATCH/,
  );
});

test("fixture audit receipt is deterministic, locked and insertion-idempotent", () => {
  const input = [
    "10000000-0000-4000-8000-000000000001",
    "cleanup",
    runTag,
    { environment: "staging", candidateSha: sha },
  ];
  const first = buildFixtureAuditSql(...input);
  const second = buildFixtureAuditSql(...input);
  assert.equal(first, second);
  assert.match(first, /from auth\.users actor where actor\.id=.* for update/);
  assert.match(first, /from private\.cms_qa_actor_leases lease where lease\.actor_id=.* for update/);
  assert.match(first, /if v_total>1 or \(v_total=1 and v_exact<>1\)/);
  assert.match(first, /if v_total=0 then\s*insert into public\.cms_audit_log/);
  assert.match(first, /commit;\s*select true as recorded;$/);
});

test("the executable stays fail-closed and leaves no active synthetic surface", () => {
  assert.match(source, /validateRuntime\(\);\s*context = await loadContext\(\)/);
  assert.match(source, /project\.name !== target\.name/);
  assert.match(source, /projects", "api-keys", "--project-ref", target\.ref, "--reveal"/);
  assert.match(source, /health\?\.environment !== target\.environment/);
  assert.match(source, /health\?\.release !== expectedSha/);
  assert.match(source, /response\.headers\.get\("x-release"\) !== expectedSha/);
  assert.match(source, /QA_ACTOR_LEASE_TTL_MINUTES \* 60_000/);
  assert.match(source, /environment: target\.environment,\s*scope_type: "user"/);
  assert.match(source, /await assertReadySession\(actor\.token\)/);
  assert.match(source, /await assertReadySession\(managedActor\.token\)/);
  assert.match(source, /auth\.mfa\.enroll/);
  assert.match(source, /auth\.mfa\.challenge/);
  assert.match(source, /auth\.mfa\.verify/);
  assert.match(
    source,
    /createActor\(runTag, \(actorId\) => \{\s*state\.actorId = actorId;\s*writeState\(state\)/,
  );
  assert.match(source, /actorKind: "reviewer", initialRole: "editor"/);
  assert.match(source, /actorKind: "existing_identity"/);
  assert.match(source, /actorKind: "recovery"/);
  assert.match(source, /actorKind: "invitee"/);
  assert.match(source, /initialRole: null/);
  assert.match(source, /provisionCms: false/);
  assert.match(source, /rdoRole: "rdo_member"/);
  assert.match(source, /QA_CMS_FIXTURE_AUTH_ONLY_BOUNDARY_FAILED/);
  assert.match(source, /auth\.admin\.generateLink\(\{\s*type: "recovery"/);
  assert.match(source, /auth\.admin\.generateLink\(\{\s*type: "invite"/);
  assert.match(source, /delivery: "generate_link_no_email"/);
  assert.match(source, /user\.user_metadata\?\.synthetic !== true/);
  assert.match(source, /user\.user_metadata\?\.runTag !== state\.runTag/);
  assert.match(source, /user\.user_metadata\?\.environment !== target\.environment/);
  assert.match(source, /user\.user_metadata\?\.candidateSha !== expectedSha/);
  assert.match(
    source,
    /onCreated\(actorId\);\s*const lease = await assertActorLease\(actorId, runTag, "active"\);\s*if \(provisionCms\)/,
  );
  assert.match(source, /cms_qa_actor_lease_status/);
  assert.match(source, /cms_complete_qa_actor_lease/);
  assert.match(source, /createScopedRoleAssignments/);
  assert.match(source, /roleKey: "super_admin"/);
  assert.match(source, /roleKey: "editor"/);
  assert.match(source, /grant_type: "direct"/);
  assert.match(source, /granted_by: operatorId/);
  const scopedRoleSetup = source.indexOf("const scopedRoleAssignments = await createScopedRoleAssignments(");
  const scopedFlagActivation = source.indexOf("const featureFlags =", scopedRoleSetup);
  assert.ok(scopedRoleSetup >= 0 && scopedRoleSetup < scopedFlagActivation);
  assert.match(
    source,
    /assertActorLease\(operatorId, runTag, "active"\)[\s\S]*assertActorLease\(reviewerId, runTag, "active"\)[\s\S]*from\("cms_scoped_role_assignments"\)/,
  );
  assert.match(source, /automaticExpiryCleanup: true/);
  assert.match(source, /neutralizeSyntheticDocuments/);
  assert.match(source, /cms_fixture_neutralize_synthetic_document/);
  assert.match(source, /p_blob_removed: false/);
  assert.match(source, /p_blob_removed: true/);
  const documentPrepare = source.indexOf("p_blob_removed: false");
  const documentRemoveMatch = /\.remove\(\s*\[document\.storage_path\]\s*\)/.exec(
    source.slice(documentPrepare),
  );
  const documentRemove = documentRemoveMatch ? documentPrepare + documentRemoveMatch.index : -1;
  const documentConfirm = source.indexOf("p_blob_removed: true", documentRemove);
  assert.ok(documentPrepare >= 0 && documentPrepare < documentRemove);
  assert.ok(documentRemove < documentConfirm);
  assert.match(source, /QA_CMS_FIXTURE_DOCUMENT_BLOB_RESIDUE/);
  assert.match(source, /QA_CMS_FIXTURE_DOCUMENT_BLOB_VERIFICATION_FAILED/);
  assert.match(source, /activeDocuments/);
  assert.match(source, /update public\.cms_content_items item set workflow_status='archived'/);
  assert.match(source, /update public\.cms_route_rules route set active=false/);
  assert.match(
    source,
    /function terminalGonePath\(\)[\s\S]*`\/qa-cms-final-gone-\$\{expectedSha\.slice\(0, 8\)\}`/,
  );
  assert.match(source, /terminalArchivedTombstone: \{ itemId: ids\.pageId \}/);
  assert.doesNotMatch(source, /terminalArchivedTombstone:\s*\{[^}]*path/s);
  assert.match(source, /payload\?\.title !== `\$\{state\.runTag\} gone`/);
  assert.match(source, /payload\?\.summary !== "Página sintética para validar retirada gone\."/);
  assert.match(source, /status_code: 410, destination_path: null/);
  assert.match(source, /QA_CMS_FIXTURE_PUBLICATION_OUTBOX_AFFECTED_IDS_MISMATCH/);
  assert.match(source, /\.in\("status", \["pending", "processing", "failed"\]\)/);
  assert.match(source, /actionablePublicationOutbox/);
  assert.match(source, /terminalArchivedTombstoneEvidence/);
  assert.match(
    source,
    /classification: "terminalNoSyntheticRoute",\s*count: 0,\s*activeRouteRules: 0,\s*identifiersOrPathsPersisted: false/,
  );
  assert.match(
    finalCoverageSource,
    /const slug = `qa-cms-final-gone-\$\{auth\.expectedSha\.slice\(0, 8\)\}`/,
  );
  assert.match(finalCoverageSource, /const revisionOneTitle = `\$\{runTag\} gone`/);
  assert.match(finalCoverageSource, /summary: "Página sintética para validar retirada gone\."/);
  assert.match(source, /insert into public\.cms_publication_outbox/);
  assert.match(source, /delete from public\.cms_publications/);
  assert.match(source, /delete from public\.cms_published_projection/);
  assert.match(source, /from\("cms_scoped_role_assignments"\)/);
  assert.match(
    source,
    /from\("cms_scoped_role_assignments"\)[\s\S]*\.eq\("site_key", "main"\)[\s\S]*\.eq\("environment", state\.environment\)[\s\S]*\.eq\("lock_version", assignment\.lock_version\)/,
  );
  assert.match(source, /from\("cms_user_roles"\)\.delete\(\)/);
  assert.match(source, /from\("rdo_user_access"\)/);
  assert.match(source, /delete from auth\.sessions where user_id/);
  assert.match(source, /sessions_valid_after: now/);
  assert.match(source, /ban_duration: "876000h"/);
  assert.match(source, /from\("cms_lead_outbox"\)/);
  assert.match(
    source,
    /from\("cms_form_versions"\)[\s\S]*?\.eq\("form_id", state\.leadFormId\)[\s\S]*?\.neq\("status", "retired"\)/,
  );
  assert.match(source, /from\("cms_ai_execution_approvals"\)/);
  assert.match(source, /set status='retired',active_version_id=null,updated_by=/);
  assert.match(source, /cms:qa\.fixture_setup/);
  assert.match(source, /cms:qa\.fixture_cleanup/);
  assert.match(source, /credentialsInStateOrReport: false/);
  assert.match(source, /\["setup", "cleanup", "residue"\]\.includes\(mode\)/);
  assert.match(source, /state\.status !== "cleaned"/);
  assert.match(
    source,
    /const activeLeases = leases\.filter\(\(lease\) => lease\.status !== "cleaned"\)\.length/,
  );
  assert.match(source, /QA_CMS_FIXTURE_RESIDUE_PRESENT/);
  assert.match(source, /QA_CMS_SUPABASE_ANON_KEY", value: context\.anonKey, secret: true/);
  assert.match(source, /QA_CMS_REVIEWER_PASSWORD", value: managedActor\.password, secret: true/);
  assert.match(source, /QA_CMS_RECOVERY_ACTION_LINK/);
  assert.match(source, /QA_CMS_INVITEE_ACTION_LINK/);
  assert.match(source, /actionLinksPersisted: false/);
  assert.match(source, /externalEmailSentByFixture: false/);
  assert.match(
    source,
    /QA_CMS_EXISTING_IDENTITY_PASSWORD", value: existingIdentityActor\.password, secret: true/,
  );
  assert.match(
    source,
    /QA_CMS_EXISTING_IDENTITY_TOTP_SECRET", value: existingIdentityActor\.secret, secret: true/,
  );
  assert.match(source, /existingIdentityRevokedAndBanned/);
  assert.match(source, /rdoAccessInactive/);
  assert.match(source, /fixtureProvisioning: "actors-and-prerequisites-only"/);
  assert.match(source, /editorialEntitiesCreatedByFixture: 0/);
  const setupSource = source.slice(
    source.indexOf("async function setup()"),
    source.indexOf("async function cleanup()"),
  );
  assert.doesNotMatch(setupSource, /createRouteFixtures|createOperationalFixtures|cms_capture_lead_scoped/);
  assert.doesNotMatch(setupSource, /QA_CMS_SYNTHETIC_IDS|QA_CMS_LEAD_REFERENCE|QA_CMS_LEAD_STATUS/);
  assert.match(setupSource, /QA_CMS_UI_CREATED_STATE_PATH/);
  assert.match(source, /productionMutations: productionMutationSummary/);
  assert.match(source, /path\.resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)/);
});

test("the database watchdog atomically leases and revokes only exact synthetic actors", () => {
  assert.match(watchdogMigration, /after insert on auth\.users/);
  assert.match(watchdogMigration, /before update of raw_user_meta_data on auth\.users/);
  assert.match(watchdogMigration, /'CMS_QA_ACTOR_MARKER_IMMUTABLE'/);
  // 0091 estendeu a lease porque a janela autenticada passou a conter tambem a prova de
  // compatibilidade do rollback, que so pode rodar enquanto as entidades criadas na UI existem.
  assert.match(watchdogMigration, /v_created_at \+ interval '119 minutes'/);
  // 0091 ajusta a definicao instalada em vez de reescrever o corpo, para nao perder os reparos de
  // 0086, entao o prazo aparece como o literal de substituicao e nao junto de v_created_at.
  assert.match(leaseWindowMigration, /interval '240 minutes'/);
  assert.match(watchdogMigration, /expires_at <= created_at \+ interval '120 minutes'/);
  assert.match(watchdogMigration, /cms_qa_override_window_is_valid/);
  assert.match(watchdogMigration, /evaluator_count <> 4/);
  assert.match(watchdogMigration, /CMS_QA_OVERRIDE_EVALUATOR_DRIFT/);
  assert.match(watchdogMigration, /CMS_QA_OVERRIDE_MANIFEST_DRIFT/);
  assert.match(
    watchdogMigration,
    /length\(original_definition\) - length\(replace\([\s\S]*?evaluator_old_fragment[\s\S]*?<> length\(evaluator_old_fragment\)/,
  );
  assert.match(watchdogMigration, /actor\.raw_user_meta_data -> 'synthetic' = 'true'::jsonb/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'runTag' = p_run_tag/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'candidateSha' = p_candidate_sha/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'environment' = p_environment/);
  assert.match(watchdogMigration, /where created_by = v_lease\.actor_id and workflow_status <> 'archived'/);
  assert.match(watchdogMigration, /delete from public\.cms_feature_flag_overrides/);
  assert.match(watchdogMigration, /processing_status = 'neutralized'/);
  assert.match(watchdogMigration, /blob_disposition = case/);
  assert.match(watchdogMigration, /'neutralizedDocuments', v_documents/);
  assert.match(watchdogMigration, /delete from public\.cms_user_roles/);
  assert.match(watchdogMigration, /form\.form_key like \('qa-ops-' \|\| lower\(v_lease\.run_tag\)/);
  assert.match(watchdogMigration, /update public\.cms_leads lead[\s\S]*status = 'anonymized'/);
  assert.match(watchdogMigration, /update public\.cms_lead_outbox outbox[\s\S]*status = 'completed'/);
  assert.match(watchdogMigration, /update public\.cms_form_definitions form[\s\S]*status = 'retired'/);
  assert.match(watchdogMigration, /update public\.cms_ai_sessions session[\s\S]*status = 'closed'/);
  assert.match(
    watchdogMigration,
    /update public\.cms_ai_synthetic_targets target[\s\S]*lifecycle = 'retired'/,
  );
  assert.match(
    watchdogMigration,
    /update public\.cms_ai_execution_approvals approval[\s\S]*status = 'expired'/,
  );
  assert.match(watchdogMigration, /insert into public\.cms_publication_outbox/);
  assert.match(watchdogMigration, /delete from public\.cms_publications/);
  assert.match(watchdogMigration, /delete from public\.cms_published_projection/);
  assert.match(watchdogMigration, /update public\.cms_scoped_role_assignments/);
  assert.match(watchdogMigration, /delete from auth\.sessions/);
  assert.match(watchdogMigration, /set banned_until = greatest/);
  assert.match(watchdogMigration, /'cms:qa\.fixture_expired_cleanup'/);
  assert.doesNotMatch(watchdogMigration, /delete from public\.cms_audit_log/);
  assert.match(
    watchdogMigration,
    /where lease\.status = 'active' and lease\.expires_at <= clock_timestamp\(\)/,
  );
  assert.match(watchdogMigration, /for update skip locked/);
  assert.match(
    watchdogMigration,
    /if exists \([\s\S]*select 1 from public\.cms_content_items[\s\S]*select 1 from public\.cms_published_projection[\s\S]*raise exception 'CMS_QA_ACTOR_CLEANUP_INCOMPLETE'/,
  );
  assert.match(watchdogMigration, /where jobname = 'cms-qa-actor-lease-sweeper-every-1m'/);
  assert.match(watchdogMigration, /'\* \* \* \* \*'/);
  assert.match(
    watchdogMigration,
    /revoke all on function private\.cms_sweep_expired_qa_actor_leases\(integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    watchdogMigration,
    /(?:@example\.invalid|password_hash|totp_secret|access_token|refresh_token)/i,
  );
});

test("the exact QA lease outlives each single-run authenticated lifecycle budget", () => {
  // A lease efetiva e a que 0091 instala; 0061 continua sendo a origem historica do gatilho.
  const leaseMinutes = Number(
    leaseWindowMigration.match(/\$new\$interval '(\d+) minutes'\$new\$/)?.[1] ?? "0",
  );
  assert.equal(leaseMinutes, 240);
  for (const [name, workflow, setupId, cleanupId] of [
    ["staging", stagingWorkflow, "browser_mutating_fixture", "browser_mutating_cleanup"],
    ["production", productionWorkflow, "production_browser_fixture", "production_browser_cleanup"],
  ]) {
    const setupMarker = workflow.indexOf(`id: ${setupId}`);
    const cleanupMarker = workflow.indexOf(`id: ${cleanupId}`, setupMarker);
    assert.ok(setupMarker >= 0 && cleanupMarker > setupMarker, `${name} lifecycle markers are required`);
    const start = workflow.lastIndexOf("\n      - name:", setupMarker);
    const end = workflow.lastIndexOf("\n      - name:", cleanupMarker);
    const lifecycle = workflow.slice(start, end);
    const steps = [...lifecycle.matchAll(/^\s+- name:/gm)].length;
    const timeouts = [...lifecycle.matchAll(/^\s+timeout-minutes:\s*(\d+)\s*$/gm)].map((match) =>
      Number(match[1]),
    );
    assert.equal(
      timeouts.length,
      steps,
      `${name} every step between fixture setup and cleanup must have an explicit timeout`,
    );
    assert.equal(
      (lifecycle.match(/cms-browser-fixture\.mjs setup/g) ?? []).length,
      1,
      `${name} must use one immutable fixture/runTag`,
    );
    assert.match(lifecycle, /--grep @ui-bootstrap/);
    assert.match(lifecycle, /--grep @semantic/);
    const budget = timeouts.reduce((total, timeout) => total + timeout, 0);
    assert.ok(budget <= 200, `${name} setup-to-cleanup budget must be at most 200 minutes`);
    assert.ok(budget < leaseMinutes, `${name} lease must outlive the complete pre-cleanup budget`);
  }
  assert.doesNotMatch(stagingWorkflow, /id: browser_routes_fixture/);
});
