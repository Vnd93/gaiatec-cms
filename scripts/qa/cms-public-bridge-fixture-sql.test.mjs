import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPublicBridgeCleanupSql,
  findSyntheticActor,
  reconcileRecoveryActor,
} from "./cms-public-bridge-fixture.mjs";
import {
  publicBridgeCampaignLocation,
  publicBridgeWorkflowNonce,
} from "./cms-public-bridge-fixture-binding.mjs";
import { revisionProvenanceSql } from "./cms-public-bridge-fixture-sql.mjs";

const candidateSha = "a".repeat(40);
const runtime = Object.freeze({
  candidateSha,
  environment: "staging",
  instance: "preview",
  workflowRunId: "42",
  workflowRunAttempt: "3",
});

function actor(id, metadata = {}) {
  return { id, user_metadata: metadata };
}

function exactActor(id = "90000000-0000-4000-8000-000000000001") {
  return actor(id, {
    synthetic: true,
    purpose: "qa-cms-browser",
    candidateSha,
    environment: runtime.environment,
    actorKind: `public_bridge_${runtime.instance}`,
    workflowRunId: runtime.workflowRunId,
    workflowRunAttempt: runtime.workflowRunAttempt,
  });
}

function boundActor(state, id = "90000000-0000-4000-8000-000000000001", metadataOverrides = {}) {
  return actor(id, {
    ...exactActor(id).user_metadata,
    runTag: state.runTag,
    nonce: state.nonce,
    ...metadataOverrides,
  });
}

function publicBridgeState() {
  const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
  const nonce = publicBridgeWorkflowNonce({
    environment: runtime.environment,
    candidateSha,
    runId: runtime.workflowRunId,
    runAttempt: runtime.workflowRunAttempt,
    instance: runtime.instance,
  });
  const campaign = publicBridgeCampaignLocation({ candidateSha, runTag, nonce });
  return {
    schemaVersion: 1,
    status: "active",
    environment: runtime.environment,
    candidateSha,
    runTag,
    instance: runtime.instance,
    nonce,
    actorId: "90000000-0000-4000-8000-000000000001",
    form: {
      id: "90000000-0000-4000-8000-000000000002",
      versionId: "90000000-0000-4000-8000-000000000003",
      fieldId: "90000000-0000-4000-8000-000000000004",
      key: `qa-bridge-${candidateSha.slice(0, 8)}-${nonce}`,
    },
    page: {
      id: "90000000-0000-4000-8000-000000000005",
      revisionId: "90000000-0000-4000-8000-000000000006",
      slug: `qa-bridge-page-${candidateSha.slice(0, 8)}-${nonce}`,
      path: `/qa-bridge-page-${candidateSha.slice(0, 8)}-${nonce}`,
      title: `Ponte pública QA ${candidateSha.slice(0, 8)}`,
    },
    campaign: {
      id: "90000000-0000-4000-8000-000000000007",
      revisionId: "90000000-0000-4000-8000-000000000008",
      ...campaign,
      title: `Campanha ponte QA ${candidateSha.slice(0, 8)}`,
    },
    formTitle: `Formulário ponte QA ${candidateSha.slice(0, 8)}`,
    emailLabel: `E-mail ponte QA ${candidateSha.slice(0, 8)}`,
  };
}

