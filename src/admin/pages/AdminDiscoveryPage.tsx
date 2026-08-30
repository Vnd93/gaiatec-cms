import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import {
  CmsApplicationContentSchema,
  CmsIndustryContentSchema,
  CmsServiceContentSchema,
  CmsSolutionContentSchema,
} from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { editorialCommand, issuePreview } from "../api/cms-api";

type Kind = "service" | "industry" | "application" | "solution";
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
      serviceKind: "Categoria a definir",
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
    [items, setItems] = useState<any[]>([]),
    [payload, setPayload] = useState<any>(() => initial(kind)),
    [slug, setSlug] = useState(`${kind}-sintetico`),
    [lock, setLock] = useState(1),
    [workflowStatus, setWorkflowStatus] = useState("draft"),
    [revisions, setRevisions] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const permission = meta[kind].permission,
    can = (action: string) => profile?.permissions.includes(`${permission}.${action}`) ?? false;
  const parsed = useMemo(() => schemas[kind].safeParse(payload), [kind, payload]);
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
  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
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
      setSuccess(`Operação ${action} concluída. Correlação: ${result.correlationId}`);
      if (action === "create") navigate(`/admin/descoberta/${kind}/${result.itemId}`);
      else await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }
  const latest = revisions.slice().sort((a, b) => b.revision_number - a.revision_number)[0];
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
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Slug</th>
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
                      <Link to={`/admin/descoberta/${kind}/${item.id}`}>Abrir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">{meta[kind].consumerId}</p>
          <h1>Editor de {meta[kind].label.toLowerCase()}</h1>
        </div>
        <Link to={`/admin/descoberta/${kind}`}>Voltar à lista</Link>
      </div>
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
      <div className="admin-editor-grid">
        <label>
          Slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label>
          Título
          <input
            value={payload.title ?? ""}
            onChange={(e) => setPayload({ ...payload, title: e.target.value })}
          />
        </label>
        <label>
          Resumo
          <textarea
            value={payload.summary ?? ""}
            onChange={(e) => setPayload({ ...payload, summary: e.target.value })}
          />
        </label>
        <label>
          Governança
          <select
            value={payload.governanceState}
            onChange={(e) => setPayload({ ...payload, governanceState: e.target.value })}
          >
            <option value="synthetic_test">Fixture sintética</option>
            <option value="awaiting_owner">Aguardando owner</option>
            <option value="homologated">Homologado</option>
          </select>
        </label>
      </div>
      <label>
        Contrato completo JSON
        <textarea
          className="admin-json-editor"
          rows={24}
          value={JSON.stringify(payload, null, 2)}
          onChange={(e) => {
            try {
              setPayload(JSON.parse(e.target.value));
              setError("");
            } catch {
              setError("JSON inválido; o salvamento está bloqueado.");
            }
          }}
        />
      </label>
      <p className="admin-help">
        Todos os campos são consumidos pelo editor/histórico/preview; título, resumo, mídia, relações, pontos,
        CTA e SEO também chegam ao frontend público. Campos de aprovação e proveniência permanecem privados
        por segurança.
      </p>
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
                try {
                  const p = await issuePreview(session, id, latest?.id);
                  window.location.assign(p.path);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Preview indisponível.");
                }
              }}
            >
              Preview
            </button>
          </>
        )}
      </div>
      {revisions.length > 0 && (
        <section>
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
