import { useEffect, useState, type FormEvent } from "react";
import {
  CatalogWorkspaceCommandSchema,
  catalogProductDiff,
  type CatalogWorkspace,
  type CatalogWorkspaceCommand,
  type CatalogWorkspaceProduct,
  type CatalogWorkspaceTerm,
} from "@/shared/contracts/catalog-workspace";
import { CatalogCompositionUnitSchema, CatalogRelationKindSchema } from "@/shared/contracts/catalog-release";
import {
  CatalogWorkspaceError,
  executeCatalogWorkspaceCommand,
  readCatalogWorkspace,
  readCatalogProductHistory,
  type CatalogConflictDetail,
} from "../api/catalog-workspace-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment } from "../ev2-runtime";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { CatalogEditorialWorkspace } from "../components/CatalogEditorialWorkspace";
import { CatalogConflictNotice } from "../components/CatalogConflictNotice";
import "../catalog-workspace.css";

const kinds = { product: "Produto", kit: "Kit", model: "Modelo", variant: "Variante" } as const;
const termKinds = {
  category: "Categoria / Família",
  family: "Família",
  technology: "Tecnologia",
  industry: "Indústria",
  application: "Aplicação",
} as const;
const states = { draft: "Rascunho", ready: "Pronto", published: "Publicado" } as const;
const relations = {
  contains: "Contém",
  required_component: "Componente obrigatório",
  optional_component: "Componente opcional",
  accessory: "Acessório",
  compatible: "Compatível",
  alternative: "Alternativa",
  substitutes: "Substitui",
  successor: "Sucessor",
  local_exclusion: "Supressão local",
} as const;
const blankProduct = (): CatalogWorkspaceProduct => ({
  id: crypto.randomUUID(),
  revision: 1,
  slug: "",
  title: "",
  content: { summary: "", description: "" },
  catalog_entity_kind: "product",
  catalog_lifecycle_state: "active",
  publication_state: "draft",
  published_revision: null,
  primary_term_id: null,
  complementary_term_ids: [],
});
const blankTerm = (): CatalogWorkspaceTerm => ({
  id: crypto.randomUUID(),
  revision: 1,
  slug: "",
  title: "",
  term_type: "category",
  status: "draft",
  parent_id: null,
  replacement_id: null,
});

