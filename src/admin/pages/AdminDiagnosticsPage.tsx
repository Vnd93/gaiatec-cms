import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "../components/AdminUI";
type Event = {
  id: string;
  event_type: string;
  error_code: string | null;
  correlation_id: string;
  created_at: string;
};
const discoveryLabels = {
  service: "serviços publicados",
  industry: "indústrias publicadas",
  application: "aplicações publicadas",
  solution: "soluções publicadas",
} as const;
export default function AdminDiagnosticsPage() {
  const [events, setEvents] = useState<Event[]>([]),
    [eventTotal, setEventTotal] = useState(0),
    [outbox, setOutbox] = useState(0),
    [discovery, setDiscovery] = useState<Record<keyof typeof discoveryLabels, number>>({
      service: 0,
      industry: 0,
      application: 0,
      solution: 0,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from("cms_operational_events")
        .select("id,event_type,error_code,correlation_id,created_at", { count: "exact" })
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("cms_publication_outbox")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"]),
      supabase.from("cms_discovery_projection").select("content_type"),
    ]).then(([eventResult, queueResult, discoveryResult]) => {
      if (!active) return;
      if (eventResult.error || queueResult.error || discoveryResult.error)
        setError("Diagnóstico indisponível.");
      else {
        setEvents((eventResult.data ?? []) as Event[]);
        setEventTotal(eventResult.count ?? 0);
        setOutbox(queueResult.count ?? 0);
        setDiscovery(
          (discoveryResult.data ?? []).reduce(
            (counts, row) => {
              const kind = row.content_type as keyof typeof discoveryLabels;
              if (kind in counts) counts[kind] += 1;
              return counts;
            },
            { service: 0, industry: 0, application: 0, solution: 0 },
          ),
        );
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <PageHeader
        eyebrow="OBSERVABILIDADE"
        title="Diagnósticos"
        description="Acompanhe falhas reais, fila de publicação e disponibilidade das projeções."
      />
      {loading ? (
        <LoadingSkeleton label="Carregando diagnósticos" rows={5} />
      ) : error ? (
        <ErrorState title="Diagnóstico indisponível" description={error} />
      ) : (
        <>
          <div className="admin-metrics">
            <article className={outbox ? "is-alert" : ""}>
              <strong>{outbox}</strong>
              <span>eventos pendentes/falhos</span>
            </article>
            <article>
              <strong>{eventTotal}</strong>
              <span>alertas abertos</span>
            </article>
            {(Object.keys(discoveryLabels) as Array<keyof typeof discoveryLabels>).map((kind) => (
              <article key={kind}>
                <strong>{discovery[kind]}</strong>
                <span>{discoveryLabels[kind]}</span>
              </article>
            ))}
          </div>
          {events.length === 0 ? (
            <EmptyState
              title="Nenhuma falha aberta"
              description="Publicação, outbox e processamento não possuem alerta ativo."
            />
          ) : (
            <>
              {eventTotal > events.length && (
                <p className="admin-help">
                  Exibindo os {events.length} alertas mais recentes de {eventTotal} abertos.
                </p>
              )}
              {events.map((event) => (
                <article className="admin-alert" key={event.id}>
                  <strong>{event.event_type}</strong>
                  <p>Código: {event.error_code ?? "—"}</p>
                  <small>
                    Suporte {event.correlation_id.slice(0, 8)} ·{" "}
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                  </small>
                </article>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
