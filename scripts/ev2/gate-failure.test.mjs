import assert from "node:assert/strict";
import test from "node:test";

import { causeCodeFor, createGateReporter, redactUnsafeDetail } from "./gate-failure.mjs";

const SHA = "a".repeat(40);
const RUN_TAG = "QA-CMS-FINAL-20260910-aaaaaaaa";

function reporter(overrides = {}) {
  const events = [];
  const { check, checks } = createGateReporter({
    phase: "g11",
    entity: "scripts/ev2/phase11/staging-canary.mjs",
    sha: SHA,
    runTag: RUN_TAG,
    onEvent: (line) => events.push(JSON.parse(line)),
    ...overrides,
  });
  return { check, checks, events };
}

test("the historical event shape survives untouched", () => {
  const { check, checks, events } = reporter();
  check("stable_not_promoted", true, "legacy-root-sha256:abc");

  // Consumidores que hoje leem `event`, `name`, `result` e `detail` continuam funcionando: o Bloco 5
  // acrescenta campos, nunca substitui os que ja existem.
  assert.equal(events[0].event, "g11.check");
  assert.equal(events[0].name, "stable_not_promoted");
  assert.equal(events[0].result, "PASS");
  assert.equal(events[0].detail, "legacy-root-sha256:abc");
  assert.deepEqual(checks, [
    { name: "stable_not_promoted", result: "PASS", detail: "legacy-root-sha256:abc" },
  ]);
});

test("a reproval names itself without anyone opening a raw log", () => {
  const { check } = reporter();
  let thrown;
  try {
    check("lead_preserved_after_delivery_failure", false, "CMS_LEAD_DELIVERY_NOT_FOUND", {
      expected: "lead preservado e visivel para a caixa de entrada",
      remediation: "Ler o codigo CMS_ do erro; ele nomeia a fixture e a restricao envolvidas.",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "um check reprovado tem de interromper o canario");

  const failure = thrown.gateFailure;
  for (const field of ["gate", "cause", "entity", "observed", "expected", "remediation", "sha"])
    assert.ok(failure[field], `campo ${field} ausente`);
  assert.equal(failure.gate, "g11.lead_preserved_after_delivery_failure");
  assert.equal(failure.cause, "CMS_G11_LEAD_PRESERVED_AFTER_DELIVERY_FAILURE");
  assert.equal(failure.sha, SHA);
  assert.equal(failure.runTag, RUN_TAG);

  // O codigo estavel entra na mensagem tambem: e ele que sobrevive quando o log e truncado.
  assert.match(thrown.message, /^CMS_G11_LEAD_PRESERVED_AFTER_DELIVERY_FAILURE: /);
});

test("a check without authored guidance omits the fields instead of inventing them", () => {
  const { check } = reporter();
  let failure;
  try {
    check("outbox_lag_within_budget", false, "4200");
  } catch (error) {
    failure = error.gateFailure;
  }
  // Preencher ~200 checks com texto generico produz ruido com aparencia de cobertura, que e pior do
  // que a ausencia honesta do campo.
  assert.equal(failure.cause, "CMS_G11_OUTBOX_LAG_WITHIN_BUDGET");
  assert.equal(failure.observed, "4200");
  assert.ok(!("expected" in failure));
  assert.ok(!("remediation" in failure));
});

test("a passing check carries no cause, entity or remediation", () => {
  const { events } = (() => {
    const r = reporter();
    r.check("anonymous_system_access_denied", true, 401);
    return r;
  })();
  for (const field of ["cause", "entity", "expected", "remediation", "observed"])
    assert.ok(!(field in events[0]), `um PASS nao pode carregar ${field}`);
});

test("a credential shape pasted into a detail never reaches the report", () => {
  const { check } = reporter();
  for (const secret of [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9zzzz",
    "sbp_0123456789abcdef0123456789abcdef",
    "ghp_0123456789abcdef0123456789abcdef01",
    "operador@gaiatecsistemas.com.br",
  ]) {
    let failure;
    try {
      check("boundary_closed", false, `falhou com ${secret}`);
    } catch (error) {
      failure = error.gateFailure;
    }
    assert.equal(failure.observed, "[detalhe suprimido: formato de credencial]");
    assert.ok(!failure.observed.includes(secret));
  }
});

test("redaction leaves a legitimate detail alone", () => {
  assert.equal(redactUnsafeDetail("CMS_LEAD_DELIVERY_NOT_FOUND"), "CMS_LEAD_DELIVERY_NOT_FOUND");
  assert.equal(redactUnsafeDetail(401), "401");
  assert.equal(redactUnsafeDetail({ status: "failed" }), '{"status":"failed"}');
});

test("the reporter refuses an identity it cannot stand behind", () => {
  const base = { phase: "g11", entity: "x", sha: SHA };
  assert.throws(() => createGateReporter({ ...base, sha: "nao-e-sha" }), /GATE_REPORTER_SHA_INVALID/);
  assert.throws(() => createGateReporter({ ...base, phase: "G11" }), /GATE_REPORTER_PHASE_INVALID/);
  assert.throws(() => createGateReporter({ ...base, entity: "" }), /GATE_REPORTER_ENTITY_REQUIRED/);

  const { check } = reporter();
  // Nome de check fora do padrao quebraria o codigo estavel derivado dele.
  assert.throws(() => check("Nome Invalido", true, "x"), /GATE_REPORTER_CHECK_NAME_INVALID/);
});

test("the stable cause code is derived, never hand-maintained", () => {
  assert.equal(
    causeCodeFor("g11", "qa_actor_watchdog_leases_active"),
    "CMS_G11_QA_ACTOR_WATCHDOG_LEASES_ACTIVE",
  );
  assert.equal(causeCodeFor("g17", "database_snapshot_ready"), "CMS_G17_DATABASE_SNAPSHOT_READY");
});
