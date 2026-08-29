import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { mediaCommand } from "../api/cms-api";

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
      <p className="admin-eyebrow">BIBLIOTECA PRIVADA</p>
      <h1>Mídia nova</h1>
      <p>
        Originais ficam privados; somente arquivos novos com origem, direitos, MIME real, dimensões e
        variantes WebP/AVIF podem ficar prontos.
      </p>
      <div className="admin-filters">
        <label>
          Buscar arquivo
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button onClick={() => void load(query)}>Buscar</button>
      </div>
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando mídia…
        </div>
      ) : error ? (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="admin-state">
          <h2>Biblioteca vazia</h2>
          <p>
            Nenhuma imagem antiga foi copiada. O processamento usa o pipeline controlado de mídia
            sintética/autorizada.
          </p>
        </div>
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
        <div className="admin-state admin-state--forbidden">
          <h2>Upload não permitido</h2>
          <p>Seu papel possui somente leitura da biblioteca.</p>
        </div>
      )}
    </section>
  );
}
