import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import {
  Ev2BulkJobSchema,
  Ev2ReleaseDetailSchema,
  Ev2ReleaseSummarySchema,
  Ev2WorkTaskSchema,
  ev2AnchorPath,
  ev2ReleaseStatusLabels,
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
import { humanValidationFields } from "../validation-field-label";
import { operatorErrorMessage } from "../operator-error-message";

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
type ReleaseCandidate = {
  id: string;
  content_type: string;
  slug: string;
  cms_content_drafts: { payload: { title?: string } } | null;
  cms_content_revisions: Array<{
    id: string;
    revision_number: number;
    created_at: string;
    payload?: { title?: string };
  }>;
};
type WorkUser = {
  userId: string;
  displayName: string;
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
const workUsersSchema = z.object({
  items: z.array(z.object({ userId: z.uuid(), displayName: z.string().trim().min(1).max(160) })),
});

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["published", "completed", "resolved", "validated", "approved"].includes(status)) return "success";
  if (["failed", "critical"].includes(status)) return "danger";
  if (["scheduled", "ready_for_review", "high"].includes(status)) return "warning";
  if (["in_progress", "running"].includes(status)) return "info";
  return "neutral";
}

const contentTypeLabels: Record<string, string> = {
  product: "Produto",
  post: "Artigo",
  page: "Página",
  homepage: "Página inicial",
  service: "Serviço",
  industry: "Indústria",
  application: "Aplicação",
  solution: "Solução",
  campaign: "Campanha",
};
const publicPrefixes: Record<string, string> = {
  product: "/produtos",
  post: "/blog",
  page: "",
  homepage: "",
  service: "/servicos",
  industry: "/industrias",
  application: "/aplicacoes",
  solution: "/solucoes",
  campaign: "/campanhas",
};
const bulkOperationLabels: Record<BulkOperation, string> = {
  add_to_release: "Adicionar ao pacote editorial",
  assign_tasks: "Atribuir tarefas",
  resolve_tasks: "Resolver tarefas",
};
const bulkStatusLabels: Record<string, string> = {
  validating: "Validando",
  validated: "Validado",
  running: "Em execução",
  completed: "Concluído",
  failed: "Falhou sem alteração parcial",
  canceled: "Cancelado",
};
const taskPriorityLabels: Record<Ev2WorkTask["priority"], string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};
const taskStatusLabels: Record<Ev2WorkTask["status"], string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  resolved: "Resolvida",
};
const taskEventLabels: Record<string, string> = {
  created: "Tarefa criada",
  task_created: "Tarefa criada",
  assigned: "Responsável definido",
  task_assigned: "Responsável definido",
  commented: "Comentário registrado",
  comment_added: "Comentário registrado",
  resolved: "Tarefa resolvida",
  task_resolved: "Tarefa resolvida",
  reopened: "Tarefa reaberta",
  task_reopened: "Tarefa reaberta",
};
const releaseActionLabels: Record<string, string> = {
  add_item: "conteúdo adicionado",
  validate: "validação concluída",
  submit: "enviado para aprovação",
  approve: "aprovação registrada",
  publish: "publicação concluída",
  schedule: "publicação agendada",
  rollback: "publicação revertida",
};
const taskDestinations = [
  ["/admin/conteudo", "Conteúdo editorial"],
  ["/admin/produtos", "Produtos"],
  ["/admin/paginas", "Páginas"],
  ["/admin/marketing", "Marketing"],
  ["/admin/midia", "Mídia e documentos"],
  ["/admin/qualidade", "Qualidade"],
] as const;

function latestCandidateRevision(candidate: ReleaseCandidate) {
  return candidate.cms_content_revisions
    .slice()
    .sort((left, right) => right.revision_number - left.revision_number)[0];
}

function candidateTitle(candidate: ReleaseCandidate) {
  return candidate.cms_content_drafts?.payload.title?.trim() || "Conteúdo sem título";
}

