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
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import "../admin-ai-execution.css";

type ToolKey = Ev2AiExecutionStep["toolKey"];
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

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
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
  const [targetRef, setTargetRef] = useState(
    () => `g14x-manual-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
  );
  const [targetTitle, setTargetTitle] = useState("Alvo sintético G14");
  const [targetSummary, setTargetSummary] = useState("Estado sintético inicial para o ensaio G14.");
  const [planTitle, setPlanTitle] = useState("Plano sintético G14");
  const [editingPlanId, setEditingPlanId] = useState("");
  const [editingPlanHash, setEditingPlanHash] = useState("");
  const [toolKey, setToolKey] = useState<ToolKey>("draft.apply_patch");
  const [patchText, setPatchText] = useState("Resumo sintético preparado pelo plano G14.");
  const [scheduledAt, setScheduledAt] = useState("");
  const [steps, setSteps] = useState<Ev2AiExecutionStep[]>([]);
  const [rationale, setRationale] = useState("Plano sintético conferido contra o dry-run e o escopo G14.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedPlan = useMemo(
    () => workspace?.plans.find((plan) => plan.id === selectedPlanId) ?? workspace?.plans[0] ?? null,
    [selectedPlanId, workspace?.plans],
  );
  const selectedTarget = useMemo(
    () => workspace?.targets.find((target) => target.reference === selectedTargetRef) ?? null,
    [selectedTargetRef, workspace?.targets],
  );
  const currentRisk = useMemo(() => planRisk(steps, workspace?.tools ?? []), [steps, workspace?.tools]);

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

  async function mutate(body: Record<string, unknown>, message: string) {
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
      const result = Ev2AiExecutionMutationResultSchema.parse(
        await aiExecuteCommand(session, body, crypto.randomUUID()),
      );
      setSuccess(message + ` Correlação: ${result.correlationId}`);
      try {
        await loadWorkspace();
      } catch {
        setError(
          "Operação confirmada pelo servidor, mas a tela não pôde ser atualizada. Não repita o comando; recarregue o workspace.",
        );
      }
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A operação foi recusada com segurança.");
      return null;
    } finally {
      setBusy(false);
    }
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
    if (result?.targetRef) setSelectedTargetRef(result.targetRef);
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
        : "Dry-run validado e plano sintético criado para revisão independente.",
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
      "Plano carregado com as versões atuais. Ao salvar, o hash mudará e a aprovação anterior expirará.",
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
          A EV2.14 exige os overrides individuais <code>ev2.ai_assist</code> e <code>ev2.ai_execute</code>. O
          fluxo manual permanece disponível.
        </div>
        <Link to="/admin/assistente">Voltar à assistência sem execução</Link>
      </section>
    );
  }

  if (capability === "checking") return <p role="status">Verificando a elegibilidade G14…</p>;

  if (capability !== "enabled" || !workspace) {
    return (
      <section>
        <h1>Execução transacional controlada</h1>
        <div role="alert" className="admin-alert admin-alert--error">
          {error || "A execução G14 está indisponível. Nenhuma alteração foi aplicada."}
        </div>
        <Link to="/admin/assistente">Usar assistência sem execução</Link>
      </section>
    );
  }

  return (
    <section className="admin-ai-exec" aria-labelledby="ai-exec-title">
      <header className="admin-ai-exec__header">
        <div>
          <p className="admin-eyebrow">EV2.14 · Gate G14</p>
          <h1 id="ai-exec-title">Execução transacional controlada</h1>
          <p>Plano estruturado, dry-run, aprovação segregada, execução atômica e compensação.</p>
        </div>
        <Link to="/admin/assistente">Assistência de leitura e rascunho</Link>
      </header>

      <div className="admin-ai-exec__guardrails" role="status">
        <ShieldAlert aria-hidden="true" size={20} />
        <p>
          Somente <strong>alvos sintéticos g14x-*</strong> em {CMS_ENVIRONMENT}. Produção, dados reais, rede
          externa e tabelas editoriais estão bloqueados. MFA é obrigatório em toda mutação.
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

      <div className="admin-ai-exec__grid">
        <form
          className="admin-editor-card"
          onSubmit={(event) => {
            event.preventDefault();
            void createTarget();
          }}
        >
          <h2>
            <Plus aria-hidden="true" size={19} /> 1. Alvo sintético
          </h2>
          <label>
            Referência g14x-*
            <input
              value={targetRef}
              onChange={(event) => setTargetRef(event.target.value)}
              pattern="g14x-[a-z0-9-]{3,100}"
              required
            />
          </label>
          <label>
            Título
            <input value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} required />
          </label>
          <label>
            Resumo inicial
            <textarea
              value={targetSummary}
              onChange={(event) => setTargetSummary(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy || !workspace.permissions.canPlan || !profile?.mfaVerified}>
            Criar alvo de ensaio
          </button>
        </form>

        <section className="admin-editor-card">
          <h2>
            <ListChecks aria-hidden="true" size={19} /> 2. Plano e dry-run
          </h2>
          <label>
            Título do plano
            <input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} />
          </label>
          <label>
            Alvo
            <select value={selectedTargetRef} onChange={(event) => setSelectedTargetRef(event.target.value)}>
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
            <select value={toolKey} onChange={(event) => setToolKey(event.target.value as ToolKey)}>
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
              <textarea value={patchText} onChange={(event) => setPatchText(event.target.value)} />
            </label>
          )}
          {toolKey === "release.schedule" && (
            <label>
              Data do ensaio (máximo 24 horas)
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          )}
          <button type="button" onClick={addStep} disabled={busy || !workspace.permissions.canPlan}>
            Adicionar ao plano
          </button>

          <ol className="admin-ai-exec__steps" aria-label="Etapas planejadas">
            {steps.map((step, index) => (
              <li key={step.stepKey}>
                <span>
                  {index + 1}. {step.toolKey} · {step.targetRef} · espera v{step.expectedVersion}
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
            Dry-run local: {steps.length} etapa(s) · {planTargetCount(steps)} alvo(s) · risco {currentRisk} ·
            reversível
          </p>
          <button
            type="button"
            onClick={() => void savePlan()}
            disabled={busy || !steps.length || !workspace.permissions.canPlan || !profile?.mfaVerified}
          >
            {editingPlanId
              ? "Salvar nova versão e invalidar aprovação"
              : "Validar dry-run e solicitar revisão"}
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
              <select value={selectedPlan.id} onChange={(event) => setSelectedPlanId(event.target.value)}>
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
                <strong>Hash:</strong> <code>{shortHash(selectedPlan.planHash)}</code>
              </p>
              <p>
                <strong>Dry-run:</strong> {selectedPlan.dryRun.stepCount} etapa(s),{" "}
                {selectedPlan.dryRun.targetCount} alvo(s), reversível
              </p>
            </div>
            <label>
              Justificativa
              <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} />
            </label>
            <div className="admin-ai-exec__actions">
              {selectedPlan.owned && ["ready", "approved", "rejected"].includes(selectedPlan.status) && (
                <>
                  <button type="button" onClick={() => loadForRevision(selectedPlan)} disabled={busy}>
                    Revisar plano
                  </button>
                  <button type="button" onClick={() => void cancelPlan(selectedPlan)} disabled={busy}>
                    <XCircle aria-hidden="true" size={17} /> Cancelar
                  </button>
                </>
              )}
              {selectedPlan.approvable && (
                <>
                  <button
                    type="button"
                    onClick={() => void decidePlan(selectedPlan, "approved")}
                    disabled={busy}
                  >
                    <CheckCircle2 aria-hidden="true" size={17} /> Aprovar por 10 minutos
                  </button>
                  <button
                    type="button"
                    onClick={() => void decidePlan(selectedPlan, "rejected")}
                    disabled={busy}
                  >
                    <XCircle aria-hidden="true" size={17} /> Rejeitar
                  </button>
                </>
              )}
              {selectedPlan.executable && selectedPlan.approvals[0]?.approvedBy !== profile?.userId && (
                <button type="button" onClick={() => void executePlan(selectedPlan)} disabled={busy}>
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
                    <button type="button" onClick={() => void compensate(selectedPlan)} disabled={busy}>
                      <CornerUpLeft aria-hidden="true" size={17} /> Executar compensação
                    </button>
                  )
                ) : selectedPlan.runs[0].executedBy !== profile?.userId &&
                  workspace.permissions.canApprove ? (
                  <button
                    type="button"
                    onClick={() => void approveCompensation(selectedPlan)}
                    disabled={busy}
                  >
                    <ClipboardCheck aria-hidden="true" size={17} /> Aprovar compensação
                  </button>
                ) : null)}
            </div>
            {selectedPlan.owned && selectedPlan.status === "ready" && (
              <p className="admin-ai-exec__note">Outro usuário sintético com MFA deve aprovar este hash.</p>
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
