import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import {
  CmsApplicationContentSchema,
  CmsIndustryContentSchema,
  CmsServiceContentSchema,
  CmsSolutionContentSchema,
} from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  controlledVocabularyCommand,
  editorialCommand,
  issuePreview,
  type ControlledVocabularyList,
} from "../api/cms-api";
import { DiscoveryContentEditor } from "../components/DiscoveryContentEditor";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { Badge, RecordDrawer, RelationMatrix, SectionCard } from "../components/AdminUI";
import { DiscoveryModuleTabs } from "../components/AdminModuleTabs";

type Kind = "service" | "industry" | "application" | "solution";
const singularLabels: Record<Kind, string> = {
  service: "Serviço",
  industry: "Indústria",
  application: "Aplicação",
  solution: "Solução",
};
const publicPaths: Record<Kind, string> = {
  service: "servicos",
  industry: "industrias",
  application: "aplicacoes",
  solution: "solucoes",
};
const meta = {
  service: { label: "Serviços", consumerId: "cms.service.v1", permission: "cms:services" },
  industry: { label: "Indústrias", consumerId: "cms.industry.v1", permission: "cms:industries" },
  application: { label: "Aplicações", consumerId: "cms.application.v1", permission: "cms:applications" },
  solution: { label: "Soluções", consumerId: "cms.solution.v1", permission: "cms:solutions" },
} as const;
const schemas = {
  service: CmsServiceContentSchema,
  industry: CmsIndustryContentSchema,
  application: CmsApplicationContentSchema,
  solution: CmsSolutionContentSchema,
};
const uid = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
function initial(kind: Kind) {
  const common = {
    schemaVersion: 1,
    consumerId: meta[kind].consumerId,
    contentType: kind,
    title: "Conteúdo sintético descartável",
    summary: "Fixture técnica para validar o contrato da Fase 5.",
    blocks: [{ id: uid(), type: "rich_text", data: { text: "Conteúdo sintético sem uso editorial." } }],
    seo: {
      title: "Conteúdo sintético | GAIATEC",
      description: "Fixture sintética não indexável usada na validação técnica da Fase 5.",
      canonicalPath: `/${kind}-sintetico`,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        authorizationReference: "F5-FIXTURE-SINTETICA",
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Teste descartável de staging",
        rightsConfirmed: true,
        commercialOwner: "Owner a definir",
        technicalOwner: "Owner a definir",
        verifiedAt: now(),
      },
    ],
    governanceState: "synthetic_test",
    search: { synonyms: [], keywords: ["fixture-sintetica"] },
    approval: {
      businessOwner: "Owner a definir",
      technicalReviewer: "Revisor a definir",
      commercialReviewer: "Revisor a definir",
      editorialReviewer: "Revisor a definir",
    },
    media: [],
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    cta: { label: "Falar com especialista", href: "/contato" },
  };
  if (kind === "service")
    return {
      ...common,
      contentType: "service",
      approval: {
        operationalOwner: "Owner a definir",
        technicalReviewer: "Revisor a definir",
        commercialReviewer: "Revisor a definir",
        editorialReviewer: "Revisor a definir",
      },
      serviceKind: "",
      serviceKindRef: { id: "", slug: "", label: "" },
      scope: "Escopo sintético.",
      whenToHire: ["Cenário sintético."],
      deliverables: ["Entregável sintético."],
      prerequisites: [],
      executionSteps: ["Etapa sintética."],
      relations: { productIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    };
  if (kind === "industry")
    return {
      ...common,
      contentType: "industry",
      marketName: "Mercado sintético",
      challenges: ["Desafio sintético."],
      evidence: ["Evidência sintética não editorial."],
      processAreas: ["Processo sintético."],
    };
  if (kind === "application")
    return {
      ...common,
      contentType: "application",
      process: "Processo sintético.",
      problem: "Problema sintético.",
      benefits: ["Benefício sintético."],
      points: [
        {
          id: uid(),
          title: "Ponto sintético",
          need: "Necessidade sintética.",
          variable: "Variável sintética",
          function: "Função sintética.",
          technicalBenefit: "Benefício técnico sintético.",
          operationalBenefit: "Benefício operacional sintético.",
          productIds: [],
          serviceIds: [],
        },
      ],
    };
  return {
    ...common,
    contentType: "solution",
    problem: "Problema sintético.",
    approach: "Abordagem sintética.",
    benefits: ["Benefício sintético."],
    components: ["Componente sintético."],
    gasDetectionModel: "integrated_master_catalog",
  };
}