export default function AdminCatalogWorkspacePage() {
  const { session, profile } = useAdminAuth();
  const [workspace, setWorkspace] = useState<CatalogWorkspace | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"products" | "terms" | "relations" | "editorial">("products");
  const [draft, setDraft] = useState<CatalogWorkspaceProduct>(blankProduct);
  const [base, setBase] = useState<CatalogWorkspaceProduct | null>(null);
  const [conflict, setConflict] = useState<CatalogWorkspaceProduct | null>(null);
  const [conflictDetail, setConflictDetail] = useState<CatalogConflictDetail | null>(null);
  const [otherConflict, setOtherConflict] = useState<{
    base: unknown;
    attempted: unknown;
    current: unknown;
    entity: "term" | "relation" | "hierarchy";
  } | null>(null);
  const [term, setTerm] = useState<CatalogWorkspaceTerm>(blankTerm);
  const [termExisting, setTermExisting] = useState(false);
  const [reason, setReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [sourceRevision, setSourceRevision] = useState(1);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof readCatalogProductHistory>>>([]);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [editorialDirty, setEditorialDirty] = useState(false);
  const [relationKind, setRelationKind] =
    useState<(typeof CatalogRelationKindSchema.options)[number]>("accessory");
  const [sourceId, setSourceId] = useState(""),
    [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState(1),
    [unit, setUnit] = useState<(typeof CatalogCompositionUnitSchema.options)[number]>("un");
  const canRead =
    profile?.permissions.includes("cms:catalog.read") === true && cmsEnvironment() !== "production";
  const sessionIdentity = session?.user.id;
  useEffect(() => {
    let cancelled = false;
    if (!canRead || !sessionIdentity) {
      setBusy(false);
      setWorkspace(null);
      return;
    }
    setBusy(true);
    readCatalogWorkspace()
      .then((value) => {
        if (!cancelled) setWorkspace(value);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível consultar o catálogo.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, sessionIdentity]);
  const edit = workspace?.enabled && workspace.permissions.edit;
  const administer = workspace?.enabled && workspace.permissions.administer;
  const productDirty = base
    ? JSON.stringify(base) !== JSON.stringify(draft)
    : Boolean(draft.title || draft.slug || draft.content.summary || draft.content.description);
  const savedTerm = workspace?.terms.find((item) => item.id === term.id);
  const termDirty = savedTerm
    ? JSON.stringify(savedTerm) !== JSON.stringify(term)
    : Boolean(term.title || term.slug);
  const dirty = Boolean(workspace?.enabled && (productDirty || termDirty || editorialDirty));

  async function run(command: CatalogWorkspaceCommand, after?: (value: CatalogWorkspace) => void) {
    if (busy || unknownOutcome || otherConflict) return;
    const parsed = CatalogWorkspaceCommandSchema.safeParse(command);
    if (!parsed.success) {
      setError("Preencha os campos obrigatórios e uma justificativa para esta ação.");
      return;
    }
    setBusy(true);
    setError("");
    setConflictDetail(null);
    setNotice("");
    let committed = false;
    try {
      await executeCatalogWorkspaceCommand(parsed.data);
      committed = true;
      const value = await readCatalogWorkspace();
      setWorkspace(value);
      setNotice("Alteração concluída e registrada no histórico.");
      setConflict(null);
      after?.(value);
    } catch (caught) {
      setError(
        committed
          ? "A alteração foi gravada, mas a consulta falhou. Recarregue antes de executar outra operação."
          : caught instanceof CatalogWorkspaceError
            ? caught.message
            : "Não foi possível confirmar a operação. Recarregue e confira o histórico antes de tentar novamente.",
      );
      if (committed || !(caught instanceof CatalogWorkspaceError) || caught.status === 503)
        setUnknownOutcome(true);
      if (caught instanceof CatalogWorkspaceError && caught.status === 409) {
        setConflictDetail(caught.conflict);
        try {
          const value = await readCatalogWorkspace();
          setWorkspace(value);
          if (command.action.endsWith("product"))
            setConflict(value.products.find((item) => item.id === draft.id) ?? null);
          else if (command.action.endsWith("term"))
            setOtherConflict({
              entity: "term",
              base: workspace?.terms.find((item) => item.id === command.id),
              attempted: command,
              current: value.terms.find((item) => item.id === command.id),
            });
          else if (command.action === "save_relation")
            setOtherConflict({
              entity: "relation",
              base: workspace?.relations.find((item) => item.relation_key === command.id),
              attempted: command,
              current: value.relations.find((item) => item.relation_key === command.id),
            });
          else if (command.action === "save_hierarchy")
            setOtherConflict({
              entity: "hierarchy",
              base: workspace?.hierarchy.find((item) => item.hierarchy_key === command.id),
              attempted: command,
              current: value.hierarchy.find((item) => item.hierarchy_key === command.id),
            });
        } catch {
          /* The attempted form remains intact when the comparison cannot be fetched. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const productFields = {
    slug: draft.slug,
    title: draft.title,
    content: draft.content,
    entityKind: draft.catalog_entity_kind,
    primaryTermId: draft.primary_term_id,
    complementaryTermIds: draft.complementary_term_ids,
  };
  function selectProduct(item: CatalogWorkspaceProduct) {
    setDraft(item);
    setBase(item);
    setConflict(null);
    setHistory([]);
    setError("");
  }
  function refreshSelected(value: CatalogWorkspace) {
    const next = value.products.find((item) => item.id === draft.id);
    if (next) {
      setDraft(next);
      setBase(next);
    }
  }
  function saveProduct(event: FormEvent) {
    event.preventDefault();
    void run(
      base
        ? { action: "update_product", id: draft.id, expectedVersion: base.revision, ...productFields }
        : { action: "create_product", id: draft.id, ...productFields },
      refreshSelected,
    );
  }
  const primaryTerms =
    workspace?.terms.filter(
      (item) => item.status === "active" && ["category", "family"].includes(item.term_type),
    ) ?? [];
  const complementaryTerms =
    workspace?.terms.filter(
      (item) => item.status === "active" && !["category", "family"].includes(item.term_type),
    ) ?? [];
  const termImpact =
    workspace?.products.filter(
      (item) => item.primary_term_id === term.id || item.complementary_term_ids.includes(term.id),
    ).length ?? 0;
  const composing = ["contains", "required_component", "optional_component"].includes(relationKind);

  return (
    <section className="catalog-workspace">
      <UnsavedChangesGuard dirty={dirty} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">CADASTRO MANUAL</p>
          <h1>Núcleo de Catálogo</h1>
          <p>Produtos, classificação, revisões e relações para solicitação de orçamento.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="admin-notice--error">
          {error}
        </p>
      )}
      {error && <CatalogConflictNotice detail={conflictDetail} />}
      {notice && (
        <p role="status" className="admin-notice--success">
          {notice}
        </p>
      )}
      {otherConflict && (
        <section aria-label="Comparação do conflito">
          <h2>Revise a alteração concorrente</h2>
          <dl>
            <dt>Base</dt>
            <dd>
              <pre>{JSON.stringify(otherConflict.base ?? null, null, 2)}</pre>
            </dd>
            <dt>Sua tentativa</dt>
            <dd>
              <pre>{JSON.stringify(otherConflict.attempted, null, 2)}</pre>
            </dd>
            <dt>Versão atual</dt>
            <dd>
              <pre>{JSON.stringify(otherConflict.current ?? null, null, 2)}</pre>
            </dd>
          </dl>
          <button
            type="button"
            onClick={() => {
              if (otherConflict.entity === "term") {
                const latest = workspace?.terms.find((item) => item.id === term.id);
                if (latest) {
                  setTerm({ ...term, revision: latest.revision });
                  setTermExisting(true);
                }
              }
              setOtherConflict(null);
            }}
          >
            Revisei o conflito; manter tentativa para edição
          </button>
        </section>
      )}
      {busy && <p role="status">Consultando o catálogo…</p>}
      {unknownOutcome && (
        <p role="alert">
          Operações bloqueadas até recarregar a página e conferir a revisão. Não repita o comando às cegas.
        </p>
      )}
      {!canRead ? (
        <p>Este catálogo não está disponível para sua sessão neste ambiente.</p>
      ) : workspace && !workspace.enabled ? (
        <p role="status">
          O novo catálogo está em preparação. A leitura pública permanece no catálogo atual.
        </p>
      ) : (
        workspace?.enabled && (
          <>
            <nav aria-label="Seções do Núcleo de Catálogo">
              {(["products", "terms", "relations", "editorial"] as const).map((id) => (
                <button
                  type="button"
                  key={id}
                  disabled={dirty && tab !== id}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {
                    {
                      products: "Produtos e revisões",
                      terms: "Classificação e termos",
                      relations: "Kits e relações",
                      editorial: "Páginas editoriais",
                    }[id]
                  }
                </button>
              ))}
            </nav>
            {tab === "editorial" && (
              <CatalogEditorialWorkspace workspace={workspace} onDirtyChange={setEditorialDirty} />
            )}
            {dirty && tab !== "editorial" && (
              <button
                type="button"
                onClick={() => {
                  if (tab === "products") {
                    setDraft(base ?? blankProduct());
                    setConflict(null);
                  }
                  if (tab === "terms") setTerm(savedTerm ?? blankTerm());
                }}
              >
                Descartar alterações não salvas
              </button>
            )}
            {tab === "products" && (
              <div className="catalog-workspace-grid">
                <aside aria-label="Produtos cadastrados">
                  {edit && (
                    <button
                      type="button"
                      disabled={busy || productDirty}
                      onClick={() => {
                        setDraft(blankProduct());
                        setBase(null);
                        setConflict(null);
                      }}
                    >
                      Novo produto
                    </button>
                  )}
                  {workspace.products.length === 0 && <p>Nenhum produto cadastrado.</p>}
                  <ul>
                    {workspace.products.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={busy || productDirty}
                          onClick={() => selectProduct(item)}
                        >
                          {item.title} · {states[item.publication_state]}
                          {item.catalog_lifecycle_state === "archived" ? " · Arquivado" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
                <div>
                  <form onSubmit={saveProduct}>
                    <fieldset disabled={busy || !edit || draft.catalog_lifecycle_state === "archived"}>
                      <legend>{base ? `Editar produto · revisão ${base.revision}` : "Novo produto"}</legend>
                      <label>
                        Nome
                        <input
                          required
                          maxLength={240}
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        />
                      </label>
                      <label>
                        Slug
                        <input
                          required
                          maxLength={160}
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          value={draft.slug}
                          onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                        />
                      </label>
                      <label>
                        Tipo
                        <select
                          value={draft.catalog_entity_kind}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              catalog_entity_kind: e.target
                                .value as CatalogWorkspaceProduct["catalog_entity_kind"],
                            })
                          }
                        >
                          {Object.entries(kinds).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Categoria / Família principal
                        <select
                          value={draft.primary_term_id ?? ""}
                          onChange={(e) => setDraft({ ...draft, primary_term_id: e.target.value || null })}
                        >
                          <option value="">Selecionar antes da publicação</option>
                          {primaryTerms.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset>
                        <legend>Classificações complementares</legend>
                        {complementaryTerms.map((item) => (
                          <label key={item.id}>
                            <input
                              type="checkbox"
                              checked={draft.complementary_term_ids.includes(item.id)}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  complementary_term_ids: e.target.checked
                                    ? [...draft.complementary_term_ids, item.id]
                                    : draft.complementary_term_ids.filter((id) => id !== item.id),
                                })
                              }
                            />
                            {termKinds[item.term_type]}: {item.title}
                          </label>
                        ))}
                      </fieldset>
                      <label>
                        Resumo
                        <textarea
                          maxLength={600}
                          value={draft.content.summary}
                          onChange={(e) =>
                            setDraft({ ...draft, content: { ...draft.content, summary: e.target.value } })
                          }
                        />
                      </label>
                      <label>
                        Descrição
                        <textarea
                          rows={8}
                          maxLength={20000}
                          value={draft.content.description}
                          onChange={(e) =>
                            setDraft({ ...draft, content: { ...draft.content, description: e.target.value } })
                          }
                        />
                      </label>
                      <button type="submit" disabled={conflict !== null}>
                        Salvar rascunho
                      </button>
                    </fieldset>
                  </form>
                  {base && (
                    <p>
                      {base.published_revision
                        ? `A revisão pública ${base.published_revision} permanece independente deste rascunho.`
                        : "Este produto ainda não tem snapshot público."}
                    </p>
                  )}
                  {conflict && base && (
                    <section aria-label="Comparação de versões">
                      <h2>Uma revisão mais recente foi encontrada</h2>
                      <div className="catalog-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Campo</th>
                              <th>Base</th>
                              <th>Sua edição</th>
                              <th>Versão atual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogProductDiff(base, draft, conflict).map((row) => (
                              <tr key={row.field}>
                                <th>{row.field}</th>
                                <td>{JSON.stringify(row.base)}</td>
                                <td>{JSON.stringify(row.attempted)}</td>
                                <td>{JSON.stringify(row.current)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button type="button" onClick={() => selectProduct(conflict)}>
                        Descartar edição e carregar atual
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBase(conflict);
                          setConflict(null);
                        }}
                      >
                        Manter edição para reaplicar e revisar
                      </button>
                    </section>
                  )}
                  {base && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void readCatalogProductHistory(base.id)
                          .then(setHistory)
                          .catch(() => setError("Não foi possível carregar o histórico."))
                      }
                    >
                      Consultar histórico imutável
                    </button>
                  )}
                  {history.length > 0 && (
                    <ol aria-label="Histórico do produto">
                      {history.map((item) => (
                        <li key={item.revision}>
                          Revisão {item.revision} · {item.state?.title ?? "Revisão anterior à integração"} ·{" "}
                          {item.state?.publication_state ?? "legado"}
                          {item.state && (
                            <button type="button" onClick={() => setSourceRevision(item.revision)}>
                              Selecionar revisão {item.revision} para restaurar
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {base && (
                    <fieldset disabled={busy || (productDirty && !conflict) || unknownOutcome}>
                      <legend>Revisão e ciclo de vida</legend>
                      <label>
                        Justificativa
                        <input
                          minLength={3}
                          maxLength={240}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      {edit &&
                        base.publication_state === "draft" &&
                        base.catalog_lifecycle_state === "active" && (
                          <button
                            type="button"
                            onClick={() =>
                              void run(
                                {
                                  action: "submit_product",
                                  id: base.id,
                                  expectedVersion: base.revision,
                                  reason,
                                },
                                refreshSelected,
                              )
                            }
                          >
                            Marcar como pronto
                          </button>
                        )}
                      {administer && (
                        <>
                          {base.publication_state === "ready" && (
                            <button
                              type="button"
                              onClick={() =>
                                void run(
                                  {
                                    action: "publish_product",
                                    id: base.id,
                                    expectedVersion: base.revision,
                                    reason,
                                  },
                                  refreshSelected,
                                )
                              }
                            >
                              Publicar revisão
                            </button>
                          )}
                          {base.published_revision && (
                            <button
                              type="button"
                              onClick={() =>
                                void run(
                                  {
                                    action: "unpublish_product",
                                    id: base.id,
                                    expectedVersion: base.revision,
                                    reason,
                                  },
                                  refreshSelected,
                                )
                              }
                            >
                              Despublicar
                            </button>
                          )}
                          {base.catalog_lifecycle_state === "active" && (
                            <button
                              type="button"
                              onClick={() =>
                                void run(
                                  {
                                    action: "archive_product",
                                    id: base.id,
                                    expectedVersion: base.revision,
                                    reason,
                                  },
                                  refreshSelected,
                                )
                              }
                            >
                              Arquivar
                            </button>
                          )}
                          <label>
                            Revisão para restaurar como rascunho
                            <input
                              type="number"
                              min={1}
                              max={base.revision}
                              value={sourceRevision}
                              onChange={(e) => setSourceRevision(Number(e.target.value))}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              void run(
                                {
                                  action: "restore_product",
                                  id: base.id,
                                  expectedVersion: base.revision,
                                  sourceRevision,
                                  reason,
                                },
                                refreshSelected,
                              )
                            }
                          >
                            Restaurar rascunho
                          </button>
                          {conflict && (
                            <button
                              type="button"
                              onClick={() =>
                                void run(
                                  {
                                    action: "override_product",
                                    id: base.id,
                                    expectedVersion: conflict.revision,
                                    ...productFields,
                                    reason,
                                  },
                                  refreshSelected,
                                )
                              }
                            >
                              Aplicar sobrescrita administrativa justificada
                            </button>
                          )}
                        </>
                      )}
                    </fieldset>
                  )}
                </div>
              </div>
            )}
            {tab === "terms" && (
              <div className="catalog-workspace-grid">
                <aside aria-label="Termos cadastrados">
                  <button
                    type="button"
                    disabled={!edit || busy || termDirty}
                    onClick={() => {
                      setTerm(blankTerm());
                      setTermExisting(false);
                    }}
                  >
                    Propor termo
                  </button>
                  <ul>
                    {workspace.terms.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={busy || termDirty}
                          onClick={() => {
                            setTerm(item);
                            setTermExisting(true);
                            setReplacementId("");
                          }}
                        >
                          {item.title} · {termKinds[item.term_type]} · {item.status}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
                <div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fields = {
                        title: term.title,
                        slug: term.slug,
                        termType: term.term_type,
                        parentId: term.parent_id,
                      };
                      void run(
                        termExisting
                          ? {
                              action: "update_term",
                              id: term.id,
                              expectedVersion: term.revision,
                              ...fields,
                              reason,
                            }
                          : { action: "create_term", id: term.id, ...fields },
                        (value) => {
                          const saved = value.terms.find((item) => item.id === term.id);
                          if (saved) {
                            setTerm(saved);
                            setTermExisting(true);
                          }
                        },
                      );
                    }}
                  >
                    <fieldset disabled={busy || (termExisting ? !administer : !edit)}>
                      <legend>{termExisting ? "Editar termo" : "Propor termo"}</legend>
                      <label>
                        Nome do termo
                        <input
                          required
                          maxLength={160}
                          value={term.title}
                          onChange={(e) => setTerm({ ...term, title: e.target.value })}
                        />
                      </label>
                      <label>
                        Slug do termo
                        <input
                          required
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          value={term.slug}
                          onChange={(e) => setTerm({ ...term, slug: e.target.value })}
                        />
                      </label>
                      <label>
                        Taxonomia
                        <select
                          disabled={termExisting}
                          value={term.term_type}
                          onChange={(e) =>
                            setTerm({
                              ...term,
                              term_type: e.target.value as CatalogWorkspaceTerm["term_type"],
                            })
                          }
                        >
                          {Object.entries(termKinds).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Termo pai
                        <select
                          value={term.parent_id ?? ""}
                          onChange={(e) => setTerm({ ...term, parent_id: e.target.value || null })}
                        >
                          <option value="">Sem pai</option>
                          {workspace.terms
                            .filter((item) => item.id !== term.id && item.status === "active")
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Justificativa da alteração
                        <input maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)} />
                      </label>
                      <button type="submit">{termExisting ? "Salvar termo" : "Enviar proposta"}</button>
                    </fieldset>
                  </form>
                  {termExisting && administer && (
                    <fieldset disabled={busy || termDirty}>
                      <legend>Gestão do termo</legend>
                      <p>
                        Impacto: {termImpact} produto(s). Cada produto afetado receberá nova revisão;
                        snapshots existentes são preservados. Se houver página editorial, registre antes sua
                        retirada ou redirecionamento.
                      </p>
                      <label>
                        Substituto ativo
                        <select value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
                          <option value="">Nenhum</option>
                          {workspace.terms
                            .filter(
                              (item) =>
                                item.id !== term.id &&
                                item.term_type === term.term_type &&
                                item.status === "active",
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      {(["activate_term", "deactivate_term", "merge_term"] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => {
                            const common = { id: term.id, expectedVersion: term.revision, reason };
                            void run(
                              action === "activate_term"
                                ? { action, ...common }
                                : {
                                    action,
                                    ...common,
                                    replacementId: replacementId || null,
                                    replacementVersion:
                                      workspace.terms.find((item) => item.id === replacementId)?.revision ??
                                      null,
                                  },
                              (value) => {
                                const updated = value.terms.find((item) => item.id === term.id);
                                if (updated) setTerm(updated);
                              },
                            );
                          }}
                        >
                          {
                            { activate_term: "Ativar", deactivate_term: "Inativar", merge_term: "Mesclar" }[
                              action
                            ]
                          }
                        </button>
                      ))}
                    </fieldset>
                  )}
                </div>
              </div>
            )}
            {tab === "relations" && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const symmetric = ["accessory", "compatible", "alternative"].includes(relationKind);
                    const [sourceProductId, targetProductId] = symmetric
                      ? [sourceId, targetId].sort()
                      : [sourceId, targetId];
                    void run({
                      action: "save_relation",
                      id: crypto.randomUUID(),
                      expectedVersion: 0,
                      sourceProductId,
                      targetProductId,
                      relationKind,
                      quantity: composing ? quantity : null,
                      unitCode: composing ? unit : null,
                      status: "active",
                      reason,
                    });
                  }}
                >
                  <fieldset disabled={busy || !edit}>
                    <legend>Nova relação ou composição</legend>
                    <label>
                      Origem
                      <select required value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                        <option value="">Selecionar</option>
                        {workspace.products.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Destino
                      <select required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">Selecionar</option>
                        {workspace.products
                          .filter((item) => item.id !== sourceId)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Relação
                      <select
                        value={relationKind}
                        onChange={(e) => setRelationKind(e.target.value as typeof relationKind)}
                      >
                        {Object.entries(relations).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {composing && (
                      <>
                        <label>
                          Quantidade
                          <input
                            required
                            type="number"
                            min="0.000001"
                            step="any"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Unidade
                          <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                            {CatalogCompositionUnitSchema.options.map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Motivo
                      <input
                        required
                        minLength={3}
                        maxLength={240}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button type="submit">Registrar relação</button>
                    <button
                      type="button"
                      onClick={() => {
                        const child = workspace.products.find((item) => item.id === sourceId);
                        void run({
                          action: "save_hierarchy",
                          id: crypto.randomUUID(),
                          expectedVersion: 0,
                          childProductId: sourceId,
                          parentProductId: targetId,
                          hierarchyKind:
                            child?.catalog_entity_kind === "variant" ? "variant_model" : "model_product",
                          status: "active",
                          reason,
                        });
                      }}
                    >
                      Definir herança da origem para o destino
                    </button>
                  </fieldset>
                </form>
                <h2>Relações registradas</h2>
                <ul>
                  {workspace.relations.map((item) => (
                    <li key={item.relation_key}>
                      {workspace.products.find((product) => product.id === item.source_product_id)?.title} →{" "}
                      {relations[item.relation_kind]} →{" "}
                      {workspace.products.find((product) => product.id === item.target_product_id)?.title}
                      {item.quantity !== null && ` · ${item.quantity} ${item.unit_code}`} · revisão{" "}
                      {item.revision} · {item.status}
                      {edit && item.status === "active" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run({
                              action: "save_relation",
                              id: item.relation_key,
                              expectedVersion: item.revision,
                              sourceProductId: item.source_product_id,
                              targetProductId: item.target_product_id,
                              relationKind: item.relation_kind,
                              quantity: item.quantity,
                              unitCode: item.unit_code,
                              status: "retracted",
                              reason,
                            })
                          }
                        >
                          Retirar por nova revisão
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <h2>Herança</h2>
                <ul>
                  {workspace.hierarchy.map((item) => (
                    <li key={item.hierarchy_key}>
                      {workspace.products.find((product) => product.id === item.child_product_id)?.title} →{" "}
                      {workspace.products.find((product) => product.id === item.parent_product_id)?.title} ·{" "}
                      {item.status}
                      {edit && item.status === "active" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run({
                              action: "save_hierarchy",
                              id: item.hierarchy_key,
                              expectedVersion: item.revision,
                              childProductId: item.child_product_id,
                              parentProductId: item.parent_product_id,
                              hierarchyKind: item.hierarchy_kind as "variant_model" | "model_product",
                              status: "retracted",
                              reason,
                            })
                          }
                        >
                          Retirar herança por nova revisão
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <h2>Relações efetivas e origem</h2>
                <ul>
                  {workspace.effectiveRelations.map((item) => (
                    <li key={`${item.subject_product_id}:${item.target_product_id}:${item.relation_kind}`}>
                      {workspace.products.find((product) => product.id === item.subject_product_id)?.title} →{" "}
                      {relations[item.relation_kind]} →{" "}
                      {workspace.products.find((product) => product.id === item.target_product_id)?.title}
                      {item.is_local_exclusion
                        ? " · suprimida"
                        : item.relation_origin_level === 0
                          ? " · direta"
                          : ` · herdada de ${workspace.products.find((product) => product.id === item.relation_origin_product_id)?.title ?? "origem"}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
