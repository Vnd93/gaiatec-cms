import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  FileCheck2,
  Layers3,
  Redo2,
  Save,
  Shapes,
  Trash2,
  Undo2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import {
  Ev2VisualBranchListResultSchema,
  Ev2VisualCapabilityResultSchema,
  Ev2VisualCatalogSchema,
  Ev2VisualDocumentResultSchema,
  Ev2VisualDocumentSchema,
  Ev2VisualMutationResultSchema,
  type Ev2VisualCatalog,
  type Ev2VisualDocument,
  type Ev2VisualDocumentResult,
} from "@/shared/contracts/ev2-visual";
import type { CmsPageBlock, CmsPageContent } from "@/shared/contracts/cms-content";
import { CmsPageRenderer } from "@/public/components/CmsPageRenderer";
import { CmsApiError, mediaCommand, visualStudioCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import {
  governedFormBindingIssue,
  pageBlockReferenceRequirement,
  type PublishedFormOption,
} from "../page-builder-model";
import {
  appendVisualComponent,
  duplicateVisualNode,
  moveVisualNode,
  removeVisualNode,
  reorderVisualNode,
  groupVisualNodes,
  setVisualSpan,
  setVisualStart,
  setVisualVisibility,
  ungroupVisualNodes,
  updateVisualNode,
  visualPageMetadata,
} from "../visual-studio-model";
import { PageBlockEditor, type BuilderMedia, type BuilderRelation } from "../components/PageBlockEditor";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { humanValidationIssue } from "../validation-field-label";
import "../admin-visual-studio.css";

const CMS_ENVIRONMENT = cmsEnvironment();
type Breakpoint = "desktop" | "tablet" | "mobile";
type ConflictReplacement = {
  strategy: "replace_remote";
  staleVersion: number;
  remoteVersion: number;
};

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" as const },
  };
}

