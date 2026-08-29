import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Event = {
  id: string;
  event_type: string;
  error_code: string | null;
  correlation_id: string;
  created_at: string;
};
export default function AdminDiagnosticsPage() {
  const [events, setEvents] = useState<Event[]>([]),
    [outbox, setOutbox] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from("cms_operational_events")
        .select("id,event_type,error_code,correlation_id,created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("cms_publication_outbox")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"]),
    ]).then(([eventResult, queueResult]) => {
      if (!active) return;
      if (eventResult.error || queueResult.error) setError("Diagnóstico indisponível.");
      else {
        setEvents((eventResult.data ?? []) as Event[]);
        setOutbox(queueResult.count ?? 0);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <p className="admin-eyebrow">OBSERVABILIDADE</p>
      <h1>Diagnósticos</h1>
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando sinais…
        </div>
      ) : error ? (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="admin-metrics">
            <article className={outbox ? "is-alert" : ""}>
              <strong>{outbox}</strong>
              <span>eventos pendentes/falhos</span>
            </article>
            <article>
              <strong>{events.length}</strong>
              <span>alertas abertos</span>
            </article>
          </div>
          {events.length === 0 ? (
            <div className="admin-state">
              <h2>Nenhuma falha aberta</h2>
              <p>Publicação, outbox e processamento não possuem alerta ativo.</p>
            </div>
          ) : (
            events.map((event) => (
              <article className="admin-alert" key={event.id}>
                <strong>{event.event_type}</strong>
                <p>Código: {event.error_code ?? "—"}</p>
                <small>
                  Suporte {event.correlation_id.slice(0, 8)} ·{" "}
                  {new Date(event.created_at).toLocaleString("pt-BR")}
                </small>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}
