import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Ev2SystemCapabilitySchema,
  Ev2SystemSnapshotSchema,
  type Ev2SystemSnapshot,
} from "@/shared/contracts/ev2-system";
import { systemAssuranceCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  AdminAlert,
  Badge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
} from "../components/AdminUI";

type Event = {
  id: string;
  event_type: string;
  error_code: string | null;
  correlation_id: string;
  created_at: string;
};

const CANDIDATE_ENABLED = import.meta.env.VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE === "true";
const discoveryLabels = {
  service: "serviços publicados",
  industry: "indústrias publicadas",
  application: "aplicações publicadas",
  solution: "soluções publicadas",
} as const;
const queueLabels = {
  publication: "Publicação",
  lead_delivery: "Entrega de leads",
  collaboration: "Colaboração",
} as const;
const checkLabels: Record<string, string> = {
  outbox_lag: "Latência das filas",
  dead_letter: "Fila de exceção",
  publication_reconciliation: "Publicação × projeção",
  lead_reconciliation: "Lead × consentimento/histórico/fila",
  critical_alerts: "Alertas críticos abertos",
  critical_audit_trace: "Cobertura de auditoria crítica",
};
const unitLabels = {
  seconds: "s",
  events: "eventos",
  records: "registros",
  alerts: "alertas",
  percent: "%",
} as const;

export default function AdminDiagnosticsPage() {
  const { session } = useAdminAuth();
  const [events, setEvents] = useState<Event[]>([]),
    [eventTotal, setEventTotal] = useState(0),
    [outbox, setOutbox] = useState(0),
    [discovery, setDiscovery] = useState<Record<keyof typeof discoveryLabels, number>>({
      service: 0,
      industry: 0,
      application: 0,
      solution: 0,
    }),
    [snapshot, setSnapshot] = useState<Ev2SystemSnapshot | null>(null),
    [candidateState, setCandidateState] = useState<"off" | "loading" | "unavailable" | "ready" | "error">(
      CANDIDATE_ENABLED ? "loading" : "off",
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const baseline = Promise.all([
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
    ]);
    const assurance = async () => {
      if (!CANDIDATE_ENABLED || !session) return null;
      const capability = Ev2SystemCapabilitySchema.parse(
        await systemAssuranceCommand(session, { action: "capability" }),
      );
      if (!capability.enabled) return false;
      return Ev2SystemSnapshotSchema.parse(await systemAssuranceCommand(session, { action: "snapshot" }));
    };

    void Promise.allSettled([baseline, assurance()]).then(([baselineResult, assuranceResult]) => {
      if (!active) return;
      if (baselineResult.status === "rejected") setError("Diagnóstico indisponível.");
      else {
        const [eventResult, queueResult, discoveryResult] = baselineResult.value;
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
      }
      if (CANDIDATE_ENABLED) {
        if (assuranceResult.status === "rejected") setCandidateState("error");
        else if (assuranceResult.value === false || assuranceResult.value === null)
          setCandidateState("unavailable");
        else if (assuranceResult.value) {
          setSnapshot(assuranceResult.value);
          setCandidateState("ready");
        }
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, session]);

  const deadLetters = snapshot?.queues.reduce((total, queue) => total + queue.deadLetter, 0) ?? 0;

  return (
    <section>
      <PageHeader
        eyebrow="OBSERVABILIDADE"
        title="Diagnósticos"
        description="Acompanhe falhas reais, filas, reconciliação e disponibilidade das projeções."
        actions={
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              if (CANDIDATE_ENABLED) {
                setCandidateState("loading");
                setSnapshot(null);
              }
              setRefreshKey((value) => value + 1);
            }}
            disabled={loading}
          >
            Atualizar diagnóstico
          </button>
        }
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
              <span>publicações pendentes/falhas</span>
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

          {candidateState === "loading" && (
            <LoadingSkeleton label="Calculando garantias sistêmicas" rows={3} />
          )}
          {candidateState === "unavailable" && (
            <AdminAlert title="EV2.11 protegida" tone="info">
              O build candidato está presente, mas este usuário não possui override individual ativo. O
              diagnóstico estável permanece disponível.
            </AdminAlert>
          )}
          {candidateState === "error" && (
            <AdminAlert title="Garantia sistêmica indisponível" tone="warning">
              Não foi possível obter a fotografia EV2.11. Nenhum dado ou fila foi alterado; use “Atualizar
              diagnóstico” para tentar novamente.
            </AdminAlert>
          )}
          {candidateState === "ready" && snapshot && (
            <SectionCard
              title="Fotografia sistêmica EV2.11"
              description="Leitura sem dados pessoais. Esta fotografia apoia o G11, mas não o aprova isoladamente."
              actions={
                <Badge tone={snapshot.gateReady ? "success" : "warning"}>
                  {snapshot.gateReady ? "Banco operacional apto" : "Ação necessária"}
                </Badge>
              }
            >
              <div className="admin-metrics">
                <article className={snapshot.metrics.outboxWorstLagSeconds > 60 ? "is-alert" : ""}>
                  <strong>{snapshot.metrics.outboxWorstLagSeconds}s</strong>
                  <span>maior espera em fila</span>
                </article>
                <article className={deadLetters ? "is-alert" : ""}>
                  <strong>{deadLetters}</strong>
                  <span>eventos em exceção</span>
                </article>
                <article className={snapshot.metrics.projectionDivergence ? "is-alert" : ""}>
                  <strong>{snapshot.metrics.projectionDivergence}</strong>
                  <span>divergências de publicação</span>
                </article>
                <article className={snapshot.metrics.leadDivergence ? "is-alert" : ""}>
                  <strong>{snapshot.metrics.leadDivergence}</strong>
                  <span>divergências de leads</span>
                </article>
                <article>
                  <strong>{snapshot.metrics.auditCoveragePercent}%</strong>
                  <span>auditoria crítica em 24h</span>
                </article>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <caption>Filas transacionais verificadas</caption>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Acionáveis</th>
                      <th>Exceções</th>
                      <th>Evento mais antigo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.queues.map((queue) => (
                      <tr key={queue.key}>
                        <td>{queueLabels[queue.key]}</td>
                        <td>{queue.actionable}</td>
                        <td>{queue.deadLetter}</td>
                        <td>{queue.oldestLagSeconds}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <caption>Critérios operacionais calculados no banco</caption>
                  <thead>
                    <tr>
                      <th>Critério</th>
                      <th>Resultado</th>
                      <th>Observado</th>
                      <th>Limite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.checks.map((check) => (
                      <tr key={check.key}>
                        <td>{checkLabels[check.key] ?? check.key}</td>
                        <td>
                          <Badge tone={check.passed ? "success" : "danger"}>
                            {check.passed ? "Conforme" : "Não conforme"}
                          </Badge>
                        </td>
                        <td>
                          {check.observed} {unitLabels[check.unit]}
                        </td>
                        <td>
                          {check.threshold} {unitLabels[check.unit]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-help">
                Captura {new Date(snapshot.capturedAt).toLocaleString("pt-BR")} · suporte{" "}
                {snapshot.correlationId.slice(0, 8)}.
              </p>
            </SectionCard>
          )}

          <SectionCard
            title="Alertas operacionais"
            description="Ocorrências abertas com código de acompanhamento."
          >
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
          </SectionCard>
        </>
      )}
    </section>
  );
}
