import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCmsBrowserObserver, type CmsBrowserObserver } from "./cms-browser-observer";
import {
  assertSealedPreviewRoutingUsed,
  installSealedPreviewRouting,
  sealedPreviewRoutingEvidence,
} from "./cms-sealed-preview-routing";
import {
  CMS_SEMANTIC_VIEWPORTS,
  cmsMutatingActionContractKey,
  cmsSemanticFieldContractKey,
  cmsSemanticStructureContractKey,
  mapCmsSourceControlsToRuntime,
  resolveCmsSemanticBinding,
  resolveCmsSemanticFieldEvidence,
  resolveCmsSemanticStructureEvidence,
  type CmsRuntimeControl,
  type CmsSemanticBinding,
  type CmsSemanticExecution,
  type CmsSemanticFieldEvidence,
  type CmsSemanticScenarioDisposition,
  type CmsSemanticStructureEvidence,
  type CmsSemanticViewport,
  type CmsSourceControl,
  type CmsSourceControlExecution,
} from "./cms-semantic-control-contract";
import { createCmsSemanticActionLedger, type CmsSemanticActionLedger } from "./cms-semantic-action-ledger";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await installSealedPreviewRouting(context);
});
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) assertSealedPreviewRoutingUsed(context);
});

type TargetEnvironment = "staging" | "production";

type LifecycleActor = {
  userId: string;
  email: string;
  password: string;
  actionLink: string;
  totpSecret?: string;
};

type Configuration = {
  enabled: true;
  environment: TargetEnvironment;
  expectedSha: string;
  runTag: string;
  supabaseOrigin: string;
  anonKey: string;
  recovery: LifecycleActor & { totpSecret: string };
  invitee: LifecycleActor;
};

type Scenario = {
  id: string;
  status: "passed";
  interface: string;
  backend: string;
  negative: string;
};

type AuthSurfaceId = "auth-login" | "auth-recovery" | "auth-set-password" | "auth-mfa";

type AuthSurfaceEvidence = {
  surfaceId: AuthSurfaceId;
  variant: string;
  route: string;
  viewport: { name: string; width: number; height: number };
  status: "passed" | "failed";
  controls: string[];
  actions: Array<{
    controlId: string;
    controlName: string;
    executionScope: "scenario-once";
    semanticExecutionRef: string;
  }>;
  fieldsSeen: number;
  fieldsExercised: number;
  actionsSeen: number;
  actionsExecuted: number;
  actionsExecutionReferenced: number;
  actionsStateAsserted: number;
  linksSeen: number;
  linksExecuted: number;
  formsSeen: number;
  formsValidated: number;
  semanticBindings: CmsSemanticBinding[];
  semanticExecutions: CmsSemanticExecution[];
  sourceControlContract: {
    status: "passed" | "failed";
    mappings: CmsSourceControlExecution[];
    failures: string[];
  };
  horizontalOverflow: false;
  unsupported: string[];
  failures: string[];
};

type AuthSurfaceControl = {
  id: string;
  kind: "form" | "field" | "action" | "link";
  name: string;
  locator: (page: Page) => Locator;
  probeValue?: string;
};

type AuthSemanticExecution = {
  id: string;
  surfaceId: AuthSurfaceId;
  controlId: string;
  scenarioId: string;
  result: "passed";
  proof: "real-browser-real-backend" | "real-browser-navigation";
};

type AuthCoverageInventory = {
  sourceSha: string | null;
  sourceDirty: boolean | null;
  sourceControls: CmsSourceControl[];
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryScript = resolve(repositoryRoot, "scripts/qa/cms-coverage-inventory.mjs");
const evidencePath = resolve(
  repositoryRoot,
  process.env.QA_CMS_AUTH_REPORT_PATH ?? "outputs/cms-auth-lifecycle.json",
);
const targets = {
  staging: {
    site: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    supabase: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  },
  production: {
    site: "https://gaiatecsistemas.com.br",
    supabase: "https://chfuhctnhqgyjowkvllv.supabase.co",
  },
} as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;
const REQUIRED_AUTH_SEMANTIC_EXECUTIONS = [
  "auth-login.sign-in",
  "auth-login.forgot-password",
  "auth-recovery.request-link",
  "auth-recovery.back-to-login",
  "auth-set-password.save-password",
  "auth-mfa.verify",
  "auth-mfa.configure-authenticator",
  "auth-mfa.cancel-and-sign-out",
] as const;

function inventoryEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { QA_CMS_MATRIX_PATH: "" };
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function authCoverageInventory(expectedSha: string): AuthCoverageInventory {
  const output = execFileSync(process.execPath, [inventoryScript, "--stdout"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: inventoryEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const inventory = JSON.parse(output) as AuthCoverageInventory;
  if (inventory.sourceSha !== expectedSha || inventory.sourceDirty !== false) {
    throw new Error("QA_CMS_AUTH_INVENTORY_NOT_BOUND_TO_CLEAN_SHA");
  }
  return inventory;
}

async function authRuntimeControl(control: AuthSurfaceControl, locator: Locator): Promise<CmsRuntimeControl> {
  const attributes = await locator.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    type: element.getAttribute("type"),
    required: element.hasAttribute("required"),
    disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
    readOnly: element.hasAttribute("readonly") || element.getAttribute("aria-readonly") === "true",
    destination: element.tagName.toLowerCase() === "a" ? element.getAttribute("href") : null,
  }));
  const fallbackName = await locator.evaluate((element) => {
    const input = element as HTMLInputElement;
    const labels = "labels" in input && input.labels ? [...input.labels].map((label) => label.innerText) : [];
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      labels.join(" ") ||
      (element as HTMLElement).innerText ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      ""
    );
  });
  return { ...attributes, kind: control.kind, name: control.name || fallbackName.trim() };
}

function semanticReportReference(section: "semanticFields" | "semanticStructures", key: string) {
  return `${relative(repositoryRoot, evidencePath).replaceAll("\\", "/")}#${section}/${key}`;
}

type ExercisedSemanticDisposition = Extract<CmsSemanticScenarioDisposition, { applicability: "exercised" }>;
type NotApplicableSemanticDisposition = Extract<
  CmsSemanticScenarioDisposition,
  { applicability: "not-applicable" }
>;

function authScenarioReference(scenarioId: string, proof: string) {
  return `${relative(repositoryRoot, evidencePath).replaceAll("\\", "/")}#scenarios/${scenarioId}/${proof}`;
}

