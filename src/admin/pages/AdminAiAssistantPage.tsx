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
import "../admin-ai-assistant.css";

const CANDIDATE_ENABLED = import.meta.env.VITE_EV2_AI_ASSIST_CANDIDATE === "true";
const CMS_ENVIRONMENT = import.meta.env.VITE_CMS_ENVIRONMENT === "staging" ? "staging" : "local";

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
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    CANDIDATE_ENABLED ? "checking" : "disabled",
  );
  const [workspace, setWorkspace] = useState<Ev2AiWorkspace | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [title, setTitle] = useState("Sessão sintética G10");
  const [mode, setMode] = useState<Ev2AiMode>("draft");
  const [proposalKind, setProposalKind] = useState<"locate" | "explain" | "extract" | "draft_patch">(
    "extract",
  );
  const [prompt, setPrompt] = useState("Extraia um resumo técnico apoiado somente no trecho sintético.");
  const [sourceReference, setSourceReference] = useState("g10x-manual-source");
  const [sourceTitle, setSourceTitle] = useState("Documento sintético do Gate G10");
  const [sourceVersion, setSourceVersion] = useState("v1");
  const [sourceLocator, setSourceLocator] = useState("seção-sintética-1");
  const [sourcePage, setSourcePage] = useState("1");
  const [sourceExcerpt, setSourceExcerpt] = useState(
    "O transmissor sintético mede uma faixa fictícia de zero a cem unidades e exige revisão humana.",
  );
  const [targetRef, setTargetRef] = useState("g10x-manual-draft");
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [rationale, setRationale] = useState("Conteúdo sintético conferido com a fonte apresentada.");
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
    if (!session || !CANDIDATE_ENABLED) return;
    const result = Ev2AiWorkspaceSchema.parse(
      await aiAssistCommand(session, { action: "workspace", envelope: envelope() }),
    );
    setWorkspace(result);
    setSelectedSessionId((current) =>
      result.sessions.some((item) => item.id === current)
        ? current
        : (result.sessions.find((item) => item.status === "active")?.id ?? result.sessions[0]?.id ?? ""),
    );
  }, [session]);

  const load = useCallback(async () => {
    if (!session || !CANDIDATE_ENABLED) return;
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
      setError(caught instanceof Error ? caught.message : "Assistência indisponível.");
    }
  }, [loadWorkspace, session]);

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
        caught instanceof Error
          ? caught.message
          : "A operação foi recusada. O CMS manual permanece disponível.",
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
      "Sessão sintética criada; nenhum provedor externo foi acionado.",
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
      "Sessão encerrada. As evidências sintéticas permanecem apenas durante a retenção definida.",
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

  if (!CANDIDATE_ENABLED) {
    return (
      <section>
        <h1>Assistente controlada</h1>
        <div role="status" className="admin-notice">
          A interface candidata EV2.10 não está incluída neste build. Todos os editores manuais continuam
          disponíveis.
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
            ? "Verificando o canary individual da EV2.10…"
            : capability === "error"
              ? error || "Não foi possível verificar a assistência."
              : "A assistência está desligada. Use normalmente os editores manuais do CMS."}
        </div>
        <ManualFallback />
      </section>
    );
  }

  return (
    <section className="admin-ai">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">EV2.10 · F-015 · MODO SINTÉTICO</p>
          <h1>Assistente controlada</h1>
          <p className="admin-help">
            Localize, explique, extraia ou prepare uma proposta de baixo risco. Confira a fonte, a confiança e
            o diff antes de registrar sua decisão.
          </p>
        </div>
      </div>

      <div className="admin-ai__safety" role="note">
        <LockKeyhole aria-hidden="true" size={20} />
        <span>
          <strong>Provedor externo, dados reais e execução: bloqueados.</strong> A decisão EV2-D04 está
          pendente; este candidato usa somente um adaptador determinístico, custo zero e fixtures{" "}
          <code>g10x-*</code>.
        </span>
      </div>

      {!profile?.mfaVerified && (
        <div role="status" className="admin-notice">
          Consultar é permitido, mas criar ou decidir exige MFA. <Link to="/admin/mfa">Confirmar MFA</Link>
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
          <span>Escopo</span>
          <strong>main · {CMS_ENVIRONMENT}</strong>
        </div>
        <div>
          <span>Permissões efetivas</span>
          <strong>
            leitura{canDraft ? " · rascunho" : ""}
            {canReview ? " · revisão" : ""}
          </strong>
        </div>
        <div>
          <span>Política</span>
          <strong>EV2-D04 · rascunho técnico</strong>
        </div>
        <div>
          <span>Retenção máxima</span>
          <strong>24 horas</strong>
        </div>
        <div>
          <span>Execução no CMS</span>
          <strong>0 ações</strong>
        </div>
        <div>
          <span>Custo</span>
          <strong>R$ 0,00 · sintético</strong>
        </div>
      </div>

      <div className="admin-ai__grid">
        <form
          className="admin-editor-card"
          onSubmit={(event) => {
            event.preventDefault();
            void createSession();
          }}
        >
          <h2>
            <Bot aria-hidden="true" size={19} /> 1. Abrir sessão
          </h2>
          <label>
            Título operacional
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
                  {item.title} · {item.status} · {item.owned ? "minha sessão" : "fila de revisão"}
                </option>
              ))}
            </select>
          </label>
          {selectedSession && (
            <>
              <p className="admin-ai__budget">
                Orçamento: {selectedSession.tokensUsed}/{selectedSession.tokenBudget} tokens · custo{" "}
                {selectedSession.costUsedMicros} µ
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
            Não cole dados reais, pessoais, credenciais ou segredos. A fonte é tratada como dado não
            confiável.
          </div>
          <label>
            Ação assistiva
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
            <legend>Fonte sintética obrigatória</legend>
            <label>
              Referência <code>g10x-*</code>
              <input
                value={sourceReference}
                onChange={(event) => setSourceReference(event.target.value)}
                pattern="g10x-[a-z0-9-]{3,100}"
                required
              />
            </label>
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
              Localizador
              <input
                value={sourceLocator}
                onChange={(event) => setSourceLocator(event.target.value)}
                required
              />
            </label>
            <label>
              Trecho sintético
              <textarea
                value={sourceExcerpt}
                onChange={(event) => setSourceExcerpt(event.target.value)}
                required
              />
            </label>
          </fieldset>
          {proposalKind === "draft_patch" && (
            <label>
              Alvo sintético
              <input
                value={targetRef}
                onChange={(event) => setTargetRef(event.target.value)}
                pattern="g10x-[a-z0-9-]{3,100}"
                required
              />
            </label>
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
            <small>
              Seu papel não possui <code>cms:ai.draft</code>.
            </small>
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
                    {proposal.kind} · {proposal.status} · {Math.round(proposal.confidence * 100)}%
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
                        : "apoiado"}
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
              <h3>Diff proposto</h3>
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
                {!canReview && (
                  <small>
                    Um papel com <code>cms:ai.review</code> registra a decisão.
                  </small>
                )}
                {canReview && !selectedSession?.reviewable && (
                  <small>A segregação exige que outro revisor autorizado decida esta proposta.</small>
                )}
                {selectedProposal.hasPendingFields && selectedSession?.reviewable && (
                  <small>
                    A aceitação direta está bloqueada: confira o campo e use “Registrar edição” ou rejeite.
                  </small>
                )}
              </div>
            )}
            <p className="admin-ai__not-applied">
              Aplicado: não · Publicado: não · Continue manualmente no editor apropriado.
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
        pelo fluxo governado atual.
      </p>
      <nav aria-label="Atalhos para operação manual">
        <Link to="/admin/conteudo">Conteúdo editorial</Link>
        <Link to="/admin/produtos">Produtos</Link>
        <Link to="/admin/paginas">Páginas</Link>
      </nav>
    </aside>
  );
}
