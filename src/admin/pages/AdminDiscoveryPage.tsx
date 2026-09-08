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
import { DiscoveryContentEditor, type DiscoveryRelationOption } from "../components/DiscoveryContentEditor";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { Badge, RecordDrawer, RelationMatrix, SectionCard } from "../components/AdminUI";
import { DiscoveryModuleTabs } from "../components/AdminModuleTabs";
import { EditorialArchiveAction } from "../components/EditorialArchiveAction";
import { humanValidationIssue } from "../validation-field-label";
import {
  fetchAuthoritativeEditorialItem,
  INVALIDATED_EDITOR_SNAPSHOT,
  saveWithPublishedRevisionReconciliation,
  type AuthoritativeEditorialItem,
} from "../published-revision-save";

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
    title: "",
    summary: "",
    blocks: [{ id: uid(), type: "rich_text", data: { text: "" } }],
    seo: {
      title: "",
      description: "",
      canonicalPath: "",
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        authorizationReference: "",
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "",
        rightsConfirmed: false,
        commercialOwner: "",
        technicalOwner: "",
        verifiedAt: now(),
      },
    ],
    governanceState: "awaiting_owner",
    search: { synonyms: [], keywords: [] },
    approval: {
      businessOwner: "",
      technicalReviewer: "",
      commercialReviewer: "",
      editorialReviewer: "",
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
        operationalOwner: "",
        technicalReviewer: "",
        commercialReviewer: "",
        editorialReviewer: "",
      },
      serviceKind: "",
      scope: "",
      whenToHire: [""],
      deliverables: [""],
      prerequisites: [],
      executionSteps: [""],
      relations: { productIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    };
  if (kind === "industry")
    return {
      ...common,
      contentType: "industry",
      displayOrder: 999,
      marketName: "",
      challenges: [""],
      evidence: [""],
      processAreas: [""],
    };
  if (kind === "application")
    return {
      ...common,
      contentType: "application",
      process: "",
      problem: "",
      benefits: [""],
      points: [
        {
          id: uid(),
          title: "",
          need: "",
          variable: "",
          function: "",
          technicalBenefit: "",
          operationalBenefit: "",
          productIds: [],
          serviceIds: [],
        },
      ],
    };
  return {
    ...common,
    contentType: "solution",
    problem: "",
    approach: "",
    benefits: [""],
    components: [""],
    gasDetectionModel: "not_applicable",
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
    [slug, setSlug] = useState(""),
    [lock, setLock] = useState(1),
    [workflowStatus, setWorkflowStatus] = useState("draft"),
    [revisions, setRevisions] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [relationError, setRelationError] = useState(""),
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
  const [relationOptions, setRelationOptions] = useState<DiscoveryRelationOption[]>([]);
  const loadRelationOptions = useCallback(async () => {
    if (!id) return;
    setRelationError("");
    const { data, error: relationLoadError } = await supabase
      .from("cms_published_projection")
      .select("item_id,content_type,payload")
      .in("content_type", ["product", "service", "industry", "application", "solution"])
      .order("published_at", { ascending: false });
    if (relationLoadError) {
      setRelationOptions([]);
      setRelationError("Os conteúdos publicados para relacionamento estão temporariamente indisponíveis.");
      return;
    }
    setRelationOptions(
      (data ?? [])
        .filter((row) => row.item_id !== id)
        .map((row) => ({
          id: row.item_id,
          contentType: row.content_type as DiscoveryRelationOption["contentType"],
          label:
            row.payload && typeof row.payload === "object" && "title" in row.payload
              ? String(row.payload.title)
              : "Conteúdo publicado",
        })),
    );
  }, [id]);
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
      setSlug("");
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
  useEffect(() => {
    void loadRelationOptions();
  }, [loadRelationOptions]);

  async function persistRelation(
    item: any,
    contentType: Kind | "product",
    relationKey: "productIds" | "applicationIds",
    targetId: string,
    next: boolean,
  ) {
    if (!session) throw new Error("Sessão administrativa indisponível.");
    const authoritative = await fetchAuthoritativeEditorialItem(item.id, contentType);
    const draft = authoritative.cms_content_drafts;
    const relations =
      draft.payload.relations &&
      typeof draft.payload.relations === "object" &&
      !Array.isArray(draft.payload.relations)
        ? (draft.payload.relations as Record<string, unknown>)
        : {};
    const currentIds = Array.isArray(relations[relationKey])
      ? relations[relationKey].filter((candidate): candidate is string => typeof candidate === "string")
      : [];
    const ids = next
      ? [...new Set([...currentIds, targetId])]
      : currentIds.filter((candidate: string) => candidate !== targetId);
    const applyAuthoritativeState = (state: AuthoritativeEditorialItem) => {
      if (contentType === "product")
        setRelatedProducts((current) => current.map((row) => (row.id === state.id ? state : row)));
      else setItems((current) => current.map((row) => (row.id === state.id ? state : row)));
      if (id === state.id) {
        setLock(state.cms_content_drafts.lock_version);
        setWorkflowStatus(state.workflow_status);
        setRevisions(state.cms_content_revisions ?? []);
      }
    };
    await saveWithPublishedRevisionReconciliation({
      reopen:
        authoritative.workflow_status === "published"
          ? () =>
              editorialCommand(session, {
                action: "reopen",
                itemId: authoritative.id,
                contentType: null,
                slug: null,
                payload: null,
                expectedLockVersion: null,
                reason: "Atualizar vínculo bidirecional do catálogo",
              })
          : null,
      save: () =>
        editorialCommand(session, {
          action: "save",
          itemId: authoritative.id,
          contentType,
          slug: authoritative.slug,
          payload: {
            ...draft.payload,
            relations: { ...relations, [relationKey]: ids },
          },
          expectedLockVersion: draft.lock_version,
          reason: "Atualizar vínculo bidirecional do catálogo",
        }),
      invalidateSnapshot: () => {
        if (id === authoritative.id) setSavedSnapshot(INVALIDATED_EDITOR_SNAPSHOT);
      },
      reconcile: async () => {
        applyAuthoritativeState(await fetchAuthoritativeEditorialItem(authoritative.id, contentType));
      },
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
        setError(`Cadastro inválido. ${humanValidationIssue(parsed.error.issues[0])}`);
        return;
      }
      const publishedItemId =
        action === "save" && workflowStatus === "published" && id && id !== "novo" ? id : null;
      const result = await saveWithPublishedRevisionReconciliation({
        reopen: publishedItemId
          ? () =>
              editorialCommand(session, {
                action: "reopen",
                itemId: publishedItemId,
                contentType: null,
                slug: null,
                payload: null,
                expectedLockVersion: null,
                reason: "Abrir nova versão governada do conteúdo publicado",
              })
          : null,
        save: () =>
          editorialCommand(session, {
            action,
            itemId: id && id !== "novo" ? id : null,
            contentType: kind,
            slug,
            payload: action === "create" || action === "save" ? payload : null,
            expectedLockVersion: id && id !== "novo" ? lock : null,
            reason: "Operação governada da Fase 5",
            ...extras,
          }),
        invalidateSnapshot: () => setSavedSnapshot(INVALIDATED_EDITOR_SNAPSHOT),
        reconcile: async () => {
          if (!publishedItemId) return;
          const authoritative = await fetchAuthoritativeEditorialItem(publishedItemId, kind);
          setLock(authoritative.cms_content_drafts.lock_version);
          setWorkflowStatus(authoritative.workflow_status);
          setRevisions(authoritative.cms_content_revisions ?? []);
        },
      });
      setSuccess(
        action === "archive"
          ? `${workflowStatus === "published" ? "Conteúdo público retirado e item arquivado" : "Item arquivado"}. A alteração foi registrada na auditoria.`
          : "Operação concluída e registrada na auditoria.",
      );
      if (action === "create" || action === "save") setSavedSnapshot(JSON.stringify({ payload, slug }));
      if (["create", "save", "publish", "archive"].includes(action)) backup.clear();
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
                  <th>Endereço público</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.cms_content_drafts?.payload?.title ?? "Sem título"}</td>
                    <td>
                      /{publicPaths[kind]}/{item.slug}
                    </td>
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
                  label: item.cms_content_drafts?.payload?.title ?? "Cadastro sem título",
                }))}
                columns={relatedProducts.map((item) => ({
                  id: item.id,
                  label: item.cms_content_drafts?.payload?.title ?? "Produto sem título",
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
            ) : kind === "industry" && activeTool === "2" ? (
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Setor</th>
                      <th>Endereço público</th>
                      <th>Situação editorial</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .slice()
                      .sort((left, right) => {
                        const orderDifference =
                          (left.cms_content_drafts?.payload?.displayOrder ?? 999) -
                          (right.cms_content_drafts?.payload?.displayOrder ?? 999);
                        return (
                          orderDifference ||
                          String(left.cms_content_drafts?.payload?.title ?? left.slug).localeCompare(
                            String(right.cms_content_drafts?.payload?.title ?? right.slug),
                            "pt-BR",
                          )
                        );
                      })
                      .map((item) => (
                        <tr key={item.id}>
                          <td>{item.cms_content_drafts?.payload?.displayOrder ?? 999}</td>
                          <td>
                            <strong>{item.cms_content_drafts?.payload?.title ?? "Sem título"}</strong>
                          </td>
                          <td>
                            /{publicPaths.industry}/{item.slug}
                          </td>
                          <td>{item.workflow_status.replaceAll("_", " ")}</td>
                          <td>
                            <Link to={`/admin/descoberta/industry/${item.id}`}>Editar ordem</Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <p className="admin-help">
                  A posição é versionada com o conteúdo e só chega ao site depois do fluxo de revisão e
                  publicação.
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
                            <small>
                              /{publicPaths[kind]}/{item.slug}
                            </small>
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
          <p className="admin-eyebrow">CATÁLOGO DE DESCOBERTA</p>
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
      {relationError && (
        <div role="alert" className="admin-notice--error">
          {relationError}{" "}
          <button type="button" onClick={() => void loadRelationOptions()}>
            Tentar novamente
          </button>
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
        contractIssue={parsed.success ? undefined : humanValidationIssue(parsed.error.issues[0])}
        serviceKindOptions={vocabularies.find((list) => list.list_key === "service.category")?.options}
        generateAddressFromTitle={id === "novo"}
        relationOptions={relationOptions}
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
              <EditorialArchiveAction
                state={workflowStatus}
                entityLabel={singularLabels[kind].toLocaleLowerCase("pt-BR")}
                article={kind === "service" ? "O" : "A"}
                allowed={can("publish")}
                busy={busy}
                onArchive={() => void run("archive")}
              />
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
              .map((r, index) => (
                <li key={r.id}>
                  Revisão {r.revision_number} — {r.reason}{" "}
                  {(workflowStatus === "archived" || (workflowStatus === "published" && index > 0)) && (
                    <button
                      disabled={busy || !can("publish")}
                      onClick={() => void run("restore", { revisionId: r.id })}
                    >
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}
    </section>
  );
}