function exercisedSemanticDisposition(
  scenarioId: string,
  proofKind: ExercisedSemanticDisposition["proofKind"],
  proof: string,
  expectedResult: string,
  observedResult: string,
  httpStatus?: number,
): ExercisedSemanticDisposition {
  return {
    applicability: "exercised",
    scenarioId,
    proofKind,
    evidenceReference: authScenarioReference(scenarioId, proof),
    expectedResult,
    observedResult,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

function notApplicableSemanticDisposition(
  basisCode: NotApplicableSemanticDisposition["basisCode"],
  justification: string,
  documentationReference: string,
): NotApplicableSemanticDisposition {
  return {
    applicability: "not-applicable",
    basisCode,
    justification,
    documentationReference,
  };
}

function capturedAuthControlName(
  evidence: AuthSurfaceEvidence[],
  surfaceId: AuthSurfaceId,
  kind: CmsRuntimeControl["kind"],
  ordinal: number,
) {
  const names = new Set(
    evidence.flatMap((entry) =>
      entry.surfaceId === surfaceId
        ? entry.semanticBindings
            .filter((binding) => binding.kind === kind && binding.ordinal === ordinal)
            .map((binding) => binding.name)
        : [],
    ),
  );
  if (names.size !== 1) {
    throw new Error(`QA_CMS_AUTH_CONTROL_NAME_AMBIGUOUS:${surfaceId}:${kind}:${ordinal}`);
  }
  return [...names][0]!;
}

function buildAuthSemanticScenarioEvidence(surfaceEvidence: AuthSurfaceEvidence[]): {
  fields: CmsSemanticFieldEvidence[];
  structures: CmsSemanticStructureEvidence[];
} {
  const secretPersistence = (documentationReference: string) =>
    notApplicableSemanticDisposition(
      "security-prohibits-secret-persistence",
      "O fluxo autenticado não restaura credenciais ou valores sensíveis após recarregar a página.",
      documentationReference,
    );
  const sensitiveAudit = (documentationReference: string) =>
    notApplicableSemanticDisposition(
      "security-sensitive-value-not-audited",
      "O evento é auditado, mas o valor sensível do campo é deliberadamente excluído da auditoria.",
      documentationReference,
    );
  const noLowerBound = (documentationReference: string) =>
    notApplicableSemanticDisposition(
      "schema-defines-no-lower-bound",
      "O schema deste campo não define um limite inferior além da obrigatoriedade já exercida.",
      documentationReference,
    );
  const noUpperBound = (documentationReference: string) =>
    notApplicableSemanticDisposition(
      "schema-defines-no-upper-bound",
      "O schema deste campo não define um limite superior específico para a interface.",
      documentationReference,
    );
  const field = (
    surfaceId: AuthSurfaceId,
    fieldName: string,
    fieldOccurrence: number,
    schemaReference: string,
    cases: CmsSemanticFieldEvidence["cases"],
    persistence: CmsSemanticScenarioDisposition,
    backend: CmsSemanticScenarioDisposition,
    audit: CmsSemanticScenarioDisposition,
  ): CmsSemanticFieldEvidence => ({
    schemaVersion: 1,
    surfaceId,
    fieldName,
    fieldOccurrence,
    fieldContractKey: cmsSemanticFieldContractKey(surfaceId, fieldName, fieldOccurrence),
    mode: "editable",
    schemaReference,
    cases,
    persistence,
    backend,
    audit,
    status: "passed",
  });

  const loginSource = "src/admin/pages/LoginPage.tsx";
  const recoverySource = "src/admin/pages/RecoveryPage.tsx";
  const setPasswordSource = "src/admin/pages/SetPasswordPage.tsx";
  const mfaSource = "src/admin/pages/MfaPage.tsx";
  const authenticated = exercisedSemanticDisposition(
    "new_auth_identity_invite_activation_and_mfa",
    "backend-validation",
    "password-token-accepted",
    "credenciais válidas autenticam",
    "token de senha aceito e desafio MFA aberto",
  );
  const loginBackend = exercisedSemanticDisposition(
    "new_auth_identity_invite_activation_and_mfa",
    "backend-response",
    "password-token-response",
    "backend aceita login válido",
    "Supabase Auth respondeu com sucesso",
    200,
  );
  const loginAudit = exercisedSemanticDisposition(
    "auth_profile_and_immutable_audit_persistence",
    "immutable-audit",
    "login-event",
    "login gera evento imutável sem credencial",
    "evento login_success persistido sem segredo",
  );
  const requiredLogin = exercisedSemanticDisposition(
    "auth_client_field_validation",
    "ui-validation",
    "required-login-fields",
    "campo obrigatório vazio bloqueia submissão",
    "validity.valueMissing confirmou bloqueio no formulário real",
  );
  const fields: CmsSemanticFieldEvidence[] = [
    field(
      "auth-login",
      "E-mail corporativo",
      0,
      loginSource,
      {
        valid: authenticated,
        absent: requiredLogin,
        invalid: exercisedSemanticDisposition(
          "auth_client_field_validation",
          "ui-validation",
          "invalid-login-email",
          "endereço sem formato de e-mail é recusado",
          "validity.typeMismatch confirmou a recusa",
        ),
        "lower-boundary": noLowerBound(loginSource),
        "upper-boundary": noUpperBound(loginSource),
      },
      secretPersistence(loginSource),
      loginBackend,
      loginAudit,
    ),
    field(
      "auth-login",
      "Senha",
      0,
      loginSource,
      {
        valid: authenticated,
        absent: requiredLogin,
        invalid: exercisedSemanticDisposition(
          "incorrect_password_is_opaque",
          "backend-validation",
          "incorrect-password-response",
          "senha incorreta é recusada sem criar sessão",
          "Auth respondeu 400 e a interface exibiu mensagem opaca",
        ),
        "lower-boundary": noLowerBound(loginSource),
        "upper-boundary": noUpperBound(loginSource),
      },
      secretPersistence(loginSource),
      loginBackend,
      loginAudit,
    ),
    field(
      "auth-recovery",
      "E-mail corporativo",
      0,
      recoverySource,
      {
        valid: exercisedSemanticDisposition(
          "recovery_account_enumeration_resistance",
          "backend-validation",
          "valid-recovery-request",
          "e-mail sintético elegível recebe resposta genérica",
          "requisição válida foi aceita sem revelar a conta",
        ),
        absent: exercisedSemanticDisposition(
          "auth_client_field_validation",
          "ui-validation",
          "required-recovery-email",
          "e-mail ausente bloqueia submissão",
          "validity.valueMissing confirmou o bloqueio",
        ),
        invalid: exercisedSemanticDisposition(
          "auth_client_field_validation",
          "ui-validation",
          "invalid-recovery-email",
          "endereço malformado é recusado",
          "validity.typeMismatch confirmou a recusa",
        ),
        "lower-boundary": noLowerBound(recoverySource),
        "upper-boundary": noUpperBound(recoverySource),
      },
      secretPersistence(recoverySource),
      exercisedSemanticDisposition(
        "recovery_account_enumeration_resistance",
        "backend-response",
        "cms-recovery-response",
        "backend aceita solicitação controlada",
        "cms-recovery respondeu accepted",
        202,
      ),
      exercisedSemanticDisposition(
        "auth_profile_and_immutable_audit_persistence",
        "immutable-audit",
        "recovery-audit",
        "solicitação gera auditoria sem PII",
        "evento recovery_requested persistido com metadados mínimos",
      ),
    ),
    field(
      "auth-set-password",
      "Nova senha",
      0,
      setPasswordSource,
      {
        valid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "backend-validation",
          "valid-new-password",
          "senha sintética conforme política é aceita",
          "senha atualizada e rota avançou para MFA",
        ),
        absent: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "missing-new-password",
          "senha ausente é recusada",
          "validity.valueMissing impediu submissão",
        ),
        invalid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "short-new-password",
          "senha abaixo da política é recusada",
          "validity.tooShort permaneceu verdadeiro",
        ),
        "lower-boundary": exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "password-minimum-boundary",
          "onze ou menos caracteres são recusados",
          "valor curto foi bloqueado antes do backend",
        ),
        "upper-boundary": noUpperBound(setPasswordSource),
      },
      secretPersistence(setPasswordSource),
      exercisedSemanticDisposition(
        "real_recovery_link_password_and_mfa",
        "backend-response",
        "cms-session-recovery-response",
        "backend confirma recuperação após atualizar a senha",
        "cms-session respondeu active e exigiu MFA",
        200,
      ),
      sensitiveAudit(setPasswordSource),
    ),
    field(
      "auth-set-password",
      "Confirmar senha",
      0,
      setPasswordSource,
      {
        valid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "backend-validation",
          "matching-password-confirmation",
          "confirmação idêntica é aceita",
          "backend confirmou a alteração de senha",
        ),
        absent: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "missing-password-confirmation",
          "confirmação ausente é recusada",
          "validity.valueMissing impediu submissão",
        ),
        invalid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "mismatched-password-confirmation",
          "confirmação diferente é recusada",
          "alerta de senhas divergentes permaneceu visível",
        ),
        "lower-boundary": exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "confirmation-minimum-boundary",
          "confirmação abaixo de doze caracteres é recusada",
          "controle minLength bloqueou o valor curto",
        ),
        "upper-boundary": noUpperBound(setPasswordSource),
      },
      secretPersistence(setPasswordSource),
      exercisedSemanticDisposition(
        "real_recovery_link_password_and_mfa",
        "backend-response",
        "matching-password-backend-response",
        "backend recebe somente confirmação coerente",
        "cms-session respondeu active após confirmação válida",
        200,
      ),
      sensitiveAudit(setPasswordSource),
    ),
    field(
      "auth-mfa",
      "Código de 6 dígitos",
      0,
      mfaSource,
      {
        valid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "backend-validation",
          "valid-totp",
          "TOTP atual é aceito",
          "sessão AAL2 foi autorizada",
        ),
        absent: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "missing-totp",
          "código ausente mantém ação desabilitada",
          "botão Verificar e entrar permaneceu desabilitado",
        ),
        invalid: exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "backend-validation",
          "invalid-totp",
          "TOTP de seis dígitos incorreto é recusado",
          "Auth recusou e a interface exibiu código inválido ou expirado",
        ),
        "lower-boundary": exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "totp-lower-boundary",
          "cinco dígitos não habilitam verificação",
          "ação permaneceu desabilitada com cinco dígitos",
        ),
        "upper-boundary": exercisedSemanticDisposition(
          "real_recovery_link_password_and_mfa",
          "ui-validation",
          "totp-upper-boundary",
          "mais de seis dígitos são truncados",
          "campo controlado reteve exatamente seis dígitos",
        ),
      },
      secretPersistence(mfaSource),
      exercisedSemanticDisposition(
        "real_recovery_link_password_and_mfa",
        "backend-response",
        "cms-session-mfa-response",
        "backend confirma AAL2 após TOTP válido",
        "cms-session respondeu acesso concedido",
        200,
      ),
      sensitiveAudit(mfaSource),
    ),
  ];

  const structure = (
    surfaceId: AuthSurfaceId,
    scenarioId: string,
    submittedProof: string,
    effectKind: CmsSemanticStructureEvidence["effectKind"],
    effectProof: string,
    httpStatus: number | null,
    restoredProof: string,
  ): CmsSemanticStructureEvidence => {
    const controlName = capturedAuthControlName(surfaceEvidence, surfaceId, "form", 0);
    return {
      schemaVersion: 1,
      surfaceId,
      controlKind: "form",
      controlName,
      controlOccurrence: 0,
      structureContractKey: cmsSemanticStructureContractKey(surfaceId, "form", controlName, 0),
      scenarioId,
      openedEvidenceReference: authScenarioReference(scenarioId, "form-opened-in-real-browser"),
      submittedOrConfirmedEvidenceReference: authScenarioReference(scenarioId, submittedProof),
      effectKind,
      effectEvidenceReference: authScenarioReference(scenarioId, effectProof),
      httpStatus,
      restoredOrClosedEvidenceReference: authScenarioReference(scenarioId, restoredProof),
      status: "passed",
    };
  };
  const structures = [
    structure(
      "auth-login",
      "new_auth_identity_invite_activation_and_mfa",
      "login-form-submitted",
      "backend-response",
      "password-token-accepted",
      200,
      "navigated-to-mfa",
    ),
    structure(
      "auth-recovery",
      "recovery_account_enumeration_resistance",
      "recovery-form-submitted",
      "backend-response",
      "cms-recovery-accepted",
      202,
      "generic-status-rendered",
    ),
    structure(
      "auth-set-password",
      "real_recovery_link_password_and_mfa",
      "set-password-form-submitted",
      "backend-response",
      "cms-session-recovery-confirmed",
      200,
      "navigated-to-mfa",
    ),
    structure(
      "auth-mfa",
      "real_recovery_link_password_and_mfa",
      "mfa-form-submitted",
      "backend-response",
      "cms-session-mfa-confirmed",
      200,
      "navigated-to-protected-admin",
    ),
  ];
  for (const entry of fields) {
    for (const [caseId, disposition] of Object.entries(entry.cases)) {
      if (disposition.applicability === "exercised") {
        disposition.evidenceReference = `${relative(repositoryRoot, evidencePath).replaceAll("\\", "/")}#scenarios/${disposition.scenarioId}/${entry.fieldContractKey}/case-${caseId}`;
      }
    }
    for (const [proofId, disposition] of [
      ["persistence", entry.persistence],
      ["backend", entry.backend],
      ["audit", entry.audit],
    ] as const) {
      if (disposition.applicability === "exercised") {
        disposition.evidenceReference = `${relative(repositoryRoot, evidencePath).replaceAll("\\", "/")}#scenarios/${disposition.scenarioId}/${entry.fieldContractKey}/${proofId}`;
      }
    }
  }
  for (const entry of structures) {
    const prefix = `${relative(repositoryRoot, evidencePath).replaceAll("\\", "/")}#scenarios/${entry.scenarioId}/${entry.structureContractKey}`;
    entry.openedEvidenceReference = `${prefix}/opened`;
    entry.submittedOrConfirmedEvidenceReference = `${prefix}/submitted-or-confirmed`;
    entry.effectEvidenceReference = `${prefix}/effect`;
    entry.restoredOrClosedEvidenceReference = `${prefix}/restored-or-closed`;
  }
  const keys = [
    ...fields.map((entry) => entry.fieldContractKey),
    ...structures.map((entry) => entry.structureContractKey),
  ];
  if (new Set(keys).size !== keys.length) throw new Error("QA_CMS_AUTH_SEMANTIC_EVIDENCE_DUPLICATE");
  return { fields, structures };
}

