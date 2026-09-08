import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPaths = [
  ".github/workflows/deploy-production.yml",
  ".github/workflows/promote-production-frontend-bridge.yml",
  ".github/workflows/verify-production-email.yml",
  ".github/workflows/provision-production-operator.yml",
  ".github/workflows/rollback-production.yml",
  ".github/workflows/backup-supabase-production.yml",
  ".github/workflows/deploy-staging.yml",
  ".github/workflows/rollback-staging.yml",
];

const artifactDownloadWorkflowPaths = [
  ".github/workflows/deploy-production.yml",
  ".github/workflows/finalize-production-deploy.yml",
  ".github/workflows/rollback-production.yml",
  ".github/workflows/rollback-production-watchdog.yml",
  ".github/workflows/deploy-staging.yml",
  ".github/workflows/deploy-staging-watchdog.yml",
  ".github/workflows/rollback-staging.yml",
  ".github/workflows/rollback-staging-watchdog.yml",
  ".github/workflows/promote-production-frontend-bridge-watchdog.yml",
];

const digestEnforcingDownloadAction =
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1";

test("manual release operations are restricted to the approved GitHub operator before checkout", async () => {
  for (const path of workflowPaths) {
    const workflow = await readFile(path, "utf8");
    const checkout = workflow.indexOf("actions/checkout@");
    assert.ok(checkout > 0, `${path}: checkout step missing`);

    const preCheckout = workflow.slice(0, checkout);
    assert.match(preCheckout, /DISPATCH_ACTOR: \$\{\{ github\.actor \}\}/, `${path}: actor context missing`);
    assert.match(
      preCheckout,
      /TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/,
      `${path}: rerun actor context missing`,
    );
    assert.match(preCheckout, /\$\{DISPATCH_ACTOR,,\}/, `${path}: dispatch actor is not enforced`);
    assert.match(preCheckout, /\$\{TRIGGERING_ACTOR,,\}/, `${path}: rerun actor is not enforced`);
    assert.match(preCheckout, /= vnd93|!= "vnd93"/, `${path}: approved operator is not exact`);
  }
});

test("scheduled backups retain their separate allowlisted trigger while manual backups enforce the operator", async () => {
  const workflow = await readFile(".github/workflows/backup-supabase-production.yml", "utf8");
  const manualBranch = workflow.indexOf("workflow_dispatch)");
  const scheduledBranch = workflow.indexOf("schedule)", manualBranch);
  const checkout = workflow.indexOf("actions/checkout@");
  assert.ok(manualBranch > 0 && scheduledBranch > manualBranch && checkout > scheduledBranch);

  const manualGuard = workflow.slice(manualBranch, scheduledBranch);
  assert.match(manualGuard, /\$\{DISPATCH_ACTOR,,\}/);
  assert.match(manualGuard, /\$\{TRIGGERING_ACTOR,,\}/);

  const scheduledGuard = workflow.slice(scheduledBranch, checkout);
  assert.match(scheduledGuard, /17 3 \* \* \*/);
  assert.match(scheduledGuard, /47 3 \* \* 0/);
});

test("production email, operator provisioning and rollback prove CI before their first mutation", async () => {
  const cases = [
    {
      path: ".github/workflows/verify-production-email.yml",
      mutation: "Prove synthetic email delivery without customer data",
      binding: /CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \}\}/,
    },
    {
      path: ".github/workflows/provision-production-operator.yml",
      mutation: "Provision the confirmed MFA operator without exposing identity",
      binding: /CANDIDATE_SHA: \$\{\{ github\.sha \}\}/,
    },
    {
      path: ".github/workflows/rollback-production.yml",
      mutation: "Restore exact prior production Pages deployment",
      binding: /CANDIDATE_SHA: \$\{\{ github\.sha \}\}/,
    },
  ];

  for (const { path, mutation, binding } of cases) {
    const workflow = await readFile(path, "utf8");
    const mutationOffset = workflow.indexOf(mutation);
    const ciOffset = workflow.lastIndexOf("check-github-controls.mjs", mutationOffset);
    assert.ok(
      mutationOffset > 0 && ciOffset > 0 && ciOffset < mutationOffset,
      `${path}: CI gate order invalid`,
    );
    assert.match(workflow.slice(ciOffset, mutationOffset), binding, `${path}: CI gate SHA binding invalid`);
  }
});

test("release artifact downloads use the pinned action that fails on digest mismatch", async () => {
  for (const path of artifactDownloadWorkflowPaths) {
    const workflow = await readFile(path, "utf8");
    const downloads = workflow.match(/^\s*uses:\s*actions\/download-artifact@.*$/gm) ?? [];
    assert.ok(downloads.length > 0, `${path}: artifact download missing`);
    for (const download of downloads)
      assert.ok(download.includes(digestEnforcingDownloadAction), `${path}: non-enforcing download action`);
  }
});
