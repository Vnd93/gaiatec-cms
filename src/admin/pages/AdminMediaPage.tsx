import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { mediaCommand } from "../api/cms-api";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  StatePanel,
} from "../components/AdminUI";

type Media = {
  id: string;
  original_filename: string;
  processing_status: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  source_kind: string;
};
export default function AdminMediaPage() {
  const { session, profile } = useAdminAuth();
  const [items, setItems] = useState<Media[]>([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(
    async (requestedQuery: string) => {
      if (!session) return;
      setLoading(true);
      try {
        const result = await mediaCommand<{ items: Media[] }>(session, {
          action: "list",
          query: requestedQuery,
          page: 1,
          pageSize: 20,
        });
        setItems(result.items);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Falha ao carregar mídia.");
      } finally {
        setLoading(false);
      }
    },
    [session],
  );
  useEffect(() => {
    void load("");
  }, [load]);
  return (
    <section>
      <PageHeader
        eyebrow="BIBLIOTECA PRIVADA"
        title="Mídia"
        description="Consulte arquivos novos e autorizados. Originais, direitos e usos permanecem protegidos."
      />
      <FilterBar summary={`${items.length} arquivo${items.length === 1 ? "" : "s"}`}>
        <label>
          Buscar arquivo
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button onClick={() => void load(query)}>Buscar</button>
      </FilterBar>
      {loading ? (
        <LoadingSkeleton label="Carregando mídia" rows={4} />
      ) : error ? (
        <ErrorState title="Biblioteca indisponível" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Biblioteca vazia"
          description="Nenhuma mídia antiga foi copiada. Envie somente originais com origem e direitos comprovados."
        />
      ) : (
        <div className="admin-media-grid">
          {items.map((item) => (
            <article key={item.id}>
              <h2>{item.original_filename}</h2>
              <p>{item.alt_text}</p>
              <dl>
                <dt>Status</dt>
                <dd>{item.processing_status}</dd>
                <dt>Dimensões</dt>
                <dd>{item.width && item.height ? item.width + " × " + item.height : "aguardando"}</dd>
                <dt>Origem</dt>
                <dd>{item.source_kind}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
      {!profile?.permissions.includes("cms:media.upload") && (
        <StatePanel
          kind="forbidden"
          title="Upload não permitido"
          description="Seu papel possui somente leitura da biblioteca."
        />
      )}
    </section>
  );
}