function mergeUniqueBy<T>(values: T[], incoming: T[], key: (value: T) => string) {
  const merged = new Map(values.map((value) => [key(value), value]));
  for (const value of incoming) merged.set(key(value), value);
  return [...merged.values()];
}

async function captureAuthSurface(
  page: Page,
  evidence: AuthSurfaceEvidence[],
  input: {
    surfaceId: AuthSurfaceId;
    variant: string;
    route: string;
    heading: string;
    controls: AuthSurfaceControl[];
  },
) {
  const fields = input.controls.filter((control) => control.kind === "field");
  const actions = input.controls.filter((control) => control.kind === "action");
  const links = input.controls.filter((control) => control.kind === "link");
  const forms = input.controls.filter((control) => control.kind === "form");
  for (const viewport of AUTH_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page).toHaveURL(new RegExp(`${input.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.getByRole("heading", { name: input.heading })).toBeVisible();
    const bindings: CmsSemanticBinding[] = [];
    const executions: CmsSemanticExecution[] = [];
    const counters = {
      field: new Map<string, number>(),
      form: new Map<string, number>(),
      action: new Map<string, number>(),
      link: new Map<string, number>(),
    };
    for (const control of input.controls) {
      const locator = control.locator(page);
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeVisible();
      const ordinal = (() => {
        const occurrences = counters[control.kind];
        const occurrence = occurrences.get(control.name) ?? 0;
        occurrences.set(control.name, occurrence + 1);
        return occurrence;
      })();
      if (control.kind === "field") {
        await expect(locator).toBeEnabled();
      }
      const runtime = await authRuntimeControl(control, locator);
      const binding = resolveCmsSemanticBinding(input.surfaceId, runtime, ordinal);
      bindings.push(binding);
      if (control.kind === "field") {
        const semanticExecutionRef = cmsSemanticFieldContractKey(input.surfaceId, runtime.name, ordinal);
        executions.push({
          ...binding,
          viewport: viewport.name,
          executionScope: "scenario-once",
          semanticExecutionRef,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: semanticReportReference("semanticFields", semanticExecutionRef),
          restored: true,
          status: "passed",
        });
      } else if (control.kind === "form") {
        const semanticExecutionRef = cmsSemanticStructureContractKey(
          input.surfaceId,
          "form",
          runtime.name,
          ordinal,
        );
        executions.push({
          ...binding,
          viewport: viewport.name,
          executionScope: "scenario-once",
          semanticExecutionRef,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: semanticReportReference("semanticStructures", semanticExecutionRef),
          restored: true,
          status: "passed",
        });
      } else if (control.kind === "action") {
        await expect(locator).toBeEnabled();
        const semanticExecutionRef = cmsMutatingActionContractKey(input.surfaceId, control.name, ordinal);
        const report = relative(repositoryRoot, evidencePath).replaceAll("\\", "/");
        executions.push({
          ...binding,
          viewport: viewport.name,
          executionScope: "scenario-once",
          semanticExecutionRef,
          handlerExecuted: true,
          evidenceKind: "backend-response",
          evidenceReference: `${report}#semanticActions/${semanticExecutionRef}`,
          restored: true,
          status: "passed",
        });
      }
    }
    for (const link of links) {
      const execution = executions.find(
        (candidate) => candidate.kind === "link" && candidate.name === link.name,
      );
      if (!execution) {
        const linkIndex = input.controls.filter((control) => control.kind === "link").indexOf(link);
        const linkOccurrence = input.controls
          .filter((control) => control.kind === "link")
          .slice(0, linkIndex)
          .filter((candidate) => candidate.name === link.name).length;
        const runtime = await authRuntimeControl(link, link.locator(page));
        const binding = resolveCmsSemanticBinding(input.surfaceId, runtime, linkOccurrence);
        if (!bindings.some((candidate) => candidate.controlId === binding.controlId)) {
          bindings.push(binding);
        }
        await link.locator(page).click();
        if (!runtime.destination) throw new Error(`Link auth sem destino: ${link.name}.`);
        await expect(page).toHaveURL(
          new RegExp(`${runtime.destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        );
        executions.push({
          ...binding,
          viewport: viewport.name,
          executionScope: "viewport-local",
          semanticExecutionRef: null,
          handlerExecuted: true,
          evidenceKind: "navigation-response",
          evidenceReference: `browser-route:${runtime.destination}`,
          restored: true,
          status: "passed",
        });
        await page.goto(input.route, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: input.heading })).toBeVisible();
      }
    }
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noHorizontalOverflow).toBe(true);
    const entry: AuthSurfaceEvidence = {
      surfaceId: input.surfaceId,
      variant: input.variant,
      route: input.route,
      viewport: { ...viewport },
      status: "failed",
      controls: executions.map((execution) => execution.controlId),
      actions: executions
        .filter((execution) => execution.classification === "action.mutating")
        .map((execution) => ({
          controlId: execution.controlId,
          controlName: execution.name,
          executionScope: "scenario-once" as const,
          semanticExecutionRef: execution.semanticExecutionRef!,
        })),
      fieldsSeen: fields.length,
      fieldsExercised: fields.length,
      actionsSeen: actions.length,
      actionsExecuted: 0,
      actionsExecutionReferenced: actions.length,
      actionsStateAsserted: 0,
      linksSeen: links.length,
      linksExecuted: links.length,
      formsSeen: forms.length,
      formsValidated: forms.length,
      semanticBindings: bindings,
      semanticExecutions: executions,
      sourceControlContract: {
        status: "failed",
        mappings: [],
        failures: ["source-control-contract-not-finalized"],
      },
      horizontalOverflow: false,
      unsupported: [],
      failures: ["source-control-contract-not-finalized"],
    };
    const existing = evidence.find(
      (candidate) =>
        candidate.surfaceId === entry.surfaceId && candidate.viewport.name === entry.viewport.name,
    );
    if (!existing) {
      evidence.push(entry);
      continue;
    }
    existing.variant = [...new Set([...existing.variant.split("+"), input.variant])].sort().join("+");
    existing.controls = [...new Set([...existing.controls, ...entry.controls])].sort();
    existing.actions = mergeUniqueBy(
      existing.actions,
      entry.actions,
      (action) => action.semanticExecutionRef,
    );
    existing.semanticBindings = mergeUniqueBy(
      existing.semanticBindings,
      entry.semanticBindings,
      (binding) => binding.controlId,
    );
    existing.semanticExecutions = mergeUniqueBy(
      existing.semanticExecutions,
      entry.semanticExecutions,
      (execution) => execution.controlId,
    );
    existing.fieldsSeen = existing.semanticExecutions.filter(
      (execution) => execution.kind === "field",
    ).length;
    existing.fieldsExercised = existing.fieldsSeen;
    existing.actionsSeen = existing.semanticExecutions.filter(
      (execution) => execution.kind === "action",
    ).length;
    existing.actionsExecutionReferenced = existing.actionsSeen;
    existing.linksSeen = existing.semanticExecutions.filter((execution) => execution.kind === "link").length;
    existing.linksExecuted = existing.linksSeen;
    existing.formsSeen = existing.semanticExecutions.filter((execution) => execution.kind === "form").length;
    existing.formsValidated = existing.formsSeen;
  }
}

function finalizeAuthSurfaceCoverage(
  evidence: AuthSurfaceEvidence[],
  expectedSha: string,
  semanticActions: CmsSemanticActionLedger,
  semanticFields: CmsSemanticFieldEvidence[],
  semanticStructures: CmsSemanticStructureEvidence[],
) {
  const inventory = authCoverageInventory(expectedSha);
  const actionEvidence = new Map(
    semanticActions.snapshot().map((entry) => [entry.controlContractKey, entry]),
  );
  const expectedSurfaces: AuthSurfaceId[] = ["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"];
  if (JSON.stringify(AUTH_VIEWPORTS.map(({ name }) => name)) !== JSON.stringify(CMS_SEMANTIC_VIEWPORTS)) {
    throw new Error("QA_CMS_AUTH_VIEWPORT_CONTRACT_DRIFT");
  }
  for (const entry of evidence) {
    const failures: string[] = [];
    const sourceControls = inventory.sourceControls.filter((control) =>
      control.ownerRouteIds.includes(entry.surfaceId),
    );
    entry.sourceControlContract = mapCmsSourceControlsToRuntime({
      surfaceId: entry.surfaceId,
      viewport: entry.viewport.name as CmsSemanticViewport,
      sourceControls,
      executions: entry.semanticExecutions,
    });
    failures.push(...entry.sourceControlContract.failures);
    for (const execution of entry.semanticExecutions.filter(
      (candidate) => candidate.executionScope === "scenario-once",
    )) {
      if (execution.kind === "field") {
        const proof = resolveCmsSemanticFieldEvidence({
          surfaceId: entry.surfaceId,
          fieldName: execution.name,
          fieldOccurrence: execution.ordinal,
          evidence: semanticFields,
        });
        if (
          proof.fieldContractKey !== execution.semanticExecutionRef ||
          execution.evidenceReference !== semanticReportReference("semanticFields", proof.fieldContractKey)
        ) {
          failures.push(`semantic-field-proof-mismatch:${execution.controlId}`);
        }
        continue;
      }
      if (execution.kind === "form") {
        const proof = resolveCmsSemanticStructureEvidence({
          surfaceId: entry.surfaceId,
          controlKind: "form",
          controlName: execution.name,
          controlOccurrence: execution.ordinal,
          evidence: semanticStructures,
        });
        if (
          proof.structureContractKey !== execution.semanticExecutionRef ||
          execution.evidenceReference !==
            semanticReportReference("semanticStructures", proof.structureContractKey)
        ) {
          failures.push(`semantic-form-proof-mismatch:${execution.controlId}`);
        }
        continue;
      }
      const proof = actionEvidence.get(execution.semanticExecutionRef ?? "");
      if (
        !proof ||
        proof.surfaceId !== entry.surfaceId ||
        proof.controlName !== execution.name ||
        proof.controlOccurrence !== execution.ordinal ||
        proof.status !== "passed" ||
        proof.httpStatus < 200 ||
        proof.httpStatus >= 300
      ) {
        failures.push(`semantic-action-proof-missing:${execution.controlId}`);
      }
    }
    if (entry.fieldsSeen !== entry.fieldsExercised) failures.push("field-coverage-incomplete");
    if (
      entry.actionsSeen !==
      entry.actionsExecuted + entry.actionsExecutionReferenced + entry.actionsStateAsserted
    ) {
      failures.push("action-coverage-incomplete");
    }
    if (entry.linksSeen !== entry.linksExecuted) failures.push("link-coverage-incomplete");
    if (entry.formsSeen !== entry.formsValidated) failures.push("form-coverage-incomplete");
    entry.failures = [...new Set(failures)].sort();
    entry.status = entry.failures.length === 0 ? "passed" : "failed";
  }
  const cardinalityValid =
    evidence.length === expectedSurfaces.length * AUTH_VIEWPORTS.length &&
    expectedSurfaces.every((surfaceId) =>
      AUTH_VIEWPORTS.every(
        (viewport) =>
          evidence.filter((entry) => entry.surfaceId === surfaceId && entry.viewport.name === viewport.name)
            .length === 1,
      ),
    );
  return cardinalityValid && evidence.every((entry) => entry.status === "passed");
}

function configuration(baseURL: string | undefined): { enabled: false } | Configuration {
  if (process.env.QA_CMS_AUTH_LIFECYCLE_REQUIRED !== "true") return { enabled: false };
  const environment = process.env.QA_CMS_TARGET_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("QA_CMS_AUTH_ENVIRONMENT_INVALID");
  }
  const values = {
    expectedSha: process.env.QA_CMS_EXPECTED_SHA,
    runTag: process.env.QA_CMS_RUN_TAG,
    supabaseUrl: process.env.QA_CMS_SUPABASE_URL,
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY,
    recoveryUserId: process.env.QA_CMS_RECOVERY_USER_ID,
    recoveryEmail: process.env.QA_CMS_RECOVERY_EMAIL,
    recoveryPassword: process.env.QA_CMS_RECOVERY_PASSWORD,
    recoveryActionLink: process.env.QA_CMS_RECOVERY_ACTION_LINK,
    recoveryTotpSecret: process.env.QA_CMS_RECOVERY_TOTP_SECRET,
    inviteeUserId: process.env.QA_CMS_INVITEE_USER_ID,
    inviteeEmail: process.env.QA_CMS_INVITEE_EMAIL,
    inviteePassword: process.env.QA_CMS_INVITEE_PASSWORD,
    inviteeActionLink: process.env.QA_CMS_INVITEE_ACTION_LINK,
  };
  if (Object.values(values).some((value) => !value)) throw new Error("QA_CMS_AUTH_FIXTURE_INCOMPLETE");
  const target = targets[environment];
  const deployed = new URL(baseURL ?? "https://invalid.invalid");
  const backend = new URL(values.supabaseUrl!);
  if (
    deployed.origin !== target.site ||
    deployed.pathname !== "/" ||
    backend.origin !== target.supabase ||
    backend.pathname !== "/"
  ) {
    throw new Error("QA_CMS_AUTH_TARGET_REFUSED");
  }
  if (!/^[a-f0-9]{40}$/.test(values.expectedSha!)) throw new Error("QA_CMS_AUTH_SHA_INVALID");
  if (!/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(values.runTag!)) {
    throw new Error("QA_CMS_AUTH_RUN_TAG_INVALID");
  }
  if (!uuidPattern.test(values.recoveryUserId!) || !uuidPattern.test(values.inviteeUserId!)) {
    throw new Error("QA_CMS_AUTH_ACTOR_INVALID");
  }
  for (const actionLink of [values.recoveryActionLink!, values.inviteeActionLink!]) {
    const parsed = new URL(actionLink);
    if (parsed.origin !== target.supabase || parsed.pathname !== "/auth/v1/verify") {
      throw new Error("QA_CMS_AUTH_ACTION_LINK_REFUSED");
    }
  }
  if (
    environment === "production" &&
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${values.expectedSha}`
  ) {
    throw new Error("QA_CMS_AUTH_PRODUCTION_AUTHORIZATION_REQUIRED");
  }
  return {
    enabled: true,
    environment,
    expectedSha: values.expectedSha!,
    runTag: values.runTag!,
    supabaseOrigin: backend.origin,
    anonKey: values.anonKey!,
    recovery: {
      userId: values.recoveryUserId!,
      email: values.recoveryEmail!,
      password: values.recoveryPassword!,
      actionLink: values.recoveryActionLink!,
      totpSecret: values.recoveryTotpSecret!,
    },
    invitee: {
      userId: values.inviteeUserId!,
      email: values.inviteeEmail!,
      password: values.inviteePassword!,
      actionLink: values.inviteeActionLink!,
    },
  };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("QA_CMS_AUTH_TOTP_SECRET_INVALID");
  }
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Bytes(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

function guaranteedInvalidTotp(valid: string): string {
  return String((Number(valid) + 1) % 1_000_000).padStart(6, "0");
}

async function waitForStableTotpWindow() {
  const position = Date.now() % 30_000;
  if (position > 26_000) await new Promise((resolve) => setTimeout(resolve, 31_000 - position));
}

function waitForEdgeAction(page: Page, functionName: string, action: string) {
  return page.waitForResponse(
    (response) => {
      let body: unknown;
      try {
        body = response.request().postDataJSON();
      } catch {
        return false;
      }
      return (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(`/functions/v1/${functionName}`) &&
        Boolean(body && typeof body === "object" && (body as Record<string, unknown>).action === action)
      );
    },
    { timeout: 30_000 },
  );
}

async function responseJson(response: Response) {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.status() >= 300 || !payload) throw new Error("QA_CMS_AUTH_BACKEND_RESPONSE_INVALID");
  return payload;
}

function recordAuthBackendAction(
  ledger: CmsSemanticActionLedger,
  input: {
    surfaceId: AuthSurfaceId;
    controlName: string;
    action: string;
    scenarioId: string;
    response: Response;
    backendStatus: string;
  },
) {
  ledger.record({
    surfaceId: input.surfaceId,
    controlName: input.controlName,
    controlOccurrence: 0,
    action: input.action,
    scenarioId: input.scenarioId,
    backendStatus: input.backendStatus,
    httpStatus: input.response.status(),
  });
}

async function sanitizeActionAddress(page: Page, expectedOrigin: string) {
  return page
    .evaluate((origin) => {
      const sameOrigin = window.location.origin === origin;
      const hasSession = Object.keys(window.localStorage).some((key) => key.endsWith("-auth-token"));
      if (sameOrigin) window.history.replaceState(null, "", "/admin/definir-senha");
      return { sameOrigin, hasSession };
    }, expectedOrigin)
    .catch(() => ({ sameOrigin: false, hasSession: false }));
}

async function openActionSession(page: Page, actionLink: string, baseURL: string) {
  const expectedOrigin = new URL(baseURL).origin;
  try {
    await page.goto(actionLink, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      (origin) =>
        window.location.origin === origin &&
        Object.keys(window.localStorage).some((key) => key.endsWith("-auth-token")),
      expectedOrigin,
      { timeout: 20_000 },
    );
  } catch {
    await sanitizeActionAddress(page, expectedOrigin);
    throw new Error("QA_CMS_AUTH_ACTION_LINK_SESSION_FAILED");
  }
  const state = await sanitizeActionAddress(page, expectedOrigin);
  if (!state.sameOrigin || !state.hasSession) throw new Error("QA_CMS_AUTH_ACTION_LINK_SESSION_FAILED");
  await expect(page.getByRole("heading", { name: "Definir nova senha" })).toBeVisible();
}

async function expectConsumedLinkRejected(page: Page, actionLink: string, baseURL: string) {
  const expectedOrigin = new URL(baseURL).origin;
  let providerRejected: boolean;
  try {
    const response = await page.goto(actionLink, { waitUntil: "domcontentloaded", timeout: 30_000 });
    providerRejected = Boolean(response && response.status() >= 400);
  } catch {
    providerRejected = true;
  }
  const state = await sanitizeActionAddress(page, expectedOrigin);
  if (state.hasSession || (!state.sameOrigin && !providerRejected)) {
    throw new Error("QA_CMS_AUTH_CONSUMED_LINK_ACCEPTED");
  }
  await page.goto("/admin/definir-senha", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
}

async function setPassword(page: Page, password: string, expectedActivated: boolean) {
  const passwordField = page.getByLabel("Nova senha");
  const confirmation = page.getByLabel("Confirmar senha");
  await passwordField.fill("");
  await confirmation.fill("");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  expect(await passwordField.evaluate((field) => (field as HTMLInputElement).validity.valueMissing)).toBe(
    true,
  );
  expect(await confirmation.evaluate((field) => (field as HTMLInputElement).validity.valueMissing)).toBe(
    true,
  );
  const passwordBelowMinimum = "Abcdefgh!12";
  expect(passwordBelowMinimum).toHaveLength(11);
  await passwordField.fill(passwordBelowMinimum);
  expect(await passwordField.evaluate((field) => (field as HTMLInputElement).validity.tooShort)).toBe(true);
  await confirmation.fill(passwordBelowMinimum);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByRole("heading", { name: "Definir nova senha" })).toBeVisible();

  await passwordField.fill("FraseSegura!123");
  await confirmation.fill("FraseDiferente!123");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByRole("alert")).toContainText("As senhas não coincidem.");

  await passwordField.fill(password);
  await confirmation.fill(password);
  const recoveryResolution = waitForEdgeAction(page, "cms-session", "recovery");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  const response = await recoveryResolution;
  const resolved = await responseJson(response);
  expect(resolved.status).toBe("active");
  expect(resolved.activated).toBe(expectedActivated);
  expect(resolved.mfaRequired).toBe(true);
  expect(resolved.accessGranted).toBe(false);
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  return { response, resolved };
}

async function completeMfaChallenge(page: Page, secret: string) {
  await waitForStableTotpWindow();
  const validCode = currentTotp(secret);
  const codeField = page.getByLabel("Código de 6 dígitos");
  const verifyButton = page.getByRole("button", { name: "Verificar e entrar" });
  await codeField.fill("");
  await expect(verifyButton).toBeDisabled();
  await codeField.fill("12345");
  await expect(verifyButton).toBeDisabled();
  await codeField.fill("1234567");
  await expect(codeField).toHaveValue("123456");
  await codeField.fill(guaranteedInvalidTotp(validCode));
  await verifyButton.click();
  await expect(page.getByRole("alert")).toContainText("Código inválido ou expirado.");
  await codeField.fill(validCode);
  const mfaResolution = waitForEdgeAction(page, "cms-session", "mfa");
  await verifyButton.click();
  const response = await mfaResolution;
  const resolved = await responseJson(response);
  expect(resolved).toMatchObject({ status: "active", mfaVerified: true, accessGranted: true });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  return { response, resolved };
}

async function completeMfaEnrollment(page: Page) {
  await expect(page.getByRole("heading", { name: "Ativar verificação em duas etapas" })).toBeVisible();
  const enrollmentRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/auth/v1/factors"),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const enrollmentResponse = await enrollmentRequest;
  expect(enrollmentResponse.status()).toBeGreaterThanOrEqual(200);
  expect(enrollmentResponse.status()).toBeLessThan(300);
  await expect(page.getByAltText("Imagem para configurar o aplicativo autenticador")).toBeVisible();
  const secret = (await page.locator(".admin-mfa-setup code").textContent())?.trim() ?? "";
  base32Bytes(secret);
  const challenge = await completeMfaChallenge(page, secret);
  return { secret, enrollmentResponse, challenge };
}

async function loginWithMfa(page: Page, actor: LifecycleActor, totpSecret: string, expectedSha: string) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.headers()["x-release"]).toBe(expectedSha);
  await page.getByLabel("E-mail corporativo").fill(actor.email);
  await page.getByLabel("Senha").fill(actor.password);
  const signInRequest = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.request().method() === "POST" &&
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "password"
    );
  });
  await page.getByRole("button", { name: "Entrar" }).click();
  const signInResponse = await signInRequest;
  expect(signInResponse.status()).toBeGreaterThanOrEqual(200);
  expect(signInResponse.status()).toBeLessThan(300);
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByRole("heading", { name: "Confirmar sua identidade" })).toBeVisible();
  await waitForStableTotpWindow();
  const mfaResolution = waitForEdgeAction(page, "cms-session", "mfa");
  await page.getByLabel("Código de 6 dígitos").fill(currentTotp(totpSecret));
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
  const mfaResponse = await mfaResolution;
  const resolved = await responseJson(mfaResponse);
  expect(resolved).toMatchObject({ status: "active", mfaVerified: true, accessGranted: true });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  return { signInResponse, mfaResponse, resolved };
}

