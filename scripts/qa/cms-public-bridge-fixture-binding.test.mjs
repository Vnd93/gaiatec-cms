import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicBridgeRunTagForCandidate,
  publicBridgeCampaignLocation,
  publicBridgeFixtureBinding,
  publicBridgeRunTag,
  publicBridgeWorkflowNonce,
} from "./cms-public-bridge-fixture-binding.mjs";

const candidateSha = "a".repeat(40);
const identity = {
  environment: "staging",
  candidateSha,
  runId: "7654321",
  runAttempt: "2",
  instance: "preview",
};
const nonce = publicBridgeWorkflowNonce(identity);

test("fixture identity is deterministic and fails closed on substitutions", () => {
  assert.match(nonce, /^[a-f0-9]{8}$/);
  assert.equal(publicBridgeWorkflowNonce(identity), nonce);
  assert.notEqual(publicBridgeWorkflowNonce({ ...identity, runAttempt: "3" }), nonce);
  assert.notEqual(publicBridgeWorkflowNonce({ ...identity, instance: "canonical" }), nonce);
  assert.throws(
    () => publicBridgeWorkflowNonce({ ...identity, candidateSha: "b".repeat(39) }),
    /FIXTURE_IDENTITY_REFUSED/,
  );
});

test("next-day recovery keeps the setup runTag when rebuilding the canonical campaign", () => {
  const setupRunTag = publicBridgeRunTag({
    candidateSha,
    at: new Date("2026-09-08T23:59:59.000Z"),
  });
  const nextDayDefaultRunTag = publicBridgeRunTag({
    candidateSha,
    at: new Date("2026-09-09T00:00:01.000Z"),
  });
  const setup = publicBridgeCampaignLocation({ candidateSha, runTag: setupRunTag, nonce });
  const recoveredFromActor = publicBridgeCampaignLocation({
    candidateSha,
    runTag: setupRunTag,
    nonce,
  });
  const incorrectNextDayDefault = publicBridgeCampaignLocation({
    candidateSha,
    runTag: nextDayDefaultRunTag,
    nonce,
  });

  assert.equal(setup.path, `/campanhas/qa-lead-${setupRunTag.toLowerCase()}-${nonce}`);
  assert.deepEqual(recoveredFromActor, setup);
  assert.notEqual(recoveredFromActor.slug, incorrectNextDayDefault.slug);
  assert.equal(isPublicBridgeRunTagForCandidate(setupRunTag, candidateSha), true);
  assert.equal(isPublicBridgeRunTagForCandidate("QA-CMS-FINAL-20260908-bbbbbbbb", candidateSha), false);
  assert.throws(
    () =>
      publicBridgeCampaignLocation({
        candidateSha,
        runTag: "QA-CMS-FINAL-20260908-bbbbbbbb",
        nonce,
      }),
    /FIXTURE_CAMPAIGN_LOCATION_REFUSED/,
  );
  assert.throws(
    () => publicBridgeCampaignLocation({ candidateSha, runTag: setupRunTag, nonce: "deadbeeZ" }),
    /FIXTURE_CAMPAIGN_LOCATION_REFUSED/,
  );
  assert.match(publicBridgeFixtureBinding({ candidateSha, runTag: setupRunTag, nonce }), /^[a-f0-9]{64}$/);
});