function decodeSqlJson(sql) {
  const match = /^convert_from\(decode\('([A-Za-z0-9+/]+={0,2})','base64'\),'UTF8'\)::jsonb$/.exec(sql);
  assert.ok(match, "expected a base64-backed JSONB SQL literal");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

test("fixture revision SQL serializes the existing non-empty provenance arrays", async () => {
  const provenance = [
    {
      sourceKind: "owner_authored",
      authorizationReference: "QA-CMS-FINAL-20260908-aaaaaaaa",
      rightsConfirmed: true,
    },
  ];

  const decoded = decodeSqlJson(revisionProvenanceSql(provenance));
  assert.ok(Array.isArray(decoded));
  assert.equal(decoded.length, 1);
  assert.deepEqual(decoded, provenance);

  const fixture = await readFile("scripts/qa/cms-public-bridge-fixture.mjs", "utf8");
  assert.match(fixture, /revisionProvenanceSql\(page\.provenance\)/);
  assert.match(fixture, /revisionProvenanceSql\(campaign\.provenance\)/);
  assert.match(fixture, /const campaignLocation = publicBridgeCampaignLocation\(/);
  assert.match(fixture, /\.\.\.campaignLocation/);
  assert.match(fixture, /isPublicBridgeRunTagForCandidate\(value\.runTag, candidateSha\)/);
  assert.match(fixture, /value\.nonce !==\s+publicBridgeWorkflowNonce\(/);
  assert.match(fixture, /const template = emptyState\(metadata\.runTag\)/);
  const reconstruction = fixture.slice(
    fixture.indexOf("async function reconstructState"),
    fixture.indexOf("async function checked"),
  );
  const nonceValidation = reconstruction.indexOf("metadata?.nonce !== expectedNonce");
  const resourceQueries = reconstruction.indexOf('.from("cms_form_definitions")', nonceValidation);
  assert.ok(nonceValidation > 0, "recovery must validate the actor nonce");
  assert.ok(resourceQueries > nonceValidation, "actor metadata must be validated before resource queries");
  for (const binding of [
    "metadata?.candidateSha !== candidateSha",
    "metadata?.environment !== environment",
    "metadata?.actorKind !== `public_bridge_${instance}`",
    'String(metadata?.workflowRunId ?? "") !== workflowRunId',
    'String(metadata?.workflowRunAttempt ?? "") !== workflowRunAttempt',
    "!isPublicBridgeRunTagForCandidate(metadata?.runTag, candidateSha)",
  ]) {
    const validation = reconstruction.indexOf(binding);
    assert.ok(validation > 0 && validation < resourceQueries, `${binding} must precede resource queries`);
  }
  const recovery = fixture.slice(
    fixture.indexOf("async function recover"),
    fixture.indexOf("export async function main"),
  );
  assert.match(recovery, /localState\.status === "preparing"/);
  assert.match(recovery, /await reconstructState\(context, localState\)/);
});

test("fixture revision SQL rejects an empty or object-shaped provenance value", () => {
  for (const value of [[], {}, null]) {
    assert.throws(() => revisionProvenanceSql(value), /QA_CMS_PUBLIC_BRIDGE_REVISION_PROVENANCE_INVALID/);
  }
});

test("actor recovery paginates past 5000 users before classifying the fixture", async () => {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          calls.push({ page, perPage });
          const first = (page - 1) * perPage;
          const users =
            page <= 50
              ? Array.from({ length: perPage }, (_, offset) =>
                  actor(`10000000-0000-4000-8000-${String(first + offset + 1).padStart(12, "0")}`),
                )
              : page === 51
                ? [exactActor()]
                : [];
          return { data: { users, total: 5001, lastPage: 5 }, error: null };
        },
      },
    },
  };

  assert.deepEqual(await findSyntheticActor(admin, runtime), exactActor());
  assert.equal(calls.length, 51);
  assert.deepEqual(calls.at(-1), { page: 51, perPage: 100 });
});

test("actor recovery fails closed at a pagination cap and scans all pages before ambiguity", async () => {
  const createAdmin = (secondMatch) => ({
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          const first = (page - 1) * perPage;
          const users = Array.from({ length: page <= 50 ? perPage : 1 }, (_, offset) =>
            actor(`20000000-0000-4000-8000-${String(first + offset + 1).padStart(12, "0")}`),
          );
          if (page === 1) users[0] = exactActor("90000000-0000-4000-8000-000000000010");
          if (page === 51 && secondMatch) users[0] = exactActor("90000000-0000-4000-8000-000000000011");
          return { data: { users, total: 5001, lastPage: 5 }, error: null };
        },
      },
    },
  });

  await assert.rejects(
    findSyntheticActor(createAdmin(false), runtime, { pageSize: 100, maxPages: 50 }),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_PAGINATION_INCOMPLETE/,
  );
  await assert.rejects(
    findSyntheticActor(createAdmin(true), runtime),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_AMBIGUOUS/,
  );
});

test("actor recovery accepts authoritative empty pagination and rejects repeated pages", async () => {
  const empty = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [], total: 0, lastPage: 0 }, error: null }),
      },
    },
  };
  assert.equal(await findSyntheticActor(empty, runtime), null);

  let singlePageCalls = 0;
  const onePageWithoutLinkMetadata = {
    auth: {
      admin: {
        listUsers: async () => {
          singlePageCalls += 1;
          return {
            data: {
              users: singlePageCalls === 1 ? [exactActor()] : [],
              total: 0,
              lastPage: 0,
            },
            error: null,
          };
        },
      },
    },
  };
  assert.deepEqual(await findSyntheticActor(onePageWithoutLinkMetadata, runtime), exactActor());
  assert.equal(singlePageCalls, 2, "zero metadata with users requires an empty-page proof");

  const repeated = actor("30000000-0000-4000-8000-000000000001");
  const duplicatePages = {
    auth: {
      admin: {
        listUsers: async ({ page }) => ({
          data: { users: [repeated], total: 2, lastPage: 2, page },
          error: null,
        }),
      },
    },
  };
  await assert.rejects(
    findSyntheticActor(duplicatePages, runtime, { pageSize: 1 }),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_PAGINATION_CHANGED/,
  );
});

test("interrupted recovery exhaustively reconciles an actor before cleanup classification", async () => {
  const localState = { ...publicBridgeState(), status: "preparing", actorId: null };
  const recoveredActor = boundActor(localState);
  const calls = [];
  const admin = {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          calls.push({ page, perPage });
          return {
            data: {
              users: page === 1 ? [actor("40000000-0000-4000-8000-000000000001")] : [recoveredActor],
              total: 2,
            },
            error: null,
          };
        },
      },
    },
  };

  assert.deepEqual(await reconcileRecoveryActor(admin, localState, runtime, { pageSize: 1 }), recoveredActor);
  assert.deepEqual(calls, [
    { page: 1, perPage: 1 },
    { page: 2, perPage: 1 },
  ]);
});