async function requestRecovery(page: Page, email: string) {
  await page.goto("/admin/recuperar-senha", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail corporativo").fill(email);
  const request = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/functions/v1/cms-recovery"),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Solicitar link" }).click();
  const response = await request;
  await expect(page.getByRole("status")).toContainText(
    "Solicitação recebida. Verifique a caixa de entrada e o spam.",
  );
  expect((await response.json().catch(() => null)) as Record<string, unknown> | null).toMatchObject({
    accepted: true,
  });
  return response;
}

async function proveLoginClientValidation(page: Page) {
  const email = page.getByLabel("E-mail corporativo");
  const password = page.getByLabel("Senha");
  await email.fill("");
  await password.fill("QA-Client-Validation!123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect(await email.evaluate((field) => (field as HTMLInputElement).validity.valueMissing)).toBe(true);
  await email.fill("endereco-invalido");
  expect(await email.evaluate((field) => (field as HTMLInputElement).validity.typeMismatch)).toBe(true);
  await email.fill("qa-client-validation@example.invalid");
  await password.fill("");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect(await password.evaluate((field) => (field as HTMLInputElement).validity.valueMissing)).toBe(true);
  await email.fill("");
}

async function proveRecoveryClientValidation(page: Page) {
  const email = page.getByLabel("E-mail corporativo");
  await email.fill("");
  await page.getByRole("button", { name: "Solicitar link" }).click();
  expect(await email.evaluate((field) => (field as HTMLInputElement).validity.valueMissing)).toBe(true);
  await email.fill("endereco-invalido");
  expect(await email.evaluate((field) => (field as HTMLInputElement).validity.typeMismatch)).toBe(true);
  await email.fill("");
}

async function proveIncorrectPassword(page: Page, actor: LifecycleActor, expectedSha: string) {
  const navigation = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(navigation?.headers()["x-release"]).toBe(expectedSha);
  await page.getByLabel("E-mail corporativo").fill(actor.email);
  await page.getByLabel("Senha").fill(`${actor.password}-incorrect`);
  const rejected = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "password" &&
      response.status() === 400
    );
  });
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos.");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(
    await page.evaluate(
      () => !Object.keys(localStorage).some((candidate) => candidate.endsWith("-auth-token")),
    ),
  ).toBe(true);
}

