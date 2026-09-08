import { useCallback, useEffect, useMemo, useState } from "react";
import { controlledVocabularyCommand, type ControlledVocabularyList } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { ProductModuleTabs } from "../components/AdminModuleTabs";
import { operatorErrorMessage } from "../operator-error-message";
import { urlSegmentFromText } from "../url-segment";

type ListDraft = {
  id?: string;
  lockVersion?: number;
  listKey: string;
  entityType: string;
  dimensionKey: string;
  label: string;
  description: string;
  publicVisible: boolean;
  active: boolean;
  sortOrder: number;
};
type OptionDraft = {
  id?: string;
  lockVersion?: number;
  listId: string;
  slug: string;
  label: string;
  description: string;
  publicVisible: boolean;
  active: boolean;
  sortOrder: number;
};

const emptyList: ListDraft = {
  listKey: "",
  entityType: "product",
  dimensionKey: "",
  label: "",
  description: "",
  publicVisible: true,
  active: true,
  sortOrder: 0,
};
const emptyOption: OptionDraft = {
  listId: "",
  slug: "",
  label: "",
  description: "",
  publicVisible: true,
  active: true,
  sortOrder: 0,
};

const entityLabels: Record<string, string> = {
  product: "Produtos",
  service: "Serviços",
  industry: "Indústrias",
  application: "Aplicações",
  solution: "Soluções",
  page: "Páginas",
  campaign: "Campanhas",
};

function generatedOptionSlug(label: string) {
  return urlSegmentFromText(label, 120) || "opcao";
}

function semanticListPayload(draft: ListDraft): ListDraft {
  if (draft.id) return draft;
  const dimensionKey = urlSegmentFromText(draft.label, 79) || "classificacao";
  return {
    ...draft,
    listKey: `${draft.entityType}.${dimensionKey}`,
    dimensionKey,
  };
}

