import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsProductContentSchema, type CmsProductContent } from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { attributesCommand, pimCommand } from "../api/cms-api";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";

const CMS_ENVIRONMENT = cmsEnvironment();

function envelope(expectedVersion?: number) {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
    ...(expectedVersion ? { expectedVersion } : {}),
  };
}

type LegacyProductSummary = {
  id: string;
  contentItemId?: string | null;
  slug: string;
  status: string;
  lockVersion: number;
};

type ReconciliationPlan = {
  productId: string;
  contentItemId: string;
  productVersion: number;
  draftVersion: number;
  equivalent: boolean;
  reasons: string[];
  legacySnapshotSha256: string;
};

type ProductRow = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts:
    | { payload: Record<string, unknown>; lock_version: number }
    | Array<{ payload: Record<string, unknown>; lock_version: number }>
    | null;
};

type CanonicalProduct = ProductRow & {
  product: CmsProductContent | null;
  version: number | null;
  legacy?: LegacyProductSummary;
};

const workflowLabels: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado",
};

function draftOf(row: ProductRow) {
  return Array.isArray(row.cms_content_drafts) ? row.cms_content_drafts[0] : row.cms_content_drafts;
}

function productCounts(product: CmsProductContent | null) {
  if (!product) return { models: 0, variants: 0, skus: 0, attributes: 0 };
  return {
    models: product.models.length,
    variants: product.models.reduce((total, model) => total + model.variants.length, 0),
    skus: product.models.filter((model) => model.sku.trim().length > 0).length,
    attributes: product.specifications.length,
  };
}

