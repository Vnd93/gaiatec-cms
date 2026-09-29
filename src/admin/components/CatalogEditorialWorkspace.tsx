import { useEffect, useState } from "react";
import {
  CatalogEditorialCommandSchema,
  type CatalogEditorialCommand,
  type CatalogEditorialRevision,
} from "@/shared/contracts/catalog-editorial-workspace";
import type { CatalogWorkspace } from "@/shared/contracts/catalog-workspace";
import {
  CatalogWorkspaceError,
  executeCatalogEditorialCommand,
  readCatalogEditorialWorkspace,
  type CatalogConflictDetail,
} from "../api/catalog-workspace-api";
import { CatalogConflictNotice } from "./CatalogConflictNotice";

export function CatalogEditorialWorkspace({
  workspace,
  onDirtyChange,
}: {
  workspace: CatalogWorkspace;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [pages, setPages] = useState<CatalogEditorialRevision[]>([]);
  const [selected, setSelected] = useState("");
  const [title, setTitle] = useState(""),
    [summary, setSummary] = useState("");
  const [blocks, setBlocks] = useState([{ heading: "", paragraphs: [""] }]);
  const [reason, setReason] = useState(""),
    [redirect, setRedirect] = useState("");
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [notice, setNotice] = useState(""),
    [conflicted, setConflicted] = useState(false);
  const [comparison, setComparison] = useState<{
    base: CatalogEditorialRevision | undefined;
    current: CatalogEditorialRevision | undefined;
  } | null>(null);
  const [conflictDetail, setConflictDetail] = useState<CatalogConflictDetail | null>(null);
  const terms = workspace.terms.filter((term) =>
    ["technology", "industry", "application"].includes(term.term_type),
  );
  const current = pages.find((page) => page.term_id === selected);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let cancelled = false;
    readCatalogEditorialWorkspace()
      .then((result) => {
        if (!cancelled) setPages(result);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível consultar as páginas editoriais.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function choose(id: string) {
    const page = pages.find((item) => item.term_id === id);
    setSelected(id);
    setTitle(page?.title ?? terms.find((term) => term.id === id)?.title ?? "");
    setSummary(page?.summary ?? "");
    setBlocks(page?.blocks ?? [{ heading: "", paragraphs: [""] }]);
    setDirty(false);
    setConflicted(false);
    setError("");
  }
  async function run(command: CatalogEditorialCommand) {
    const parsed = CatalogEditorialCommandSchema.safeParse(command);
    if (busy || conflicted) return;
    if (!parsed.success) {
      setError("Preencha título, resumo, blocos e justificativa.");
      return;
    }
    setBusy(true);
    setError("");
    setConflictDetail(null);
    setNotice("");
    let committed = false;
    try {
      await executeCatalogEditorialCommand(parsed.data);
      committed = true;
      const refreshed = await readCatalogEditorialWorkspace();
      setPages(refreshed);
      setDirty(false);
      setNotice(
        "Revisão registrada. Solicitar indexação não equivale a aprová-la: é necessária evidência de UAT do mesmo SHA e revisão.",
      );
    } catch (caught) {
      setError(
        committed
          ? "A revisão foi gravada, mas a consulta falhou. Recarregue antes de tentar outra ação."
          : caught instanceof CatalogWorkspaceError
            ? caught.message
            : "Falha na operação; o formulário foi preservado.",
      );
      setConflicted(true);
      if (caught instanceof CatalogWorkspaceError && caught.status === 409) {
        setConflictDetail(caught.conflict);
        try {
          const refreshed = await readCatalogEditorialWorkspace();
          setComparison({ base: current, current: refreshed.find((item) => item.term_id === selected) });
          setPages(refreshed);
        } catch {
          /* Keep the attempted text and require an explicit reload. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const base = { termId: selected, expectedVersion: current?.revision ?? 0, reason };
  return (
    <section aria-label="Páginas editoriais">
      <h2>Páginas editoriais opt-in</h2>
      {error && <CatalogConflictNotice detail={conflictDetail} />}
      <p>
        Sem página por padrão. Publicação e indexação são decisões separadas; sem evidência válida, a página
        permanece noindex.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label>
        Termo editorial
        <select value={selected} disabled={busy || dirty} onChange={(event) => choose(event.target.value)}>
          <option value="">Selecione um termo</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.title} · {term.status}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
        <button type="button" onClick={() => choose(selected)}>
          Descartar alterações não salvas
        </button>
      )}
      {conflicted &&
        (comparison ? (
          <section aria-label="Comparação editorial">
            <h3>Base, tentativa e versão atual</h3>
            <dl>
              <dt>Base</dt>
              <dd>
                <pre>{JSON.stringify(comparison.base ?? null, null, 2)}</pre>
              </dd>
              <dt>Sua tentativa</dt>
              <dd>
                <pre>{JSON.stringify({ title, summary, blocks }, null, 2)}</pre>
              </dd>
              <dt>Versão atual</dt>
              <dd>
                <pre>{JSON.stringify(comparison.current ?? null, null, 2)}</pre>
              </dd>
            </dl>
            <button
              type="button"
              onClick={() => {
                setConflicted(false);
                setComparison(null);
                setDirty(true);
              }}
            >
              Revisei; manter tentativa para editar
            </button>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              void readCatalogEditorialWorkspace()
                .then((result) => {
                  setPages(result);
                  setNotice("Versão atual carregada. Revise sua tentativa antes de reaplicar.");
                  setConflicted(false);
                })
                .catch(() => setError("Não foi possível recarregar."))
                .finally(() => setBusy(false));
            }}
          >
            Carregar versão atual mantendo minha tentativa
          </button>
        ))}
      {selected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run({ action: "save", ...base, title, summary, blocks });
          }}
        >
          <fieldset disabled={busy || !workspace.permissions.edit || conflicted}>
            <legend>Conteúdo da página · revisão {current?.revision ?? 0}</legend>
            <label>
              Título editorial
              <input
                value={title}
                maxLength={180}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Resumo editorial
              <textarea
                value={summary}
                maxLength={600}
                onChange={(e) => {
                  setSummary(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            {blocks.map((block, index) => (
              <fieldset key={index}>
                <legend>Bloco {index + 1}</legend>
                <label>
                  Título do bloco
                  <input
                    value={block.heading}
                    maxLength={160}
                    onChange={(e) => {
                      setBlocks(
                        blocks.map((item, i) => (i === index ? { ...item, heading: e.target.value } : item)),
                      );
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Parágrafos (um por linha)
                  <textarea
                    value={block.paragraphs.join("\n")}
                    onChange={(e) => {
                      setBlocks(
                        blocks.map((item, i) =>
                          i === index ? { ...item, paragraphs: e.target.value.split("\n") } : item,
                        ),
                      );
                      setDirty(true);
                    }}
                  />
                </label>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBlocks(blocks.filter((_, i) => i !== index));
                      setDirty(true);
                    }}
                  >
                    Remover bloco {index + 1}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              disabled={blocks.length >= 50}
              onClick={() => {
                setBlocks([...blocks, { heading: "", paragraphs: [""] }]);
                setDirty(true);
              }}
            >
              Adicionar bloco
            </button>
            <label>
              Justificativa editorial
              <input value={reason} maxLength={240} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="submit">Salvar rascunho editorial</button>
          </fieldset>
          {current && workspace.permissions.administer && (
            <fieldset disabled={busy || dirty || conflicted}>
              <legend>Ciclo editorial · {current.status}</legend>
              <button
                type="button"
                disabled={current.status !== "draft"}
                onClick={() => void run({ action: "publish", ...base, indexRequested: false })}
              >
                Publicar página noindex
              </button>
              <button
                type="button"
                disabled={current.status !== "draft"}
                onClick={() => void run({ action: "publish", ...base, indexRequested: true })}
              >
                Publicar e solicitar indexação
              </button>
              <button type="button" onClick={() => void run({ action: "unpublish", ...base })}>
                Retirar página
              </button>
              <label>
                Destino do redirecionamento
                <select value={redirect} onChange={(e) => setRedirect(e.target.value)}>
                  <option value="">Selecione</option>
                  {pages
                    .filter(
                      (page) =>
                        page.term_id !== selected &&
                        page.status === "published" &&
                        page.term_kind === current.term_kind,
                    )
                    .map((page) => (
                      <option key={page.term_id} value={page.term_id}>
                        {page.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!redirect}
                onClick={() => void run({ action: "redirect", ...base, targetTermId: redirect })}
              >
                Registrar redirecionamento 301
              </button>
            </fieldset>
          )}
        </form>
      )}
    </section>
  );
}