async function browserApi(
  page: Page,
  config: Configuration,
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
) {
  return page.evaluate(
    async ({ anonKey, endpoint, init }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const token = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!token) throw new Error("browser-session-unavailable");
      const response = await fetch(endpoint, {
        method: init.method ?? "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      return {
        status: response.status,
        payload: (await response.json().catch(() => null)) as unknown,
      };
    },
    { anonKey: config.anonKey, endpoint: `${config.supabaseOrigin}${path}`, init },
  );
}

async function createUnobservedAuthSession(
  page: Page,
  config: Configuration,
  actor: LifecycleActor,
  slot: string,
) {
  const result = await page.evaluate(
    async ({ anonKey, email, password, storageKey, supabaseOrigin, userId }) => {
      const response = await fetch(`${supabaseOrigin}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
      const refreshToken = typeof payload?.refresh_token === "string" ? payload.refresh_token : "";
      const user = payload?.user as Record<string, unknown> | undefined;
      const valid = Boolean(accessToken && refreshToken && user?.id === userId);
      if (valid) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
        );
      }
      return { status: response.status, valid, storedInBrowserOnly: valid };
    },
    {
      anonKey: config.anonKey,
      email: actor.email,
      password: actor.password,
      storageKey: `qa-cms-ephemeral-${slot}`,
      supabaseOrigin: config.supabaseOrigin,
      userId: actor.userId,
    },
  );
  expect(result).toEqual({ status: 200, valid: true, storedInBrowserOnly: true });
}

async function refreshAndProveCmsDenied(
  page: Page,
  config: Configuration,
  actor: LifecycleActor,
  slot: string,
) {
  const result = await page.evaluate(
    async ({ anonKey, storageKey, supabaseOrigin, userId }) => {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Record<
        string,
        unknown
      > | null;
      const refreshToken = typeof stored?.refresh_token === "string" ? stored.refresh_token : "";
      if (!refreshToken) return { credentialPresent: false };
      try {
        const refresh = await fetch(`${supabaseOrigin}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const payload = (await refresh.json().catch(() => null)) as Record<string, unknown> | null;
        const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
        if (!accessToken) {
          return { credentialPresent: true, refreshStatus: refresh.status, refreshed: false };
        }
        const authIdentity = await fetch(`${supabaseOrigin}/auth/v1/user`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        });
        const authPayload = (await authIdentity.json().catch(() => null)) as Record<string, unknown> | null;
        const cms = await fetch(`${supabaseOrigin}/functions/v1/cms-session`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "resolve" }),
        });
        const cmsPayload = (await cms.json().catch(() => null)) as Record<string, unknown> | null;
        return {
          credentialPresent: true,
          refreshStatus: refresh.status,
          refreshed: true,
          authStatus: authIdentity.status,
          identityMatches: authPayload?.id === userId,
          cmsStatus: cms.status,
          cmsDeniedOpaque: cmsPayload?.error === "Conta sem acesso administrativo ativo.",
        };
      } finally {
        sessionStorage.removeItem(storageKey);
      }
    },
    {
      anonKey: config.anonKey,
      storageKey: `qa-cms-ephemeral-${slot}`,
      supabaseOrigin: config.supabaseOrigin,
      userId: actor.userId,
    },
  );
  expect(result).toEqual({
    credentialPresent: true,
    refreshStatus: 200,
    refreshed: true,
    authStatus: 200,
    identityMatches: true,
    cmsStatus: 403,
    cmsDeniedOpaque: true,
  });
}

async function resolveThenLogoutCmsSession(
  page: Page,
  config: Configuration,
  actor: LifecycleActor,
  slot: string,
) {
  const result = await page.evaluate(
    async ({ anonKey, storageKey, supabaseOrigin, userId }) => {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Record<
        string,
        unknown
      > | null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : "";
      if (!accessToken) return { credentialPresent: false };
      const invoke = async (action: "resolve" | "logout") => {
        const response = await fetch(`${supabaseOrigin}/functions/v1/cms-session`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        });
        return {
          status: response.status,
          payload: (await response.json().catch(() => null)) as Record<string, unknown> | null,
        };
      };
      const resolved = await invoke("resolve");
      const logout = resolved.status === 200 ? await invoke("logout") : null;
      return {
        credentialPresent: true,
        resolveStatus: resolved.status,
        userMatches: resolved.payload?.userId === userId,
        active: resolved.payload?.status === "active",
        mfaRequired: resolved.payload?.mfaRequired === true,
        accessDeniedAtAal1: resolved.payload?.accessGranted === false,
        logoutStatus: logout?.status ?? 0,
      };
    },
    {
      anonKey: config.anonKey,
      storageKey: `qa-cms-ephemeral-${slot}`,
      supabaseOrigin: config.supabaseOrigin,
      userId: actor.userId,
    },
  );
  expect(result).toEqual({
    credentialPresent: true,
    resolveStatus: 200,
    userMatches: true,
    active: true,
    mfaRequired: true,
    accessDeniedAtAal1: true,
    logoutStatus: 200,
  });
}

async function forceRealSilentRefresh(page: Page, expectedSha: string) {
  // JWTs use whole-second iat/exp claims. Crossing a second boundary makes the
  // refreshed credential observably distinct without ever returning it to Node.
  await page.waitForTimeout(1_100);
  const prepared = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>) : null;
    const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
    const expiresAt = Number(stored?.expires_at);
    if (!key || !stored || !accessToken || !Number.isFinite(expiresAt)) {
      throw new Error("browser-session-unavailable");
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
    const fingerprint = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    sessionStorage.setItem("qa-cms-prior-access-fingerprint", fingerprint);
    stored.expires_at = Math.floor(Date.now() / 1000) - 60;
    stored.expires_in = 0;
    localStorage.setItem(key, JSON.stringify(stored));
    return { originallyUnexpired: expiresAt > Date.now() / 1000 };
  });
  expect(prepared.originallyUnexpired).toBe(true);

  const refreshed = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      );
    },
    { timeout: 30_000 },
  );
  const resolved = waitForEdgeAction(page, "cms-session", "resolve");
  const navigation = await page.reload({ waitUntil: "domcontentloaded" });
  expect(navigation?.headers()["x-release"]).toBe(expectedSha);
  expect((await refreshed).status()).toBe(200);
  expect((await resolved).status()).toBe(200);
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });

  const state = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>) : null;
    const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
    const priorFingerprint = sessionStorage.getItem("qa-cms-prior-access-fingerprint");
    sessionStorage.removeItem("qa-cms-prior-access-fingerprint");
    if (!accessToken || !priorFingerprint) throw new Error("browser-refreshed-session-unavailable");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
    const fingerprint = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return {
      accessTokenRotated: fingerprint !== priorFingerprint,
      expiresInFuture: Number(stored?.expires_at) > Date.now() / 1000 + 300,
    };
  });
  expect(state).toEqual({ accessTokenRotated: true, expiresInFuture: true });
}

