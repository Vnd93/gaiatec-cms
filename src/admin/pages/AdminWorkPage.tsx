import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { z } from "zod";
import {
  Ev2BulkJobSchema,
  Ev2ReleaseDetailSchema,
  Ev2ReleaseSummarySchema,
  Ev2WorkTaskSchema,
  ev2AnchorPath,
  ev2ReleaseStatusLabels,
  parseBulkTargets,
  type Ev2BulkJob,
  type Ev2ReleaseDetail,
  type Ev2ReleaseSummary,
  type Ev2WorkTask,
} from "@/shared/contracts/ev2-collaboration";
import { bulkV2Command, collaborationCommand, releaseV2Command } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import {
  AdminAlert,
  Badge,
  ConfirmDialog,
  EmptyState,
  FieldGroup,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
  StepTabs,
} from "../components/AdminUI";

type WorkTab = "inbox" | "releases" | "bulk";
type BulkOperation = "add_to_release" | "assign_tasks" | "resolve_tasks";
type BulkResult = Ev2BulkJob & {
  items: Array<{
    position: number;
    targetType: string;
    targetId: string;
    validationStatus: "valid" | "error";
    errors: Array<{ field?: string; code?: string; correction?: string }>;
    result?: Record<string, unknown> | null;
  }>;
};

const envelope = <T extends 1 | 2>(schemaVersion: T, expectedVersion?: number) => ({
  schemaVersion,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: cmsEnvironment(), siteKey: "main" as const },
  ...(expectedVersion ? { expectedVersion } : {}),
});

const releaseListSchema = z.object({ items: z.array(Ev2ReleaseSummarySchema) });
const inboxSchema = z.object({
  items: z.array(Ev2WorkTaskSchema),
  savedViews: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      filters: z.record(z.string(), z.unknown()),
      sort: z.record(z.string(), z.unknown()),
      favorite: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
});
const bulkListSchema = z.object({ items: z.array(Ev2BulkJobSchema) });

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["published", "completed", "resolved", "validated", "approved"].includes(status)) return "success";
  if (["failed", "critical"].includes(status)) return "danger";
  if (["scheduled", "ready_for_review", "high"].includes(status)) return "warning";
  if (["in_progress", "running"].includes(status)) return "info";
  return "neutral";
}

