import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  CornerUpLeft,
  ListChecks,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router";
import {
  Ev2AiExecutionCapabilitySchema,
  Ev2AiExecutionMutationResultSchema,
  Ev2AiExecutionWorkspaceSchema,
  type Ev2AiExecutionPlan,
  type Ev2AiExecutionStep,
  type Ev2AiExecutionWorkspace,
} from "@/shared/contracts/ev2-ai-execute";
import {
  createExecutionStep,
  planRisk,
  planTargetCount,
  rebaseExpectedVersions,
  validateExecutionStep,
} from "../ai-execution-model";
import { aiExecuteCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import "../admin-ai-execution.css";

type ToolKey = Ev2AiExecutionStep["toolKey"];
type PendingMutation = {
  body: Record<string, unknown>;
  idempotencyKey: string;
  message: string;
};
const CMS_ENVIRONMENT = cmsEnvironment();

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" as const },
  };
}

function internalExecutionReference() {
  return `g14x-ui-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function isDefinitiveMutationFailure(caught: unknown): boolean {
  if (!caught || typeof caught !== "object") return false;
  const failure = caught as { status?: unknown; preserved?: unknown };
  return typeof failure.status === "number" && (failure.status < 500 || failure.preserved === true);
}

export default function AdminAiExecutionPage() {
  const { session, profile } = useAdminAuth();
  const assistEnabled = isEv2FeatureEnabled(profile, "ev2.ai_assist");
  const executeEnabled = isEv2FeatureEnabled(profile, "ev2.ai_execute");
  const candidateEnabled = assistEnabled && executeEnabled;
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    candidateEnabled ? "checking" : "disabled",
  );
  const [workspace, setWorkspace] = useState<Ev2AiExecutionWorkspace | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedTargetRef, setSelectedTargetRef] = useState("");
  const [targetRef, setTargetRef] = useState(internalExecutionReference);
  const [targetTitle, setTargetTitle] = useState("Alvo sintético de ensaio");
  const [targetSummary, setTargetSummary] = useState("Estado sintético inicial para o ensaio controlado.");
  const [planTitle, setPlanTitle] = useState("Plano sintético de ensaio");
  const [editingPlanId, setEditingPlanId] = useState("");
  const [editingPlanHash, setEditingPlanHash] = useState("");
  const [toolKey, setToolKey] = useState<ToolKey>("draft.apply_patch");
  const [patchText, setPatchText] = useState("Resumo sintético preparado pelo plano de ensaio.");
  const [scheduledAt, setScheduledAt] = useState("");
  const [steps, setSteps] = useState<Ev2AiExecutionStep[]>([]);
  const [rationale, setRationale] = useState("Plano sintético conferido contra o ensaio e seu escopo.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);

  const selectedPlan = useMemo(
    () => workspace?.plans.find((plan) => plan.id === selectedPlanId) ?? workspace?.plans[0] ?? null,
    [selectedPlanId, workspace?.plans],
  );
  const selectedTarget = useMemo(
    () => workspace?.targets.find((target) => target.reference === selectedTargetRef) ?? null,
    [selectedTargetRef, workspace?.targets],
  );
  const currentRisk = useMemo(() => planRisk(steps, workspace?.tools ?? []), [steps, workspace?.tools]);
  const mutationsBlocked = busy || pendingMutation !== null;

  const loadWorkspace = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    const result = Ev2AiExecutionWorkspaceSchema.parse(
      await aiExecuteCommand(session, { action: "workspace", envelope: envelope() }),
    );
    setWorkspace(result);
    setSelectedTargetRef((current) =>
      result.targets.some((target) => target.reference === current)
        ? current
        : (result.targets.find((target) => target.owned)?.reference ?? result.targets[0]?.reference ?? ""),
    );
    setSelectedPlanId((current) =>
      result.plans.some((plan) => plan.id === current) ? current : (result.plans[0]?.id ?? ""),
    );
  }, [candidateEnabled, session]);

  const load = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    setError("");
    try {
      const result = Ev2AiExecutionCapabilitySchema.parse(
        await aiExecuteCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!result.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      await loadWorkspace();
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "Execução controlada indisponível.");
    }
  }, [candidateEnabled, loadWorkspace, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function executeMutation(operation: PendingMutation) {
    if (!session) {
      setError("Sua sessão expirou. Entre novamente antes de continuar.");
      return null;
    }
    if (profile?.mfaVerified !== true) {
      setError("Confirme o MFA antes de executar uma operação transacional.");
      return null;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const send = async () =>
        Ev2AiExecutionMutationResultSchema.parse(
          await aiExecuteCommand(session, operation.body, operation.idempotencyKey),
        );
      let result: Awaited<ReturnType<typeof send>>;
      try {
        result = await send();
      } catch (caught) {
        if (isDefinitiveMutationFailure(caught)) throw caught;
        result = await send();
      }
      setPendingMutation(null);
      setSuccess(operation.message);
      try {
        await loadWorkspace();
      } catch {
        setError(
          "Operação confirmada pelo servidor, mas a tela não pôde ser atualizada. Não repita o comando; recarregue o workspace.",
        );
      }
      return result;
    } catch (caught) {
      if (isDefinitiveMutationFailure(caught)) {
        setPendingMutation(null);
        setError(caught instanceof Error ? caught.message : "A operação foi recusada com segurança.");
      } else {
        setPendingMutation(operation);
        setError(
          "Resultado ainda não confirmado. O comando original e a mesma chave idempotente foram preservados. Use “Repetir comando pendente”; não crie outra operação.",
        );
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function mutate(body: Record<string, unknown>, message: string) {
    if (!session) {
      setError("Sua sessão expirou. Entre novamente antes de continuar.");
      return null;
    }
    if (profile?.mfaVerified !== true) {
      setError("Confirme o MFA antes de executar uma operação transacional.");
      return null;
    }
    if (pendingMutation) {
      setError("Resolva o comando pendente antes de iniciar outra operação.");
      return null;
    }
    const operation = { body, message, idempotencyKey: crypto.randomUUID() };
    setPendingMutation(operation);
    return executeMutation(operation);
  }

  async function createTarget() {
    const result = await mutate(
      {
        action: "create_target",
        envelope: envelope(),
        targetRef,
        targetTitle,
        targetSummary,
      },
      "Alvo sintético criado; nenhuma tabela editorial foi alterada.",
    );
    if (result?.targetRef) {
      setSelectedTargetRef(result.targetRef);
      setTargetRef(internalExecutionReference());
    }
  }

  function addStep() {
    if (!selectedTarget) {
      setError("Crie ou selecione um alvo sintético antes de adicionar etapas.");
      return;
    }
    if (steps.length >= 20) {
      setError("O plano aceita no máximo 20 etapas.");
      return;
    }
    const scheduleInstant = scheduledAt ? Date.parse(scheduledAt) : Number.NaN;
    if (toolKey === "release.schedule" && !Number.isFinite(scheduleInstant)) {
      setError("Informe uma data válida para o agendamento sintético.");
      return;
    }
    const step = createExecutionStep({
      toolKey,
      target: selectedTarget,
      existingSteps: steps,
      patchText,
      scheduledAt: Number.isFinite(scheduleInstant) ? new Date(scheduleInstant).toISOString() : "",
    });
    const issue = validateExecutionStep(step);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setSteps((current) => [...current, step]);
  }

  async function savePlan() {
    if (!steps.length) {
      setError("Adicione ao menos uma etapa ao plano.");
      return;
    }
    const action = editingPlanId ? "revise_plan" : "create_plan";
    const result = await mutate(
      {
        action,
        envelope: envelope(),
        ...(editingPlanId ? { planId: editingPlanId, expectedPlanHash: editingPlanHash } : {}),
        title: planTitle,
        steps,
      },
      editingPlanId
        ? "Plano revisado; qualquer aprovação anterior foi invalidada."
        : "Simulação segura validada e plano sintético criado para revisão independente.",
    );
    if (result?.planId) setSelectedPlanId(result.planId);
    if (result) {
      setEditingPlanId("");
      setEditingPlanHash("");
      setSteps([]);
    }
  }

  function loadForRevision(plan: Ev2AiExecutionPlan) {
    setEditingPlanId(plan.id);
    setEditingPlanHash(plan.planHash);
    setPlanTitle(plan.title);
    setSteps(rebaseExpectedVersions(plan.steps, workspace?.targets ?? []));
    setSuccess(
      "Plano carregado com as versões atuais. Ao salvar, a versão verificada do plano mudará e a aprovação anterior expirará.",
    );
  }

  async function decidePlan(plan: Ev2AiExecutionPlan, decision: "approved" | "rejected") {
    await mutate(
      {
        action: "approve_plan",
        envelope: envelope(),
        planId: plan.id,
        expectedPlanHash: plan.planHash,
        decision,
        rationale,
      },
      decision === "approved"
        ? "Aprovação segregada registrada por 10 minutos."
        : "Plano rejeitado sem qualquer aplicação.",
    );
  }

  async function executePlan(plan: Ev2AiExecutionPlan) {
    await mutate(
      {
        action: "execute_plan",
        envelope: envelope(),
        planId: plan.id,
        expectedPlanHash: plan.planHash,
      },
      "Plano executado atomicamente apenas sobre alvos sintéticos.",
    );
  }

  async function approveCompensation(plan: Ev2AiExecutionPlan) {
    const run = plan.runs[0];
    if (!run) return;
    await mutate(
      {
        action: "approve_compensation",
        envelope: envelope(),
        runId: run.id,
        expectedPlanHash: plan.planHash,
        rationale,
      },
      "Compensação autorizada por outro operador durante 10 minutos.",
    );
  }

  async function compensate(plan: Ev2AiExecutionPlan) {
    const run = plan.runs[0];
    if (!run) return;
    await mutate(
      {
        action: "compensate_run",
        envelope: envelope(),
        runId: run.id,
        expectedPlanHash: plan.planHash,
      },
      "Estado sintético anterior restaurado com versão monotônica.",
    );
  }

  async function cancelPlan(plan: Ev2AiExecutionPlan) {
    await mutate(
      {
        action: "cancel_plan",
        envelope: envelope(),
        planId: plan.id,
        expectedPlanHash: plan.planHash,
      },
      "Plano cancelado; aprovações ativas foram invalidadas.",
    );
  }

  if (!candidateEnabled) {
    return (
      <section>
        <h1>Execução transacional controlada</h1>
        <div role="status" className="admin-notice">
          A execução assistida precisa ser habilitada individualmente para esta conta. O fluxo manual
          permanece disponível enquanto a autorização não estiver completa.
        </div>
        <Link to="/admin/assistente">Voltar à assistência sem execução</Link>
      </section>
    );
  }

  if (capability === "checking") return <p role="status">Verificando a elegibilidade da execução…</p>;

  if (capability !== "enabled" || !workspace) {
    return (
      <section>
        <h1>Execução transacional controlada</h1>
        <div role="alert" className="admin-alert admin-alert--error">
          {error || "A execução assistida está indisponível. Nenhuma alteração foi aplicada."}
        </div>
        <Link to="/admin/assistente">Usar assistência sem execução</Link>
      </section>
    );
  }

  return (
    <section className="admin-ai-exec" aria-labelledby="ai-exec-title">
      <UnsavedChangesGuard dirty={pendingMutation !== null} />
      <header className="admin-ai-exec__header">
        <div>
          <p className="admin-eyebrow">EXECUÇÃO ASSISTIDA</p>
          <h1 id="ai-exec-title">Execução transacional controlada</h1>
          <p>Plano estruturado, simulação segura, aprovação segregada, execução atômica e compensação.</p>
        </div>
        <Link to="/admin/assistente">Assistência de leitura e rascunho</Link>
      </header>

      <div className="admin-ai-exec__guardrails" role="status">
        <ShieldAlert aria-hidden="true" size={20} />
        <p>
          Somente <strong>alvos sintéticos de ensaio</strong> desta execução podem ser selecionados.
          Planejador, revisor e executor usam MFA, com revisão e execução por pessoas distintas. Dados reais e
          tabelas editoriais permanecem bloqueados em {CMS_ENVIRONMENT}.
        </p>
      </div>

      {error && (
        <div role="alert" className="admin-alert admin-alert--error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="admin-alert admin-alert--success">
          {success}
        </div>
      )}
      {pendingMutation && (
        <div role="status" className="admin-notice">
          <p>
            Há um comando com resultado ambíguo. A repetição segura reutiliza exatamente o mesmo envelope e a
            mesma proteção contra duplicidade.
          </p>
          <button type="button" onClick={() => void executeMutation(pendingMutation)} disabled={busy}>
            Repetir comando pendente
          </button>
        </div>
      )}

      <div className="admin-ai-exec__grid">
        <form
          className="admin-editor-card"
          aria-label="Criar alvo sintético de ensaio"
          onSubmit={(event) => {
            event.preventDefault();
            void createTarget();
          }}
        >
          <h2>
            <Plus aria-hidden="true" size={19} /> 1. Alvo sintético
          </h2>
          <p className="admin-help">
            A referência técnica deste ensaio é criada automaticamente e fica disponível apenas na auditoria.
          </p>
          <label>
            Título
            <input
              value={targetTitle}
              onChange={(event) => setTargetTitle(event.target.value)}
              required
              minLength={3}
              maxLength={160}
            />
          </label>
          <label>
            Resumo inicial
            <textarea
              value={targetSummary}
              onChange={(event) => setTargetSummary(event.target.value)}
              required
              minLength={3}
              maxLength={3000}
            />
          </label>
          <button
            type="submit"
            disabled={mutationsBlocked || !workspace.permissions.canPlan || !profile?.mfaVerified}
          >
            Criar alvo de ensaio
          </button>
        </form>

        <section className="admin-editor-card">
          <h2>
            <ListChecks aria-hidden="true" size={19} /> 2. Plano e simulação segura
          </h2>
          <label>
            Título do plano
            <input
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
              required
              minLength={3}
              maxLength={160}
            />
          </label>
          <label>
            Alvo
            <select
              required
              value={selectedTargetRef}
              onChange={(event) => setSelectedTargetRef(event.target.value)}
            >
              <option value="">Selecione</option>
              {workspace.targets
                .filter((target) => target.owned)
                .map((target) => (
                  <option key={target.reference} value={target.reference}>
                    {target.title} · {target.lifecycle} · v{target.version}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Comando oficial sintético
            <select required value={toolKey} onChange={(event) => setToolKey(event.target.value as ToolKey)}>
              {workspace.tools.map((tool) => (
                <option key={tool.key} value={tool.key}>
                  {tool.name} · {tool.risk}
                </option>
              ))}
            </select>
          </label>
          {toolKey === "draft.apply_patch" && (
            <label>
              Novo resumo sintético
              <textarea
                required
                minLength={3}
                maxLength={3000}
                value={patchText}
                onChange={(event) => setPatchText(event.target.value)}
              />
            </label>
          )}
          {toolKey === "release.schedule" && (
            <label>
              Data do ensaio (máximo 24 horas)
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            onClick={addStep}
            disabled={mutationsBlocked || !workspace.permissions.canPlan}
          >
            Adicionar ao plano
          </button>

          <ol className="admin-ai-exec__steps" aria-label="Etapas planejadas">
            {steps.map((step, index) => (
              <li key={step.stepKey}>
                <span>
                  {index + 1}.{" "}
                  {workspace.tools.find((tool) => tool.key === step.toolKey)?.name ?? "Operação controlada"} ·{" "}
                  {workspace.targets.find((target) => target.reference === step.targetRef)?.title ??
                    "Alvo de ensaio"}{" "}
                  · versão conferida automaticamente
                </span>
                <button
                  type="button"
                  aria-label={`Remover etapa ${index + 1}`}
                  onClick={() =>
                    setSteps((current) =>
                      rebaseExpectedVersions(
                        current.filter((item) => item.stepKey !== step.stepKey),
                        workspace.targets,
                      ),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </li>
            ))}
          </ol>
          <p className="admin-ai-exec__preview">
            Simulação local: {steps.length} etapa(s) · {planTargetCount(steps)} alvo(s) · risco {currentRisk}{" "}
            · reversível
          </p>
          <button
            type="button"
            onClick={() => void savePlan()}
            disabled={
              mutationsBlocked || !steps.length || !workspace.permissions.canPlan || !profile?.mfaVerified
            }
          >
            {editingPlanId
              ? "Salvar nova versão e invalidar aprovação"
              : "Validar simulação e solicitar revisão"}
          </button>
        </section>
      </div>

      <section className="admin-editor-card admin-ai-exec__review">
        <h2>
          <ClipboardCheck aria-hidden="true" size={19} /> 3. Aprovação e execução
        </h2>
        {!selectedPlan ? (
          <p>Nenhum plano criado.</p>
        ) : (
          <>
            <label>
              Plano
              <select
                required
                value={selectedPlan.id}
                onChange={(event) => setSelectedPlanId(event.target.value)}
              >
                {workspace.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title} · {plan.status} · {plan.risk}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-ai-exec__summary">
              <p>
                <strong>Status:</strong> {selectedPlan.status}
              </p>
              <p>
                <strong>Risco:</strong> {selectedPlan.risk}
              </p>
              <p>
                <strong>Integridade:</strong> plano conferido pelo servidor
              </p>
              <p>
                <strong>Simulação segura:</strong> {selectedPlan.dryRun.stepCount} etapa(s),{" "}
                {selectedPlan.dryRun.targetCount} alvo(s), reversível
              </p>
            </div>
            <label>
              Justificativa
              <textarea
                required
                minLength={3}
                maxLength={1000}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
              />
            </label>
            <div className="admin-ai-exec__actions">
              {selectedPlan.owned && ["ready", "approved", "rejected"].includes(selectedPlan.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => loadForRevision(selectedPlan)}
                    disabled={mutationsBlocked}
                  >
                    Revisar plano
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelPlan(selectedPlan)}
                    disabled={mutationsBlocked}
                  >
                    <XCircle aria-hidden="true" size={17} /> Cancelar
                  </button>
                </>
              )}
              {selectedPlan.approvable && (
                <>
                  <button
                    type="button"
                    onClick={() => void decidePlan(selectedPlan, "approved")}
                    disabled={mutationsBlocked}
                  >
                    <CheckCircle2 aria-hidden="true" size={17} /> Aprovar por 10 minutos
                  </button>
                  <button
                    type="button"
                    onClick={() => void decidePlan(selectedPlan, "rejected")}
                    disabled={mutationsBlocked}
                  >
                    <XCircle aria-hidden="true" size={17} /> Rejeitar
                  </button>
                </>
              )}
              {selectedPlan.executable && selectedPlan.approvals[0]?.approvedBy !== profile?.userId && (
                <button
                  type="button"
                  onClick={() => void executePlan(selectedPlan)}
                  disabled={mutationsBlocked}
                >
                  <Play aria-hidden="true" size={17} /> Executar plano aprovado
                </button>
              )}
              {selectedPlan.status === "executed" &&
                selectedPlan.runs[0] &&
                (selectedPlan.runs[0].compensationApproved ? (
                  selectedPlan.compensatable &&
                  selectedPlan.approvals.find(
                    (approval) => approval.purpose === "compensate" && approval.status === "active",
                  )?.approvedBy !== profile?.userId && (
                    <button
                      type="button"
                      onClick={() => void compensate(selectedPlan)}
                      disabled={mutationsBlocked}
                    >
                      <CornerUpLeft aria-hidden="true" size={17} /> Executar compensação
                    </button>
                  )
                ) : selectedPlan.runs[0].executedBy !== profile?.userId &&
                  workspace.permissions.canApprove ? (
                  <button
                    type="button"
                    onClick={() => void approveCompensation(selectedPlan)}
                    disabled={mutationsBlocked}
                  >
                    <ClipboardCheck aria-hidden="true" size={17} /> Aprovar compensação
                  </button>
                ) : null)}
            </div>
            {selectedPlan.owned && selectedPlan.status === "ready" && (
              <p className="admin-ai-exec__note">
                Outro usuário sintético com MFA deve aprovar esta versão verificada.
              </p>
            )}
          </>
        )}
      </section>

      <aside className="admin-editor-card admin-ai-exec__fallback">
        <h2>Fallback manual preservado</h2>
        <p>Uma falha, expiração ou divergência encerra a execução antes de tocar qualquer alvo real.</p>
        <nav aria-label="Atalhos manuais">
          <Link to="/admin/conteudo">Conteúdo editorial</Link>
          <Link to="/admin/meu-trabalho">Releases e tarefas</Link>
          <Link to="/admin/produtos">Produtos</Link>
        </nav>
      </aside>
    </section>
  );
}