async function revokeSessionsThroughUi(administrator: Page, revokedPage: Page, config: Configuration) {
  await administrator.goto("/admin/usuarios", { waitUntil: "domcontentloaded" });
  await expect(administrator.getByRole("heading", { name: "Usuários e acessos" })).toBeVisible();
  const row = administrator
    .getByRole("row")
    .filter({ hasText: `Convite CMS QA ${config.runTag}` })
    .first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const command = waitForEdgeAction(administrator, "cms-users", "revoke_sessions");
  await row.getByRole("button", { name: "Revogar sessões", exact: true }).click();
  await administrator.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  const commandPayload = await responseJson(await command);
  expect(commandPayload.status).toBe("sessions_revoked");

  const rejected = await browserApi(revokedPage, config, "/functions/v1/cms-session", {
    method: "POST",
    body: { action: "resolve" },
  });
  expect(rejected.status).toBe(403);
  expect(rejected.payload).toMatchObject({ error: "Conta sem acesso administrativo ativo." });

  const prepared = await revokedPage.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>) : null;
    if (!key || !stored || typeof stored.refresh_token !== "string") {
      throw new Error("browser-revoked-session-unavailable");
    }
    stored.expires_at = Math.floor(Date.now() / 1000) - 60;
    stored.expires_in = 0;
    localStorage.setItem(key, JSON.stringify(stored));
    return { refreshCredentialPresent: true };
  });
  expect(prepared.refreshCredentialPresent).toBe(true);
  const refreshed = revokedPage.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      );
    },
    { timeout: 30_000 },
  );
  const replayResolution = waitForEdgeAction(revokedPage, "cms-session", "resolve");
  await revokedPage.reload({ waitUntil: "domcontentloaded" });
  expect((await refreshed).status()).toBe(200);
  expect((await replayResolution).status()).toBe(403);
  await expect(
    revokedPage.getByRole("heading", { name: "Acesso administrativo não autorizado" }),
  ).toBeVisible();
}

async function expireSessionWithServerRejectedRefresh(page: Page, config: Configuration) {
  const logoutStatus = await page.evaluate(
    async ({ anonKey, logoutEndpoint }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const token = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!key || !stored || !token) throw new Error("browser-session-unavailable");
      const response = await fetch(logoutEndpoint, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`server-session-revocation-failed:${response.status}`);
      stored.expires_at = Math.floor(Date.now() / 1000) - 60;
      stored.expires_in = 0;
      localStorage.setItem(key, JSON.stringify(stored));
      return response.status;
    },
    { anonKey: config.anonKey, logoutEndpoint: `${config.supabaseOrigin}/auth/v1/logout?scope=global` },
  );
  expect([200, 204]).toContain(logoutStatus);

  const rejectedRefresh = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      );
    },
    { timeout: 30_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  expect((await rejectedRefresh).status()).toBeGreaterThanOrEqual(400);
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
  expect(
    await page.evaluate(
      () => !Object.keys(localStorage).some((candidate) => candidate.endsWith("-auth-token")),
    ),
  ).toBe(true);
}

async function isolatedContext(browser: Browser, baseURL: string, observer: CmsBrowserObserver) {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  await installSealedPreviewRouting(context);
  observer.observeContext(context);
  return context;
}

function sanitizeFailure(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[secret]");
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/gi, "[uuid]")
    .slice(0, 500);
}

function writeEvidence(value: Record<string, unknown>) {
  const relativePath = relative(repositoryRoot, evidencePath);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\")
  ) {
    throw new Error("QA_CMS_AUTH_REPORT_PATH_REFUSED");
  }
  const serialized = `${JSON.stringify(
    { ...value, sealedPreviewRouting: sealedPreviewRoutingEvidence() },
    null,
    2,
  )}\n`;
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(serialized) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized) ||
    /\b(?:eyJ[A-Za-z0-9_-]+\.|sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{12,}/i.test(serialized)
  ) {
    throw new Error("QA_CMS_AUTH_REPORT_SENSITIVE_VALUE_REFUSED");
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, serialized, { encoding: "utf8", mode: 0o600 });
}