function frozenRevisionTitle(candidate: ReleaseCandidate, revisionId: string) {
  return (
    candidate.cms_content_revisions.find((revision) => revision.id === revisionId)?.payload?.title?.trim() ||
    "Título da revisão indisponível"
  );
}

function candidateAddress(contentType: string, slug: string) {
  if (contentType === "homepage") return "/";
  return `${publicPrefixes[contentType] ?? ""}/${slug}`.replace(/\/{2,}/g, "/");
}

function batches<T>(values: T[], size = 80): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
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
  const [releaseCandidates, setReleaseCandidates] = useState<ReleaseCandidate[]>([]);
  const [releaseDisplayItems, setReleaseDisplayItems] = useState<ReleaseCandidate[]>([]);
  const [workUsers, setWorkUsers] = useState<WorkUser[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<Ev2ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(clientCandidate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadWarning, setLoadWarning] = useState("");
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
  const [bulkSelections, setBulkSelections] = useState<string[]>([]);
  const [bulkReleaseId, setBulkReleaseId] = useState("");
  const [bulkRelease, setBulkRelease] = useState<Ev2ReleaseDetail | null>(null);
  const [bulkReleaseLoading, setBulkReleaseLoading] = useState(false);
  const [bulkReleaseError, setBulkReleaseError] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const bulkExecuteKey = useRef(crypto.randomUUID());
  const selectedReleaseRequest = useRef(0);
  const bulkReleaseRequest = useRef(0);
  const bulkValidationVersion = useRef(0);

  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const canReadReleases = permissions.includes("cms:releases.read");
  const canCreateRelease = permissions.includes("cms:releases.create");
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
    setLoadWarning("");
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
      const failures: string[] = [];
      const jobs: Array<Promise<void>> = [];

      if (permissions.includes("cms:collaboration.read")) {
        jobs.push(
          collaborationCommand(session, { action: "list", envelope: envelope(1), limit: 100 })
            .then((result) => setTasks(inboxSchema.parse(result).items))
            .catch(() => {
              failures.push("As pendências não puderam ser atualizadas.");
            }),
        );
      }
      if (canReadReleases) {
        jobs.push(
          releaseV2Command(session, { action: "list", envelope: envelope(2) })
            .then((result) => setReleases(releaseListSchema.parse(result).items))
            .catch(() => {
              failures.push("Os pacotes editoriais não puderam ser atualizados.");
            }),
        );
      }
      if (canReadBulk) {
        jobs.push(
          bulkV2Command(session, { action: "list", envelope: envelope(1), limit: 50 })
            .then((result) => setBulkJobs(bulkListSchema.parse(result).items))
            .catch(() => {
              failures.push("O histórico de operações em massa não pôde ser atualizado.");
            }),
        );
      }
      if (canEditReleases || canDryRun) {
        jobs.push(
          Promise.resolve(
            supabase
              .from("cms_content_items")
              .select(
                "id,content_type,slug,cms_content_drafts(payload),cms_content_revisions(id,revision_number,created_at)",
              )
              .eq("workflow_status", "approved")
              .order("updated_at", { ascending: false })
              .limit(500),
          )
            .then((result) => {
              if (result.error) throw result.error;
              setReleaseCandidates((result.data ?? []) as unknown as ReleaseCandidate[]);
            })
            .catch(() => {
              failures.push("Os conteúdos elegíveis para pacotes não puderam ser atualizados.");
            }),
        );
      }
      if (canAssign) {
        jobs.push(
          collaborationCommand(session, { action: "assignees", envelope: envelope(1) })
            .then((result) => setWorkUsers(workUsersSchema.parse(result).items))
            .catch(() => {
              failures.push("A lista de responsáveis não pôde ser atualizada.");
            }),
        );
      }

      await Promise.all(jobs);
      setLoadWarning([...new Set(failures)].join(" "));
    } catch (caught) {
      setCapability("error");
      setError(operatorErrorMessage(caught, { fallback: "Meu trabalho está indisponível." }));
    } finally {
      setLoading(false);
    }
  }, [
    canAssign,
    canDryRun,
    canEditReleases,
    canReadBulk,
    canReadReleases,
    clientCandidate,
    permissions,
    session,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadRelease(releaseId: string) {
    if (!session) return;
    const requestId = selectedReleaseRequest.current + 1;
    selectedReleaseRequest.current = requestId;
    setSelectedRelease(null);
    setReleaseDisplayItems([]);
    setBusy(true);
    setError("");
    try {
      const result = await releaseV2Command(session, {
        action: "status",
        releaseId,
        envelope: envelope(2),
      });
      const detail = Ev2ReleaseDetailSchema.parse(result);
      const itemIds = [...new Set(detail.items.map((item) => item.itemId))];
      const revisionIds = [...new Set(detail.items.map((item) => item.revisionId))];
      const [itemResults, revisionResults] = await Promise.all([
        Promise.all(
          batches(itemIds).map((ids) =>
            supabase.from("cms_content_items").select("id,content_type,slug").in("id", ids),
          ),
        ),
        Promise.all(
          batches(revisionIds).map((ids) =>
            supabase
              .from("cms_content_revisions")
              .select("id,item_id,revision_number,created_at,payload")
              .in("id", ids),
          ),
        ),
      ]);
      if (selectedReleaseRequest.current !== requestId) return;
      if ([...itemResults, ...revisionResults].some((queryResult) => queryResult.error))
        throw new Error("Não foi possível carregar os nomes e as revisões deste pacote editorial.");
      const displayByItem = new Map<string, ReleaseCandidate>();
      itemResults
        .flatMap((queryResult) => queryResult.data ?? [])
        .forEach((item) => {
          displayByItem.set(item.id, {
            id: item.id,
            content_type: item.content_type,
            slug: item.slug,
            cms_content_drafts: null,
            cms_content_revisions: [],
          });
        });
      revisionResults
        .flatMap((queryResult) => queryResult.data ?? [])
        .forEach((revision) => {
          displayByItem.get(revision.item_id)?.cms_content_revisions.push({
            id: revision.id,
            revision_number: revision.revision_number,
            created_at: revision.created_at,
            payload: revision.payload as { title?: string },
          });
        });
      setReleaseItemId("");
      setReleaseRevisionId("");
      setReleaseDisplayItems([...displayByItem.values()]);
      setSelectedRelease(detail);
    } catch (caught) {
      if (selectedReleaseRequest.current !== requestId) return;
      setError(operatorErrorMessage(caught, { fallback: "Pacote editorial indisponível." }));
    } finally {
      if (selectedReleaseRequest.current === requestId) setBusy(false);
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
      setError(operatorErrorMessage(caught, { fallback: "Tarefa indisponível." }));
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
      setSuccess("Pendências atualizadas com trilha de auditoria.");
      setTaskTitle("");
      setTaskComment("");
      await load();
      if (activeTaskId) await loadTask(activeTaskId);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "A colaboração não foi atualizada." }));
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
      setSuccess(`Pacote editorial atualizado: ${releaseActionLabels[action] ?? "alteração concluída"}.`);
      setReleaseItemId("");
      setReleaseRevisionId("");
      await load();
      await loadRelease(result.releaseId);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "O pacote editorial não foi atualizado." }));
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
      setSuccess("Pacote editorial criado como rascunho, sem publicar conteúdo.");
      await load();
      await loadRelease(result.releaseId);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Pacote editorial não criado." }));
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDryRun() {
    if (!session || busy) return;
    const validationVersion = bulkValidationVersion.current;
    setBusy(true);
    setError("");
    setSuccess("");
    setBulkResult(null);
    setBulkConfirmed(false);
    try {
      const targets =
        bulkOperation === "add_to_release"
          ? bulkSelections.map((selection) => {
              const [id, revisionId] = selection.split("|");
              if (!id || !revisionId) throw new Error("Seleção de conteúdo inválida. Atualize a página.");
              return { id, revisionId };
            })
          : bulkSelections.map((id) => {
              const task = tasks.find((candidate) => candidate.id === id);
              if (!task)
                throw new Error("Uma tarefa selecionada não está mais disponível. Atualize a página.");
              return { id, expectedVersion: task.lockVersion };
            });
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
      if (bulkValidationVersion.current !== validationVersion) return;
      setBulkResult(result);
      bulkExecuteKey.current = crypto.randomUUID();
      const targetLabel = `${result.targetCount} ${result.targetCount === 1 ? "item" : "itens"}`;
      setSuccess(
        result.status === "validated"
          ? `Simulação aprovada: ${targetLabel}, sem realizar alterações.`
          : `Simulação bloqueada: ${result.report.errors ?? 0} erro(s), sem realizar alterações.`,
      );
    } catch (caught) {
      if (bulkValidationVersion.current !== validationVersion) return;
      setError(operatorErrorMessage(caught, { fallback: "A validação do lote não foi concluída." }));
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
      const writeCount = result.report.writes ?? 0;
      setSuccess(
        `Lote concluído por inteiro: ${writeCount} ${writeCount === 1 ? "alteração" : "alterações"}.`,
      );
      setBulkSelections([]);
      if (bulkOperation === "add_to_release") {
        bulkReleaseRequest.current += 1;
        setBulkReleaseId("");
        setBulkRelease(null);
        setBulkReleaseError("");
        setBulkReleaseLoading(false);
      }
      bulkExecuteKey.current = crypto.randomUUID();
      await load();
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Lote não concluído." }));
    } finally {
      setBusy(false);
    }
  }

  const activeTask = useMemo(
    () => activeTaskDetail ?? tasks.find((task) => task.id === activeTaskId),
    [activeTaskDetail, activeTaskId, tasks],
  );
  const bulkTaskCandidates = tasks.filter((task) =>
    bulkOperation === "resolve_tasks" ? task.status !== "resolved" : true,
  );
  const selectedReleaseItemIds = useMemo(
    () => new Set(selectedRelease?.items.map((item) => item.itemId) ?? []),
    [selectedRelease],
  );
  const individualReleaseCandidates = releaseCandidates.filter(
    (candidate) => latestCandidateRevision(candidate) && !selectedReleaseItemIds.has(candidate.id),
  );
  const bulkReleaseItemIds = useMemo(
    () => new Set(bulkRelease?.items.map((item) => item.itemId) ?? []),
    [bulkRelease],
  );
  const bulkContentCandidates =
    bulkOperation === "add_to_release" && bulkReleaseId && bulkRelease
      ? releaseCandidates.filter(
          (candidate) => latestCandidateRevision(candidate) && !bulkReleaseItemIds.has(candidate.id),
        )
      : [];
  const invalidateBulkValidation = () => {
    bulkValidationVersion.current += 1;
    setBulkResult(null);
    setBulkConfirmed(false);
    setSuccess("");
    bulkExecuteKey.current = crypto.randomUUID();
  };
  const toggleBulkSelection = (value: string) => {
    invalidateBulkValidation();
    setBulkSelections((current) =>
      current.includes(value) ? current.filter((candidate) => candidate !== value) : [...current, value],
    );
  };
  const changeBulkRelease = async (releaseId: string) => {
    const requestId = bulkReleaseRequest.current + 1;
    bulkReleaseRequest.current = requestId;
    setBulkReleaseId(releaseId);
    setBulkRelease(null);
    setBulkReleaseError("");
    setBulkSelections([]);
    invalidateBulkValidation();
    if (!releaseId || !session) {
      setBulkReleaseLoading(false);
      return;
    }

    setBulkReleaseLoading(true);
    try {
      const result = await releaseV2Command(session, {
        action: "status",
        releaseId,
        envelope: envelope(2),
      });
      if (bulkReleaseRequest.current !== requestId) return;
      const detail = Ev2ReleaseDetailSchema.parse(result);
      if (detail.status !== "draft") {
        throw new Error("Este pacote editorial não aceita novos conteúdos.");
      }
      setBulkRelease(detail);
    } catch (caught) {
      if (bulkReleaseRequest.current !== requestId) return;
      setBulkReleaseError(
        operatorErrorMessage(caught, {
          fallback: "Não foi possível consultar o pacote editorial selecionado.",
        }),
      );
    } finally {
      if (bulkReleaseRequest.current === requestId) setBulkReleaseLoading(false);
    }
  };
  const bulkTargetLabel = (targetId: string) => {
    const task = tasks.find((candidate) => candidate.id === targetId);
    if (task) return task.title;
    const content = releaseCandidates.find((candidate) => candidate.id === targetId);
    return content ? candidateTitle(content) : "Item validado";
  };

  if (!clientCandidate)
    return (
      <section>
        <PageHeader
          eyebrow="TRABALHO E COLABORAÇÃO"
          title="Meu trabalho"
          description="Esta área não está habilitada para a sua sessão. As demais áreas administrativas continuam disponíveis."
        />
      </section>
    );
  if (loading || capability === "checking")
    return <LoadingSkeleton label="Carregando meu trabalho" rows={6} />;

  return (
    <section>
      <PageHeader
        eyebrow="TRABALHO E COLABORAÇÃO"
        title="Meu trabalho"
        description="Coordene pendências, pacotes editoriais e alterações em massa com validação e reversão segura."
        meta={
          <Badge tone={capability === "enabled" ? "success" : "warning"}>
            {capability === "enabled" ? "Área disponível" : "Área indisponível"}
          </Badge>
        }
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {loadWarning && <AdminAlert tone="warning">{loadWarning}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {capability !== "enabled" ? (
        <EmptyState
          title="Capacidade indisponível para esta sessão"
          description="Este recurso não está habilitado para o seu acesso. Nenhum dado foi alterado."
        />
      ) : (
        <>
          <StepTabs
            idPrefix="admin-work"
            label="Áreas de meu trabalho"
            active={tab}
            onChange={setTab}
            steps={[
              { id: "inbox", label: "Pendências", description: "Tarefas e conversas relacionadas" },
              { id: "releases", label: "Pacotes editoriais", description: "Publicação conjunta e reversão" },
              { id: "bulk", label: "Em massa", description: "Simulação e execução segura" },
            ]}
          />

          {tab === "inbox" && (
            <div
              id="admin-work-panel-inbox"
              role="tabpanel"
              aria-labelledby="admin-work-tab-inbox"
              className="admin-editor-grid"
            >
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
                      Área de destino
                      <select value={taskRoute} onChange={(event) => setTaskRoute(event.target.value)}>
                        {taskDestinations.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
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
                                <Badge tone={statusTone(task.priority)}>
                                  {taskPriorityLabels[task.priority]}
                                </Badge>
                              </td>
                              <td>
                                <strong>{task.title}</strong>
                                <br />
                                <small>{task.commentCount} comentário(s)</small>
                              </td>
                              <td>
                                <Badge tone={statusTone(task.status)}>{taskStatusLabels[task.status]}</Badge>
                              </td>
                              <td>
                                <div className="admin-table-actions">
                                  {path && <Link to={path}>Abrir conteúdo relacionado</Link>}
                                  {canComment && (
                                    <button
                                      type="button"
                                      aria-label={`Abrir conversa de ${task.title}`}
                                      disabled={busy}
                                      onClick={() => void loadTask(task.id)}
                                    >
                                      Abrir conversa
                                    </button>
                                  )}
                                  {canResolve && task.status !== "resolved" && (
                                    <button
                                      type="button"
                                      aria-label={`Resolver ${task.title}`}
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
                                      aria-label={`Reabrir ${task.title}`}
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
                              {taskEventLabels[event.eventType] ?? "Tarefa atualizada"} ·{" "}
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
            <div
              id="admin-work-panel-releases"
              role="tabpanel"
              aria-labelledby="admin-work-tab-releases"
              className="admin-editor-grid"
            >
              {canCreateRelease && (
                <SectionCard
                  title="Novo pacote editorial"
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
                    Criar pacote vazio
                  </button>
                </SectionCard>
              )}
              <SectionCard
                title="Pacotes editoriais recentes"
                description="Selecione um pacote para conferir versões e avançar pelas etapas de aprovação."
              >
                {releases.length === 0 ? (
                  <p className="admin-empty-inline">Nenhum pacote editorial disponível.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Pacote editorial</th>
                          <th>Estado</th>
                          <th>Itens</th>
                          <th>Atualização</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releases.map((release) => (
                          <tr key={release.releaseId}>
                            <td>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void loadRelease(release.releaseId)}
                              >
                                {release.title}
                              </button>
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
                  description={`${selectedRelease.items.length} conteúdo(s) no pacote · ${ev2ReleaseStatusLabels[selectedRelease.status]}`}
                >
                  <AdminAlert tone="info">
                    Publicação e reversão são concluídas por inteiro: nenhuma alteração parcial é confirmada.
                  </AdminAlert>
                  {selectedRelease.status === "draft" && canEditReleases && (
                    <FieldGroup legend="Adicionar revisão congelada">
                      <label>
                        Conteúdo e revisão aprovada
                        <select
                          value={
                            releaseItemId && releaseRevisionId ? `${releaseItemId}|${releaseRevisionId}` : ""
                          }
                          onChange={(event) => {
                            const [itemId = "", revisionId = ""] = event.target.value.split("|");
                            setReleaseItemId(itemId);
                            setReleaseRevisionId(revisionId);
                          }}
                        >
                          <option value="">Selecione</option>
                          {individualReleaseCandidates.map((candidate) => {
                            const revision = latestCandidateRevision(candidate);
                            if (!revision) return null;
                            return (
                              <option
                                key={`${candidate.id}|${revision.id}`}
                                value={`${candidate.id}|${revision.id}`}
                              >
                                {candidateTitle(candidate)} —{" "}
                                {contentTypeLabels[candidate.content_type] ?? "Conteúdo"} — revisão{" "}
                                {revision.revision_number}
                              </option>
                            );
                          })}
                        </select>
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
                              {frozenRevisionTitle(
                                releaseDisplayItems.find((candidate) => candidate.id === item.itemId) ?? {
                                  id: item.itemId,
                                  content_type: item.contentType,
                                  slug: item.slug,
                                  cms_content_drafts: null,
                                  cms_content_revisions: [],
                                },
                                item.revisionId,
                              )}
                              <small>{candidateAddress(item.contentType, item.slug)}</small>
                            </td>
                            <td>
                              {releaseDisplayItems
                                .find((candidate) => candidate.id === item.itemId)
                                ?.cms_content_revisions.find((revision) => revision.id === item.revisionId)
                                ?.revision_number
                                ? `Revisão ${
                                    releaseDisplayItems
                                      .find((candidate) => candidate.id === item.itemId)
                                      ?.cms_content_revisions.find(
                                        (revision) => revision.id === item.revisionId,
                                      )?.revision_number
                                  }`
                                : "Revisão aprovada"}
                            </td>
                            <td>
                              {item.diff.changedFields.length > 0
                                ? humanValidationFields(item.diff.changedFields)
                                : "Sem mudança de conteúdo"}
                              {item.diff.seoChanged ? " · SEO alterado" : ""}
                            </td>
                            <td>
                              <Badge tone={statusTone(item.validationStatus)}>
                                {item.validationStatus === "passed"
                                  ? "Aprovado"
                                  : item.validationStatus === "failed"
                                    ? "Requer correção"
                                    : "Aguardando validação"}
                              </Badge>
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
                              <td>{validation.message}</td>
                              <td>
                                <Badge tone={statusTone(validation.status)}>
                                  {validation.status === "passed" ? "Aprovado" : "Requer correção"}
                                </Badge>
                              </td>
                              <td>
                                {validation.status === "passed"
                                  ? "Nenhuma ação necessária."
                                  : "Revise o conteúdo indicado e valide o pacote novamente."}
                              </td>
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
                            reason: "Pacote editorial conferido e aprovado por responsável autorizado",
                          })
                        }
                      >
                        Aprovar com confirmação em duas etapas
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
                          Reverter publicação
                        </button>
                      )}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {tab === "bulk" && (
            <div
              id="admin-work-panel-bulk"
              role="tabpanel"
              aria-labelledby="admin-work-tab-bulk"
              className="admin-editor-grid"
            >
              <SectionCard
                title="Operação em massa"
                description="A simulação sempre precede a execução e não altera os dados."
              >
                <FieldGroup legend="Plano do lote">
                  <label>
                    Operação
                    <select
                      value={bulkOperation}
                      disabled={busy}
                      onChange={(event) => {
                        bulkReleaseRequest.current += 1;
                        setBulkOperation(event.target.value as BulkOperation);
                        setBulkReleaseId("");
                        setBulkRelease(null);
                        setBulkReleaseLoading(false);
                        setBulkReleaseError("");
                        invalidateBulkValidation();
                        setBulkSelections([]);
                      }}
                    >
                      <option value="add_to_release">Adicionar ao pacote editorial</option>
                      <option value="assign_tasks">Atribuir tarefas</option>
                      <option value="resolve_tasks">Resolver tarefas</option>
                    </select>
                  </label>
                  {bulkOperation === "add_to_release" && (
                    <label>
                      Pacote editorial de destino
                      <select
                        value={bulkReleaseId}
                        disabled={busy}
                        onChange={(event) => void changeBulkRelease(event.target.value)}
                      >
                        <option value="">Selecione</option>
                        {releases
                          .filter((release) => release.status === "draft")
                          .map((release) => (
                            <option key={release.releaseId} value={release.releaseId}>
                              {release.title}
                            </option>
                          ))}
                      </select>
                      {bulkReleaseLoading && (
                        <span className="admin-help" role="status">
                          Consultando os conteúdos já incluídos…
                        </span>
                      )}
                      {bulkReleaseError && <span className="admin-field-error">{bulkReleaseError}</span>}
                    </label>
                  )}
                  {bulkOperation === "assign_tasks" && (
                    <label>
                      Responsável
                      <select
                        value={bulkAssignee}
                        disabled={busy}
                        onChange={(event) => {
                          setBulkAssignee(event.target.value);
                          invalidateBulkValidation();
                        }}
                      >
                        <option value="">Selecione</option>
                        {workUsers.map((user) => (
                          <option value={user.userId} key={user.userId}>
                            {user.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Motivo
                    <input
                      value={bulkReason}
                      maxLength={500}
                      disabled={busy}
                      onChange={(event) => {
                        setBulkReason(event.target.value);
                        invalidateBulkValidation();
                      }}
                    />
                  </label>
                  <fieldset>
                    <legend>{bulkOperation === "add_to_release" ? "Conteúdos" : "Tarefas"}</legend>
                    {(bulkOperation === "add_to_release" ? bulkContentCandidates : bulkTaskCandidates)
                      .length === 0 ? (
                      <p className="admin-help">
                        {bulkOperation === "add_to_release" && !bulkReleaseId
                          ? "Selecione primeiro o pacote editorial de destino."
                          : bulkReleaseLoading
                            ? "Consultando conteúdos elegíveis…"
                            : "Nenhum item elegível está disponível."}
                      </p>
                    ) : bulkOperation === "add_to_release" ? (
                      bulkContentCandidates.map((candidate) => {
                        const revision = latestCandidateRevision(candidate)!;
                        const value = `${candidate.id}|${revision.id}`;
                        return (
                          <label className="admin-checkbox" key={value}>
                            <input
                              type="checkbox"
                              checked={bulkSelections.includes(value)}
                              disabled={busy}
                              onChange={() => toggleBulkSelection(value)}
                            />
                            {candidateTitle(candidate)} — revisão {revision.revision_number}
                          </label>
                        );
                      })
                    ) : (
                      bulkTaskCandidates.map((task) => (
                        <label className="admin-checkbox" key={task.id}>
                          <input
                            type="checkbox"
                            checked={bulkSelections.includes(task.id)}
                            disabled={busy}
                            onChange={() => toggleBulkSelection(task.id)}
                          />
                          {task.title}
                        </label>
                      ))
                    )}
                  </fieldset>
                </FieldGroup>
                {canDryRun && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      bulkReason.trim().length < 3 ||
                      bulkSelections.length === 0 ||
                      (bulkOperation === "add_to_release" &&
                        (!bulkReleaseId ||
                          !bulkRelease ||
                          bulkReleaseLoading ||
                          Boolean(bulkReleaseError))) ||
                      (bulkOperation === "assign_tasks" && !bulkAssignee)
                    }
                    onClick={() => void runBulkDryRun()}
                  >
                    Validar sem alterar
                  </button>
                )}
                {bulkResult && (
                  <>
                    <AdminAlert tone={bulkResult.status === "validated" ? "success" : "danger"}>
                      Total {bulkResult.targetCount} · válidos {bulkResult.report.validItems ?? 0} · erros{" "}
                      {bulkResult.report.errors ?? 0} · alterações {bulkResult.report.writes ?? 0}
                    </AdminAlert>
                    <div className="admin-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Linha</th>
                            <th>Item</th>
                            <th>Validação</th>
                            <th>Correção</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResult.items.map((item) => (
                            <tr key={`${item.position}:${item.targetId}`}>
                              <td>{item.position}</td>
                              <td>{bulkTargetLabel(item.targetId)}</td>
                              <td>
                                <Badge tone={item.validationStatus === "valid" ? "success" : "danger"}>
                                  {item.validationStatus === "valid" ? "Válido" : "Com erro"}
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
                          Confirmo {bulkResult.targetCount} item
                          {bulkResult.targetCount === 1 ? "" : "s"} selecionado
                          {bulkResult.targetCount === 1 ? "" : "s"}.
                        </label>
                        <button
                          type="button"
                          disabled={busy || !bulkConfirmed}
                          onClick={() => void executeBulk()}
                        >
                          Executar lote por inteiro
                        </button>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
              <SectionCard
                title="Execuções recentes"
                description="Resultados de simulações, execuções e cancelamentos."
              >
                {bulkJobs.length === 0 ? (
                  <p className="admin-empty-inline">Nenhuma execução disponível.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Execução</th>
                          <th>Operação</th>
                          <th>Estado</th>
                          <th>Itens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkJobs.map((job) => (
                          <tr key={job.jobId}>
                            <td>
                              {job.createdAt ? new Date(job.createdAt).toLocaleString("pt-BR") : "Recente"}
                            </td>
                            <td>{bulkOperationLabels[job.operation]}</td>
                            <td>
                              <Badge tone={statusTone(job.status)}>
                                {bulkStatusLabels[job.status] ?? "Estado indisponível"}
                              </Badge>
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
        title={
          confirmAction === "rollback"
            ? "Reverter todo o pacote editorial?"
            : "Publicar todo o pacote editorial?"
        }
        description={
          confirmAction === "rollback"
            ? "A versão pública anterior será restaurada por inteiro. A operação exige confirmação em duas etapas e ficará registrada na auditoria."
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
              action === "rollback" ? { reason: "Reversão operacional confirmada" } : {},
            );
        }}
      />
    </section>
  );
}