export default function AdminVisualStudioPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const candidateEnabled = isEv2FeatureEnabled(profile, "ev2.visual_studio");
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    candidateEnabled ? "checking" : "disabled",
  );
  const [catalog, setCatalog] = useState<Ev2VisualCatalog | null>(null);
  const [loaded, setLoaded] = useState<Ev2VisualDocumentResult | null>(null);
  const [document, setDocument] = useState<Ev2VisualDocument | null>(null);
  const [basePayload, setBasePayload] = useState<CmsPageContent | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [media, setMedia] = useState<BuilderMedia[]>([]);
  const [relations, setRelations] = useState<BuilderRelation[]>([]);
  const [forms, setForms] = useState<PublishedFormOption[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [history, setHistory] = useState<Ev2VisualDocument[]>([]);
  const [future, setFuture] = useState<Ev2VisualDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [conflictReplacement, setConflictReplacement] = useState<ConflictReplacement | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState("");
  const [symbolName, setSymbolName] = useState("");
  const [symbolKey, setSymbolKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canEdit = profile?.permissions.includes("cms:visual.edit") ?? false;
  const canDesign = profile?.permissions.includes("cms:visual.design") ?? false;
  const canBranch = profile?.permissions.includes("cms:visual.branch") ?? false;
  const canSnapshot = profile?.permissions.includes("cms:visual.snapshot") ?? false;
  const canSymbol = profile?.permissions.includes("cms:visual.symbols") ?? false;
  const canApply = profile?.permissions.includes("cms:visual.apply") ?? false;
  const hasMutationMfa = profile?.mfaVerified === true;
  const canEditDocument = canEdit && (document?.mode !== "designer" || canDesign);

  const loadSupportingData = useCallback(async () => {
    if (!itemId || !session) return;
    const mediaRequest = async () => {
      const items: BuilderMedia[] = [];
      const pageSize = 50;
      let page = 1;
      let total = 1;
      while ((page - 1) * pageSize < total) {
        const result = await mediaCommand<{ items: BuilderMedia[]; total: number }>(session, {
          action: "list",
          query: "",
          page,
          pageSize,
        });
        items.push(...result.items);
        total = result.total;
        if (result.items.length === 0) break;
        page += 1;
      }
      return items.filter(
        (asset) =>
          asset.processing_status === "ready" && (!asset.scan_status || asset.scan_status === "clean"),
      );
    };
    const [draftResult, mediaResult, relationResult, formResult] = await Promise.all([
      supabase.from("cms_content_drafts").select("payload,lock_version").eq("item_id", itemId).single(),
      mediaRequest(),
      supabase
        .from("cms_content_items")
        .select("id,content_type,slug,cms_content_drafts(payload)")
        .in("content_type", ["product", "service", "industry", "application", "solution", "page"])
        .neq("workflow_status", "trashed")
        .order("updated_at", { ascending: false }),
      supabase
        .from("cms_form_definitions")
        .select("id,form_key,active_version_id,title")
        .eq("status", "published")
        .not("active_version_id", "is", null)
        .order("title", { ascending: true }),
    ]);
    if (draftResult.error) throw new Error("O rascunho editorial de origem não está disponível.");
    setBasePayload(draftResult.data.payload as CmsPageContent);
    setDraftVersion(draftResult.data.lock_version);
    setMedia(mediaResult);
    setRelations(
      (relationResult.data ?? [])
        .filter((row: any) => row.id !== itemId)
        .map((row: any) => ({
          ...(() => {
            const payload = Array.isArray(row.cms_content_drafts)
              ? row.cms_content_drafts[0]?.payload
              : row.cms_content_drafts?.payload;
            const path =
              payload?.route?.path ??
              (row.content_type === "product"
                ? `/produtos/${row.slug}`
                : row.content_type === "industry"
                  ? `/industrias/${row.slug}`
                  : row.content_type === "application"
                    ? `/aplicacoes/${row.slug}`
                    : row.content_type === "solution"
                      ? `/solucoes/${row.slug}`
                      : row.content_type === "service"
                        ? `/servicos/${row.slug}`
                        : `/${row.slug}`);
            return { path, summary: payload?.summary };
          })(),
          id: row.id,
          content_type: row.content_type,
          slug: row.slug,
          label:
            (Array.isArray(row.cms_content_drafts)
              ? row.cms_content_drafts[0]?.payload?.title
              : row.cms_content_drafts?.payload?.title) ?? row.slug,
        })),
    );
    setForms(
      (formResult.data ?? []).flatMap((row) =>
        row.active_version_id
          ? [
              {
                id: row.id,
                formKey: row.form_key,
                versionId: row.active_version_id,
                title: row.title,
              },
            ]
          : [],
      ),
    );
  }, [itemId, session]);

  const load = useCallback(async () => {
    if (!session || !itemId || !candidateEnabled) return;
    setError("");
    try {
      const capabilityResult = Ev2VisualCapabilityResultSchema.parse(
        await visualStudioCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!capabilityResult.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      const [catalogResult, branchesResult] = await Promise.all([
        visualStudioCommand(session, { action: "catalog", envelope: envelope() }),
        visualStudioCommand(session, { action: "list_branches", envelope: envelope(), itemId }),
        loadSupportingData(),
      ]);
      setCatalog(Ev2VisualCatalogSchema.parse(catalogResult));
      const branches = Ev2VisualBranchListResultSchema.parse(branchesResult).branches;
      const active = branches.find((branch) => branch.status === "draft");
      if (!active) {
        setLoaded(null);
        setDocument(null);
        setSelectedNodeId("");
        setConflict(false);
        setConflictVersion(null);
        setConflictReplacement(null);
        return;
      }
      const result = Ev2VisualDocumentResultSchema.parse(
        await visualStudioCommand(session, {
          action: "get_document",
          envelope: envelope(),
          branchId: active.id,
        }),
      );
      setLoaded(result);
      setDocument(result.document);
      setSelectedNodeId(result.document.nodes[0]?.id ?? "");
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setConflict(false);
      setConflictVersion(null);
      setConflictReplacement(null);
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "Estúdio Visual indisponível.");
    }
  }, [candidateEnabled, itemId, loadSupportingData, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedNode = document?.nodes.find((node) => node.id === selectedNodeId);
  const selectedNodeIndex = document?.nodes.findIndex((node) => node.id === selectedNodeId) ?? -1;
  const componentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of document?.nodes ?? []) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    return counts;
  }, [document]);
  const themeStyle = useMemo(() => {
    const variables: Record<string, string> = {};
    const tokenVariables: Record<string, string> = {
      "color.brand": "--cms-brand",
      "color.text": "--cms-text",
      "color.surface": "--cms-surface",
      "space.section": "--cms-section-space",
      "radius.card": "--cms-card-radius",
      "type.body": "--cms-body-font",
    };
    for (const token of catalog?.theme.tokens ?? []) {
      const variable = tokenVariables[token.key];
      if (variable) variables[variable] = token.value;
    }
    return variables as CSSProperties;
  }, [catalog]);
  const previewPayload = useMemo(() => {
    if (!basePayload || !document || !loaded) return null;
    return {
      ...basePayload,
      blocks: document.nodes,
      visual: visualPageMetadata(document, loaded.branch.id, loaded.branch.documentHash),
    } as CmsPageContent;
  }, [basePayload, document, loaded]);
  const previewMediaUrls = useMemo(
    () =>
      Object.fromEntries(
        media.flatMap((asset) =>
          asset.preview_url
            ? [
                [`${asset.id}:large.avif`, asset.preview_url],
                [`${asset.id}:large.webp`, asset.preview_url],
                [`${asset.id}:medium.webp`, asset.preview_url],
              ]
            : [],
        ),
      ),
    [media],
  );
  const previewMediaAlt = useMemo(
    () => Object.fromEntries(media.map((asset) => [asset.id, asset.alt_text])),
    [media],
  );
  const previewRelatedItems = useMemo(
    () =>
      relations.map((item) => ({
        title: item.label,
        summary: item.summary,
        path: item.path ?? `/${item.slug}`,
        kind: item.content_type,
      })),
    [relations],
  );
  const formBindingIssue = useMemo(
    () => governedFormBindingIssue(document?.nodes ?? [], forms),
    [document?.nodes, forms],
  );

  function commit(next: Ev2VisualDocument) {
    if (!document) return;
    setHistory((current) => [...current.slice(-49), document]);
    setFuture([]);
    setDocument(next);
    setDirty(true);
    setError("");
    setSuccess("");
  }

  function safely(change: () => Ev2VisualDocument) {
    try {
      commit(change());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Alteração visual inválida.");
    }
  }

  function undo() {
    if (!document || history.length === 0) return;
    const previous = history.at(-1)!;
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [document, ...current].slice(0, 50));
    setDocument(previous);
    setDirty(true);
  }

  function redo() {
    if (!document || future.length === 0) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current.slice(-49), document]);
    setDocument(next);
    setDirty(true);
  }

  async function createBranch() {
    if (!session || !itemId || !hasMutationMfa) return;
    setBusy(true);
    setError("");
    try {
      Ev2VisualMutationResultSchema.parse(
        await visualStudioCommand(
          session,
          {
            action: "create_branch",
            envelope: envelope(),
            itemId,
            branchKey: `visual-${Date.now().toString(36)}`,
            mode: "guided",
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess("Branch visual criado a partir do rascunho atual.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o branch visual.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDocument() {
    if (!session || !loaded || !document || !hasMutationMfa) return false;
    if (formBindingIssue) {
      setError(formBindingIssue);
      return false;
    }
    const parsed = Ev2VisualDocumentSchema.safeParse(document);
    if (!parsed.success) {
      setError(humanValidationIssue(parsed.error.issues[0]) || "Documento visual incompleto.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const result = Ev2VisualMutationResultSchema.parse(
        await visualStudioCommand(
          session,
          {
            action: "save_document",
            envelope: envelope(),
            branchId: loaded.branch.id,
            expectedVersion: loaded.branch.documentVersion,
            document: parsed.data,
            ...(conflictReplacement ? { conflictResolution: conflictReplacement } : {}),
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess(`Documento salvo na versão ${result.documentVersion}.`);
      setConflict(false);
      setConflictVersion(null);
      setConflictReplacement(null);
      await load();
      return true;
    } catch (caught) {
      if (caught instanceof CmsApiError && caught.status === 409) {
        setConflict(true);
        setConflictVersion(loaded.branch.documentVersion);
        setConflictReplacement(null);
      }
      setError(caught instanceof Error ? caught.message : "A edição foi preservada, mas não foi salva.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resolveConflict(strategy: "server" | "local") {
    if (!session || !loaded) return;
    if (strategy === "local" && (!canDesign || !hasMutationMfa)) return;
    if (
      strategy === "local" &&
      !window.confirm(
        "A versão do servidor será substituída integralmente pela sua edição local no próximo salvamento. Deseja preparar essa substituição explícita?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const [documentResult] = await Promise.all([
        visualStudioCommand(session, {
          action: "get_document",
          envelope: envelope(),
          branchId: loaded.branch.id,
        }),
        loadSupportingData(),
      ]);
      const result = Ev2VisualDocumentResultSchema.parse(documentResult);
      const staleVersion = conflictVersion ?? loaded.branch.documentVersion;
      if (strategy === "local" && result.branch.documentVersion <= staleVersion) {
        throw new Error("A versão remota do conflito não avançou; recarregue o documento.");
      }
      setLoaded(result);
      setConflict(false);
      if (strategy === "server") {
        setConflictVersion(null);
        setConflictReplacement(null);
        setDocument(result.document);
        setSelectedNodeId(result.document.nodes[0]?.id ?? "");
        setHistory([]);
        setFuture([]);
        setDirty(false);
        setSuccess(
          `Versão ${result.branch.documentVersion} do servidor carregada; a edição local foi descartada.`,
        );
      } else {
        setConflictReplacement({
          strategy: "replace_remote",
          staleVersion,
          remoteVersion: result.branch.documentVersion,
        });
        setDirty(true);
        setSuccess(
          `Substituição explícita preparada sobre a versão ${result.branch.documentVersion}. Revise e salve para confirmar.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a base do conflito.");
    } finally {
      setBusy(false);
    }
  }

  async function snapshot() {
    if (!session || !loaded || dirty || !hasMutationMfa) return;
    setBusy(true);
    setError("");
    try {
      const result = Ev2VisualMutationResultSchema.parse(
        await visualStudioCommand(
          session,
          {
            action: "snapshot",
            envelope: envelope(),
            branchId: loaded.branch.id,
            expectedVersion: loaded.branch.documentVersion,
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess(`${result.snapshotCount} snapshots responsivos imutáveis gerados.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar os snapshots.");
    } finally {
      setBusy(false);
    }
  }

  async function createSymbol() {
    if (!session || !loaded || !selectedNode || dirty || !hasMutationMfa) return;
    setBusy(true);
    setError("");
    try {
      Ev2VisualMutationResultSchema.parse(
        await visualStudioCommand(
          session,
          {
            action: "create_symbol",
            envelope: envelope(),
            branchId: loaded.branch.id,
            expectedVersion: loaded.branch.documentVersion,
            nodeId: selectedNode.id,
            symbolKey,
            name: symbolName,
          },
          crypto.randomUUID(),
        ),
      );
      setSymbolKey("");
      setSymbolName("");
      setSuccess("Símbolo criado somente no site e ambiente atuais.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o símbolo.");
    } finally {
      setBusy(false);
    }
  }

  async function applyToDraft() {
    if (!session || !loaded || !draftVersion || dirty || !hasMutationMfa) return;
    if (formBindingIssue) {
      setError(formBindingIssue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = Ev2VisualMutationResultSchema.parse(
        await visualStudioCommand(
          session,
          {
            action: "apply_to_draft",
            envelope: envelope(),
            branchId: loaded.branch.id,
            expectedVersion: loaded.branch.documentVersion,
            expectedDraftVersion: draftVersion,
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess(
        `Aplicado somente ao rascunho v${result.draftLockVersion}; nenhuma publicação foi executada.`,
      );
      navigate(`/admin/paginas/${itemId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível aplicar ao rascunho.");
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!session || !loaded || dirty || !hasMutationMfa) return;
    setBusy(true);
    setError("");
    try {
      await visualStudioCommand(
        session,
        {
          action: "abandon",
          envelope: envelope(),
          branchId: loaded.branch.id,
          expectedVersion: loaded.branch.documentVersion,
        },
        crypto.randomUUID(),
      );
      setSuccess("Branch abandonado sem alterar o rascunho editorial.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abandonar o branch.");
    } finally {
      setBusy(false);
    }
  }

  if (!candidateEnabled) {
    return (
      <section>
        <h1>Estúdio Visual</h1>
        <div role="status" className="admin-notice">
          O Estúdio Visual não está disponível para esta sessão. O construtor de páginas permanece disponível.
        </div>
      </section>
    );
  }
  if (!itemId)
    return (
      <section>
        <h1>Estúdio Visual</h1>
        <div role="status" className="admin-notice">
          Selecione uma página administrada para abrir um documento visual isolado.
        </div>
        <Link to="/admin/paginas">Selecionar página</Link>
      </section>
    );
  if (capability !== "enabled") {
    return (
      <section>
        <h1>Estúdio Visual</h1>
        <div role={capability === "error" ? "alert" : "status"} className="admin-notice">
          {capability === "checking"
            ? "Verificando a disponibilidade do Estúdio Visual…"
            : capability === "error"
              ? error || "Não foi possível verificar a capacidade visual."
              : "A capacidade visual está desligada para esta identidade. O construtor de páginas continua disponível."}
        </div>
      </section>
    );
  }
  if (!document || !loaded || !catalog) {
    return (
      <section>
        <div className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">DOCUMENTO VISUAL VERSIONADO</p>
            <h1>Estúdio Visual</h1>
            <p className="admin-help">
              Inicie uma versão visual isolada a partir do rascunho atual. O construtor e a publicação não
              serão alterados.
            </p>
          </div>
          {canBranch && (
            <button
              type="button"
              className="admin-button"
              disabled={busy || !hasMutationMfa}
              onClick={() => void createBranch()}
            >
              <Shapes size={16} aria-hidden="true" /> Criar versão visual
            </button>
          )}
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
        {!hasMutationMfa && canBranch && (
          <div role="status" className="admin-notice">
            Criar o branch visual exige MFA. <Link to="/admin/mfa">Elevar sessão</Link>
          </div>
        )}
        <Link to={`/admin/paginas/${itemId}`}>Voltar ao construtor de páginas</Link>
      </section>
    );
  }

  return (
    <section className="admin-visual-studio">
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">DOCUMENTO VISUAL VERSIONADO</p>
          <h1>Estúdio Visual</h1>
          <p className="admin-help">
            20 componentes governados · grade 12/8/4 · sem HTML, CSS ou JavaScript arbitrário.
          </p>
        </div>
        <div className="admin-heading-actions">
          <Link className="admin-button admin-button--secondary" to={`/admin/paginas/${itemId}`}>
            Construtor de páginas
          </Link>
          <button
            type="button"
            disabled={busy || !dirty || !canEditDocument || !hasMutationMfa || Boolean(formBindingIssue)}
            onClick={() => void saveDocument()}
          >
            <Save size={16} aria-hidden="true" /> Salvar documento
          </button>
          <button
            type="button"
            className="admin-button"
            disabled={busy || dirty || !canApply || !hasMutationMfa || Boolean(formBindingIssue)}
            onClick={() => void applyToDraft()}
          >
            <FileCheck2 size={16} aria-hidden="true" /> Aplicar ao rascunho
          </button>
        </div>
      </div>

      <div className="admin-visual-safety" role="note">
        <strong>Sem impacto público.</strong> Aplicar substitui os blocos do rascunho usando controle de
        versão; revisão, aprovação e publicação continuam no fluxo editorial existente.
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
          {conflict && (
            <span className="admin-visual-conflict-actions">
              <button type="button" disabled={busy} onClick={() => void resolveConflict("server")}>
                Carregar servidor e descartar edição local
              </button>
              {canDesign && hasMutationMfa && (
                <button type="button" disabled={busy} onClick={() => void resolveConflict("local")}>
                  Preparar substituição privilegiada
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {success && (
        <div role="status" className="admin-notice--success">
          {success}
        </div>
      )}
      {!hasMutationMfa && (canEdit || canBranch || canSnapshot || canSymbol || canApply) && (
        <div role="status" className="admin-notice">
          Toda alteração do Estúdio Visual exige autenticação em duas etapas; a consulta permanece disponível.{" "}
          <Link to="/admin/mfa">Elevar sessão</Link>
        </div>
      )}
      {document.mode === "designer" && !canDesign && (
        <div role="status" className="admin-notice">
          Este documento está em Modo Designer. Selecione o modo Guiado para editar ou solicite a permissão de
          design visual ao administrador.
        </div>
      )}
      {formBindingIssue && (
        <div role="alert" className="admin-notice admin-notice--error">
          {formBindingIssue}
        </div>
      )}

      <div className="admin-visual-toolbar" role="group" aria-label="Ferramentas do documento visual">
        <button type="button" disabled={!history.length || busy} onClick={undo} aria-label="Desfazer">
          <Undo2 size={16} aria-hidden="true" /> Desfazer
        </button>
        <button type="button" disabled={!future.length || busy} onClick={redo} aria-label="Refazer">
          <Redo2 size={16} aria-hidden="true" /> Refazer
        </button>
        <span aria-live="polite">
          {dirty ? "Alterações locais não salvas" : `Versão ${loaded.branch.documentVersion} salva`}
        </span>
        <label>
          Modo
          <select
            value={document.mode}
            disabled={!canEdit || busy}
            onChange={(event) => {
              const mode = event.target.value === "designer" ? "designer" : "guided";
              if (mode === "designer" && !canDesign) {
                setError("O Modo Designer exige a permissão de design visual.");
                return;
              }
              commit({ ...document, mode });
            }}
          >
            <option value="guided">Guiado</option>
            <option value="designer" disabled={!canDesign}>
              Designer
            </option>
          </select>
        </label>
      </div>

      <div className="admin-visual-workspace">
        <aside className="admin-visual-palette" aria-label="Biblioteca de componentes">
          <h2>
            <Shapes size={18} aria-hidden="true" /> Componentes
          </h2>
          <p>Selecione para inserir ao final do documento.</p>
          <div>
            {catalog.components.map((component) => {
              const count = componentCounts.get(component.key) ?? 0;
              const exhausted = count >= component.budget.maxInstances || document.nodes.length >= 80;
              const referenceRequirement = pageBlockReferenceRequirement(component.key);
              const referenceUnavailable =
                (referenceRequirement === "media" && media.length === 0) ||
                (referenceRequirement === "relation" && relations.length === 0) ||
                (referenceRequirement === "form" && forms.length === 0);
              return (
                <button
                  key={component.key}
                  type="button"
                  disabled={!canEditDocument || busy || exhausted || referenceUnavailable}
                  title={
                    exhausted
                      ? "Limite governado atingido"
                      : referenceUnavailable
                        ? `Cadastre ${
                            referenceRequirement === "media"
                              ? "uma mídia"
                              : referenceRequirement === "form"
                                ? "um formulário publicado"
                                : "um conteúdo relacionado"
                          } antes de inserir`
                        : undefined
                  }
                  onClick={() =>
                    safely(() =>
                      appendVisualComponent(document, component.key, {
                        assetId: media[0]?.id,
                        relatedItemId: relations[0]?.id,
                        form: forms[0],
                      }),
                    )
                  }
                >
                  <span>{component.name}</span>
                  <small>
                    {component.category} · v{component.version} · {count}/{component.budget.maxInstances}
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="admin-visual-canvas-column">
          <div className="admin-visual-breakpoints" role="group" aria-label="Viewport de pré-visualização">
            {(["desktop", "tablet", "mobile"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={breakpoint === item}
                onClick={() => setBreakpoint(item)}
              >
                {item === "desktop" ? "Desktop · 12" : item === "tablet" ? "Tablet · 8" : "Mobile · 4"}
              </button>
            ))}
          </div>
          <div
            className="admin-visual-canvas"
            data-breakpoint={breakpoint}
            role="group"
            aria-label={`Canvas ${breakpoint}`}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onSubmitCapture={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {previewPayload && (
              <CmsPageRenderer
                payload={previewPayload}
                mediaUrls={previewMediaUrls}
                mediaAlt={previewMediaAlt}
                relatedItems={previewRelatedItems}
                viewport={breakpoint}
                themeStyle={themeStyle}
              />
            )}
            <p className="admin-visual-preview-note">
              Preview seguro: links e envios de formulário desativados.
            </p>
          </div>
        </div>

        <aside className="admin-visual-layers" aria-label="Camadas e propriedades">
          <h2>
            <Layers3 size={18} aria-hidden="true" /> Camadas
          </h2>
          <ol>
            {document.nodes.map((node, index) => {
              const definition = catalog.components.find((component) => component.key === node.type);
              return (
                <li
                  key={node.id}
                  draggable={canEditDocument && !busy}
                  onDragStart={() => setDraggedNodeId(node.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedNodeId) safely(() => reorderVisualNode(document, draggedNodeId, node.id));
                    setDraggedNodeId("");
                  }}
                >
                  <button
                    type="button"
                    className={selectedNodeId === node.id ? "is-selected" : undefined}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <span>{definition?.name ?? node.type}</span>
                    <small>
                      {node.layout?.[breakpoint].span}/{document.grid[breakpoint]}
                    </small>
                  </button>
                  <span className="admin-visual-layer-actions">
                    <button
                      type="button"
                      aria-label={`Mover ${definition?.name ?? node.type} para cima`}
                      disabled={!canEditDocument || busy || index === 0}
                      onClick={() => safely(() => moveVisualNode(document, node.id, -1))}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${definition?.name ?? node.type} para baixo`}
                      disabled={!canEditDocument || busy || index === document.nodes.length - 1}
                      onClick={() => safely(() => moveVisualNode(document, node.id, 1))}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Duplicar ${definition?.name ?? node.type}`}
                      disabled={!canEditDocument || busy}
                      onClick={() => safely(() => duplicateVisualNode(document, node.id))}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${definition?.name ?? node.type}`}
                      disabled={!canEditDocument || busy || document.nodes.length === 1}
                      onClick={() => safely(() => removeVisualNode(document, node.id))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          {selectedNode && (
            <div className="admin-visual-properties">
              <h3>Layout · {breakpoint}</h3>
              <label>
                Colunas ocupadas
                <input
                  type="range"
                  min="1"
                  max={document.grid[breakpoint]}
                  value={selectedNode.layout?.[breakpoint].span ?? document.grid[breakpoint]}
                  disabled={!canEditDocument || busy}
                  onChange={(event) =>
                    safely(() =>
                      setVisualSpan(document, selectedNode.id, breakpoint, Number(event.target.value)),
                    )
                  }
                />
                <output>{selectedNode.layout?.[breakpoint].span ?? document.grid[breakpoint]}</output>
              </label>
              {!selectedNode.groupId && (
                <label>
                  Coluna inicial
                  <select
                    value={selectedNode.layout?.[breakpoint].start ?? ""}
                    disabled={!canEditDocument || busy}
                    onChange={(event) =>
                      safely(() =>
                        setVisualStart(
                          document,
                          selectedNode.id,
                          breakpoint,
                          event.target.value ? Number(event.target.value) : undefined,
                        ),
                      )
                    }
                  >
                    <option value="">Automática</option>
                    {Array.from(
                      {
                        length:
                          document.grid[breakpoint] -
                          (selectedNode.layout?.[breakpoint].span ?? document.grid[breakpoint]) +
                          1,
                      },
                      (_, index) => index + 1,
                    ).map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={selectedNode.layout?.[breakpoint].hidden ?? false}
                  disabled={!canEditDocument || busy}
                  onChange={(event) =>
                    safely(() =>
                      setVisualVisibility(document, selectedNode.id, breakpoint, event.target.checked),
                    )
                  }
                />
                Ocultar neste breakpoint
              </label>
              <div className="admin-visual-group-actions">
                <button
                  type="button"
                  disabled={!canEditDocument || busy || selectedNodeIndex <= 0}
                  onClick={() => {
                    const firstSelectedIndex = selectedNode.groupId
                      ? document.nodes.findIndex((node) => node.groupId === selectedNode.groupId)
                      : selectedNodeIndex;
                    const previous = document.nodes[firstSelectedIndex - 1];
                    if (!previous) return;
                    const nodeIds = document.nodes
                      .filter(
                        (node) =>
                          node.id === selectedNode.id ||
                          node.id === previous.id ||
                          (selectedNode.groupId && node.groupId === selectedNode.groupId) ||
                          (previous.groupId && node.groupId === previous.groupId),
                      )
                      .map((node) => node.id);
                    safely(() =>
                      groupVisualNodes(
                        document,
                        nodeIds,
                        previous.groupId ?? selectedNode.groupId ?? crypto.randomUUID(),
                      ),
                    );
                  }}
                >
                  Agrupar com anterior
                </button>
                {selectedNode.groupId && (
                  <button
                    type="button"
                    disabled={!canEditDocument || busy}
                    onClick={() => safely(() => ungroupVisualNodes(document, selectedNode.groupId!))}
                  >
                    Desagrupar
                  </button>
                )}
              </div>
              <fieldset className="admin-visual-editor-lock" disabled={!canEditDocument || busy}>
                <PageBlockEditor
                  block={selectedNode as CmsPageBlock}
                  index={selectedNodeIndex}
                  total={document.nodes.length}
                  media={media}
                  relations={relations}
                  forms={forms}
                  onChange={(block) => safely(() => updateVisualNode(document, selectedNode.id, block))}
                  onRemove={() => safely(() => removeVisualNode(document, selectedNode.id))}
                  onDuplicate={() => safely(() => duplicateVisualNode(document, selectedNode.id))}
                  onMove={(offset) => safely(() => moveVisualNode(document, selectedNode.id, offset))}
                />
              </fieldset>
              {canSymbol && (
                <fieldset>
                  <legend>Símbolo reutilizável</legend>
                  <label>
                    Nome
                    <input value={symbolName} onChange={(event) => setSymbolName(event.target.value)} />
                  </label>
                  <label>
                    Chave
                    <input
                      value={symbolKey}
                      onChange={(event) => setSymbolKey(event.target.value)}
                      placeholder="cabecalho-produto"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || dirty || !hasMutationMfa || !symbolName || !symbolKey}
                    onClick={() => void createSymbol()}
                  >
                    Criar no site atual
                  </button>
                </fieldset>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="admin-visual-footer-actions">
        <button
          type="button"
          disabled={busy || dirty || !canSnapshot || !hasMutationMfa}
          onClick={() => void snapshot()}
        >
          <Eye size={16} aria-hidden="true" /> Gerar snapshots 12/8/4
        </button>
        <span>{loaded.snapshots.length} snapshots registrados</span>
        <button
          type="button"
          disabled={busy || dirty || !canBranch || !hasMutationMfa}
          onClick={() => void abandon()}
        >
          Abandonar branch
        </button>
      </div>
    </section>
  );
}