export default function AdminPimPage() {
  const { session, profile } = useAdminAuth();
  const enabled = isEv2FeatureEnabled(profile, "ev2.pim_v2");
  const [items, setItems] = useState<CanonicalProduct[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | "draft" | "in_review" | "approved" | "published" | "archived">(
    "all",
  );
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [reconciliationItem, setReconciliationItem] = useState<CanonicalProduct | null>(null);
  const [reconciliationPlan, setReconciliationPlan] = useState<ReconciliationPlan | null>(null);
  const [reconciliationReason, setReconciliationReason] = useState("");
  const [reconciliationAcknowledged, setReconciliationAcknowledged] = useState(false);
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [reconciliationError, setReconciliationError] = useState("");
  const [compatibilityState, setCompatibilityState] = useState<"checking" | "available" | "unavailable">(
    enabled ? "checking" : "unavailable",
  );

  const load = useCallback(async () => {
    if (!session || !enabled) return;
    setLoading(true);
    setError("");
    const [contentResult, legacyResult] = await Promise.all([
      supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload,lock_version)")
        .eq("content_type", "product")
        .order("updated_at", { ascending: false }),
      pimCommand<{ products: LegacyProductSummary[] }>(session, {
        action: "list_products",
        envelope: envelope(),
        query: "",
        includeArchived: false,
      }).catch(() => ({ products: [] })),
    ]);
    const { data, error: loadError } = contentResult;
    if (loadError) {
      setError("Não foi possível carregar o catálogo de produtos.");
      setLoading(false);
      return;
    }
    const legacyProducts = legacyResult.products ?? [];
    setItems(
      ((data ?? []) as ProductRow[]).map((row) => {
        const draft = draftOf(row);
        const parsed = CmsProductContentSchema.safeParse(draft?.payload);
        return {
          ...row,
          product: parsed.success ? parsed.data : null,
          version: draft?.lock_version ?? null,
          legacy: legacyProducts.find(
            (legacy) =>
              legacy.contentItemId === row.id || (!legacy.contentItemId && legacy.slug === row.slug),
          ),
        };
      }),
    );
    setLoading(false);
  }, [enabled, session]);

  const openReconciliation = useCallback(
    async (item: CanonicalProduct) => {
      if (!session || !item.legacy) return;
      setReconciliationItem(item);
      setReconciliationPlan(null);
      setReconciliationReason("");
      setReconciliationAcknowledged(false);
      setReconciliationError("");
      setReconciliationBusy(true);
      try {
        const plan = await pimCommand<ReconciliationPlan>(session, {
          action: "get_reconciliation_plan",
          envelope: envelope(),
          productId: item.legacy.id,
          contentItemId: item.id,
        });
        setReconciliationPlan(plan);
      } catch {
        setReconciliationError("Não foi possível gerar o plano autoritativo. Nenhum dado foi alterado.");
      } finally {
        setReconciliationBusy(false);
      }
    },
    [session],
  );

  const applyReconciliation = useCallback(async () => {
    if (!session || !reconciliationItem?.legacy || !reconciliationPlan) return;
    const resolution = reconciliationPlan.equivalent ? "equivalence" : "retire_acknowledged_gap";
    if (!reconciliationPlan.equivalent && !reconciliationAcknowledged) return;
    if (reconciliationReason.trim().length < 3) {
      setReconciliationError("Informe uma justificativa com pelo menos três caracteres.");
      return;
    }
    setReconciliationBusy(true);
    setReconciliationError("");
    try {
      await pimCommand(session, {
        action: "reconcile_product",
        envelope: envelope(reconciliationPlan.productVersion),
        productId: reconciliationPlan.productId,
        contentItemId: reconciliationPlan.contentItemId,
        expectedDraftVersion: reconciliationPlan.draftVersion,
        resolution,
        ...(resolution === "retire_acknowledged_gap"
          ? { acknowledgedLegacySha256: reconciliationPlan.legacySnapshotSha256 }
          : {}),
        reason: reconciliationReason.trim(),
      });
      setReconciliationItem(null);
      setReconciliationPlan(null);
      await load();
    } catch {
      setReconciliationError(
        "A reconciliação não foi aplicada. Atualize o plano e confirme a versão mais recente.",
      );
    } finally {
      setReconciliationBusy(false);
    }
  }, [
    load,
    reconciliationAcknowledged,
    reconciliationItem,
    reconciliationPlan,
    reconciliationReason,
    session,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session || !enabled) return;
    let active = true;
    void Promise.all([
      pimCommand(session, { action: "capability", envelope: envelope() }),
      attributesCommand(session, { action: "capability", envelope: envelope() }),
    ]).then(
      () => {
        if (active) setCompatibilityState("available");
      },
      () => {
        if (active) setCompatibilityState("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, session]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      if (state !== "all" && item.workflow_status !== state) return false;
      const title = item.product?.title ?? item.slug.replaceAll("-", " ");
      return (
        !needle ||
        [title, item.product?.brand.name, item.product?.manufacturer.name, item.product?.productLine.name]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle))
      );
    });
  }, [items, query, state]);

  if (!enabled)
    return (
      <section>
        <p className="admin-eyebrow">CATÁLOGO · PIM</p>
        <h1>Visão especializada de produtos</h1>
        <div role="status" className="admin-notice">
          Esta visão especializada não está habilitada para a sessão. O cadastro oficial continua disponível
          em <Link to="/admin/produtos">Produtos</Link>.
        </div>
      </section>
    );

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">CATÁLOGO · PIM</p>
          <h1>Visão especializada de produtos</h1>
          <p className="admin-help">
            Esta tela consulta o mesmo cadastro oficial de Produtos. Criação, edição, validação, revisão e
            publicação acontecem em um único fluxo, sem uma segunda gravação paralela.
          </p>
        </div>
        <div className="admin-heading-actions">
          <Link className="admin-button admin-button--secondary" to="/admin/importacao">
            Importar produtos
          </Link>
          <Link className="admin-button admin-button--primary" to="/admin/produtos/novo">
            Novo produto
          </Link>
        </div>
      </div>

      <nav className="admin-module-links" aria-label="Ferramentas relacionadas do catálogo">
        <Link to="/admin/produtos">Lista de produtos</Link>
        <Link to="/admin/dados-mestres">Dados mestres</Link>
        <Link to="/admin/vocabularios">Listas controladas</Link>
        <Link to="/admin/qualidade">Qualidade</Link>
      </nav>

      <p className="admin-help" role="status">
        Serviços de compatibilidade e unidades:{" "}
        {compatibilityState === "checking"
          ? "verificando…"
          : compatibilityState === "available"
            ? "disponíveis"
            : "indisponíveis; o cadastro oficial permanece preservado"}
        .
      </p>

      {error && (
        <div role="alert" className="admin-notice admin-notice--error">
          <p>{error} Nenhum dado foi alterado.</p>
          <button type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}

      <div className="admin-filter-bar">
        <label>
          Buscar por produto, marca, fabricante ou linha
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite um nome comercial"
          />
        </label>
        <label>
          Situação editorial
          <select value={state} onChange={(event) => setState(event.target.value as typeof state)}>
            <option value="all">Todas</option>
            <option value="draft">Rascunho</option>
            <option value="in_review">Em revisão</option>
            <option value="approved">Aprovado</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando catálogo…
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty-state">
          <h2>Nenhum produto encontrado</h2>
          <p>Ajuste os filtros ou inicie um cadastro oficial.</p>
          <Link className="admin-button" to="/admin/produtos/novo">
            Cadastrar produto
          </Link>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Situação</th>
                <th>Modelos</th>
                <th>Variantes</th>
                <th>SKUs</th>
                <th>Atributos</th>
                <th>Qualidade do cadastro</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const counts = productCounts(item.product);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.product?.title ?? "Cadastro a reparar"}</strong>
                      <small>
                        {[item.product?.brand.name, item.product?.productLine.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>{workflowLabels[item.workflow_status] ?? "Em preparação"}</td>
                    <td>{counts.models}</td>
                    <td>{counts.variants}</td>
                    <td>{counts.skus}</td>
                    <td>{counts.attributes}</td>
                    <td>{item.product ? "Contrato íntegro" : "Requer reparo orientado"}</td>
                    <td>
                      <Link to={`/admin/produtos/${item.id}?etapa=modelos`}>Abrir cadastro completo</Link>
                      {item.legacy && (
                        <button type="button" onClick={() => void openReconciliation(item)}>
                          Analisar legado
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reconciliationItem && (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pim-reconciliation-title"
          >
            <h2 id="pim-reconciliation-title">Reconciliação autoritativa do produto legado</h2>
            {reconciliationBusy && !reconciliationPlan ? (
              <p role="status">Conferindo a integridade e as diferenças no servidor…</p>
            ) : reconciliationError && !reconciliationPlan ? (
              <div role="alert" className="admin-notice admin-notice--error">
                {reconciliationError}
              </div>
            ) : reconciliationPlan ? (
              <>
                <p>
                  Resultado:{" "}
                  {reconciliationPlan.equivalent
                    ? "equivalência comprovada"
                    : "diferenças exigem decisão privilegiada"}
                  .
                </p>
                <details>
                  <summary>Detalhes técnicos de integridade</summary>
                  <p>
                    Resumo de integridade do cadastro anterior:{" "}
                    <code>{reconciliationPlan.legacySnapshotSha256}</code>
                  </p>
                </details>
                {reconciliationPlan.reasons.length > 0 && (
                  <ul>
                    {reconciliationPlan.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                {!reconciliationPlan.equivalent && (
                  <label>
                    <input
                      type="checkbox"
                      checked={reconciliationAcknowledged}
                      onChange={(event) => setReconciliationAcknowledged(event.target.checked)}
                    />
                    Confirmo a retirada explícita do grafo legado divergente, vinculada ao resumo acima.
                  </label>
                )}
                <label>
                  Justificativa auditável
                  <textarea
                    value={reconciliationReason}
                    onChange={(event) => setReconciliationReason(event.target.value)}
                    maxLength={500}
                  />
                </label>
                {reconciliationError && <p role="alert">{reconciliationError}</p>}
                <button
                  type="button"
                  disabled={
                    reconciliationBusy ||
                    reconciliationReason.trim().length < 3 ||
                    (!reconciliationPlan.equivalent && !reconciliationAcknowledged)
                  }
                  onClick={() => void applyReconciliation()}
                >
                  {reconciliationPlan.equivalent
                    ? "Arquivar legado equivalente"
                    : "Retirar legado divergente"}
                </button>
              </>
            ) : null}
            <button type="button" disabled={reconciliationBusy} onClick={() => setReconciliationItem(null)}>
              Fechar
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