export default function AdminControlledVocabulariesPage() {
  const { session, profile } = useAdminAuth();
  const [lists, setLists] = useState<ControlledVocabularyList[]>([]),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [listDraft, setListDraft] = useState(emptyList),
    [optionDraft, setOptionDraft] = useState(emptyOption);
  const canManage = profile?.permissions.includes("cms:vocabularies.manage") ?? false;
  const reload = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await controlledVocabularyCommand<{ items: ControlledVocabularyList[] }>(session, {
        action: "list",
        includeInactive: true,
      });
      setLists(result.items);
      setSelected((current) => current || result.items[0]?.id || "");
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "As listas mestras estão indisponíveis." }));
    } finally {
      setBusy(false);
    }
  }, [session]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const current = lists.find((list) => list.id === selected);
  const options = useMemo(
    () =>
      (current?.options ?? []).filter(
        (option) => !query || `${option.label} ${option.slug}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [current, query],
  );
  async function command(body: Record<string, unknown>) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await controlledVocabularyCommand<{ correlationId: string; usageCount?: number }>(
        session,
        body,
      );
      setSuccess(
        `Alteração concluída e registrada na auditoria.${
          typeof result.usageCount === "number"
            ? ` A opção permanece referenciada por ${result.usageCount} conteúdo(s).`
            : ""
        }`,
      );
      setListDraft(emptyList);
      setOptionDraft({ ...emptyOption, listId: selected });
      await reload();
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível concluir a alteração." }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">PADRÕES DO CATÁLOGO</p>
          <h1>Listas mestras</h1>
          <p className="admin-help">
            Classificações cadastráveis, ordenadas e auditadas. Opções utilizadas nunca são excluídas; podem
            ser inativadas.
          </p>
        </div>
      </div>
      <ProductModuleTabs />
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
      <div className="admin-master-layout">
        <aside className="admin-master-sidebar" aria-label="Listas cadastradas">
          {lists.map((list) => (
            <button
              key={list.id}
              className={selected === list.id ? "is-active" : ""}
              onClick={() => {
                setSelected(list.id);
                setOptionDraft({ ...emptyOption, listId: list.id });
              }}
            >
              <strong>{list.label}</strong>
              <span>
                {entityLabels[list.entity_type] ?? "Outros cadastros"} · {list.options.length} opções
              </span>
            </button>
          ))}
          {!lists.length && !busy && <p>Nenhuma lista cadastrada.</p>}
        </aside>
        <div className="admin-master-content">
          {current ? (
            <>
              <div className="admin-editor-card">
                <div>
                  <h2>{current.label}</h2>
                  <p>{current.description || "Sem descrição operacional."}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() =>
                      setListDraft({
                        id: current.id,
                        lockVersion: current.lock_version,
                        listKey: current.list_key,
                        entityType: current.entity_type,
                        dimensionKey: current.dimension_key,
                        label: current.label,
                        description: current.description,
                        publicVisible: current.public_visible,
                        active: current.active,
                        sortOrder: current.sort_order,
                      })
                    }
                  >
                    Editar lista abaixo
                  </button>
                )}
                <label>
                  Buscar opção
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Rótulo</th>
                      <th>Visibilidade</th>
                      <th>Situação</th>
                      {canManage && <th>Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => (
                      <tr key={option.id}>
                        <td>{option.sort_order}</td>
                        <td>{option.label}</td>
                        <td>{option.public_visible ? "Pública" : "Interna"}</td>
                        <td>
                          <span
                            className={`admin-status admin-status--${option.active ? "active" : "archived"}`}
                          >
                            {option.active ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        {canManage && (
                          <td>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setOptionDraft({
                                  id: option.id,
                                  lockVersion: option.lock_version,
                                  listId: current.id,
                                  slug: option.slug,
                                  label: option.label,
                                  description: option.description,
                                  publicVisible: option.public_visible,
                                  active: option.active,
                                  sortOrder: option.sort_order,
                                })
                              }
                            >
                              Editar
                            </button>{" "}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  option.active &&
                                  !window.confirm(
                                    "Inativar esta opção? Conteúdos existentes conservarão a referência, mas novos cadastros não poderão selecioná-la.",
                                  )
                                )
                                  return;
                                void command({
                                  action: "set_option_active",
                                  option: {
                                    id: option.id,
                                    active: !option.active,
                                    lockVersion: option.lock_version,
                                  },
                                });
                              }}
                            >
                              {option.active ? "Inativar" : "Ativar"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canManage && (
                <form
                  className="admin-editor-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command({
                      action: "upsert_option",
                      option: {
                        ...optionDraft,
                        listId: current.id,
                        slug: optionDraft.slug || generatedOptionSlug(optionDraft.label),
                      },
                    });
                  }}
                >
                  <h2>Adicionar ou atualizar opção</h2>
                  {optionDraft.id && <p className="admin-help">Editando “{optionDraft.label}”.</p>}
                  <div className="admin-form-grid">
                    <label>
                      Rótulo
                      <input
                        required
                        maxLength={160}
                        value={optionDraft.label}
                        onChange={(event) => {
                          const label = event.target.value;
                          setOptionDraft({
                            ...optionDraft,
                            label,
                            slug: optionDraft.id ? optionDraft.slug : generatedOptionSlug(label),
                          });
                        }}
                      />
                    </label>
                    <label>
                      Descrição opcional
                      <textarea
                        maxLength={500}
                        value={optionDraft.description}
                        onChange={(event) =>
                          setOptionDraft({ ...optionDraft, description: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Ordem
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={optionDraft.sortOrder}
                        onChange={(event) =>
                          setOptionDraft({ ...optionDraft, sortOrder: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={optionDraft.publicVisible}
                        onChange={(event) =>
                          setOptionDraft({ ...optionDraft, publicVisible: event.target.checked })
                        }
                      />
                      Rótulo pode ser público
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={optionDraft.active}
                        onChange={(event) => setOptionDraft({ ...optionDraft, active: event.target.checked })}
                      />
                      Opção ativa para novos cadastros
                    </label>
                  </div>
                  <button type="submit" className="admin-button" disabled={busy}>
                    Salvar opção
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="admin-state">
              <h2>Selecione uma lista</h2>
            </div>
          )}
          {canManage && (
            <section className="admin-editor-card" aria-labelledby="master-list-editor-title">
              <h2 id="master-list-editor-title">
                {listDraft.id ? "Editar lista mestra" : "Criar lista mestra"}
              </h2>
              <p className="admin-help">
                Escolha a área e dê um nome claro. As referências necessárias para integração são criadas
                automaticamente e preservadas nas edições.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void command({ action: "upsert_list", list: semanticListPayload(listDraft) });
                }}
              >
                <div className="admin-form-grid">
                  <label>
                    Área de uso
                    <select
                      disabled={Boolean(listDraft.id)}
                      value={listDraft.entityType}
                      onChange={(event) => setListDraft({ ...listDraft, entityType: event.target.value })}
                    >
                      {Object.entries(entityLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nome operacional
                    <input
                      required
                      maxLength={120}
                      value={listDraft.label}
                      onChange={(event) => setListDraft({ ...listDraft, label: event.target.value })}
                    />
                  </label>
                  <label>
                    Descrição opcional
                    <textarea
                      maxLength={500}
                      value={listDraft.description}
                      onChange={(event) => setListDraft({ ...listDraft, description: event.target.value })}
                    />
                  </label>
                  <label>
                    Ordem
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={listDraft.sortOrder}
                      onChange={(event) =>
                        setListDraft({ ...listDraft, sortOrder: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={listDraft.publicVisible}
                      onChange={(event) =>
                        setListDraft({ ...listDraft, publicVisible: event.target.checked })
                      }
                    />
                    Lista pode projetar rótulos públicos
                  </label>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={listDraft.active}
                      onChange={(event) => setListDraft({ ...listDraft, active: event.target.checked })}
                    />
                    Lista ativa
                  </label>
                </div>
                <button type="submit" className="admin-button" disabled={busy}>
                  {listDraft.id ? "Salvar lista" : "Criar lista"}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
