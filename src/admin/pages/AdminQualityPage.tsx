import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { qualityCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import { AdminAlert } from "../components/AdminUI";
import { operatorErrorMessage } from "../operator-error-message";

type QualityRun = {
  id: string;
  item_id: string;
  ruleset_version: string;
  trigger_kind: string;
  status: "passed" | "warning" | "blocked";
  finding_counts: { errors?: number; warnings?: number; recommendations?: number; waived?: number };
  checked_at: string;
};

type ContentOption = {
  id: string;
  content_type: string;
  slug: string;
  cms_content_drafts: { payload?: { title?: string } } | Array<{ payload?: { title?: string } }> | null;
};

const contentTypeLabels: Record<string, string> = {
  product: "Produto",
  service: "Serviço",
  industry: "Indústria",
  application: "Aplicação",
  solution: "Solução",
  post: "Artigo",
  page: "Página",
  homepage: "Página inicial",
  campaign: "Campanha",
  navigation: "Navegação",
  site_settings: "Dados globais",
  placement: "Posicionamentos",
};

const fieldLabels: Record<string, string> = {
  "seo.title": "Título para mecanismos de busca",
  "seo.description": "Descrição para mecanismos de busca",
  "seo.canonicalPath": "Endereço oficial",
  blocks: "Conteúdo da página",
  media: "Mídia",
  title: "Título",
  summary: "Resumo",
};

const qualityResultLabels: Record<string, string> = {
  passed: "Conforme",
  warning: "Com alertas",
  blocked: "Bloqueado",
};

const findingMessages: Record<string, string> = {
  "content.title_required": "Informe o título.",
  "content.summary_required": "Considere adicionar um resumo.",
  "seo.title_length": "Reduza o título exibido nos resultados de busca para até 60 caracteres.",
  "seo.description_required": "Informe a descrição exibida nos resultados de busca.",
  "seo.description_length": "Use entre 50 e 160 caracteres na descrição dos resultados de busca.",
  "seo.canonical_required": "Defina o endereço oficial antes de permitir a indexação.",
  "media.alt_required": "Informe o texto alternativo da mídia.",
  "media.rights_required": "Confirme os direitos de uso da mídia.",
  "pim.specification_recommended": "Considere adicionar as especificações técnicas do produto.",
  "pim.searchable_requires_homologation":
    "Revise e aprove a especificação antes de disponibilizá-la na busca.",
  "links.invalid_url": "Corrija o endereço informado.",
};

function qualityResultLabel(status: string): string {
  return qualityResultLabels[status] ?? "Resultado indisponível";
}

function findingMessage(ruleKey: string): string {
  return findingMessages[ruleKey] ?? "Revise este campo antes de publicar.";
}

function draftTitle(item: ContentOption): string {
  const draft = Array.isArray(item.cms_content_drafts) ? item.cms_content_drafts[0] : item.cms_content_drafts;
  return draft?.payload?.title?.trim() || item.slug.replaceAll("-", " ");
}

function contentLabel(item: ContentOption): string {
  return `${draftTitle(item)} — ${contentTypeLabels[item.content_type] ?? "Conteúdo"}`;
}

function fieldLabel(path: string): string {
  const normalized = path.replace(/^payload\./, "");
  if (fieldLabels[path]) return fieldLabels[path];
  if (fieldLabels[normalized]) return fieldLabels[normalized];
  const indexed = normalized.match(/^(blocks|media|specifications)\[(\d+)\]/);
  if (indexed) {
    const [, collection, rawIndex] = indexed;
    const itemNumber = Number(rawIndex) + 1;
    if (collection === "blocks") return `Bloco ${itemNumber}`;
    if (collection === "media") return `Mídia ${itemNumber}`;
    return `Especificação ${itemNumber}`;
  }
  return "Campo do conteúdo";
}

function contentEditPath(item: ContentOption | undefined, findingCategory = ""): string {
  if (!item) return "/admin/conteudo";
  if (findingCategory.toLowerCase().includes("media")) return "/admin/midia";
  if (item.content_type === "product") {
    return `/admin/produtos/${item.id}?etapa=${findingCategory.toLowerCase().includes("seo") ? "seo" : "dados"}`;
  }
  if (["service", "industry", "application", "solution"].includes(item.content_type)) {
    return `/admin/descoberta/${item.content_type}/${item.id}`;
  }
  if (["page", "homepage"].includes(item.content_type)) return `/admin/paginas/${item.id}`;
  if (item.content_type === "campaign") return `/admin/marketing/campanhas/${item.id}`;
  return `/admin/conteudo/${item.id}`;
}

const envelope = () => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: cmsEnvironment(), siteKey: "main" },
});

