import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CI_PROFILE_NEEDS, verifyCiProfileNeeds } from "./ci-profile-needs-lib.mjs";

const workflow = await readFile(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");
const mainPush = { eventName: "push", ref: "refs/heads/main" };

test("every release profile requires exact selected successes and exact non-selected skips", () => {
  for (const [profile, results] of Object.entries(CI_PROFILE_NEEDS)) {
    assert.deepEqual(verifyCiProfileNeeds({ profile, results, ...mainPush }), {
      schemaVersion: 1,
      event: "g12.ci.profile_needs.verified",
      profile,
      results,
    });
  }
});

test("full-release refuses a skipped Edge Function runtime smoke", () => {
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "full-release",
        results: { ...CI_PROFILE_NEEDS["full-release"], "hotfix-bundle-smoke": "skipped" },
        ...mainPush,
      }),
    /G12_CI_PROFILE_NEEDS_REFUSED:hotfix-bundle-smoke:expected_success:actual_skipped/,
  );
});

test("profile outcome verification refuses failures, cancellations, unexpected executions, and shape drift", () => {
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "edge-only",
        results: { ...CI_PROFILE_NEEDS["edge-only"], quality: "failure" },
        ...mainPush,
      }),
    /quality:expected_success:actual_failure/,
  );
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "edge-only",
        results: { ...CI_PROFILE_NEEDS["edge-only"], "package-staging": "cancelled" },
        ...mainPush,
      }),
    /package-staging:expected_success:actual_cancelled/,
  );
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "edge-only",
        results: { ...CI_PROFILE_NEEDS["edge-only"], database: "success" },
        ...mainPush,
      }),
    /database:expected_skipped:actual_success/,
  );
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "edge-only",
        results: { ...CI_PROFILE_NEEDS["edge-only"], extra: "success" },
        ...mainPush,
      }),
    /G12_CI_PROFILE_NEEDS_REFUSED:results:shape/,
  );
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "unknown",
        results: CI_PROFILE_NEEDS["edge-only"],
        ...mainPush,
      }),
    /G12_CI_PROFILE_NEEDS_REFUSED:profile:unknown_unknown/,
  );
});

test("pull requests require package-staging skipped but cannot skip any profile-selected gate", () => {
  const pullRequest = { eventName: "pull_request", ref: "refs/pull/42/merge" };
  const valid = {
    ...CI_PROFILE_NEEDS["full-release"],
    "package-staging": "skipped",
  };
  assert.equal(
    verifyCiProfileNeeds({ profile: "full-release", results: valid, ...pullRequest }).event,
    "g12.ci.profile_needs.verified",
  );
  assert.throws(
    () =>
      verifyCiProfileNeeds({
        profile: "full-release",
        results: { ...valid, "hotfix-bundle-smoke": "skipped" },
        ...pullRequest,
      }),
    /hotfix-bundle-smoke:expected_success:actual_skipped/,
  );
});

test("pipeline metrics verifies exact needs before it captures timing evidence", () => {
  const start = workflow.indexOf("  pipeline-metrics:");
  assert.notEqual(start, -1);
  const job = workflow.slice(start);
  const verify = job.indexOf("Fail closed on exact release-profile job outcomes");
  const capture = job.indexOf("Capture every completed CI stage");
  assert.ok(verify >= 0 && capture > verify);
  assert.match(job, /^\s+if: always\(\)$/m);
  assert.match(job, /verify-ci-profile-needs\.mjs/);
  for (const [argument, expression] of [
    ["profile", "needs.release-plan.outputs.profile"],
    ["event-name", "github.event_name"],
    ["ref", "github.ref"],
    ["release-plan", "needs.release-plan.result"],
    ["quality", "needs.quality.result"],
    ["package-staging", "needs.package-staging.result"],
    ["hotfix-bundle-smoke", "needs.hotfix-bundle-smoke.result"],
    ["database", "needs.database.result"],
    ["browser", "needs.browser.result"],
  ])
    assert.match(job, new RegExp(`--${argument} "\\$\\{\\{ ${expression.replaceAll(".", "\\.")} \\}\\}"`));
  assert.doesNotMatch(job.slice(verify, capture), /continue-on-error:\s*true/);
  assert.match(job.slice(capture), /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
});
