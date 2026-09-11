import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadCmsUiCreatedState,
  writeCmsUiCreatedState,
  type CmsUiCreatedState,
} from "../e2e/cms-ui-created-state";

const roots: string[] = [];
const sha = "a".repeat(40);
const state: CmsUiCreatedState = {
  schemaVersion: 1,
  status: "ready",
  environment: "staging",
  candidateSha: sha,
  runTag: "QA-CMS-FINAL-20260907-aaaaaaaa",
  lease: {
    actorId: "80000000-0000-4000-8000-000000000001",
    source: "cms-browser-fixture",
    resourceIdsCaptured: true,
  },
  ids: {
    contentId: "80000000-0000-4000-8000-000000000002",
    productId: "80000000-0000-4000-8000-000000000003",
    serviceId: "80000000-0000-4000-8000-000000000004",
    industryId: "80000000-0000-4000-8000-000000000005",
    applicationId: "80000000-0000-4000-8000-000000000006",
    solutionId: "80000000-0000-4000-8000-000000000007",
    pageId: "80000000-0000-4000-8000-000000000008",
    campaignId: "80000000-0000-4000-8000-000000000009",
  },
  form: {
    id: "80000000-0000-4000-8000-000000000010",
    versionId: "80000000-0000-4000-8000-000000000011",
    // Chaves como a UI as deriva: do titulo e do rotulo, nunca digitadas.
    key: "qa-cms-final-20260907-aaaaaaaa-formulario-operacional-deadbeef",
    fieldKey: "qa-cms-final-20260907-aaaaaaaa-e-mail-sintetico",
    status: "published",
  },
  lead: {
    reference: "LD-QAFINAL001",
    status: "responded",
    campaignPath: "/campanhas/qa-final-aaaaaaaa",
  },
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "cms-ui-state-"));
  roots.push(root);
  return root;
}

describe("CMS UI-created handoff state", () => {
  it("writes atomically and loads only the exact SHA, run and environment binding", () => {
    const repositoryRoot = temporaryRoot();
    writeCmsUiCreatedState({ repositoryRoot, state });
    expect(
      loadCmsUiCreatedState({
        repositoryRoot,
        expectedEnvironment: "staging",
        expectedSha: sha,
        expectedRunTag: state.runTag,
      }),
    ).toEqual(state);
    if (process.platform !== "win32") {
      expect(statSync(join(repositoryRoot, "outputs/cms-ui-created-state.json")).mode & 0o777).toBe(0o600);
    }
    expect(() =>
      loadCmsUiCreatedState({
        repositoryRoot,
        expectedEnvironment: "staging",
        expectedSha: "b".repeat(40),
        expectedRunTag: state.runTag,
      }),
    ).toThrow(/QA_CMS_UI_STATE_BINDING_INVALID/);
  });

  it("refuses schema drift, paths outside the repository and malformed form keys", () => {
    const repositoryRoot = temporaryRoot();
    writeCmsUiCreatedState({ repositoryRoot, state });
    const path = join(repositoryRoot, "outputs/cms-ui-created-state.json");
    const extra = { ...JSON.parse(readFileSync(path, "utf8")), unexpected: true };
    writeFileSync(path, JSON.stringify(extra));
    expect(() =>
      loadCmsUiCreatedState({
        repositoryRoot,
        expectedEnvironment: "staging",
        expectedSha: sha,
        expectedRunTag: state.runTag,
      }),
    ).toThrow(/QA_CMS_UI_STATE_SCHEMA_INVALID/);
    expect(() => writeCmsUiCreatedState({ repositoryRoot, state, path: "../escaped.json" })).toThrow(
      /QA_CMS_UI_STATE_PATH_REFUSED/,
    );

    const malformedRoot = temporaryRoot();
    expect(() =>
      writeCmsUiCreatedState({
        repositoryRoot: malformedRoot,
        state: { ...state, form: { ...state.form, key: "qa_invalid_legacy_key" } },
      }),
    ).toThrow(/QA_CMS_UI_STATE_BINDING_INVALID/);

    const mismatchedRoot = temporaryRoot();
    expect(() =>
      writeCmsUiCreatedState({
        repositoryRoot: mismatchedRoot,
        state: {
          ...state,
          form: { ...state.form, key: "qa-ops-qa-cms-final-20260907-bbbbbbbb-deadbeef" },
        },
      }),
    ).toThrow(/QA_CMS_UI_STATE_BINDING_INVALID/);
  });
});