export default function AdminWorkPage() {
  const { session, profile } = useAdminAuth();
  const clientCandidate = isEv2FeatureEnabled(profile, "ev2.collaboration_bulk");
  const [tab, setTab] = useState<WorkTab>("inbox");
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    clientCandidate ? "checking" : "disabled",
  );
  const [tasks, setTasks] = useState<Ev2WorkTask[]>([]);
  const [releases, setReleases] = useState<Ev2ReleaseSummary[]>([]);
  const [bulkJobs, setBulkJobs] = useState<Ev2BulkJob[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<Ev2ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(clientCandidate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskRoute, setTaskRoute] = useState("/admin/conteudo");
  const [taskComment, setTaskComment] = useState("");
  const [activeTaskId, setActiveTaskId] = useState("");
  const [activeTaskDetail, setActiveTaskDetail] = useState<Ev2WorkTask | null>(null);

  const [releaseTitle, setReleaseTitle] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseItemId, setReleaseItemId] = useState("");
  const [releaseRevisionId, setReleaseRevisionId] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [confirmAction, setConfirmAction] = useState<"publish" | "rollback" | null>(null);

  const [bulkOperation, setBulkOperation] = useState<BulkOperation>("add_to_release");
  const [bulkTargets, setBulkTargets] = useState("");
  const [bulkReleaseId, setBulkReleaseId] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const bulkExecuteKey = useRef(crypto.randomUUID());

  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const canReadReleases = permissions.includes("cms:releases.read");
  const canEditReleases = permissions.includes("cms:releases.edit");
  const canApproveRelease = permissions.includes("cms:releases.approve");
  const canPublishRelease = permissions.includes("cms:releases.publish");
  const canComment = permissions.includes("cms:collaboration.comment");
  const canAssign = permissions.includes("cms:collaboration.assign");
  const canResolve = permissions.includes("cms:collaboration.resolve");
  const canReadBulk = permissions.includes("cms:bulk.read");
  const canDryRun = permissions.includes("cms:bulk.dry_run");
  const canExecuteBulk = permissions.includes("cms:bulk.execute");

  const load = useCallback(async () => {
    if (!session || !clientCandidate) return;
    setLoading(true);
    setError("");
    try {
      const capabilityResult = await collaborationCommand<{ enabled: boolean }>(session, {
        action: "capability",
        envelope: envelope(1),
      });
      if (!capabilityResult.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      const [inboxResult, releaseResult, bulkResultValue] = await Promise.all([
        permissions.includes("cms:collaboration.read")
          ? collaborationCommand(session, { action: "list", envelope: envelope(1), limit: 100 })
          : null,
        canReadReleases ? releaseV2Command(session, { action: "list", envelope: envelope(2) }) : null,
        canReadBulk ? bulkV2Command(session, { action: "list", envelope: envelope(1), limit: 50 }) : null,
      ]);
      if (inboxResult) setTasks(inboxSchema.parse(inboxResult).items);
      if (releaseResult) setReleases(releaseListSchema.parse(releaseResult).items);
      if (bulkResultValue) setBulkJobs(bulkListSchema.parse(bulkResultValue).items);
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "Meu trabalho está indisponível.");
    } finally {
      setLoading(false);
    }
  }, [canReadBulk, canReadReleases, clientCandidate, permissions, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadRelease(releaseId: string) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await releaseV2Command(session, {
        action: "status",
        releaseId,
        envelope: envelope(2),
      });
      setSelectedRelease(Ev2ReleaseDetailSchema.parse(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Release indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function loadTask(taskId: string) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await collaborationCommand(session, {
        action: "list",
        taskId,
        envelope: envelope(1),
        limit: 1,
      });
      const detail = inboxSchema.parse(result).items[0];
      if (!detail) throw new Error("Tarefa não encontrada.");
      setActiveTaskId(taskId);
      setActiveTaskDetail(detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tarefa indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateCollaboration(action: string, payload: Record<string, unknown>) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await collaborationCommand(session, { action, envelope: envelope(1), ...payload }, crypto.randomUUID());
      setSuccess("Inbox atualizada com trilha de auditoria.");
      setTaskTitle("");
      setTaskComment("");
      await load();
      if (activeTaskId) await loadTask(activeTaskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A colaboração não foi atualizada.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateRelease(action: string, payload: Record<string, unknown> = {}) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const current = selectedRelease;
      const result = await releaseV2Command<{ releaseId: string }>(
        session,
        {
          action,
          envelope: envelope(2, current?.lockVersion),
          ...(current ? { releaseId: current.releaseId } : {}),
          ...payload,
        },
        crypto.randomUUID(),
      );
      setSuccess(`Release atualizado: ${action.replaceAll("_", " ")}.`);
      setReleaseItemId("");
      setReleaseRevisionId("");
      await load();
      await loadRelease(result.releaseId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "O release não foi atualizado.");
    } finally {
      setBusy(false);
    }
  }

  async function createRelease() {
    if (!session || busy || releaseTitle.trim().length < 3 || releaseReason.trim().length < 3) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await releaseV2Command<{ releaseId: string }>(
        session,
        {
          action: "create",
          envelope: envelope(2),
          title: releaseTitle,
          reason: releaseReason,
        },
        crypto.randomUUID(),
      );
      setReleaseTitle("");
      setReleaseReason("");
      setSuccess("Release criado em rascunho, sem publicar conteúdo.");
      await load();
      await loadRelease(result.releaseId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Release não criado.");
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDryRun() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setBulkConfirmed(false);
    try {
      const targets = parseBulkTargets(bulkTargets, bulkOperation);
      const result = await bulkV2Command<BulkResult>(
        session,
        {
          action: "dry_run",
          envelope: envelope(1),
          operation: bulkOperation,
          targets,
          changes:
            bulkOperation === "add_to_release"
              ? { releaseId: bulkReleaseId }
              : bulkOperation === "assign_tasks"
                ? { assignedTo: bulkAssignee }
                : {},
          reason: bulkReason,
        },
        crypto.randomUUID(),
      );
      setBulkResult(result);
      setSuccess(
        result.status === "validated"
          ? `Dry-run válido: ${result.targetCount} alvo(s), zero gravações de domínio.`
          : `Dry-run bloqueado: ${result.report.errors ?? 0} erro(s), zero gravações de domínio.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dry-run não concluído.");
    } finally {
      setBusy(false);
    }
  }

  async function executeBulk() {
    if (!session || !bulkResult || !bulkConfirmed || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await bulkV2Command<BulkResult>(
        session,
        {
          action: "execute",
          envelope: envelope(1),
          jobId: bulkResult.jobId,
          expectedVersion: bulkResult.lockVersion,
        },
        bulkExecuteKey.current,
      );
      setBulkResult(result);
      setSuccess(`Lote concluído atomicamente: ${result.report.writes ?? 0} alteração(ões).`);
      bulkExecuteKey.current = crypto.randomUUID();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lote não concluído.");
    } finally {
      setBusy(false);
    }
  }

  const activeTask = useMemo(
    () => activeTaskDetail ?? tasks.find((task) => task.id === activeTaskId),
    [activeTaskDetail, activeTaskId, tasks],
  );

  if (!clientCandidate)
    return (
      <section>
        <PageHeader
          eyebrow="EV2.7 · DEFAULT-OFF"
          title="Meu trabalho"
          description="A superfície EV2 não está elegível para esta sessão; o fluxo administrativo anterior permanece intacto."
        />
      </section>
    );
  if (loading || capability === "checking")
    return <LoadingSkeleton label="Carregando meu trabalho" rows={6} />;

  return (
    <section>
      <PageHeader
        eyebrow="EV2.7 · PRODUTIVIDADE E COLABORAÇÃO"
        title="Meu trabalho"
        description="Coordene tarefas, releases compostos e operações em massa com validação, idempotência e rollback."
        meta={
          <Badge tone={capability === "enabled" ? "success" : "warning"}>
            {capability === "enabled" ? "Canary habilitado" : "Capacidade desligada"}
          </Badge>
        }
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {capability !== "enabled" ? (
        <EmptyState
          title="Capacidade indisponível para esta sessão"
          description="A flag individual está desligada, expirada ou não pôde ser avaliada. Nenhum dado EV2.7 foi alterado."
        />
      ) : (
        <>
          <StepTabs
            label="Áreas de meu trabalho"
            active={tab}
            onChange={setTab}
            steps={[
              { id: "inbox", label: "Inbox", description: "Tarefas e comentários ancorados" },
              { id: "releases", label: "Releases", description: "Pacotes coerentes e rollback" },
              { id: "bulk", label: "Em massa", description: "Dry-run e execução atômica" },
            ]}
          />

          {tab === "inbox" && (
            <div className="admin-editor-grid">
              {canAssign && (
                <SectionCard
                  title="Nova tarefa"
                  description="Crie uma pendência com destino navegável no CMS."
                >
                  <FieldGroup legend="Contexto da tarefa">
                    <label>
                      Título
                      <input
                        value={taskTitle}
                        maxLength={160}
                        onChange={(event) => setTaskTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      Rota administrativa
                      <input
                        value={taskRoute}
                        maxLength={500}
                        onChange={(event) => setTaskRoute(event.target.value)}
                      />
                    </label>
                  </FieldGroup>
                  <button
                    type="button"
                    disabled={busy || taskTitle.trim().length < 3 || !taskRoute.startsWith("/admin")}
                    onClick={() =>
                      void mutateCollaboration("create_task", {
                        title: taskTitle,
                        sourceKind: "manual",
                        priority: "normal",
                        anchor: { route: taskRoute },
                      })
                    }
                  >
                    Criar tarefa
                  </button>
                </SectionCard>
              )}
              <SectionCard
                title="Pendências"
                description={`${tasks.length} tarefa(s) visível(is) para seu papel.`}
              >
                {tasks.length === 0 ? (
                  <p className="admin-empty-inline">Nenhuma pendência encontrada.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Prioridade</th>
                          <th>Tarefa</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((task) => {
                          const path = ev2AnchorPath(task.anchor);
                          return (
                            <tr key={task.id}>
                              <td>
                                <Badge tone={statusTone(task.priority)}>{task.priority}</Badge>
                              </td>
                              <td>
                                <strong>{task.title}</strong>
                                <br />
                                <small>
                                  {task.commentCount} comentário(s) · versão {task.lockVersion}
                                </small>
                              </td>
                              <td>
                                <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                              </td>
                              <td>
                                <div className="admin-table-actions">
                                  {path && <Link to={path}>Abrir alvo</Link>}
                                  {canComment && (
                                    <button type="button" onClick={() => void loadTask(task.id)}>
                                      Abrir conversa
                                    </button>
                                  )}
                                  {canResolve && task.status !== "resolved" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void mutateCollaboration("resolve_task", {
                                          taskId: task.id,
                                          expectedVersion: task.lockVersion,
                                          reason: "Pendência concluída pelo operador",
                                        })
                                      }
                                    >
                                      Resolver
                                    </button>
                                  )}
                                  {canResolve && task.status === "resolved" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void mutateCollaboration("reopen_task", {
                                          taskId: task.id,
                                          expectedVersion: task.lockVersion,
                                          reason: "Pendência reaberta pelo operador",
                                        })
                                      }
                                    >
                                      Reabrir
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {activeTask && (
                  <FieldGroup legend={`Comentário em “${activeTask.title}”`}>
                    {activeTask.comments.length > 0 && (
                      <div>
                        <strong>Conversa</strong>
                        <ol>
                          {activeTask.comments.map((comment) => (
                            <li key={comment.id}>
                              {comment.body} · {new Date(comment.createdAt).toLocaleString("pt-BR")}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {activeTask.history.length > 0 && (
                      <div>
                        <strong>Histórico</strong>
                        <ol>
                          {activeTask.history.map((event) => (
                            <li key={event.id}>
                              {event.eventType.replaceAll("_", " ")} ·{" "}
                              {new Date(event.occurredAt).toLocaleString("pt-BR")}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <label>
                      Comentário
                      <textarea
                        value={taskComment}
                        maxLength={4000}
                        onChange={(event) => setTaskComment(event.target.value)}
                      />
                    </label>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-button--secondary"
                        onClick={() => {
                          setActiveTaskId("");
                          setActiveTaskDetail(null);
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busy || !taskComment.trim()}
                        onClick={() =>
                          void mutateCollaboration("add_comment", {
                            taskId: activeTask.id,
                            body: taskComment,
                            anchor: activeTask.anchor,
                            mentions: [],
                          })
                        }
                      >
                        Registrar comentário
                      </button>
                    </div>
                  </FieldGroup>
                )}
              </SectionCard>
            </div>
          )}

          {tab === "releases" && (
            <div className="admin-editor-grid">
              {canEditReleases && (
                <SectionCard
                  title="Novo release"
                  description="O pacote nasce vazio e não publica automaticamente."
                >
                  <FieldGroup legend="Identificação">
                    <label>
                      Título
                      <input
                        value={releaseTitle}
                        maxLength={160}
                        onChange={(event) => setReleaseTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      Motivo
                      <input
                        value={releaseReason}
                        maxLength={500}
                        onChange={(event) => setReleaseReason(event.target.value)}
                      />
                    </label>
                  </FieldGroup>
                  <button
                    type="button"
                    disabled={busy || releaseTitle.trim().length < 3 || releaseReason.trim().length < 3}
                    onClick={() => void createRelease()}
                  >
                    Criar release vazio
                  </button>
                </SectionCard>
              )}
              <SectionCard
                title="Releases recentes"
                description="Selecione um pacote para conferir versões e avançar o workflow."
              >
                {releases.length === 0 ? (
                  <p className="admin-empty-inline">Nenhum release composto.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Release</th>
                          <th>Estado</th>
                          <th>Itens</th>
                          <th>Atualização</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releases.map((release) => (
                          <tr key={release.releaseId}>
                            <td>
                              <button type="button" onClick={() => void loadRelease(release.releaseId)}>
                                {release.title}
                              </button>
                              <br />
                              <small>{release.releaseId}</small>
                            </td>
                            <td>
                              <Badge tone={statusTone(release.status)}>
                                {ev2ReleaseStatusLabels[release.status]}
                              </Badge>
                            </td>
                            <td>{release.itemCount}</td>
                            <td>{new Date(release.updatedAt).toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
              {selectedRelease && (
                <SectionCard
                  title={selectedRelease.title}
                  description={`Plano ${selectedRelease.planHash.slice(0, 12)} · versão ${selectedRelease.lockVersion}`}
                >
                  <AdminAlert tone="info">
                    Publicação e rollback são transações lógicas atômicas: nenhuma alteração parcial é
                    confirmada.
                  </AdminAlert>
                  {selectedRelease.status === "draft" && canEditReleases && (
                    <FieldGroup legend="Adicionar revisão congelada">
                      <label>
                        ID do conteúdo
                        <input
                          value={releaseItemId}
                          onChange={(event) => setReleaseItemId(event.target.value)}
                        />
                      </label>
                      <label>
                        ID da revisão aprovada
                        <input
                          value={releaseRevisionId}
                          onChange={(event) => setReleaseRevisionId(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !releaseItemId || !releaseRevisionId}
                        onClick={() =>
                          void mutateRelease("add_item", {
                            itemId: releaseItemId,
                            revisionId: releaseRevisionId,
                            dependencyIds: [],
                          })
                        }
                      >
                        Adicionar ao pacote
                      </button>
                    </FieldGroup>
                  )}
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Posição</th>
                          <th>Conteúdo</th>
                          <th>Revisão</th>
                          <th>Diferenças</th>
                          <th>Validação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRelease.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.position}</td>
                            <td>
                              {item.contentType} · {item.slug}
                              <br />
                              <small>{item.itemId}</small>
                            </td>
                            <td>
                              <code>{item.revisionId}</code>
                            </td>
                            <td>
                              {item.diff.changedFields.length > 0
                                ? item.diff.changedFields.join(", ")
                                : "Sem mudança de conteúdo"}
                              {item.diff.seoChanged ? " · SEO alterado" : ""}
                            </td>
                            <td>
                              <Badge tone={statusTone(item.validationStatus)}>{item.validationStatus}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedRelease.validations.length > 0 && (
                    <div className="admin-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Regra/campo</th>
                            <th>Resultado</th>
                            <th>Orientação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRelease.validations.map((validation, index) => (
                            <tr key={`${validation.validationKey}:${index}`}>
                              <td>
                                <code>{validation.validationKey}</code>
                                <br />
                                <small>{validation.fieldPath}</small>
                              </td>
                              <td>
                                <Badge tone={statusTone(validation.status)}>{validation.status}</Badge>
                              </td>
                              <td>{validation.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="admin-workflow-actions">
                    {canEditReleases && ["draft", "validated"].includes(selectedRelease.status) && (
                      <button
                        type="button"
                        disabled={busy || selectedRelease.items.length === 0}
                        onClick={() => void mutateRelease("validate")}
                      >
                        Validar pacote
                      </button>
                    )}
                    {canEditReleases && selectedRelease.status === "validated" && (
                      <button type="button" disabled={busy} onClick={() => void mutateRelease("submit")}>
                        Enviar para aprovação
                      </button>
                    )}
                    {canApproveRelease && selectedRelease.status === "ready_for_review" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutateRelease("approve", {
                            reason: "Release conferido e aprovado de forma segregada",
                          })
                        }
                      >
                        Aprovar com MFA
                      </button>
                    )}
                    {canPublishRelease && selectedRelease.status === "approved" && (
                      <button type="button" disabled={busy} onClick={() => setConfirmAction("publish")}>
                        Publicar conjunto
                      </button>
                    )}
                    {canPublishRelease && selectedRelease.status === "approved" && (
                      <label>
                        Agendar para
                        <input
                          type="datetime-local"
                          value={scheduleAt}
                          onChange={(event) => setScheduleAt(event.target.value)}
                        />
                      </label>
                    )}
                    {canPublishRelease && selectedRelease.status === "approved" && scheduleAt && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutateRelease("schedule", { scheduledFor: new Date(scheduleAt).toISOString() })
                        }
                      >
                        Agendar conjunto
                      </button>
                    )}
                    {permissions.includes("cms:releases.rollback") &&
                      selectedRelease.status === "published" && (
                        <button
                          type="button"
                          className="admin-button--danger"
                          disabled={busy}
                          onClick={() => setConfirmAction("rollback")}
                        >
                          Reverter release
                        </button>
                      )}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {tab === "bulk" && (
            <div className="admin-editor-grid">
              <SectionCard
                title="Operação em massa"
                description="O dry-run sempre precede a execução e produz zero gravações de domínio."
              >
                <FieldGroup legend="Plano do lote">
                  <label>
                    Operação
                    <select
                      value={bulkOperation}
                      onChange={(event) => {
                        setBulkOperation(event.target.value as BulkOperation);
                        setBulkResult(null);
                      }}
                    >
                      <option value="add_to_release">Adicionar a release</option>
                      <option value="assign_tasks">Atribuir tarefas</option>
                      <option value="resolve_tasks">Resolver tarefas</option>
                    </select>
                  </label>
                  {bulkOperation === "add_to_release" && (
                    <label>
                      ID do release
                      <input
                        value={bulkReleaseId}
                        onChange={(event) => setBulkReleaseId(event.target.value)}
                      />
                    </label>
                  )}
                  {bulkOperation === "assign_tasks" && (
                    <label>
                      ID do responsável
                      <input value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)} />
                    </label>
                  )}
                  <label>
                    Motivo
                    <input
                      value={bulkReason}
                      maxLength={500}
                      onChange={(event) => setBulkReason(event.target.value)}
                    />
                  </label>
                  <label>
                    Alvos — um por linha
                    <textarea
                      rows={8}
                      value={bulkTargets}
                      placeholder={
                        bulkOperation === "add_to_release" ? "itemId,revisionId" : "taskId,expectedVersion"
                      }
                      onChange={(event) => {
                        setBulkTargets(event.target.value);
                        setBulkResult(null);
                      }}
                    />
                  </label>
                </FieldGroup>
                {canDryRun && (
                  <button
                    type="button"
                    disabled={busy || bulkReason.trim().length < 3 || !bulkTargets.trim()}
                    onClick={() => void runBulkDryRun()}
                  >
                    Validar sem alterar
                  </button>
                )}
                {bulkResult && (
                  <>
                    <AdminAlert tone={bulkResult.status === "validated" ? "success" : "danger"}>
                      Total {bulkResult.targetCount} · válidos {bulkResult.report.validItems ?? 0} · erros{" "}
                      {bulkResult.report.errors ?? 0} · gravações {bulkResult.report.writes ?? 0}
                    </AdminAlert>
                    <div className="admin-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Linha</th>
                            <th>Alvo</th>
                            <th>Validação</th>
                            <th>Correção</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResult.items.map((item) => (
                            <tr key={`${item.position}:${item.targetId}`}>
                              <td>{item.position}</td>
                              <td>
                                <code>{item.targetId}</code>
                              </td>
                              <td>
                                <Badge tone={item.validationStatus === "valid" ? "success" : "danger"}>
                                  {item.validationStatus}
                                </Badge>
                              </td>
                              <td>
                                {item.errors.map((entry) => entry.correction).join(" ") ||
                                  "Pronto para execução."}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {bulkResult.status === "validated" && canExecuteBulk && (
                      <div className="admin-workflow-actions">
                        <label>
                          <input
                            type="checkbox"
                            checked={bulkConfirmed}
                            onChange={(event) => setBulkConfirmed(event.target.checked)}
                          />{" "}
                          Confirmo o escopo exato de {bulkResult.targetCount} alvo(s).
                        </label>
                        <button
                          type="button"
                          disabled={busy || !bulkConfirmed}
                          onClick={() => void executeBulk()}
                        >
                          Executar lote atômico
                        </button>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
              <SectionCard title="Jobs recentes" description="Recibos de dry-run, execução e cancelamento.">
                {bulkJobs.length === 0 ? (
                  <p className="admin-empty-inline">Nenhum job disponível.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Job</th>
                          <th>Operação</th>
                          <th>Estado</th>
                          <th>Alvos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkJobs.map((job) => (
                          <tr key={job.jobId}>
                            <td>
                              <code>{job.jobId}</code>
                            </td>
                            <td>{job.operation}</td>
                            <td>
                              <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                            </td>
                            <td>{job.targetCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "rollback" ? "Reverter todo o release?" : "Publicar todo o release?"}
        description={
          confirmAction === "rollback"
            ? "As projeções anteriores serão restauradas atomicamente. A operação exige MFA e ficará auditada."
            : "Todos os itens serão confirmados na mesma transação. Qualquer falha mantém o estado público anterior."
        }
        confirmLabel={confirmAction === "rollback" ? "Reverter conjunto" : "Publicar conjunto"}
        dangerous={confirmAction === "rollback"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action)
            void mutateRelease(
              action,
              action === "rollback" ? { reason: "Rollback operacional confirmado" } : {},
            );
        }}
      />
    </section>
  );
}
