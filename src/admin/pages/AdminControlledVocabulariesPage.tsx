import { useCallback, useEffect, useMemo, useState } from "react";
import { controlledVocabularyCommand, type ControlledVocabularyList } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";

type ListDraft = {
  id?: string;
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
      setError(caught instanceof Error ? caught.message : "Listas mestras indisponíveis.");
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
        `Alteração auditada. Código ${result.correlationId.slice(0, 8)}.${
          typeof result.usageCount === "number"
            ? ` A opção permanece referenciada por ${result.usageCount} conteúdo(s).`
            : ""
        }`,
      );
      setListDraft(emptyList);
      setOptionDraft({ ...emptyOption, listId: selected });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Alteração não concluída.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">GOVERNANÇA DO CATÁLOGO</p>
          <h1>Listas mestras</h1>
          <p className="admin-help">
            Classificações cadastráveis, ordenadas e auditadas. Opções utilizadas nunca são excluídas; podem
            ser inativadas.
          </p>
        </div>
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
      <div className="admin-master-layout">
        <aside className="admin-master-sidebar" aria-label="Dimensões cadastradas">
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
                {list.entity_type} · {list.options.length} opções
              </span>
            </button>
          ))}
          {!lists.length && !busy && <p>Nenhuma dimensão cadastrada.</p>}
        </aside>
        <div className="admin-master-content">
          {current ? (
            <>
              <div className="admin-editor-card">
                <div>
                  <h2>{current.label}</h2>
                  <p>{current.description || current.list_key}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() =>
                      setListDraft({
                        id: current.id,
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
                    Editar dimensão abaixo
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
                      <th>Identificador</th>
                      <th>Visibilidade</th>
                      <th>Estado</th>
                      {canManage && <th>Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => (
                      <tr key={option.id}>
                        <td>{option.sort_order}</td>
                        <td>{option.label}</td>
                        <td>
                          <code title="UUID usado na planilha de cadastro em massa">{option.id}</code>
                          <small>{option.slug}</small>
                        </td>
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
                                  option: { id: option.id, active: !option.active },
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
                    void command({ action: "upsert_option", option: { ...optionDraft, listId: current.id } });
                  }}
                >
                  <h2>Adicionar ou atualizar opção</h2>
                  {optionDraft.id && (
                    <p className="admin-help">
                      Editando UUID <code>{optionDraft.id}</code>
                    </p>
                  )}
                  <div className="admin-form-grid">
                    <label>
                      Rótulo
                      <input
                        required
                        value={optionDraft.label}
                        onChange={(event) => setOptionDraft({ ...optionDraft, label: event.target.value })}
                      />
                    </label>
                    <label>
                      Identificador estável
                      <input
                        required
                        disabled={Boolean(optionDraft.id)}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        value={optionDraft.slug}
                        onChange={(event) => setOptionDraft({ ...optionDraft, slug: event.target.value })}
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
              <h2>Selecione uma dimensão</h2>
            </div>
          )}
          {canManage && (
            <details className="admin-editor-card">
              <summary>Criar nova dimensão extensível</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void command({ action: "upsert_list", list: listDraft });
                }}
              >
                <div className="admin-form-grid">
                  <label>
                    Chave da lista
                    <input
                      required
                      disabled={Boolean(listDraft.id)}
                      value={listDraft.listKey}
                      onChange={(event) => setListDraft({ ...listDraft, listKey: event.target.value })}
                    />
                  </label>
                  <label>
                    Entidade
                    <input
                      required
                      disabled={Boolean(listDraft.id)}
                      value={listDraft.entityType}
                      onChange={(event) => setListDraft({ ...listDraft, entityType: event.target.value })}
                    />
                  </label>
                  <label>
                    Dimensão
                    <input
                      required
                      disabled={Boolean(listDraft.id)}
                      value={listDraft.dimensionKey}
                      onChange={(event) => setListDraft({ ...listDraft, dimensionKey: event.target.value })}
                    />
                  </label>
                  <label>
                    Nome operacional
                    <input
                      required
                      value={listDraft.label}
                      onChange={(event) => setListDraft({ ...listDraft, label: event.target.value })}
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
                    Dimensão ativa
                  </label>
                </div>
                <button type="submit" className="admin-button" disabled={busy}>
                  {listDraft.id ? "Salvar dimensão" : "Criar dimensão"}
                </button>
              </form>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