export default function AdminQualityPage() {
  const { session, profile } = useAdminAuth();
  const candidateEnabled = isEv2FeatureEnabled(profile, "ev2.search_quality");
  const [runs, setRuns] = useState<QualityRun[]>([]),
    [contentOptions, setContentOptions] = useState<ContentOption[]>([]),
    [findings, setFindings] = useState<
      Array<{
        ruleKey: string;
        category: string;
        severity: string;
        fieldPath: string;
        message: string;
        waived: boolean;
      }>
    >([]),
    [itemId, setItemId] = useState(""),
    [ruleKey, setRuleKey] = useState(""),
    [reason, setReason] = useState(""),
    [expiresAt, setExpiresAt] = useState(""),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const canRun = profile?.permissions.includes("cms:quality.run") ?? false;
  const canWaive = profile?.permissions.includes("cms:quality.waive") ?? false;
  const categoryCounts = useMemo(() => {
    const counts = { seo: 0, links: 0, accessibility: 0, media: 0 };
    findings.forEach((finding) => {
      const category = `${finding.category} ${finding.ruleKey}`.toLowerCase();
      if (category.includes("seo")) counts.seo += 1;
      else if (category.includes("link")) counts.links += 1;
      else if (category.includes("access") || category.includes("a11y")) counts.accessibility += 1;
      else if (category.includes("media") || category.includes("image")) counts.media += 1;
    });
    return counts;
  }, [findings]);
  const load = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    setError("");
    try {
      const capability = await qualityCommand<{ enabled: boolean }>(session, {
        action: "capability",
        envelope: envelope(),
      });
      setEnabled(capability.enabled);
      if (!capability.enabled) return;
      const [result, contentResult] = await Promise.all([
        qualityCommand<{ items: QualityRun[] }>(session, {
          action: "list",
          envelope: envelope(),
          limit: 50,
        }),
        supabase
          .from("cms_content_items")
          .select("id,content_type,slug,cms_content_drafts(payload)")
          .neq("workflow_status", "archived")
          .order("updated_at", { ascending: false })
          .limit(500),
      ]);
      setRuns(result.items);
      if (contentResult.error) throw new Error("A lista de conteúdos não pôde ser carregada.");
      const available = (contentResult.data ?? []) as unknown as ContentOption[];
      setContentOptions(available);
      setItemId((current) =>
        current && available.some((item) => item.id === current) ? current : (available[0]?.id ?? ""),
      );
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "O Centro de Qualidade está indisponível." }));
    }
  }, [candidateEnabled, session]);
  useEffect(() => {
    void load();
  }, [load]);

  async function runQuality() {
    if (!session || !itemId || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await qualityCommand<{
        status: string;
        counts: Record<string, number>;
        findings: Array<{
          ruleKey: string;
          category: string;
          severity: string;
          fieldPath: string;
          message: string;
          waived: boolean;
        }>;
      }>(session, { action: "run", envelope: envelope(), itemId, trigger: "manual" }, true);
      setFindings(result.findings);
      setSuccess(
        `Verificação concluída: ${qualityResultLabel(result.status)}. ${result.counts.errors ?? 0} erro(s), ${result.counts.warnings ?? 0} alerta(s).`,
      );
      await load();
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "A verificação não foi concluída." }));
    } finally {
      setBusy(false);
    }
  }
  async function waive() {
    if (!session || !itemId || !ruleKey || !reason || !expiresAt || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await qualityCommand(
        session,
        {
          action: "waive",
          envelope: envelope(),
          itemId,
          ruleKey,
          reason,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        true,
      );
      setSuccess("Exceção temporária registrada com auditoria.");
      setRuleKey("");
      setReason("");
      setExpiresAt("");
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "A exceção temporária não foi registrada." }));
    } finally {
      setBusy(false);
    }
  }

  if (!candidateEnabled)
    return (
      <section>
        <h1>Centro de Qualidade</h1>
        <div className="admin-state">O Centro de Qualidade não está disponível para esta conta.</div>
      </section>
    );
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">QUALIDADE DE CONTEÚDO</p>
          <h1>Centro de Qualidade</h1>
          <p>
            Verifica a apresentação na busca, a acessibilidade, os links, as mídias e os dados de produto
            antes da publicação.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {!enabled ? (
        <div className="admin-state">As verificações de qualidade estão desativadas para esta conta.</div>
      ) : (
        <>
          <div className="admin-metrics" role="group" aria-label="Pendências por categoria">
            <article>
              <strong>{categoryCounts.seo}</strong>
              <span>busca</span>
            </article>
            <article>
              <strong>{categoryCounts.links}</strong>
              <span>links</span>
            </article>
            <article>
              <strong>{categoryCounts.accessibility}</strong>
              <span>acessibilidade</span>
            </article>
            <article>
              <strong>{categoryCounts.media}</strong>
              <span>mídias sem uso</span>
            </article>
          </div>
          <p className="admin-help">
            Uma verificação automática acontece diariamente. A verificação manual abaixo atualiza as
            orientações deste conteúdo imediatamente.
          </p>
          <div className="admin-editor-grid">
            <label>
              Conteúdo a verificar
              <select
                value={itemId}
                onChange={(event) => {
                  setItemId(event.target.value);
                  setFindings([]);
                  setRuleKey("");
                }}
              >
                <option value="">Selecione um conteúdo</option>
                {contentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {contentLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            {canRun && (
              <button type="button" disabled={busy || !itemId} onClick={() => void runQuality()}>
                {busy ? "Verificando…" : "Executar verificação"}
              </button>
            )}
          </div>
          {canWaive && (
            <div className="admin-editor-grid" role="group" aria-labelledby="quality-waiver-title">
              <h2 id="quality-waiver-title">Exceção temporária</h2>
              <label>
                Achado a dispensar
                <select value={ruleKey} onChange={(event) => setRuleKey(event.target.value)}>
                  <option value="">Selecione um achado da verificação</option>
                  {findings
                    .filter((finding) => !finding.waived)
                    .map((finding) => (
                      <option key={`${finding.ruleKey}:${finding.fieldPath}`} value={finding.ruleKey}>
                        {fieldLabel(finding.fieldPath)} — {findingMessage(finding.ruleKey)}
                      </option>
                    ))}
                </select>
                <small>Execute a verificação do conteúdo antes de registrar uma exceção.</small>
              </label>
              <label>
                Motivo
                <input
                  value={reason}
                  minLength={3}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <label>
                Expira em
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !itemId || !ruleKey || reason.trim().length < 3 || !expiresAt}
                onClick={() => void waive()}
              >
                Registrar exceção
              </button>
            </div>
          )}
          <h2>Execuções recentes</h2>
          {findings.length > 0 && (
            <div className="admin-table-wrap" aria-live="polite">
              <table>
                <thead>
                  <tr>
                    <th>Campo/bloco</th>
                    <th>Severidade</th>
                    <th>Orientação</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => (
                    <tr key={`${finding.ruleKey}:${finding.fieldPath}`}>
                      <td>{fieldLabel(finding.fieldPath)}</td>
                      <td>
                        {finding.waived
                          ? "Dispensado"
                          : finding.severity === "error"
                            ? "Erro"
                            : finding.severity === "warning"
                              ? "Alerta"
                              : "Recomendação"}
                      </td>
                      <td>{findingMessage(finding.ruleKey)}</td>
                      <td>
                        <Link
                          className="admin-table-action"
                          to={contentEditPath(
                            contentOptions.find((item) => item.id === itemId),
                            finding.category,
                          )}
                        >
                          Corrigir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {runs.length === 0 ? (
            <div className="admin-state">Nenhuma verificação registrada.</div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Conteúdo</th>
                    <th>Resultado</th>
                    <th>Achados</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        {contentOptions.find((item) => item.id === run.item_id)
                          ? contentLabel(contentOptions.find((item) => item.id === run.item_id)!)
                          : "Conteúdo não disponível nesta sessão"}
                      </td>
                      <td>{qualityResultLabel(run.status)}</td>
                      <td>
                        {run.finding_counts.errors ?? 0} erros · {run.finding_counts.warnings ?? 0} alertas ·{" "}
                        {run.finding_counts.waived ?? 0} dispensados
                      </td>
                      <td>{new Date(run.checked_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
