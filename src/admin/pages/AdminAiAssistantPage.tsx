import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, FileSearch, LockKeyhole, PencilLine, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router";
import {
  Ev2AiCapabilitySchema,
  Ev2AiDecisionResultSchema,
  Ev2AiProposalCreatedSchema,
  Ev2AiSessionClosedSchema,
  Ev2AiSessionCreatedSchema,
  Ev2AiWorkspaceSchema,
  type Ev2AiMode,
  type Ev2AiProposal,
  type Ev2AiWorkspace,
} from "@/shared/contracts/ev2-ai";
import { aiAssistCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import { operatorErrorMessage } from "../operator-error-message";
import "../admin-ai-assistant.css";

const CMS_ENVIRONMENT = cmsEnvironment();
const environmentLabels = {
  local: "Ambiente local",
  staging: "Homologação",
  production: "Produção",
} as const;
const sessionStatusLabels: Record<string, string> = {
  active: "Em andamento",
  closed: "Encerrada",
  canceled: "Cancelada",
  expired: "Expirada",
};
const proposalKindLabels: Record<string, string> = {
  locate: "Localização",
  explain: "Explicação",
  extract: "Extração",
  draft_patch: "Proposta de rascunho",
};
const proposalStatusLabels: Record<string, string> = {
  proposed: "Aguardando decisão",
  accepted: "Aceita",
  rejected: "Rejeitada",
  edited: "Editada",
};

function sessionStatusLabel(status: string): string {
  return sessionStatusLabels[status] ?? "Situação indisponível";
}

function proposalKindLabel(kind: string): string {
  return proposalKindLabels[kind] ?? "Proposta assistida";
}

function proposalStatusLabel(status: string): string {
  return proposalStatusLabels[status] ?? "Situação indisponível";
}

function internalAssistantReference(kind: "source" | "draft") {
  return `g10x-${kind}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" as const },
  };
}

export default function AdminAiAssistantPage() {
  const { session, profile } = useAdminAuth();
  const candidateEnabled = isEv2FeatureEnabled(profile, "ev2.ai_assist");
  const executionCandidateEnabled = isEv2FeatureEnabled(profile, "ev2.ai_execute");
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    candidateEnabled ? "checking" : "disabled",
  );
  const [workspace, setWorkspace] = useState<Ev2AiWorkspace | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [title, setTitle] = useState("Cadastro assistido por IA");
  const [mode, setMode] = useState<Ev2AiMode>("draft");
  const [proposalKind, setProposalKind] = useState<"locate" | "explain" | "extract" | "draft_patch">(
    "extract",
  );
  const [prompt, setPrompt] = useState("Extraia um resumo técnico fiel ao documento informado.");
  const [sourceReference] = useState(() => internalAssistantReference("source"));
  const [sourceTitle, setSourceTitle] = useState("Documento técnico do produto");
  const [sourceVersion, setSourceVersion] = useState("v1");
  const [sourceLocator, setSourceLocator] = useState("Seção de especificações");
  const [sourcePage, setSourcePage] = useState("1");
  const [sourceExcerpt, setSourceExcerpt] = useState(
    "Cole aqui somente o trecho técnico autorizado que servirá de fonte para a proposta.",
  );
  const [targetRef] = useState(() => internalAssistantReference("draft"));
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [rationale, setRationale] = useState("Conteúdo conferido com a fonte apresentada.");
  const [editedValue, setEditedValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canDraft = profile?.permissions.includes("cms:ai.draft") ?? false;
  const canReview = profile?.permissions.includes("cms:ai.review") ?? false;
  const selectedSession = useMemo(
    () => workspace?.sessions.find((item) => item.id === selectedSessionId),
    [selectedSessionId, workspace?.sessions],
  );
  const proposals = useMemo(() => selectedSession?.proposals ?? [], [selectedSession]);
  const selectedProposal = useMemo(
    () => proposals.find((item) => item.id === selectedProposalId) ?? proposals[0],
    [proposals, selectedProposalId],
  );

  const loadWorkspace = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    const result = Ev2AiWorkspaceSchema.parse(
      await aiAssistCommand(session, { action: "workspace", envelope: envelope() }),
    );
    setWorkspace(result);
    setSelectedSessionId((current) =>
      result.sessions.some((item) => item.id === current)
        ? current
        : (result.sessions.find((item) => item.status === "active")?.id ?? result.sessions[0]?.id ?? ""),
    );
  }, [candidateEnabled, session]);

  const load = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    setError("");
    try {
      const result = Ev2AiCapabilitySchema.parse(
        await aiAssistCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!result.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      await loadWorkspace();
    } catch (caught) {
      setCapability("error");
      setError(operatorErrorMessage(caught, { fallback: "A assistência está indisponível." }));
    }
  }, [candidateEnabled, loadWorkspace, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canDraft && mode === "draft") setMode("read");
  }, [canDraft, mode]);

  useEffect(() => {
    if (!selectedProposal) return;
    setSelectedProposalId(selectedProposal.id);
    setEditedValue(selectedProposal.fields[0]?.value ?? "");
  }, [selectedProposal]);

  async function mutate<T>(
    body: Record<string, unknown>,
    parse: (value: unknown) => T,
    message: string,
  ): Promise<T | null> {
    if (!session || profile?.mfaVerified !== true) return null;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = parse(await aiAssistCommand(session, body, crypto.randomUUID()));
      setSuccess(message);
      await loadWorkspace();
      return result;
    } catch (caught) {
      setError(
        operatorErrorMessage(caught, {
          fallback: "A operação assistida não foi concluída. Os editores manuais continuam disponíveis.",
        }),
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    const result = await mutate(
      { action: "start_session", envelope: envelope(), mode, title },
      (value) => Ev2AiSessionCreatedSchema.parse(value),
      "Sessão assistida criada. Toda sugestão continuará sujeita à sua revisão.",
    );
    if (result) setSelectedSessionId(result.sessionId);
  }

  async function generateProposal() {
    if (!selectedSession) return;
    const result = await mutate(
      {
        action: "generate_proposal",
        envelope: envelope(),
        sessionId: selectedSession.id,
        proposalKind,
        prompt,
        targetRef: proposalKind === "draft_patch" ? targetRef : undefined,
        source: {
          kind: "synthetic_document",
          reference: sourceReference,
          title: sourceTitle,
          version: sourceVersion,
          locator: sourceLocator,
          page: sourcePage ? Number(sourcePage) : undefined,
          excerpt: sourceExcerpt,
        },
      },
      (value) => Ev2AiProposalCreatedSchema.parse(value),
      "Proposta preparada para revisão. Nada foi aplicado ou publicado.",
    );
    if (result) setSelectedProposalId(result.proposalId);
  }

  async function closeSession() {
    if (!selectedSession?.owned || selectedSession.status !== "active") return;
    await mutate(
      { action: "close_session", envelope: envelope(), sessionId: selectedSession.id },
      (value) => Ev2AiSessionClosedSchema.parse(value),
      "Sessão encerrada. As evidências permanecem apenas durante a retenção definida.",
    );
  }

  async function decideProposal(proposal: Ev2AiProposal, decision: "accepted" | "rejected" | "edited") {
    const editedFields =
      decision === "edited"
        ? proposal.fields.map((field, index) => ({
            path: field.path,
            value: index === 0 ? editedValue : field.value,
          }))
        : undefined;
    await mutate(
      {
        action: "decide_proposal",
        envelope: envelope(),
        proposalId: proposal.id,
        expectedProposalHash: proposal.proposalHash,
        decision,
        rationale,
        editedFields,
      },
      (value) => Ev2AiDecisionResultSchema.parse(value),
      "Decisão humana registrada sem aplicar ou publicar conteúdo.",
    );
  }

  if (!candidateEnabled) {
    return (
      <section>
        <h1>Assistente controlada</h1>
        <div role="status" className="admin-notice">
          A assistência por inteligência artificial não está disponível para esta conta. Todos os editores
          manuais continuam disponíveis.
        </div>
      </section>
    );
  }

  if (capability !== "enabled") {
    return (
      <section>
        <h1>Assistente controlada</h1>
        <div role={capability === "error" ? "alert" : "status"} className="admin-notice">
          {capability === "checking"
            ? "Verificando a disponibilidade da assistência…"
            : capability === "error"
              ? error || "Não foi possível verificar a assistência."
              : "A assistência está desativada. Use normalmente os editores manuais."}
        </div>
        <ManualFallback />
      </section>
    );
  }

  return (
    <section className="admin-ai">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">ASSISTENTE DE CADASTRO</p>
          <h1>Assistente controlada</h1>
          <p className="admin-help">
            Localize, explique, extraia ou prepare uma proposta de baixo risco. Confira a fonte, a confiança e
            as alterações propostas antes de registrar sua decisão.
          </p>
        </div>
      </div>

      <div className="admin-ai__safety" role="note">
        <LockKeyhole aria-hidden="true" size={20} />
        <span>
          <strong>A IA gera propostas; você mantém o controle.</strong> O conteúdo é enviado ao modelo
          aprovado, não é aplicado nem publicado automaticamente e permanece sujeito à revisão humana.
        </span>
      </div>

      {executionCandidateEnabled &&
        profile?.permissions.some((permission) =>
          ["cms:ai.plan", "cms:ai.approve", "cms:ai.execute", "cms:ai.compensate"].includes(permission),
        ) && (
          <div className="admin-notice">
            A execução assistida está disponível somente para exercícios controlados de homologação.{" "}
            <Link to="/admin/assistente/execucao">Abrir execução assistida</Link>
          </div>
        )}

      {!profile?.mfaVerified && (
        <div role="status" className="admin-notice">
          Consultar é permitido, mas criar ou decidir exige verificação em duas etapas.{" "}
          <Link to="/admin/mfa">Confirmar identidade</Link>
        </div>
      )}
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="admin-notice--success">
          {success}
        </div>
      )}

      <div className="admin-ai__metrics" aria-label="Limites da assistência">
        <div>
          <span>Site</span>
          <strong>Site principal · {environmentLabels[CMS_ENVIRONMENT]}</strong>
        </div>
        <div>
          <span>Acesso disponível</span>
          <strong>
            leitura{canDraft ? " · rascunho" : ""}
            {canReview ? " · revisão" : ""}
          </strong>
        </div>
        <div>
          <span>Regra de segurança</span>
          <strong>Revisão humana obrigatória</strong>
        </div>
        <div>
          <span>Retenção máxima</span>
          <strong>24 horas</strong>
        </div>
        <div>
          <span>Alterações automáticas</span>
          <strong>Nenhuma</strong>
        </div>
        <div>
          <span>Custo</span>
          <strong>Sem cobrança · nenhuma troca automática de serviço</strong>
        </div>
      </div>

      <div className="admin-ai__grid">
        <form
          className="admin-editor-card"
          aria-label="Abrir sessão da assistente"
          onSubmit={(event) => {
            event.preventDefault();
            void createSession();
          }}
        >
          <h2>
            <Bot aria-hidden="true" size={19} /> 1. Abrir sessão
          </h2>
          <label>
            Nome desta sessão
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Modo
            <select value={mode} onChange={(event) => setMode(event.target.value as Ev2AiMode)}>
              <option value="read">Leitura e explicação</option>
              <option value="draft" disabled={!canDraft}>
                Leitura e proposta de rascunho
              </option>
            </select>
          </label>
          <button type="submit" disabled={busy || !profile?.mfaVerified}>
            Abrir sessão de 30 minutos
          </button>
          <label>
            Sessão atual
            <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
              <option value="">Selecione</option>
              {workspace?.sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {sessionStatusLabel(item.status)} ·{" "}
                  {item.owned ? "minha sessão" : "fila de revisão"}
                </option>
              ))}
            </select>
          </label>
          {selectedSession && (
            <>
              <p className="admin-ai__budget">
                Uso da sessão: {selectedSession.tokensUsed} de {selectedSession.tokenBudget} unidades · sem
                cobrança
              </p>
              {selectedSession.owned && selectedSession.status === "active" && (
                <button
                  type="button"
                  disabled={busy || !profile?.mfaVerified}
                  onClick={() => void closeSession()}
                >
                  Encerrar sessão
                </button>
              )}
            </>
          )}
        </form>

        <form
          className="admin-editor-card"
          aria-label="Solicitar proposta com fonte"
          onSubmit={(event) => {
            event.preventDefault();
            void generateProposal();
          }}
        >
          <h2>
            <FileSearch aria-hidden="true" size={19} /> 2. Solicitar com fonte
          </h2>
          <div className="admin-ai__warning">
            <ShieldAlert aria-hidden="true" size={18} />
            Use conteúdo técnico autorizado. Não cole dados pessoais, credenciais ou segredos.
          </div>
          <label>
            Tipo de ajuda
            <select
              value={proposalKind}
              onChange={(event) =>
                setProposalKind(event.target.value as "locate" | "explain" | "extract" | "draft_patch")
              }
            >
              <option value="locate">Localizar</option>
              <option value="explain">Explicar</option>
              <option value="extract">Extrair</option>
              <option value="draft_patch">Preparar rascunho</option>
            </select>
          </label>
          <label>
            Solicitação
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
          </label>
          <fieldset>
            <legend>Fonte técnica obrigatória</legend>
            <p className="admin-help">
              A referência técnica é criada automaticamente e fica disponível somente na auditoria.
            </p>
            <label>
              Documento
              <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} required />
            </label>
            <div className="admin-ai__fields">
              <label>
                Versão
                <input
                  value={sourceVersion}
                  onChange={(event) => setSourceVersion(event.target.value)}
                  required
                />
              </label>
              <label>
                Página
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={sourcePage}
                  onChange={(event) => setSourcePage(event.target.value)}
                />
              </label>
            </div>
            <label>
              Seção ou referência no documento
              <input
                value={sourceLocator}
                onChange={(event) => setSourceLocator(event.target.value)}
                required
              />
            </label>
            <label>
              Trecho técnico autorizado
              <textarea
                value={sourceExcerpt}
                onChange={(event) => setSourceExcerpt(event.target.value)}
                required
              />
            </label>
          </fieldset>
          {proposalKind === "draft_patch" && (
            <p className="admin-help">
              O vínculo com o rascunho de ensaio é gerado automaticamente e não altera conteúdo real.
            </p>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              !selectedSession ||
              !selectedSession.owned ||
              selectedSession.status !== "active" ||
              !profile?.mfaVerified ||
              (proposalKind === "draft_patch" && !canDraft)
            }
          >
            Preparar proposta sem aplicar
          </button>
          {proposalKind === "draft_patch" && !canDraft && (
            <small>Seu papel não permite preparar rascunhos com a assistente.</small>
          )}
        </form>
      </div>

      <article className="admin-editor-card admin-ai__review">
        <h2>
          <PencilLine aria-hidden="true" size={19} /> 3. Revisão humana
        </h2>
        {!selectedProposal ? (
          <p>Nenhuma proposta nesta sessão.</p>
        ) : (
          <>
            <label>
              Proposta
              <select
                value={selectedProposal.id}
                onChange={(event) => setSelectedProposalId(event.target.value)}
              >
                {proposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>
                    {proposalKindLabel(proposal.kind)} · {proposalStatusLabel(proposal.status)} ·{" "}
                    {Math.round(proposal.confidence * 100)}%
                  </option>
                ))}
              </select>
            </label>
            <p>{selectedProposal.summary}</p>
            <p className="admin-ai__quality" role="status">
              Qualidade: {selectedProposal.fields.length} campo(s), 100% com fonte ·{" "}
              {selectedProposal.fields.filter((field) => field.status === "pending").length} pendente(s) ·
              confiança mínima {Math.round(selectedProposal.confidence * 100)}%
            </p>
            {selectedProposal.fields.map((field) => (
              <section className="admin-ai__field" key={field.path}>
                <header>
                  <strong>{field.label}</strong>
                  <span data-confidence={field.status}>
                    {Math.round(field.confidence * 100)}% ·{" "}
                    {field.status === "pending"
                      ? "aguarda confirmação"
                      : field.status === "human_verified"
                        ? "confirmado por revisão"
                        : "confirmado pela fonte"}
                  </span>
                </header>
                <p>{field.value}</p>
                <details>
                  <summary>Ver fonte e trecho</summary>
                  <dl>
                    <div>
                      <dt>Documento</dt>
                      <dd>{field.sourceTitle}</dd>
                    </div>
                    <div>
                      <dt>Versão/local</dt>
                      <dd>
                        {field.sourceVersion} · {field.locator}
                        {field.page ? " · página " + field.page : ""}
                      </dd>
                    </div>
                  </dl>
                  <blockquote>{field.excerpt}</blockquote>
                </details>
              </section>
            ))}
            <div className="admin-ai__diff">
              <h3>Alterações propostas</h3>
              <div>
                <span>Antes</span>
                <pre>{selectedProposal.diff.before || "Sem alteração existente"}</pre>
              </div>
              <div>
                <span>Depois</span>
                <pre>{selectedProposal.diff.after}</pre>
              </div>
            </div>
            {selectedProposal.status === "proposed" && (
              <div className="admin-ai__decision">
                <label>
                  Justificativa da decisão
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Ajuste manual do primeiro campo
                  <textarea value={editedValue} onChange={(event) => setEditedValue(event.target.value)} />
                </label>
                <div>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !canReview ||
                      !selectedSession?.reviewable ||
                      selectedProposal.hasPendingFields ||
                      !profile?.mfaVerified
                    }
                    onClick={() => void decideProposal(selectedProposal, "accepted")}
                  >
                    <Check aria-hidden="true" size={17} /> Aceitar para uso manual
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canReview || !selectedSession?.reviewable || !profile?.mfaVerified}
                    onClick={() => void decideProposal(selectedProposal, "edited")}
                  >
                    <PencilLine aria-hidden="true" size={17} /> Registrar edição
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canReview || !selectedSession?.reviewable || !profile?.mfaVerified}
                    onClick={() => void decideProposal(selectedProposal, "rejected")}
                  >
                    <X aria-hidden="true" size={17} /> Rejeitar
                  </button>
                </div>
                {!canReview && <small>Um revisor autorizado precisa registrar a decisão.</small>}
                {canReview && !selectedSession?.reviewable && (
                  <small>Para garantir uma revisão independente, outra pessoa autorizada deve decidir.</small>
                )}
                {selectedProposal.hasPendingFields && selectedSession?.reviewable && (
                  <small>
                    A aceitação direta está bloqueada: confira o campo e use “Registrar edição” ou rejeite.
                  </small>
                )}
              </div>
            )}
            <p className="admin-ai__not-applied">
              Nenhuma alteração foi aplicada ou publicada. Continue no editor apropriado.
            </p>
          </>
        )}
      </article>

      <ManualFallback />
    </section>
  );
}

function ManualFallback() {
  return (
    <aside className="admin-editor-card admin-ai__fallback" aria-labelledby="ai-manual-title">
      <h2 id="ai-manual-title">Operação manual sempre disponível</h2>
      <p>
        Uma indisponibilidade ou bloqueio da assistência não impede localizar, editar, revisar ou publicar
        pelo fluxo editorial normal.
      </p>
      <nav aria-label="Atalhos para operação manual">
        <Link to="/admin/conteudo">Conteúdo editorial</Link>
        <Link to="/admin/produtos">Produtos</Link>
        <Link to="/admin/paginas">Páginas</Link>
      </nav>
    </aside>
  );
}