test.describe("CMS Auth invite and recovery lifecycle", () => {
  test("@mutating convite inédito e recuperação completam ativação, senha, MFA e auditoria", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "ciclo de autenticação mutante executado uma vez",
    );
    const config = configuration(baseURL);
    test.skip(!config.enabled, "fixture de autenticação real não habilitado");
    if (!config.enabled || !baseURL) throw new Error("QA_CMS_AUTH_GATE_INCONSISTENT");
    test.setTimeout(12 * 60_000);

    const contexts: BrowserContext[] = [];
    const scenarios: Scenario[] = [];
    const authSurfaceCoverage: AuthSurfaceEvidence[] = [];
    const semanticExecutions: AuthSemanticExecution[] = [];
    const semanticActions = createCmsSemanticActionLedger();
    const semanticFields: CmsSemanticFieldEvidence[] = [];
    const semanticStructures: CmsSemanticStructureEvidence[] = [];
    const recordSemanticExecution = (execution: AuthSemanticExecution) => {
      expect(semanticExecutions.some((entry) => entry.id === execution.id)).toBe(false);
      semanticExecutions.push(execution);
    };
    let status: "passed" | "failed" = "failed";
    let failure: string | null = null;
    const sensitive = [
      config.recovery.email,
      config.recovery.password,
      config.recovery.actionLink,
      config.recovery.totpSecret,
      config.invitee.email,
      config.invitee.password,
      config.invitee.actionLink,
    ];
    const observer = createCmsBrowserObserver({
      suite: "cms-auth-lifecycle",
      expectedSha: config.expectedSha,
      sensitiveValues: sensitive,
      expectedHttpFailures: [
        {
          id: "invalid-mfa-code",
          method: "POST",
          path: /\/auth\/v1\/factors\/[^/]+\/verify$/,
          statuses: [400, 401, 403, 422],
          minOccurrences: 2,
          maxOccurrences: 2,
        },
        {
          id: "incorrect-password",
          method: "POST",
          path: "/auth/v1/token",
          statuses: [400],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "consumed-single-use-action-link",
          method: "GET",
          path: "/auth/v1/verify",
          statuses: [400, 401, 403, 404, 410, 422],
          maxOccurrences: 2,
        },
        {
          id: "revoked-cms-session",
          method: "POST",
          path: "/functions/v1/cms-session",
          statuses: [401, 403],
          minOccurrences: 2,
          maxOccurrences: 3,
        },
        {
          id: "expired-refresh-token",
          method: "POST",
          path: "/auth/v1/token",
          statuses: [400, 401, 403],
          maxOccurrences: 3,
          minOccurrences: 1,
        },
      ],
    });

    try {
      const publicAuthContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(publicAuthContext);
      const publicAuthPage = await publicAuthContext.newPage();
      await publicAuthPage.goto("/admin/login", { waitUntil: "domcontentloaded" });
      await captureAuthSurface(publicAuthPage, authSurfaceCoverage, {
        surfaceId: "auth-login",
        variant: "signed-out",
        route: "/admin/login",
        heading: "Entrar no painel",
        controls: [
          {
            id: "login-form",
            kind: "form",
            name: "",
            locator: (page) => page.locator("form"),
          },
          {
            id: "email",
            kind: "field",
            name: "E-mail corporativo",
            locator: (page) => page.getByLabel("E-mail corporativo"),
            probeValue: "qa-responsive@example.invalid",
          },
          {
            id: "password",
            kind: "field",
            name: "Senha",
            locator: (page) => page.getByLabel("Senha"),
            probeValue: "QA-Responsive!123",
          },
          {
            id: "sign-in",
            kind: "action",
            name: "Entrar",
            locator: (page) => page.getByRole("button", { name: "Entrar", exact: true }),
          },
          {
            id: "forgot-password",
            kind: "link",
            name: "Esqueci minha senha",
            locator: (page) => page.getByRole("link", { name: "Esqueci minha senha" }),
          },
        ],
      });
      await proveLoginClientValidation(publicAuthPage);
      await publicAuthPage.getByRole("link", { name: "Esqueci minha senha" }).click();
      await expect(publicAuthPage).toHaveURL(/\/admin\/recuperar-senha$/);
      recordSemanticExecution({
        id: "auth-login.forgot-password",
        surfaceId: "auth-login",
        controlId: "forgot-password",
        scenarioId: "auth_route_navigation",
        result: "passed",
        proof: "real-browser-navigation",
      });
      await captureAuthSurface(publicAuthPage, authSurfaceCoverage, {
        surfaceId: "auth-recovery",
        variant: "request-form",
        route: "/admin/recuperar-senha",
        heading: "Recuperar acesso",
        controls: [
          {
            id: "recovery-form",
            kind: "form",
            name: "",
            locator: (page) => page.locator("form"),
          },
          {
            id: "email",
            kind: "field",
            name: "E-mail corporativo",
            locator: (page) => page.getByLabel("E-mail corporativo"),
            probeValue: "qa-responsive@example.invalid",
          },
          {
            id: "request-link",
            kind: "action",
            name: "Solicitar link",
            locator: (page) => page.getByRole("button", { name: "Solicitar link" }),
          },
          {
            id: "back-to-login",
            kind: "link",
            name: "Voltar ao login",
            locator: (page) => page.getByRole("link", { name: "Voltar ao login" }),
          },
        ],
      });
      await proveRecoveryClientValidation(publicAuthPage);
      await publicAuthPage.getByRole("link", { name: "Voltar ao login" }).click();
      await expect(publicAuthPage).toHaveURL(/\/admin\/login$/);
      recordSemanticExecution({
        id: "auth-recovery.back-to-login",
        surfaceId: "auth-recovery",
        controlId: "back-to-login",
        scenarioId: "auth_route_navigation",
        result: "passed",
        proof: "real-browser-navigation",
      });
      scenarios.push({
        id: "auth_route_navigation",
        status: "passed",
        interface: "links reais navegaram de login para recuperação e retornaram ao login",
        backend: "rotas públicas permaneceram sem sessão e sem mutação administrativa",
        negative: "nenhuma rota protegida foi exposta pela navegação pública",
      });
      scenarios.push({
        id: "auth_client_field_validation",
        status: "passed",
        interface: "required e type=email exercidos nos formulários reais de login e recuperação",
        backend: "submissões inválidas foram bloqueadas pelo formulário antes de criar requisição",
        negative: "ausência e e-mail malformado não acionaram autenticação nem recuperação",
      });

      const recoveryContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(recoveryContext);
      const recoveryPage = await recoveryContext.newPage();
      await openActionSession(recoveryPage, config.recovery.actionLink, baseURL);
      await captureAuthSurface(recoveryPage, authSurfaceCoverage, {
        surfaceId: "auth-set-password",
        variant: "recovery-session",
        route: "/admin/definir-senha",
        heading: "Definir nova senha",
        controls: [
          {
            id: "set-password-form",
            kind: "form",
            name: "",
            locator: (page) => page.locator("form"),
          },
          {
            id: "new-password",
            kind: "field",
            name: "Nova senha",
            locator: (page) => page.getByLabel("Nova senha"),
            probeValue: "QA-Responsive!123",
          },
          {
            id: "confirm-password",
            kind: "field",
            name: "Confirmar senha",
            locator: (page) => page.getByLabel("Confirmar senha"),
            probeValue: "QA-Responsive!123",
          },
          {
            id: "save-password",
            kind: "action",
            name: "Salvar senha",
            locator: (page) => page.getByRole("button", { name: "Salvar senha" }),
          },
        ],
      });
      const recoveryPassword = await setPassword(recoveryPage, config.recovery.password, false);
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-set-password",
        controlName: "Salvar senha",
        action: "recovery",
        scenarioId: "real_recovery_link_password_and_mfa",
        response: recoveryPassword.response,
        backendStatus: String(recoveryPassword.resolved.status),
      });
      recordSemanticExecution({
        id: "auth-set-password.save-password",
        surfaceId: "auth-set-password",
        controlId: "save-password",
        scenarioId: "real_recovery_link_password_and_mfa",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      await expect(recoveryPage.getByRole("heading", { name: "Confirmar sua identidade" })).toBeVisible();
      await captureAuthSurface(recoveryPage, authSurfaceCoverage, {
        surfaceId: "auth-mfa",
        variant: "challenge",
        route: "/admin/mfa",
        heading: "Confirmar sua identidade",
        controls: [
          {
            id: "mfa-form",
            kind: "form",
            name: "",
            locator: (page) => page.locator("form"),
          },
          {
            id: "totp-code",
            kind: "field",
            name: "Código de 6 dígitos",
            locator: (page) => page.getByLabel("Código de 6 dígitos"),
            probeValue: "123456",
          },
          {
            id: "verify",
            kind: "action",
            name: "Verificar e entrar",
            locator: (page) => page.getByRole("button", { name: "Verificar e entrar" }),
          },
          {
            id: "cancel-and-sign-out",
            kind: "action",
            name: "Cancelar e sair",
            locator: (page) => page.getByRole("button", { name: "Cancelar e sair" }),
          },
        ],
      });
      const recoveryMfa = await completeMfaChallenge(recoveryPage, config.recovery.totpSecret);
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-mfa",
        controlName: "Verificar e entrar",
        action: "mfa",
        scenarioId: "real_recovery_link_password_and_mfa",
        response: recoveryMfa.response,
        backendStatus: String(recoveryMfa.resolved.status),
      });
      recordSemanticExecution({
        id: "auth-mfa.verify",
        surfaceId: "auth-mfa",
        controlId: "verify",
        scenarioId: "real_recovery_link_password_and_mfa",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      scenarios.push({
        id: "real_recovery_link_password_and_mfa",
        status: "passed",
        interface: "link real -> PASSWORD_RECOVERY -> nova senha -> desafio MFA",
        backend: "cms-session recovery e mfa confirmados no Supabase do alvo",
        negative: "senha curta, divergência e código TOTP incorreto recusados",
      });

      const consumedRecoveryContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(consumedRecoveryContext);
      await expectConsumedLinkRejected(
        await consumedRecoveryContext.newPage(),
        config.recovery.actionLink,
        baseURL,
      );

      const missingRecoveryContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(missingRecoveryContext);
      const missingRecoveryPage = await missingRecoveryContext.newPage();
      const missingRecovery = await requestRecovery(
        missingRecoveryPage,
        `absent-${config.runTag.toLowerCase()}-${randomUUID()}@example.invalid`,
      );
      const validRecoveryContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(validRecoveryContext);
      const validRecoveryPage = await validRecoveryContext.newPage();
      const validRecovery = await requestRecovery(validRecoveryPage, config.recovery.email);
      expect(missingRecovery.status()).toBe(validRecovery.status());
      expect(validRecovery.status()).toBe(202);
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-recovery",
        controlName: "Solicitar link",
        action: "request-recovery",
        scenarioId: "recovery_account_enumeration_resistance",
        response: validRecovery,
        backendStatus: "accepted",
      });
      recordSemanticExecution({
        id: "auth-recovery.request-link",
        surfaceId: "auth-recovery",
        controlId: "request-link",
        scenarioId: "recovery_account_enumeration_resistance",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      scenarios.push({
        id: "recovery_account_enumeration_resistance",
        status: "passed",
        interface: "formulário real para identidade ausente e identidade válida",
        backend: "Auth respondeu de forma equivalente aos dois pedidos controlados",
        negative: "nenhuma existência de conta foi revelada pela mensagem ou status HTTP",
      });

      const inviteContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(inviteContext);
      const invitePage = await inviteContext.newPage();
      await openActionSession(invitePage, config.invitee.actionLink, baseURL);
      const invitePassword = await setPassword(invitePage, config.invitee.password, true);
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-set-password",
        controlName: "Salvar senha",
        action: "recovery",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        response: invitePassword.response,
        backendStatus: String(invitePassword.resolved.status),
      });
      await captureAuthSurface(invitePage, authSurfaceCoverage, {
        surfaceId: "auth-mfa",
        variant: "enrollment",
        route: "/admin/mfa",
        heading: "Ativar verificação em duas etapas",
        controls: [
          {
            id: "configure-authenticator",
            kind: "action",
            name: "Configurar autenticador",
            locator: (page) => page.getByRole("button", { name: "Configurar autenticador" }),
          },
          {
            id: "cancel-and-sign-out",
            kind: "action",
            name: "Cancelar e sair",
            locator: (page) => page.getByRole("button", { name: "Cancelar e sair" }),
          },
        ],
      });
      const enrollment = await completeMfaEnrollment(invitePage);
      expect(enrollment.challenge.resolved.roles).toContain("admin");
      expect(enrollment.challenge.resolved.permissions).toContain("cms:audit.read");
      const criticalAuditRead = invitePage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.endsWith("/rest/v1/cms_audit_log"),
        { timeout: 30_000 },
      );
      await invitePage.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      expect((await criticalAuditRead).status()).toBe(200);
      await expect(invitePage.getByRole("heading", { name: "Auditoria" })).toBeVisible();
      scenarios.push({
        id: "admin_aal1_mfa_aal2_critical_permission",
        status: "passed",
        interface: "admin AAL1 foi encaminhado à matrícula TOTP e retornou como AAL2",
        backend: "leitura real de auditoria protegida por cms:audit.read foi autorizada somente após MFA",
        negative: "a sessão AAL1 não recebeu acesso ao painel antes da elevação",
      });
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-mfa",
        controlName: "Configurar autenticador",
        action: "enroll-totp",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        response: enrollment.enrollmentResponse,
        backendStatus: "enrolled",
      });
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-mfa",
        controlName: "Verificar e entrar",
        action: "mfa",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        response: enrollment.challenge.response,
        backendStatus: String(enrollment.challenge.resolved.status),
      });
      recordSemanticExecution({
        id: "auth-mfa.configure-authenticator",
        surfaceId: "auth-mfa",
        controlId: "configure-authenticator",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      const inviteeTotpSecret = enrollment.secret;
      sensitive.push(inviteeTotpSecret);
      await invitePage.getByRole("button", { name: "Sair", exact: true }).click();
      await expect(invitePage).toHaveURL(/\/admin\/login$/);
      const inviteeLogin = await loginWithMfa(
        invitePage,
        config.invitee,
        inviteeTotpSecret,
        config.expectedSha,
      );
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-login",
        controlName: "Entrar",
        action: "password-sign-in",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        response: inviteeLogin.signInResponse,
        backendStatus: "authenticated",
      });
      recordSemanticExecution({
        id: "auth-login.sign-in",
        surfaceId: "auth-login",
        controlId: "sign-in",
        scenarioId: "new_auth_identity_invite_activation_and_mfa",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      scenarios.push({
        id: "new_auth_identity_invite_activation_and_mfa",
        status: "passed",
        interface: "convite Auth inédito -> senha -> matrícula TOTP -> logout -> login AAL2",
        backend: "perfil admin invited ativado e sessão AAL2 autorizada no projeto do alvo",
        negative: "código TOTP incorreto recusado antes da ativação segura",
      });

      const incorrectPasswordContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(incorrectPasswordContext);
      await proveIncorrectPassword(
        await incorrectPasswordContext.newPage(),
        config.invitee,
        config.expectedSha,
      );
      scenarios.push({
        id: "incorrect_password_is_opaque",
        status: "passed",
        interface: "login real exibiu mensagem genérica sem revelar estado da conta",
        backend: "Supabase Auth recusou a credencial incorreta com HTTP 400",
        negative: "nenhuma sessão foi criada ou persistida após a tentativa inválida",
      });

      await forceRealSilentRefresh(invitePage, config.expectedSha);
      scenarios.push({
        id: "silent_session_refresh_real_backend",
        status: "passed",
        interface: "reload da rota autenticada sem novo login ou novo desafio MFA",
        backend: "refresh token real rotacionou o JWT e cms-session resolveu novamente o acesso AAL2",
        negative: "nenhum token ou fingerprint saiu do contexto efêmero do navegador",
      });

      const consumedInviteContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(consumedInviteContext);
      await expectConsumedLinkRejected(
        await consumedInviteContext.newPage(),
        config.invitee.actionLink,
        baseURL,
      );
      scenarios.push({
        id: "single_use_action_links",
        status: "passed",
        interface: "reabertura dos links em contextos limpos",
        backend: "tokens de convite e recuperação permaneceram de uso único",
        negative: "links consumidos não criaram nova sessão e retornaram ao login",
      });

      const profileResult = await browserApi(
        recoveryPage,
        config,
        `/rest/v1/cms_profiles?select=user_id,status,mfa_enrolled_at&user_id=in.(${config.recovery.userId},${config.invitee.userId})&order=user_id.asc`,
      );
      expect(profileResult.status).toBe(200);
      const profiles = Array.isArray(profileResult.payload)
        ? (profileResult.payload as Array<Record<string, unknown>>)
        : [];
      expect(profiles).toHaveLength(2);
      expect(
        profiles.every((profile) => profile.status === "active" && Boolean(profile.mfa_enrolled_at)),
      ).toBe(true);

      const loginResult = await browserApi(
        recoveryPage,
        config,
        `/rest/v1/cms_login_events?select=user_id,event_type,success,mfa_verified&user_id=in.(${config.recovery.userId},${config.invitee.userId})&event_type=in.(recovery,mfa_challenge,login_success)&order=occurred_at.asc`,
      );
      expect(loginResult.status).toBe(200);
      const events = Array.isArray(loginResult.payload)
        ? (loginResult.payload as Array<Record<string, unknown>>)
        : [];
      for (const userId of [config.recovery.userId, config.invitee.userId]) {
        expect(events.some((event) => event.user_id === userId && event.event_type === "recovery")).toBe(
          true,
        );
        expect(
          events.some(
            (event) =>
              event.user_id === userId &&
              event.event_type === "mfa_challenge" &&
              event.success === true &&
              event.mfa_verified === true,
          ),
        ).toBe(true);
      }
      const auditResult = await browserApi(
        recoveryPage,
        config,
        `/rest/v1/cms_audit_log?select=actor_id,action,target_type,target_id&actor_id=eq.${config.invitee.userId}&action=eq.cms%3Ausers.activate&target_id=eq.${config.invitee.userId}`,
      );
      expect(auditResult.status).toBe(200);
      expect(Array.isArray(auditResult.payload) ? auditResult.payload : []).toHaveLength(1);
      const recoveryAuditResult = await browserApi(
        recoveryPage,
        config,
        `/rest/v1/cms_audit_log?select=actor_id,action,target_type,target_id,event_data&actor_id=eq.${config.recovery.userId}&action=in.(cms%3Aauth.recovery_requested,cms%3Aauth.recovery_delivery_failed)`,
      );
      expect(recoveryAuditResult.status).toBe(200);
      const recoveryAudits = Array.isArray(recoveryAuditResult.payload)
        ? (recoveryAuditResult.payload as Array<Record<string, unknown>>)
        : [];
      expect(recoveryAudits.some((audit) => audit.action === "cms:auth.recovery_requested")).toBe(true);
      for (const audit of recoveryAudits) {
        expect(["cms:auth.recovery_requested", "cms:auth.recovery_delivery_failed"]).toContain(audit.action);
        expect(audit.event_data).toMatchObject({
          schemaVersion: 1,
          channel: "supabase_auth",
        });
      }
      scenarios.push({
        id: "auth_profile_and_immutable_audit_persistence",
        status: "passed",
        interface: "consulta autenticada posterior ao reload e segundo login",
        backend: "perfis ativos com MFA e eventos recovery/mfa/activate persistidos",
        negative: "evidência omite UUID, e-mail, senha, segredo TOTP e links de ação",
      });
      const semanticScenarioEvidence = buildAuthSemanticScenarioEvidence(authSurfaceCoverage);
      semanticFields.push(...semanticScenarioEvidence.fields);
      semanticStructures.push(...semanticScenarioEvidence.structures);

      await createUnobservedAuthSession(invitePage, config, config.invitee, "unobserved-revocation");
      await revokeSessionsThroughUi(recoveryPage, invitePage, config);
      await refreshAndProveCmsDenied(invitePage, config, config.invitee, "unobserved-revocation");
      const revocationAudit = await browserApi(
        recoveryPage,
        config,
        `/rest/v1/cms_audit_log?select=action,target_type&actor_id=eq.${config.recovery.userId}&action=eq.cms%3Asessions.revoke&target_id=eq.${config.invitee.userId}`,
      );
      expect(revocationAudit.status).toBe(200);
      expect(Array.isArray(revocationAudit.payload) ? revocationAudit.payload : []).toHaveLength(1);
      scenarios.push({
        id: "effective_cms_session_revocation",
        status: "passed",
        interface: "ação Revogar sessões confirmada na tela de usuários e acesso negado após reload",
        backend:
          "JWT original e JWT renovado da mesma sessão Auth foram recusados por cms-session com HTTP 403",
        negative:
          "refresh token anterior não recuperou acesso ao CMS e a identidade compartilhada não foi banida",
      });

      scenarios.push({
        id: "unobserved_auth_session_refresh_rejected_by_cms",
        status: "passed",
        interface: "revogação real executada sem abrir a sessão Auth paralela no CMS",
        backend:
          "refresh Auth permaneceu válido, mas cms-session recusou o session_id capturado com HTTP 403",
        negative:
          "sessão não observada não escapou da revogação e a identidade Auth compartilhada não foi banida",
      });

      await createUnobservedAuthSession(recoveryPage, config, config.recovery, "logout-replay");
      await resolveThenLogoutCmsSession(recoveryPage, config, config.recovery, "logout-replay");
      await refreshAndProveCmsDenied(recoveryPage, config, config.recovery, "logout-replay");
      scenarios.push({
        id: "cms_logout_refresh_replay_rejected",
        status: "passed",
        interface: "logout CMS concluído antes do encerramento da sessão no provedor",
        backend: "refresh Auth permaneceu válido e o mesmo session_id recebeu HTTP 403 no CMS",
        negative: "falha ou atraso no sign-out Auth não reabriu a sessão administrativa",
      });

      await expireSessionWithServerRejectedRefresh(recoveryPage, config);
      scenarios.push({
        id: "expired_session_rejected_refresh",
        status: "passed",
        interface: "sessão local expirada retornou automaticamente à tela de login",
        backend: "logout global real invalidou a renovação e o Auth recusou o refresh token",
        negative: "sessão expirada não permaneceu no storage e não exibiu área administrativa",
      });

      const cancelContext = await isolatedContext(browser, baseURL, observer);
      contexts.push(cancelContext);
      const cancelPage = await cancelContext.newPage();
      await cancelPage.goto("/admin/login", { waitUntil: "domcontentloaded" });
      await cancelPage.getByLabel("E-mail corporativo").fill(config.recovery.email);
      await cancelPage.getByLabel("Senha").fill(config.recovery.password);
      await cancelPage.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(cancelPage).toHaveURL(/\/admin\/mfa$/);
      const cancelLogout = waitForEdgeAction(cancelPage, "cms-session", "logout");
      await cancelPage.getByRole("button", { name: "Cancelar e sair" }).click();
      const cancelLogoutResponse = await cancelLogout;
      const cancelLogoutPayload = await responseJson(cancelLogoutResponse);
      await expect(cancelPage).toHaveURL(/\/admin\/login$/);
      await expect(cancelPage.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
      recordAuthBackendAction(semanticActions, {
        surfaceId: "auth-mfa",
        controlName: "Cancelar e sair",
        action: "logout",
        scenarioId: "mfa_cancel_signout",
        response: cancelLogoutResponse,
        backendStatus: String(cancelLogoutPayload.status ?? "signed-out"),
      });
      recordSemanticExecution({
        id: "auth-mfa.cancel-and-sign-out",
        surfaceId: "auth-mfa",
        controlId: "cancel-and-sign-out",
        scenarioId: "mfa_cancel_signout",
        result: "passed",
        proof: "real-browser-real-backend",
      });
      scenarios.push({
        id: "mfa_cancel_signout",
        status: "passed",
        interface: "ação Cancelar e sair no desafio MFA retornou ao login",
        backend: "sessão Auth criada para a prova foi encerrada pelo fluxo real",
        negative: "cancelamento não manteve acesso à área administrativa",
      });

      observer.assertClean();
      status = "passed";
    } catch (error) {
      failure = sanitizeFailure(error, sensitive);
    } finally {
      for (const context of contexts) {
        if (status === "passed") {
          try {
            assertSealedPreviewRoutingUsed(context);
          } catch (error) {
            status = "failed";
            failure ??= sanitizeFailure(error, sensitive);
          }
        }
        await context.close().catch(() => undefined);
      }
      let sourceControlCoverageComplete = false;
      try {
        sourceControlCoverageComplete = finalizeAuthSurfaceCoverage(
          authSurfaceCoverage,
          config.expectedSha,
          semanticActions,
          semanticFields,
          semanticStructures,
        );
        if (!sourceControlCoverageComplete) {
          status = "failed";
          failure ??= "QA_CMS_AUTH_SOURCE_CONTROL_COVERAGE_INCOMPLETE";
        }
      } catch (error) {
        status = "failed";
        failure ??= sanitizeFailure(error, sensitive);
      }
      const surfaceCoverageComplete =
        status === "passed" &&
        sourceControlCoverageComplete &&
        REQUIRED_AUTH_SEMANTIC_EXECUTIONS.every((id) =>
          semanticExecutions.some((execution) => execution.id === id && execution.result === "passed"),
        ) &&
        (["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"] as const).every((surfaceId) =>
          AUTH_VIEWPORTS.every((viewport) =>
            authSurfaceCoverage.some(
              (entry) =>
                entry.surfaceId === surfaceId &&
                entry.viewport.name === viewport.name &&
                entry.status === "passed",
            ),
          ),
        );
      writeEvidence({
        schemaVersion: 1,
        status,
        environment: config.environment,
        candidateSha: config.expectedSha,
        runTag: config.runTag,
        browser: "desktop-chromium-real-ui",
        backend: `supabase-${config.environment}-real`,
        scenarios,
        credentialsPersisted: false,
        noIdentifiersPersisted: true,
        actionLinksPersisted: false,
        rawBrowserArtifacts: "disabled",
        browserObservability: observer.snapshot(),
        semanticActions: semanticActions.snapshot(),
        semanticFields,
        semanticStructures,
        authSurfaceCoverage: {
          status: surfaceCoverageComplete ? "passed" : "failed",
          viewports: AUTH_VIEWPORTS.map((viewport) => ({ ...viewport })),
          entries: authSurfaceCoverage,
          semanticExecutions,
          unsupported: [],
          failures: [],
        },
        actionLinkProvisioning: "admin-generate-link-without-email-delivery",
        publicRecoveryDelivery: "provider-invoked-only-for-valid-synthetic-cms-profile-and-audited",
        transportDeliveryGate: "separate-production-email-workflow",
        recoveryFormDisclosure: "generic-for-existing-and-absent",
        sessionLifecycle: {
          silentRefresh: "real-auth-refresh-and-aal2-session-resolution",
          expiration: "expired-local-session-with-server-rejected-refresh",
          revocation: "cms-session-403-and-ui-access-denied",
          tokensPersistedInEvidence: false,
        },
        cleanup: "awaiting-fixture-teardown-verification",
        failure,
      });
    }
    if (failure) throw new Error(`QA_CMS_AUTH_LIFECYCLE_FAILED:${failure}`);
  });
});
