import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsContentPayloadSchema } from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { editorialCommand, issuePreview } from "../api/cms-api";

type Loaded = {
  id: string;
  slug: string;
  workflow_status: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: {
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
    payload: Record<string, unknown>;
  }[];
};
export default function AdminEditorPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { session, profile, user } = useAdminAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [loading, setLoading] = useState(id !== "novo"),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [slug, setSlug] = useState("demo-sintetica-" + Date.now());
  const [title, setTitle] = useState("Demonstração sintética descartável"),
    [summary, setSummary] = useState("Conteúdo fictício criado exclusivamente para validar o Gate G3."),
    [body, setBody] = useState("Este texto não descreve produto, serviço ou informação real da GAIATEC."),
    [reason, setReason] = useState("Validação sintética do fluxo editorial");
  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
      )
      .eq("id", id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Conteúdo indisponível ou sem permissão.");
        else {
          const item = data as unknown as Loaded;
          setLoaded(item);
          setSlug(item.slug);
          const payload = item.cms_content_drafts.payload as {
            title?: string;
            summary?: string;
            blocks?: { data?: { text?: string } }[];
          };
          setTitle(payload.title ?? "");
          setSummary(payload.summary ?? "");
          setBody(payload.blocks?.[0]?.data?.text ?? "");
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const can = (permission: string) => profile?.permissions.includes(permission) ?? false;
  const payload = useMemo(
    () => ({
      schemaVersion: 1 as const,
      consumerId: "cms.synthetic-article.v1" as const,
      contentType: "post" as const,
      title,
      summary,
      excerpt: summary,
      authorName: "Equipe sintética de validação",
      blocks: [{ id: crypto.randomUUID(), type: "rich_text" as const, data: { text: body } }],
      seo: {
        title: title.slice(0, 70) || "Demonstração sintética",
        description: summary.slice(0, 170) || "Validação sintética",
        canonicalPath: "/cms/conteudo/" + slug,
        indexable: false,
      },
      provenance: [
        {
          sourceKind: "owner_authored" as const,
          rightsConfirmed: true as const,
          commercialOwner: "Owner sintético",
          technicalOwner: "Owner sintético",
          verifiedAt: new Date().toISOString(),
        },
      ],
    }),
    [body, slug, summary, title],
  );
  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if ((action === "create" || action === "save") && !CmsContentPayloadSchema.safeParse(payload).success)
        throw new Error("Revise os campos obrigatórios.");
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : "post",
        slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason,
        ...extras,
      });
      setSuccess("Operação concluída: " + result.status + ". Código " + result.correlationId.slice(0, 8));
      if (!loaded && result.itemId) navigate("/admin/conteudo/" + result.itemId, { replace: true });
      else window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha editorial.");
    } finally {
      setBusy(false);
    }
  }
  async function preview(revisionId?: string) {
    if (!session || !loaded) return;
    setBusy(true);
    try {
      const result = await issuePreview(session, loaded.id, revisionId);
      // The token is issued asynchronously, so opening a new tab here is
      // commonly blocked as a popup. Same-tab navigation is deterministic and
      // keeps the editor one browser Back action away.
      window.location.assign(result.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no preview.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando editor…
      </div>
    );
  if (error && !loaded && id !== "novo")
    return (
      <div className="admin-state admin-notice--error" role="alert">
        {error}
      </div>
    );
  const state = loaded?.workflow_status ?? "new";
  return (
    <section>
      <p className="admin-eyebrow">EDITOR E REVISÕES</p>
      <h1>{loaded ? title : "Novo conteúdo sintético"}</h1>
      <p className="admin-help">
        Ambiente limpo: use somente texto fictício e descartável, sem dados comerciais reais.
      </p>
      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="admin-notice admin-notice--success" role="status">
          {success}
        </p>
      )}
      <div className="admin-editor-grid">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(loaded ? "save" : "create");
          }}
        >
          <label>
            Slug
            <input
              value={slug}
              disabled={Boolean(loaded) || busy}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label>
            Título
            <input
              value={title}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Resumo
            <textarea
              value={summary}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label>
            Corpo sintético
            <textarea
              rows={8}
              value={body}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label>
            Motivo da revisão
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {can("cms:posts.edit") && (state === "new" || state === "draft" || state === "in_review") && (
            <button className="admin-button" disabled={busy}>
              {loaded ? "Salvar com controle de versão" : "Criar rascunho"}
            </button>
          )}
        </form>
        <aside className="admin-workflow">
          <h2>Workflow</h2>
          <p>
            Status: <strong>{state}</strong>
          </p>
          <button onClick={() => void preview()} disabled={!loaded || busy}>
            Preview do rascunho
          </button>
          {state === "draft" && can("cms:posts.edit") && (
            <button onClick={() => void run("submit")} disabled={busy}>
              Enviar para revisão
            </button>
          )}
          {state === "in_review" && can("cms:posts.approve") && (
            <button
              onClick={() => void run("approve", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
              disabled={busy}
            >
              Aprovar revisão
            </button>
          )}
          {state === "approved" && can("cms:posts.publish") && (
            <>
              <button
                onClick={() => void run("publish", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
                disabled={busy}
              >
                Publicar agora
              </button>
              <button
                onClick={() =>
                  void run("schedule", { publishAt: new Date(Date.now() + 3600000).toISOString() })
                }
                disabled={busy}
              >
                Agendar +1h
              </button>
            </>
          )}
          {state === "published" && (
            <a href={"/cms/conteudo/" + slug} target="_blank" rel="noreferrer">
              Abrir projeção publicada
            </a>
          )}
        </aside>
      </div>
      {loaded && (
        <section className="admin-history">
          <h2>Histórico imutável</h2>
          {loaded.cms_content_revisions.length === 0 ? (
            <p>Nenhuma revisão congelada.</p>
          ) : (
            loaded.cms_content_revisions
              .sort((a, b) => b.revision_number - a.revision_number)
              .map((revision, index) => (
                <details key={revision.id}>
                  <summary>
                    Revisão {revision.revision_number} — {revision.reason}
                  </summary>
                  <pre>{JSON.stringify(revision.payload, null, 2)}</pre>
                  <button onClick={() => void preview(revision.id)}>Preview desta revisão</button>
                  {state === "published" && index > 0 && can("cms:posts.publish") && (
                    <button onClick={() => void run("restore", { revisionId: revision.id })}>
                      Restaurar como nova revisão
                    </button>
                  )}
                </details>
              ))
          )}
        </section>
      )}
      <p className="admin-help">
        Sessão: {user?.email}. As ações disponíveis refletem permissões reais resolvidas no servidor.
      </p>
    </section>
  );
}