export default function AdminDiscoveryPage() {
  const { contentType = "service", id } = useParams(),
    kind = (Object.keys(meta).includes(contentType) ? contentType : "service") as Kind;
  const { session, profile } = useAdminAuth(),
    navigate = useNavigate(),
    [searchParams] = useSearchParams(),
    [items, setItems] = useState<any[]>([]),
    [relatedProducts, setRelatedProducts] = useState<any[]>([]),
    [selectedSummary, setSelectedSummary] = useState<any | null>(null),
    [payload, setPayload] = useState<any>(() => initial(kind)),
    [slug, setSlug] = useState(`${kind}-sintetico`),
    [lock, setLock] = useState(1),
    [workflowStatus, setWorkflowStatus] = useState("draft"),
    [revisions, setRevisions] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [previewFallback, setPreviewFallback] = useState(""),
    [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ payload, slug }));
  const [vocabularies, setVocabularies] = useState<ControlledVocabularyList[]>([]);
  const permission = meta[kind].permission,
    can = (action: string) => profile?.permissions.includes(`${permission}.${action}`) ?? false;
  const activeTool = searchParams.get("tab") ?? "0";
  const parsed = useMemo(() => schemas[kind].safeParse(payload), [kind, payload]);
  useEffect(() => {
    if (!session || kind !== "service") return;
    let active = true;
    void controlledVocabularyCommand<{ items: ControlledVocabularyList[] }>(session, {
      action: "list",
      entityType: "service",
      includeInactive: false,
    })
      .then((result) => {
        if (active) setVocabularies(result.items);
      })
      .catch(() => {
        if (active) setError("A lista mestra de categorias de serviço está indisponível.");
      });
    return () => {
      active = false;
    };
  }, [kind, session]);
  const loadRelatedProducts = useCallback(async () => {
    if (kind !== "application") return;
    const { data } = await supabase
      .from("cms_content_items")
      .select("id,slug,workflow_status,cms_content_drafts(payload,lock_version)")
      .eq("content_type", "product")
      .neq("workflow_status", "trashed")
      .order("updated_at", { ascending: false });
    setRelatedProducts((data ?? []) as any[]);
  }, [kind]);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    if (id && id !== "novo") {
      const { data, error: e } = await supabase
        .from("cms_content_items")
        .select(
          "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
        )
        .eq("id", id)
        .eq("content_type", kind)
        .single();
      if (e) setError("Conteúdo indisponível ou sem permissão.");
      else {
        const row = data as any;
        setPayload(row.cms_content_drafts.payload);
        setSlug(row.slug);
        setSavedSnapshot(JSON.stringify({ payload: row.cms_content_drafts.payload, slug: row.slug }));
        setLock(row.cms_content_drafts.lock_version);
        setWorkflowStatus(row.workflow_status);
        setRevisions(row.cms_content_revisions ?? []);
      }
      setItems([]);
    } else if (!id) {
      const { data, error: e } = await supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload,lock_version)")
        .eq("content_type", kind)
        .order("updated_at", { ascending: false });
      if (e) setError("Não foi possível carregar os cadastros.");
      else setItems((data ?? []) as any[]);
    } else {
      setPayload(initial(kind));
      setSlug(`${kind}-sintetico`);
      setRevisions([]);
      setLock(1);
      setWorkflowStatus("draft");
    }
    setLoading(false);
  }, [id, kind]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    void loadRelatedProducts();
  }, [loadRelatedProducts]);

  async function persistRelation(
    item: any,
    contentType: Kind | "product",
    relationKey: "productIds" | "applicationIds",
    targetId: string,
    next: boolean,
  ) {
    if (!session) throw new Error("Sessão administrativa indisponível.");
    const draft = item.cms_content_drafts;
    const currentIds = draft.payload.relations?.[relationKey] ?? [];
    const ids = next
      ? [...new Set([...currentIds, targetId])]
      : currentIds.filter((candidate: string) => candidate !== targetId);
    if (item.workflow_status === "published") {
      await editorialCommand(session, {
        action: "reopen",
        itemId: item.id,
        contentType: null,
        slug: null,
        payload: null,
        expectedLockVersion: null,
        reason: "Atualizar vínculo bidirecional do catálogo",
      });
    }
    await editorialCommand(session, {
      action: "save",
      itemId: item.id,
      contentType,
      slug: item.slug,
      payload: {
        ...draft.payload,
        relations: { ...draft.payload.relations, [relationKey]: ids },
      },
      expectedLockVersion: draft.lock_version,
      reason: "Atualizar vínculo bidirecional do catálogo",
    });
  }

  async function toggleProductApplication(applicationId: string, productId: string, next: boolean) {
    const application = items.find((item) => item.id === applicationId);
    const product = relatedProducts.find((item) => item.id === productId);
    if (!application || !product || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await persistRelation(product, "product", "applicationIds", applicationId, next);
      try {
        await persistRelation(application, "application", "productIds", productId, next);
      } catch (caught) {
        await persistRelation(product, "product", "applicationIds", applicationId, !next);
        throw caught;
      }
      setSuccess(`Vínculo ${next ? "adicionado" : "removido"} nos dois sentidos.`);
      await Promise.all([reload(), loadRelatedProducts()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "O vínculo não pôde ser atualizado; revise a auditoria antes de tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const dirty = JSON.stringify({ payload, slug }) !== savedSnapshot;
    try {
      if (!["create", "save"].includes(action) && dirty)
        throw new Error("Salve o conteúdo antes de executar uma ação de revisão ou publicação.");
      if ((action === "create" || action === "save") && !parsed.success) {
        setError(
          `Contrato inválido: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`,
        );
        return;
      }
      if (action === "save" && workflowStatus === "published" && id && id !== "novo") {
        await editorialCommand(session, {
          action: "reopen",
          itemId: id,
          contentType: null,
          slug: null,
          payload: null,
          expectedLockVersion: null,
          reason: "Abrir nova versão governada do conteúdo publicado",
        });
      }
      const result = await editorialCommand(session, {
        action,
        itemId: id && id !== "novo" ? id : null,
        contentType: kind,
        slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: action === "save" ? lock : null,
        reason: "Operação governada da Fase 5",
        ...extras,
      });
      setSuccess(
        `Operação ${action} concluída. Código de acompanhamento: ${result.correlationId.slice(0, 8)}.`,
      );
      if (action === "create" || action === "save") setSavedSnapshot(JSON.stringify({ payload, slug }));
      if (["create", "save", "publish"].includes(action)) backup.clear();
      if (action === "create") navigate(`/admin/descoberta/${kind}/${result.itemId}`);
      else await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }
  const latest = revisions.slice().sort((a, b) => b.revision_number - a.revision_number)[0];
  const dirty = JSON.stringify({ payload, slug }) !== savedSnapshot;
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: kind,
    itemKey: id ?? "novo",
    value: { payload, slug },
    dirty,
    enabled: !loading,
    onRestore: (stored) => {
      setPayload(stored.payload);
      setSlug(stored.slug);
    },
  });
  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando {meta[kind].label.toLowerCase()}…
      </div>
    );
  if (!id)
    return (
      <section>
        <div className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">CATÁLOGO E DESCOBERTA</p>
            <h1>{meta[kind].label}</h1>
          </div>
          {can("edit") && (
            <Link className="admin-button" to={`/admin/descoberta/${kind}/novo`}>
              Novo cadastro
            </Link>
          )}
        </div>
        <DiscoveryModuleTabs kind={kind} />
        {error ? (
          <div role="alert" className="admin-notice--error">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="admin-state">
            <h2>Nenhum cadastro novo</h2>
            <p>
              O CMS não consulta o site, banco ou painel antigos. Cadastre o lote definitivo quando as fontes
              e os owners forem aprovados.
            </p>
          </div>
        ) : activeTool === "0" ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Endereço amigável</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.cms_content_drafts?.payload?.title}</td>
                    <td>{item.slug}</td>
                    <td>{item.workflow_status}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedSummary(item)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SectionCard
            title={
              kind === "service"
                ? activeTool === "1"
                  ? "Vínculos com produtos"
                  : "Listas mestras"
                : kind === "industry"
                  ? activeTool === "1"
                    ? "Conteúdo por setor"
                    : "Ordem no site"
                  : kind === "application"
                    ? activeTool === "1"
                      ? "Vínculos da aplicação"
                      : "Matriz produto × aplicação"
                    : "Composição"
            }
            description="A relação é bidirecional e respeita o workflow editorial vigente."
          >
            {kind === "application" && activeTool === "2" ? (
              <RelationMatrix
                rowLabel="Aplicação"
                columnLabel="Produto"
                rows={items.map((item) => ({
                  id: item.id,
                  label: item.cms_content_drafts?.payload?.title ?? item.slug,
                }))}
                columns={relatedProducts.map((item) => ({
                  id: item.id,
                  label: item.cms_content_drafts?.payload?.title ?? item.slug,
                }))}
                linked={(applicationId, productId) =>
                  items
                    .find((item) => item.id === applicationId)
                    ?.cms_content_drafts?.payload?.relations?.productIds?.includes(productId) ?? false
                }
                disabled={
                  busy || !can("edit") || !(profile?.permissions.includes("cms:products.edit") ?? false)
                }
                onToggle={(applicationId, productId, next) =>
                  void toggleProductApplication(applicationId, productId, next)
                }
              />
            ) : kind === "service" && activeTool === "2" ? (
              <div className="admin-master-layout">
                <div className="admin-master-sidebar">
                  {(vocabularies.length
                    ? vocabularies
                    : [
                        { id: "category", label: "Categorias de serviço", options: [] },
                        { id: "delivery", label: "Modalidades de atendimento", options: [] },
                        { id: "standards", label: "Normas e certificações", options: [] },
                      ]
                  ).map((list: any) => (
                    <Link key={list.id} to="/admin/listas-mestras">
                      <strong>{list.label}</strong>
                      <span>{list.options.length} termos</span>
                    </Link>
                  ))}
                </div>
                <p className="admin-help">
                  Abra uma lista para incluir, inativar ou revisar termos sem alterar os identificadores já
                  usados.
                </p>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {kind === "industry"
                          ? "Setor"
                          : kind === "application"
                            ? "Aplicação"
                            : kind === "solution"
                              ? "Solução"
                              : "Serviço"}
                      </th>
                      <th>Produtos</th>
                      <th>Serviços</th>
                      <th>Aplicações</th>
                      <th>Situação</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const relations = item.cms_content_drafts?.payload?.relations ?? {};
                      const products = relations.productIds?.length ?? 0;
                      const services = relations.serviceIds?.length ?? 0;
                      const applications = relations.applicationIds?.length ?? 0;
                      const complete =
                        products > 0 || (kind === "industry" && (services > 0 || applications > 0));
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.cms_content_drafts?.payload?.title ?? "Sem título"}</strong>
                            <small>{item.slug}</small>
                          </td>
                          <td>{products || "—"}</td>
                          <td>{services || "—"}</td>
                          <td>{applications || "—"}</td>
                          <td>
                            <Badge tone={complete ? "success" : "warning"}>
                              {complete ? "Completo" : "Sem vínculos"}
                            </Badge>
                          </td>
                          <td>
                            <Link to={`/admin/descoberta/${kind}/${item.id}`}>
                              {kind === "industry" ? "Completar" : "Gerenciar vínculos"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
        <RecordDrawer
          open={Boolean(selectedSummary)}
          eyebrow={singularLabels[kind].toUpperCase()}
          title={selectedSummary?.cms_content_drafts?.payload?.title ?? "Sem título"}
          address={selectedSummary ? `/${publicPaths[kind]}/${selectedSummary.slug}` : undefined}
          status={
            <Badge tone={selectedSummary?.workflow_status === "published" ? "success" : "info"}>
              {String(selectedSummary?.workflow_status ?? "draft").replaceAll("_", " ")}
            </Badge>
          }
          fields={
            selectedSummary
              ? [
                  {
                    label: "Vínculos",
                    value: `${selectedSummary.cms_content_drafts?.payload?.relations?.productIds?.length ?? 0} produtos · ${selectedSummary.cms_content_drafts?.payload?.relations?.serviceIds?.length ?? 0} serviços`,
                  },
                  {
                    label: "Atualização",
                    value: new Date(selectedSummary.updated_at).toLocaleString("pt-BR"),
                  },
                ]
              : undefined
          }
          summary={selectedSummary?.cms_content_drafts?.payload?.summary || "Sem resumo editorial."}
          primary={
            selectedSummary && (
              <Link to={`/admin/descoberta/${kind}/${selectedSummary.id}`}>Ver ficha completa</Link>
            )
          }
          onClose={() => setSelectedSummary(null)}
        />
      </section>
    );
  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">{meta[kind].consumerId}</p>
          <h1>Editor de {meta[kind].label.toLowerCase()}</h1>
        </div>
        <Link to={`/admin/descoberta/${kind}`}>Voltar à lista</Link>
      </div>
      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Conteúdo em edição</dt>
          <dd>
            {payload.title || "Sem título"} · /{publicPaths[kind]}/{slug}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{dirty ? "Alterações não salvas" : `Rascunho salvo · estado ${workflowStatus}`}</dd>
        </div>
        <div>
          <dt>Impacto público</dt>
          <dd>Lista, página detalhada, busca, relações e SEO após publicação.</dd>
        </div>
      </dl>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
          {previewFallback && (
            <>
              {" "}
              <a href={previewFallback} target="_blank" rel="noopener noreferrer">
                Abrir preview em nova aba
              </a>
            </>
          )}
        </div>
      )}
      {success && (
        <div role="status" className="admin-notice--success">
          {success}
        </div>
      )}
      <DraftBackupNotice backup={backup} />
      <DiscoveryContentEditor
        kind={kind}
        payload={payload}
        slug={slug}
        onChange={setPayload}
        onSlugChange={setSlug}
        contractValid={parsed.success}
        contractIssue={
          parsed.success
            ? undefined
            : `${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`
        }
        serviceKindOptions={vocabularies.find((list) => list.list_key === "service.category")?.options}
      />
      <div className="admin-workflow-bar">
        <div>
          <span>Workflow</span>
          <strong>{workflowStatus.replaceAll("_", " ")}</strong>
          <DraftBackupNotice backup={{ ...backup, recoverable: null }} />
        </div>
        <div className="admin-actions">
          {id === "novo" ? (
            <button disabled={busy || !can("edit")} onClick={() => void run("create")}>
              Criar rascunho
            </button>
          ) : (
            <>
              <button disabled={busy || !can("edit")} onClick={() => void run("save")}>
                Salvar
              </button>
              <button disabled={busy || !can("edit")} onClick={() => void run("submit")}>
                Enviar para revisão
              </button>
              <button
                disabled={busy || !profile?.permissions.includes(`${permission}.approve`) || !latest}
                onClick={() => void run("approve", { revisionId: latest?.id })}
              >
                Aprovar
              </button>
              <button
                disabled={busy || !can("publish") || !latest}
                onClick={() => void run("publish", { revisionId: latest?.id })}
              >
                Publicar
              </button>
              <button
                disabled={busy || !can("edit")}
                onClick={async () => {
                  if (!session || !id) return;
                  setBusy(true);
                  setError("");
                  setPreviewFallback("");
                  const result = await openExternalAfterAsync(
                    async () => (await issuePreview(session, id, latest?.id)).path,
                  );
                  if (result.status === "blocked") {
                    setPreviewFallback(result.url);
                    setError("O navegador bloqueou a nova aba. Abra o preview pelo link abaixo.");
                  } else if (result.status === "failed") setError(result.error.message);
                  setBusy(false);
                }}
              >
                Preview
              </button>
            </>
          )}
        </div>
      </div>
      {revisions.length > 0 && (
        <section className="admin-history">
          <h2>Histórico</h2>
          <ul>
            {revisions
              .slice()
              .sort((a, b) => b.revision_number - a.revision_number)
              .map((r) => (
                <li key={r.id}>
                  Revisão {r.revision_number} — {r.reason}{" "}
                  <button
                    disabled={busy || !can("publish")}
                    onClick={() => void run("restore", { revisionId: r.id })}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </section>
  );
}