test("interrupted recovery requires the local and recovered runTag/nonce binding", async () => {
  const localState = { ...publicBridgeState(), status: "preparing", actorId: null };
  const createAdmin = (recoveredActor) => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [recoveredActor], total: 1 }, error: null }),
      },
    },
  });

  await assert.rejects(
    reconcileRecoveryActor(
      createAdmin(boundActor(localState, undefined, { nonce: "deadbeef" })),
      localState,
      runtime,
    ),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_INVALID/,
  );

  const differentRunTag = `QA-CMS-FINAL-20260907-${candidateSha.slice(0, 8)}`;
  await assert.rejects(
    reconcileRecoveryActor(
      createAdmin(boundActor(localState, undefined, { runTag: differentRunTag })),
      localState,
      runtime,
    ),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_BINDING_MISMATCH/,
  );
});

test("not-created is available only after authoritative actor-search exhaustion", async () => {
  const localState = { ...publicBridgeState(), status: "preparing", actorId: null };
  let calls = 0;
  const admin = {
    auth: {
      admin: {
        listUsers: async () => {
          calls += 1;
          return {
            data: {
              users: calls === 1 ? [actor("50000000-0000-4000-8000-000000000001")] : [],
              total: 0,
            },
            error: null,
          };
        },
      },
    },
  };

  assert.equal(await reconcileRecoveryActor(admin, localState, runtime), null);
  assert.equal(calls, 2, "recovery must obtain the terminal empty page before returning null");

  const persistedActorState = {
    ...localState,
    actorId: "90000000-0000-4000-8000-000000000099",
  };
  calls = 0;
  await assert.rejects(
    reconcileRecoveryActor(admin, persistedActorState, runtime),
    /QA_CMS_PUBLIC_BRIDGE_ACTOR_RECOVERY_MISSING/,
  );
  assert.equal(calls, 2, "even a missing persisted actor must be established exhaustively");
});

test("public bridge cleanup preflights the exact graph and mutates it in one transaction", () => {
  const sql = buildPublicBridgeCleanupSql(publicBridgeState(), runtime);
  const firstMutation = sql.indexOf("insert into public.cms_lead_status_history");
  for (const preflight of [
    "from auth.users actor",
    "from public.cms_profiles profile",
    "from public.cms_form_definitions form",
    "from public.cms_form_versions version",
    "from public.cms_content_items item",
    "from public.cms_content_revisions revision",
    "from public.cms_leads lead",
    "from public.cms_lead_consents consent",
    "from public.cms_lead_status_history history",
    "from public.cms_lead_outbox outbox",
    "QA_CMS_PUBLIC_BRIDGE_CLEANUP_GRAPH_CARDINALITY_MISMATCH",
    "QA_CMS_PUBLIC_BRIDGE_CLEANUP_LEAD_PROVENANCE_MISMATCH",
    "QA_CMS_PUBLIC_BRIDGE_CLEANUP_AUDIT_PROVENANCE_MISMATCH",
  ]) {
    const position = sql.indexOf(preflight);
    assert.ok(position >= 0 && position < firstMutation, `${preflight} must precede mutation`);
  }
  assert.match(sql, /^begin;/);
  assert.match(sql, /where version\.created_by=.* or version\.form_id=/);
  assert.match(sql, /where revision\.created_by=.* or revision\.item_id=any/);
  assert.match(sql, /v_lead\.origin_path is distinct from '\/campanhas\/qa-lead-/);
  assert.match(sql, /v_lead\.campaign_id is distinct from '90000000-0000-4000-8000-000000000007'::uuid/);
  assert.match(sql, /v_consent_count<>1/);
  assert.match(sql, /cardinality\(v_outbox_ids\)<>1/);
  for (const resource of ["LEAD", "OUTBOX", "PROJECTION", "PUBLICATION", "CONTENT", "VERSION", "FORM"]) {
    assert.match(sql, new RegExp(`QA_CMS_PUBLIC_BRIDGE_CLEANUP_${resource}_AFFECTED_IDS_MISMATCH`));
  }
  assert.match(sql, /QA_CMS_PUBLIC_BRIDGE_CLEANUP_TERMINAL_STATE_INVALID/);
  assert.match(
    sql,
    /delete from public\.cms_published_projection projection[\s\S]*returning projection\.item_id/,
  );
  assert.match(sql, /delete from public\.cms_publications publication[\s\S]*returning publication\.item_id/);
  assert.match(sql, /commit;\s*select true as cleaned;$/);
  assert.equal((sql.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;/gm) ?? []).length, 1);
});

test("public bridge cleanup refuses a foreign binding before producing mutation SQL", () => {
  const state = publicBridgeState();
  assert.throws(
    () => buildPublicBridgeCleanupSql({ ...state, actorId: "foreign" }, runtime),
    /QA_CMS_PUBLIC_BRIDGE_CLEANUP_BINDING_INVALID/,
  );
  assert.throws(
    () =>
      buildPublicBridgeCleanupSql(
        { ...state, campaign: { ...state.campaign, path: "/campanhas/foreign" } },
        runtime,
      ),
    /QA_CMS_PUBLIC_BRIDGE_CLEANUP_BINDING_INVALID/,
  );
});
