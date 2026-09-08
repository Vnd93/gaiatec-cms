import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CmsUiCreatedState = {
  schemaVersion: 1;
  status: "ready";
  environment: "staging" | "production";
  candidateSha: string;
  runTag: string;
  lease: {
    actorId: string;
    source: "cms-browser-fixture";
    resourceIdsCaptured: true;
  };
  ids: {
    contentId: string;
    productId: string;
    serviceId: string;
    industryId: string;
    applicationId: string;
    solutionId: string;
    pageId: string;
    campaignId: string;
  };
  form: { id: string; versionId: string; key: string; status: "published" };
  lead: {
    reference: string;
    status: "new" | "assigned" | "in_service" | "responded" | "converted" | "disqualified" | "archived";
    campaignPath: string;
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("QA_CMS_UI_STATE_SCHEMA_INVALID");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error("QA_CMS_UI_STATE_SCHEMA_INVALID");
  }
}

function assertContained(repositoryRoot: string, target: string) {
  const fromRoot = relative(realpathSync(repositoryRoot), realpathSync(target));
  if (fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("QA_CMS_UI_STATE_PATH_REFUSED");
  }
}

export function loadCmsUiCreatedState(input: {
  repositoryRoot: string;
  expectedEnvironment: "staging" | "production";
  expectedSha: string;
  expectedRunTag: string;
  path?: string;
}): CmsUiCreatedState {
  const file = resolve(
    input.repositoryRoot,
    input.path ?? process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json",
  );
  const fromRoot = relative(resolve(input.repositoryRoot), file);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("QA_CMS_UI_STATE_PATH_REFUSED");
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 64 * 1024) {
    throw new Error("QA_CMS_UI_STATE_FILE_REFUSED");
  }
  assertContained(input.repositoryRoot, file);
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error("QA_CMS_UI_STATE_FILE_MODE_REFUSED");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = record(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("QA_CMS_UI_STATE_")) throw error;
    throw new Error("QA_CMS_UI_STATE_JSON_INVALID", { cause: error });
  }
  exactKeys(parsed, [
    "schemaVersion",
    "status",
    "environment",
    "candidateSha",
    "runTag",
    "lease",
    "ids",
    "form",
    "lead",
  ]);
  const lease = record(parsed.lease);
  const ids = record(parsed.ids);
  const form = record(parsed.form);
  const lead = record(parsed.lead);
  exactKeys(lease, ["actorId", "source", "resourceIdsCaptured"]);
  exactKeys(ids, [
    "contentId",
    "productId",
    "serviceId",
    "industryId",
    "applicationId",
    "solutionId",
    "pageId",
    "campaignId",
  ]);
  exactKeys(form, ["id", "versionId", "key", "status"]);
  exactKeys(lead, ["reference", "status", "campaignPath"]);

  const idValues = [lease.actorId, ...Object.values(ids), form.id, form.versionId];
  if (
    parsed.schemaVersion !== 1 ||
    parsed.status !== "ready" ||
    parsed.environment !== input.expectedEnvironment ||
    parsed.candidateSha !== input.expectedSha ||
    parsed.runTag !== input.expectedRunTag ||
    lease.source !== "cms-browser-fixture" ||
    lease.resourceIdsCaptured !== true ||
    idValues.some((value) => typeof value !== "string" || !uuidPattern.test(value)) ||
    typeof form.key !== "string" ||
    form.key.length > 150 ||
    !/^qa-ops-qa-cms-final-[0-9]{8}-[0-9a-f]{8}-[a-z0-9]+$/.test(form.key) ||
    !form.key.startsWith(`qa-ops-${String(parsed.runTag).toLowerCase()}-`) ||
    form.status !== "published" ||
    typeof lead.reference !== "string" ||
    !/^LD-[A-Z0-9]+$/.test(lead.reference) ||
    typeof lead.status !== "string" ||
    !["new", "assigned", "in_service", "responded", "converted", "disqualified", "archived"].includes(
      lead.status,
    ) ||
    typeof lead.campaignPath !== "string" ||
    !/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lead.campaignPath)
  ) {
    throw new Error("QA_CMS_UI_STATE_BINDING_INVALID");
  }
  return parsed as CmsUiCreatedState;
}

export function writeCmsUiCreatedState(input: {
  repositoryRoot: string;
  state: CmsUiCreatedState;
  path?: string;
}) {
  const destination = resolve(
    input.repositoryRoot,
    input.path ?? process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json",
  );
  const fromRoot = relative(resolve(input.repositoryRoot), destination);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("QA_CMS_UI_STATE_PATH_REFUSED");
  }
  mkdirSync(dirname(destination), { recursive: true });
  assertContained(input.repositoryRoot, dirname(destination));
  if (existsSync(destination)) {
    const existing = lstatSync(destination);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error("QA_CMS_UI_STATE_FILE_REFUSED");
    }
    assertContained(input.repositoryRoot, destination);
  }
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(input.state, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    loadCmsUiCreatedState({
      repositoryRoot: input.repositoryRoot,
      expectedEnvironment: input.state.environment,
      expectedSha: input.state.candidateSha,
      expectedRunTag: input.state.runTag,
      path: temporary,
    });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}
