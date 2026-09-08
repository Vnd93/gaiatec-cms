import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { PRODUCTION_FUNCTIONS } from "../ev2/phase12/production-backend-lib.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const toolingRepositoryRoot = realpathSync(resolve(scriptDirectory, "../.."));
const args = process.argv.slice(2);

function optionalSingleArgument(name) {
  const flag = `--${name}`;
  const indexes = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length > 1) throw new Error(`QA_CMS_ARGUMENT_REPEATED:${name}`);
  if (!indexes.length) return null;
  const value = args[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`QA_CMS_ARGUMENT_VALUE_REQUIRED:${name}`);
  return value;
}

const requestedRepositoryRoot = optionalSingleArgument("repository-root");
let repositoryRoot;
try {
  repositoryRoot = realpathSync(
    requestedRepositoryRoot ? resolve(process.cwd(), requestedRepositoryRoot) : toolingRepositoryRoot,
  );
} catch {
  throw new Error("QA_CMS_REPOSITORY_ROOT_UNAVAILABLE");
}
if (
  !statSync(repositoryRoot).isDirectory() ||
  !existsSync(resolve(repositoryRoot, ".git")) ||
  !existsSync(resolve(repositoryRoot, "package.json")) ||
  !existsSync(resolve(repositoryRoot, "src/admin")) ||
  !existsSync(resolve(repositoryRoot, "supabase"))
) {
  throw new Error("QA_CMS_REPOSITORY_ROOT_INVALID");
}
const historicalRepositoryRoot = repositoryRoot !== toolingRepositoryRoot;
if (historicalRepositoryRoot) {
  let sourceSha;
  let toolingSha;
  try {
    sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    toolingSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: toolingRepositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("QA_CMS_REPOSITORY_ROOT_GIT_IDENTITY_REQUIRED");
  }
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^[a-f0-9]{40}$/.test(toolingSha)) {
    throw new Error("QA_CMS_REPOSITORY_ROOT_GIT_IDENTITY_INVALID");
  }
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", sourceSha, toolingSha], {
    cwd: toolingRepositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (ancestry.status !== 0) throw new Error("QA_CMS_REPOSITORY_ROOT_NOT_TOOLING_ANCESTOR");
}
const canonicalDocumentationSha = "4f5e2e7638fd9a2c2da17717e641abb7e685ece0";
const canonicalDocumentation = {
  repository: "Vnd93/gaiatec-documentacao",
  revision: canonicalDocumentationSha,
  localIndexes: ["src/admin/README.md", "docs/ev2/README.md"],
  authoritativeLocations: [
    `https://github.com/Vnd93/gaiatec-documentacao/tree/${canonicalDocumentationSha}/docs/30-cms`,
    `https://github.com/Vnd93/gaiatec-documentacao/tree/${canonicalDocumentationSha}/docs/80-evolucao/ev2`,
    ".github/release-controls",
  ],
  reviewedDocuments: [
    "docs/30-cms/matriz-rotas-cms.md",
    "docs/30-cms/inventario-telas-e-componentes.md",
    "docs/30-cms/design-system-admin-gaiatec.md",
    "docs/30-cms/api.md",
    "docs/30-cms/manual-do-usuario/manual-do-usuario-cms-gaiatec.pdf",
    "docs/30-cms/manual-do-usuario/manual-do-usuario-cms-gaiatec.docx",
    "docs/10-produto-requisitos/planejamento-implementacao-cms.md",
    "docs/20-arquitetura-seguranca/adr/ADR-001..ADR-028 (coleção integral)",
    "docs/80-evolucao/ev2/ESPECIFICACAO_TECNICA_FUNCIONAL_E_PLANO_DE_IMPLEMENTACAO.md",
    "docs/80-evolucao/ev2/fase-11/MATRIZ_HOMOLOGACAO.md",
  ],
  redesignArtifact: {
    fileName: "CMS Gaiatec Redesign.dc.html",
    sha256: "2FB1845FCD40680585F34550A69CD7F9E13631004B32C43B06B6D4B2F8B1E8CF",
    classification: "referência visual e funcional recebida; não é backend nem evidência de operação",
  },
};

const PUBLIC_SOURCE_OWNERS = {
  "src/admin/pages/CmsPreviewPage.tsx": ["public-preview"],
  "src/admin/pages/CmsPublishedPage.tsx": ["public-cms-content"],
};
const PUBLIC_OWNER_BINDINGS = {
  "public-preview": { route: "/preview/:token", edgeFunction: "cms-preview" },
  "public-cms-content": { route: "/cms/conteudo/:slug", edgeFunction: "cms-public" },
};

const GLOBAL_ADMIN_SOURCE_OWNERS = ["src/admin/components/AdminShell.tsx"];
// These editors share one route module, but only one of them is rendered for
// each section selected in the URL.  Whole-file ownership would make every
// field appear on all three surfaces and would force the browser gate to claim
// evidence for controls that cannot exist in that route state.
const ADMIN_DECLARATION_OWNER_OVERRIDES = {
  "src/admin/pages/AdminSiteConfigurationPage.tsx#NavigationEditor": ["site-navigation"],
  "src/admin/pages/AdminSiteConfigurationPage.tsx#SettingsEditor": ["site-settings"],
  "src/admin/pages/AdminSiteConfigurationPage.tsx#PlacementEditor": ["site-placements"],
};
const OPERATIONAL_EDGE_OWNERS = {
  "cms-outbox-worker": ["work-inbox", "campaign-edit", "forms", "leads", "diagnostics"],
  "lead-capture": ["forms", "campaign-edit"],
  "submit-contact": ["public-contact-compatibility"],
  "rdo-command": ["rdo-report-editor", "rdo-reports"],
  "rdo-invite": ["rdo-team-management"],
  "rdo-notify": ["rdo-report-editor"],
  "rdo-otp": ["rdo-authentication"],
  "rdo-sign": ["rdo-public-signature"],
  "rdo-team": ["rdo-team-management"],
};
const OPERATIONAL_EDGE_CONSUMER_SOURCES = {
  "lead-capture": ["src/public/lead-api.ts"],
  "submit-contact": ["scripts/phase1/remote-staging-tests.ps1"],
  "rdo-command": ["src/app/rdo/lib/relatorios.ts", "src/app/rdo/lib/assinatura.ts"],
  "rdo-invite": ["src/app/rdo/lib/invite.ts"],
  "rdo-notify": ["src/app/rdo/lib/notify.ts", "src/app/rdo/lib/assinatura.ts"],
  "rdo-otp": ["src/app/rdo/AuthContext.tsx"],
  "rdo-sign": ["src/app/rdo/pages/AssinarPage.tsx"],
  "rdo-team": ["src/app/rdo/lib/team.ts"],
};
const EXTERNAL_EDGE_FUNCTIONS = new Set([
  "Supabase Auth signInWithPassword",
  "Supabase Auth updateUser",
  "Supabase Auth MFA",
  "Supabase Auth signOut",
]);

const EXTERNAL_RELATIONS = new Set(["auth.users", "auth.mfa_factors", "auth.mfa_challenges"]);

const profiles = {
  login: {
    section: "Autenticação",
    menu: "Acesso",
    purpose: "Autenticar operador previamente convidado sem cadastro público.",
    sourceFiles: ["src/admin/pages/LoginPage.tsx", "src/admin/auth/AdminAuthContext.tsx"],
    permissions: ["anônimo ou sessão existente"],
    apiHelpers: [],
    edgeFunctions: ["Supabase Auth signInWithPassword", "cms-session"],
    tables: ["auth.users", "cms_profiles", "cms_user_roles", "cms_session_revocations", "cms_audit_log"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; rota privada com noindex/nofollow/noarchive.",
  },
  recovery: {
    section: "Autenticação",
    menu: "Recuperação",
    purpose: "Solicitar recuperação sem revelar se a conta existe.",
    sourceFiles: ["src/admin/pages/RecoveryPage.tsx", "src/admin/auth/AdminAuthContext.tsx"],
    permissions: ["anônimo"],
    apiHelpers: [],
    edgeFunctions: ["cms-recovery"],
    tables: ["auth.users", "cms_profiles", "cms_audit_log", "request_rate_limits"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; rota privada.",
  },
  setPassword: {
    section: "Autenticação",
    menu: "Ativação/recuperação",
    purpose: "Definir senha após convite ou recuperação válida.",
    sourceFiles: ["src/admin/pages/SetPasswordPage.tsx", "src/admin/auth/AdminAuthContext.tsx"],
    permissions: ["sessão PASSWORD_RECOVERY válida"],
    apiHelpers: [],
    edgeFunctions: ["Supabase Auth updateUser", "cms-session"],
    tables: ["auth.users", "cms_profiles", "cms_audit_log"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; rota privada.",
  },
  mfa: {
    section: "Autenticação",
    menu: "MFA",
    purpose: "Matricular ou desafiar o segundo fator TOTP antes de liberar o CMS.",
    sourceFiles: ["src/admin/pages/MfaPage.tsx", "src/admin/auth/AdminAuthContext.tsx"],
    permissions: ["sessão Supabase autenticada e perfil CMS ativo"],
    apiHelpers: [],
    edgeFunctions: ["Supabase Auth MFA", "cms-session"],
    tables: [
      "auth.mfa_factors",
      "auth.mfa_challenges",
      "cms_profiles",
      "cms_session_revocations",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; eleva a sessão administrativa para AAL2.",
  },
  home: {
    section: "Trabalho",
    menu: "Visão geral",
    purpose: "Exibir indicadores, fila operacional, atividade e alertas críticos.",
    sourceFiles: ["src/admin/pages/AdminHomePage.tsx"],
    permissions: ["sessão CMS ativa"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_content_items", "cms_media_assets", "cms_operational_events", "cms_audit_log"],
    storage: [],
    publicConsumers: [],
    publicResult: "Resumo administrativo; não publica conteúdo diretamente.",
  },
  work: {
    section: "Trabalho",
    menu: "Meu trabalho",
    purpose: "Operar tarefas, releases editoriais, lotes e rollback governado.",
    sourceFiles: ["src/admin/pages/AdminWorkPage.tsx"],
    permissions: ["cms:collaboration.read", "cms:releases.read", "cms:bulk.read"],
    apiHelpers: ["bulkV2Command", "collaborationCommand", "releaseV2Command"],
    edgeFunctions: ["cms-collaboration", "cms-releases", "cms-bulk"],
    tables: [
      "cms_work_tasks",
      "cms_work_comments",
      "cms_release_packages",
      "cms_release_items",
      "cms_bulk_jobs",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: ["site público após publicação do release"],
    publicResult:
      "Itens do release aprovado aparecem em suas rotas públicas; rollback restaura a projeção anterior.",
    featureFlag: "ev2.collaboration_bulk",
  },
  aiAssist: {
    section: "Trabalho",
    menu: "Assistente IA",
    purpose: "Gerar sugestões com fonte, confiança, custo e revisão humana obrigatória.",
    sourceFiles: ["src/admin/pages/AdminAiAssistantPage.tsx"],
    permissions: ["cms:ai.read"],
    apiHelpers: ["aiAssistCommand"],
    edgeFunctions: ["cms-ai"],
    tables: ["cms_ai_sessions", "cms_ai_messages", "cms_ai_provider_calls", "cms_audit_log"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum conteúdo é publicado automaticamente.",
    featureFlag: "ev2.ai_assist",
  },
  aiExecute: {
    section: "Trabalho",
    menu: "Assistente IA / Execução",
    purpose: "Executar transações propostas pela IA somente após autorização humana e diff.",
    sourceFiles: ["src/admin/pages/AdminAiExecutionPage.tsx"],
    permissions: ["cms:ai.execute"],
    apiHelpers: ["aiExecuteCommand"],
    edgeFunctions: ["cms-ai-execute"],
    tables: [
      "cms_ai_execution_plans",
      "cms_ai_execution_approvals",
      "cms_ai_execution_runs",
      "cms_ai_execution_policy_decisions",
      "cms_command_receipts",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: ["consumidor correspondente somente após fluxo editorial posterior"],
    publicResult: "A execução não deve publicar por conta própria.",
    featureFlag: "ev2.ai_execute",
  },
  contentList: {
    section: "Conteúdo",
    menu: "Editorial",
    purpose: "Listar, buscar e filtrar artigos e seus estados editoriais.",
    sourceFiles: ["src/admin/pages/AdminContentPage.tsx"],
    permissions: ["cms:posts.read"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_content_items"],
    storage: [],
    publicConsumers: ["/blog", "/blog/:slug", "/cms/conteudo/:slug"],
    publicResult: "Somente revisões publicadas aparecem no blog e na projeção pública.",
  },
  contentEditor: {
    section: "Conteúdo",
    menu: "Editorial / Editor",
    purpose: "Criar e versionar artigo do rascunho à restauração ou retirada.",
    sourceFiles: [
      "src/admin/pages/AdminEditorPage.tsx",
      "src/admin/components/DamPicker.tsx",
      "src/admin/components/EditorialArchiveAction.tsx",
    ],
    permissions: ["cms:posts.read", "cms:posts.edit", "cms:posts.approve", "cms:posts.publish"],
    apiHelpers: ["damCommand", "editorialCommand", "issuePreview"],
    edgeFunctions: ["cms-content", "cms-media", "cms-preview"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_media_assets",
      "cms_form_definitions",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["/blog/:slug", "/cms/conteudo/:slug", "/preview/:token"],
    publicResult:
      "Artigo aprovado aparece na rota pública; arquivamento/retirada remove ou retorna 410 conforme regra.",
  },
  productsList: {
    section: "Catálogo",
    menu: "Produtos",
    purpose: "Listar, pesquisar, filtrar e paginar produtos e rascunhos.",
    sourceFiles: ["src/admin/pages/AdminProductsPage.tsx"],
    permissions: ["cms:products.read"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_content_items", "cms_content_drafts"],
    storage: [],
    publicConsumers: ["/produtos", "/busca", "/produtos/comparador"],
    publicResult: "Somente produtos publicados integram catálogo, busca e comparação.",
  },
  productEditor: {
    section: "Catálogo",
    menu: "Produtos / Editor",
    purpose: "Editar produto, modelos, variantes, SKU, atributos, mídia e documentos governados.",
    sourceFiles: [
      "src/admin/pages/AdminProductEditorPage.tsx",
      "src/admin/components/ProductDocumentsEditor.tsx",
      "src/admin/components/EditorialArchiveAction.tsx",
      "src/admin/hooks/useProgressiveDraftAutosave.ts",
    ],
    permissions: [
      "cms:products.read",
      "cms:products.edit",
      "cms:products.approve",
      "cms:products.publish",
      "cms:documents.read",
      "cms:documents.upload",
      "cms:documents.manage",
      "cms:documents.security_review",
    ],
    apiHelpers: [
      "controlledVocabularyCommand",
      "documentCommand",
      "draftV2Command",
      "editorialCommand",
      "issuePreview",
    ],
    edgeFunctions: [
      "cms-content",
      "cms-preview",
      "cms-controlled-vocabularies",
      "cms-documents",
      "cms-drafts-v2",
    ],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_drafts_v2",
      "cms_draft_v2_events",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_controlled_lists",
      "cms_controlled_options",
      "cms_document_assets",
      "cms_document_security_reviews",
      "cms_audit_log",
    ],
    storage: ["cms-media-private", "cms-documents-private"],
    publicConsumers: ["/produtos/:slug", "/produtos", "/busca", "/produtos/comparador", "/preview/:token"],
    publicResult:
      "Produto publicado expõe dados técnicos e somente documentos atestados por segundo ator, via URL assinada com attachment.",
  },
  bulkImport: {
    section: "Catálogo",
    menu: "Cadastro em massa",
    purpose: "Validar CSV/XLSX e criar produtos governados em lote com idempotência.",
    sourceFiles: ["src/admin/pages/AdminBulkImportPage.tsx"],
    permissions: ["cms:products.edit"],
    apiHelpers: ["bulkImportCommand"],
    edgeFunctions: ["cms-content"],
    tables: ["cms_content_items", "cms_content_drafts", "cms_command_receipts", "cms_audit_log"],
    storage: [],
    publicConsumers: ["/produtos após revisão e publicação individual"],
    publicResult: "Importação cria rascunhos; nunca deve publicar automaticamente.",
  },
  discovery: {
    section: "Catálogo",
    menu: "Descoberta",
    purpose: "Gerir serviço, indústria, aplicação ou solução e seus relacionamentos.",
    sourceFiles: [
      "src/admin/pages/AdminDiscoveryPage.tsx",
      "src/admin/components/EditorialArchiveAction.tsx",
    ],
    permissions: [
      "cms:services.read",
      "cms:services.edit",
      "cms:services.publish",
      "cms:industries.read",
      "cms:industries.edit",
      "cms:industries.publish",
      "cms:applications.read",
      "cms:applications.edit",
      "cms:applications.publish",
      "cms:solutions.read",
      "cms:solutions.edit",
      "cms:solutions.publish",
    ],
    apiHelpers: ["controlledVocabularyCommand", "editorialCommand", "issuePreview"],
    edgeFunctions: ["cms-content", "cms-preview", "cms-controlled-vocabularies"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_controlled_lists",
      "cms_controlled_options",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["/servicos", "/industrias", "/aplicacoes", "/solucoes e respectivas rotas :slug"],
    publicResult: "Entidade publicada aparece em listagem, detalhe, busca e relacionamentos públicos.",
  },
  search: {
    section: "Catálogo",
    menu: "Busca e sinônimos",
    purpose: "Consultar índice, sinônimos, regras, zero-results e reindexação.",
    sourceFiles: ["src/admin/pages/AdminSearchGovernancePage.tsx"],
    permissions: ["cms:search.read", "cms:search.manage"],
    apiHelpers: ["searchGovernanceCommand"],
    edgeFunctions: ["cms-search-admin"],
    tables: [
      "cms_search_documents",
      "cms_search_synonyms",
      "cms_search_rules",
      "cms_search_events",
      "cms_search_index_jobs",
      "cms_published_projection",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: ["/busca", "autocomplete público", "redirects de busca"],
    publicResult: "Índice e sinônimos alteram resultados públicos após reindexação concluída.",
    featureFlag: "ev2.search_quality",
  },
  quality: {
    section: "Trabalho",
    menu: "Centro de Qualidade",
    purpose: "Executar verificações de SEO, links, acessibilidade, mídia e waivers.",
    sourceFiles: ["src/admin/pages/AdminQualityPage.tsx"],
    permissions: ["cms:quality.read", "cms:quality.run", "cms:quality.waive"],
    apiHelpers: ["qualityCommand"],
    edgeFunctions: ["cms-quality"],
    tables: ["cms_quality_runs", "cms_quality_findings", "cms_quality_waivers", "cms_audit_log"],
    storage: [],
    publicConsumers: ["gate de publicação para todas as superfícies públicas"],
    publicResult: "Falha bloqueante impede publicação; waiver válido permanece auditado.",
    featureFlag: "ev2.search_quality",
  },
  vocabularies: {
    section: "Catálogo",
    menu: "Listas mestras",
    purpose: "Gerir listas e opções controladas com proteção de uso.",
    sourceFiles: ["src/admin/pages/AdminControlledVocabulariesPage.tsx"],
    permissions: ["cms:vocabularies.read", "cms:vocabularies.manage"],
    apiHelpers: ["controlledVocabularyCommand"],
    edgeFunctions: ["cms-controlled-vocabularies"],
    tables: ["cms_controlled_lists", "cms_controlled_options", "cms_audit_log"],
    storage: [],
    publicConsumers: ["filtros e metadados de catálogo/descoberta"],
    publicResult: "Opções públicas ativas alimentam campos e filtros dos consumidores.",
  },
  masterData: {
    section: "Catálogo",
    menu: "Dados mestres",
    purpose: "Gerir entidades mestras versionadas, relações e compatibilidades.",
    sourceFiles: ["src/admin/pages/AdminMasterDataPage.tsx"],
    permissions: ["cms:masterdata.read", "cms:masterdata.manage"],
    apiHelpers: ["masterDataCommand"],
    edgeFunctions: ["cms-master-data"],
    tables: [
      "cms_master_entities",
      "cms_master_entity_aliases",
      "cms_master_relation_rules",
      "cms_master_compatibilities",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: ["PIM, produto, descoberta e busca"],
    publicResult: "Dados homologados enriquecem relações públicas após publicação do item consumidor.",
    featureFlag: "ev2.master_data",
  },
  pim: {
    section: "Catálogo",
    menu: "PIM / Visão especializada",
    purpose:
      "Consultar o produto canônico, modelos, variantes, SKU e atributos; toda mutação segue o editor oficial de Produtos.",
    sourceFiles: ["src/admin/pages/AdminPimPage.tsx"],
    permissions: ["cms:products.read", "cms:pim.read", "cms:attributes.read"],
    apiHelpers: ["pimCommand", "attributesCommand"],
    edgeFunctions: ["cms-pim", "cms-attributes"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_pim_products",
      "cms_pim_models",
      "cms_pim_variants",
      "cms_pim_skus",
      "cms_pim_attribute_definitions",
      "cms_pim_attribute_values",
      "cms_pim_units",
    ],
    storage: [],
    publicConsumers: ["/produtos/:slug", "/busca", "/produtos/comparador"],
    publicResult:
      "A visão reflete o mesmo contrato publicado usado por produto, busca, filtros e comparação.",
    featureFlag: "ev2.pim_v2",
  },
  pagesList: {
    section: "Conteúdo",
    menu: "Páginas",
    purpose: "Listar páginas, templates, rascunhos e usos do construtor.",
    sourceFiles: ["src/admin/pages/AdminPagesPage.tsx"],
    permissions: ["cms:pages.read", "cms:homepage.read"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_content_items"],
    storage: [],
    publicConsumers: ["rotas gerenciadas do site"],
    publicResult: "Páginas publicadas resolvem sua rota gerenciada no Worker/site.",
  },
  pageEditor: {
    section: "Conteúdo",
    menu: "Páginas / Construtor",
    purpose: "Compor página por blocos, SEO, preview, versão, publicação e restauração.",
    sourceFiles: ["src/admin/pages/AdminPageBuilderPage.tsx"],
    permissions: ["cms:pages.read", "cms:pages.edit", "cms:pages.publish"],
    apiHelpers: ["editorialCommand", "issuePreview"],
    edgeFunctions: ["cms-content", "cms-preview"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_media_assets",
      "cms_form_definitions",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["rota pública definida no campo path", "/preview/:token"],
    publicResult: "Blocos da revisão publicada renderizam no caminho público com SEO correspondente.",
  },
  visual: {
    section: "Conteúdo",
    menu: "Estúdio Visual",
    purpose: "Editar composição visual com histórico, branches, símbolos, preview e conflitos.",
    sourceFiles: ["src/admin/pages/AdminVisualStudioPage.tsx"],
    permissions: ["cms:visual.read", "cms:visual.edit"],
    apiHelpers: ["mediaCommand", "visualStudioCommand"],
    edgeFunctions: ["cms-visual", "cms-media"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_page_branches",
      "cms_visual_symbols",
      "cms_media_assets",
      "cms_form_definitions",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["página pública correspondente após fluxo editorial"],
    publicResult: "Alteração visual só chega ao site depois de revisão/publicação humana.",
    featureFlag: "ev2.visual_studio",
  },
  siteConfiguration: {
    section: "Site",
    menu: "Navegação / Dados globais / Posicionamentos",
    purpose: "Versionar documentos globais do shell, menus, dados corporativos e placements.",
    sourceFiles: ["src/admin/pages/AdminSiteConfigurationPage.tsx"],
    permissions: [
      "cms:navigation.read",
      "cms:navigation.edit",
      "cms:navigation.publish",
      "cms:settings.read",
      "cms:settings.edit",
      "cms:settings.publish",
      "cms:placements.read",
      "cms:placements.edit",
      "cms:placements.publish",
    ],
    apiHelpers: ["editorialCommand", "issuePreview"],
    edgeFunctions: ["cms-content", "cms-preview"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["Header", "Footer", "menu mobile", "SitePlacements", "/preview/:token"],
    publicResult: "Shell e placements públicos refletem somente a revisão aprovada.",
  },
  sites: {
    section: "Site",
    menu: "Sites e ambientes",
    purpose: "Governar registro multisite, domínios e configuração por ambiente.",
    sourceFiles: ["src/admin/pages/AdminSitesPage.tsx"],
    permissions: ["cms:sites.read", "cms:sites.manage"],
    apiHelpers: ["sitesCommand"],
    edgeFunctions: ["cms-sites"],
    tables: ["cms_sites", "cms_site_domains", "cms_audit_log"],
    storage: [],
    publicConsumers: ["roteamento futuro por siteKey/domínio"],
    publicResult: "Somente registros ativos e aprovados participam do roteamento multisite.",
    featureFlag: "ev2.multisite",
  },
  marketingList: {
    section: "Marketing",
    menu: "Campanhas",
    purpose: "Listar campanhas, estados e janelas de vigência.",
    sourceFiles: ["src/admin/pages/AdminMarketingPage.tsx"],
    permissions: ["cms:campaigns.read"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_content_items"],
    storage: [],
    publicConsumers: ["/campanhas/:slug"],
    publicResult: "Campanhas publicadas e vigentes resolvem sua landing page.",
  },
  campaignEditor: {
    section: "Marketing",
    menu: "Campanhas / Editor",
    purpose: "Criar campanha, janela, landing, formulário, preview, publicação e arquivamento.",
    sourceFiles: [
      "src/admin/pages/AdminCampaignEditorPage.tsx",
      "src/admin/components/EditorialArchiveAction.tsx",
    ],
    permissions: ["cms:campaigns.read", "cms:campaigns.edit", "cms:campaigns.publish"],
    apiHelpers: ["editorialCommand", "issuePreview"],
    edgeFunctions: ["cms-content", "cms-preview"],
    tables: [
      "cms_content_items",
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_published_projection",
      "cms_media_assets",
      "cms_form_definitions",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["/campanhas/:slug", "/preview/:token", "lead-capture"],
    publicResult:
      "Landing vigente mostra campanha e formulário publicado; retirada deixa de servir conteúdo.",
  },
  forms: {
    section: "Marketing",
    menu: "Formulários",
    purpose: "Criar, versionar, publicar, retirar e arquivar formulários com consentimento.",
    sourceFiles: ["src/admin/pages/AdminFormsPage.tsx"],
    permissions: ["cms:forms.read", "cms:forms.edit", "cms:forms.publish"],
    apiHelpers: ["leadCommand"],
    edgeFunctions: ["cms-leads", "lead-capture"],
    tables: ["cms_form_definitions", "cms_form_versions", "cms_leads", "cms_lead_consents", "cms_audit_log"],
    storage: [],
    publicConsumers: ["CmsLeadForm", "páginas/campanhas com formulário incorporado"],
    publicResult: "Somente versão publicada aceita leads; retirada/arquivo bloqueia novas submissões.",
  },
  leads: {
    section: "Trabalho",
    menu: "Leads",
    purpose: "Triar, atribuir, exportar, reprocessar e anonimizar leads.",
    sourceFiles: ["src/admin/pages/AdminLeadsPage.tsx"],
    permissions: ["cms:leads.read", "cms:leads.manage", "cms:leads.export"],
    apiHelpers: ["leadCommand"],
    edgeFunctions: ["cms-leads"],
    tables: [
      "cms_leads",
      "cms_lead_status_history",
      "cms_profiles",
      "cms_lead_consents",
      "cms_lead_outbox",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: ["origem: formulários públicos; sem exposição pública dos leads"],
    publicResult: "Dados pessoais permanecem privados; exportação exige permissão e auditoria.",
  },
  media: {
    section: "Conteúdo",
    menu: "Mídia",
    purpose: "Enviar imagem privada, registrar direitos, usos e exclusão protegida.",
    sourceFiles: ["src/admin/pages/AdminMediaPage.tsx", "src/admin/pages/AdminDamPage.tsx"],
    permissions: ["cms:media.read", "cms:media.upload", "cms:media.manage"],
    apiHelpers: ["damCommand", "mediaCommand"],
    edgeFunctions: ["cms-media"],
    tables: [
      "cms_media_assets",
      "cms_media_variants",
      "cms_media_usages",
      "cms_dam_collections",
      "cms_dam_tags",
      "cms_dam_crops",
      "cms_dam_replacements",
      "cms_dam_gc_jobs",
      "cms_audit_log",
    ],
    storage: ["cms-media-private"],
    publicConsumers: ["páginas, artigos, produtos, campanhas e descoberta"],
    publicResult: "Somente variante autorizada é entregue por URL assinada em conteúdo publicado.",
  },
  profile: {
    section: "Administração",
    menu: "Perfil e sessão",
    purpose: "Exibir identidade, papéis, permissões, MFA e encerrar sessão local.",
    sourceFiles: ["src/admin/pages/AdminProfilePage.tsx"],
    permissions: ["sessão CMS ativa"],
    apiHelpers: [],
    edgeFunctions: ["cms-session", "Supabase Auth signOut"],
    tables: ["cms_profiles", "cms_user_roles", "cms_session_revocations"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; identidade administrativa privada.",
  },
  users: {
    section: "Administração",
    menu: "Usuários e acessos",
    purpose: "Convidar, ativar, suspender, revogar sessões e proteger o último superadministrador.",
    sourceFiles: ["src/admin/pages/AdminUsersPage.tsx", "src/admin/components/ScopedAccessPanel.tsx"],
    permissions: ["cms:users.read", "cms:users.invite", "cms:users.manage"],
    apiHelpers: ["scopedAccessCommand", "usersCommand"],
    edgeFunctions: ["cms-scopes", "cms-users"],
    tables: [
      "auth.users",
      "cms_profiles",
      "cms_user_roles",
      "cms_session_revocations",
      "cms_scoped_role_assignments",
      "cms_command_receipts",
      "cms_audit_log",
    ],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; não concede permissões do RDO implicitamente.",
  },
  diagnostics: {
    section: "Administração",
    menu: "Diagnósticos",
    purpose: "Inspecionar saúde, outbox, projeções e eventos operacionais sem dados sensíveis.",
    sourceFiles: ["src/admin/pages/AdminDiagnosticsPage.tsx"],
    permissions: ["cms:diagnostics.read"],
    apiHelpers: ["systemAssuranceCommand"],
    edgeFunctions: ["cms-system"],
    tables: ["cms_operational_events", "cms_publication_outbox", "cms_discovery_projection", "cms_audit_log"],
    storage: [],
    publicConsumers: ["/healthz", "projeções do site público"],
    publicResult: "Saúde degradada deve ser visível ao operador sem revelar payloads privados.",
    featureFlag: "ev2.system_assurance",
  },
  audit: {
    section: "Administração",
    menu: "Auditoria",
    purpose: "Pesquisar trilha imutável por ator, área, ação e período.",
    sourceFiles: ["src/admin/pages/AdminAuditPage.tsx"],
    permissions: ["cms:audit.read"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: ["cms_audit_log", "cms_profiles"],
    storage: [],
    publicConsumers: [],
    publicResult: "Nenhum; evidencia as operações que afetaram o site.",
  },
  notFound: {
    section: "Administração",
    menu: "Rota inexistente",
    purpose: "Falhar de forma segura para caminho administrativo não reconhecido.",
    sourceFiles: ["src/admin/pages/AdminNotFoundPage.tsx"],
    permissions: ["nenhuma"],
    apiHelpers: [],
    edgeFunctions: [],
    tables: [],
    storage: [],
    publicConsumers: [],
    publicResult: "404/noindex; nenhum dado administrativo é entregue.",
  },
};

const allProfileIds = Object.keys(profiles);
const functionalRequirementBindings = [
  {
    id: "F-001",
    title: "Rascunho livre, autosave e validação progressiva",
    profiles: ["contentEditor", "productEditor", "pageEditor", "campaignEditor", "forms"],
  },
  {
    id: "F-002",
    title: "Editor de produto orientado a tarefas",
    profiles: ["productsList", "productEditor", "pim", "bulkImport"],
  },
  {
    id: "F-003",
    title: "Dados mestres e taxonomias dependentes",
    profiles: ["masterData", "vocabularies", "productEditor", "pim"],
  },
  {
    id: "F-004",
    title: "Produto, modelo, variante e SKU normalizados",
    profiles: ["productsList", "productEditor", "pim", "bulkImport"],
  },
  {
    id: "F-005",
    title: "Atributos técnicos, unidades e compatibilidades",
    profiles: ["productEditor", "pim", "masterData", "quality"],
  },
  {
    id: "F-006",
    title: "DAM contextual e biblioteca avançada",
    profiles: ["media", "productEditor", "contentEditor", "pageEditor", "visual"],
  },
  {
    id: "F-007",
    title: "Busca unificada, técnica e relações assistidas",
    profiles: ["search", "productsList", "productEditor", "discovery", "contentList"],
  },
  {
    id: "F-008",
    title: "SEO automático e Centro de Qualidade",
    profiles: ["quality", "search", "productEditor", "contentEditor", "pageEditor", "campaignEditor"],
  },
  {
    id: "F-009",
    title: "Release bundle e workflow de conteúdo",
    profiles: ["work", "productEditor", "contentEditor", "pageEditor", "campaignEditor", "siteConfiguration"],
  },
  {
    id: "F-010",
    title: "Inbox, tarefas, comentários, histórico e diff",
    profiles: ["home", "work", "audit"],
  },
  { id: "F-011", title: "Estúdio Visual governado", profiles: ["visual", "pageEditor", "pagesList"] },
  {
    id: "F-012",
    title: "Fábrica de sites e multisite",
    profiles: ["sites", "siteConfiguration", "visual", "pagesList"],
  },
  {
    id: "F-013",
    title: "Operações em massa e importação/exportação",
    profiles: ["bulkImport", "work", "leads", "productsList"],
  },
  {
    id: "F-014",
    title: "Usuários, RBAC, auditoria e segregação",
    profiles: ["users", "audit", "profile", "mfa", "login"],
  },
  { id: "F-015", title: "Copiloto IA de leitura e rascunho", profiles: ["aiAssist", "work"] },
  { id: "F-016", title: "IA transacional controlada", profiles: ["aiExecute", "aiAssist", "audit"] },
  {
    id: "F-017",
    title: "Conteúdo, marketing, formulários e leads integrados",
    profiles: ["contentList", "contentEditor", "marketingList", "campaignEditor", "forms", "leads"],
  },
  {
    id: "F-018",
    title: "Performance, acessibilidade, observabilidade e resiliência",
    profiles: allProfileIds,
  },
];

function ruleRange(start, end, topic, ruleProfiles) {
  return Array.from({ length: end - start + 1 }, (_, offset) => ({
    id: `RB-${String(start + offset).padStart(3, "0")}`,
    topic,
    profiles: ruleProfiles,
  }));
}

const businessRuleBindings = [
  ...ruleRange(1, 4, "Rascunho e concorrência", [
    "contentEditor",
    "productEditor",
    "pageEditor",
    "campaignEditor",
    "forms",
  ]),
  ...ruleRange(5, 7, "Workflow editorial", [
    "work",
    "contentEditor",
    "productEditor",
    "pageEditor",
    "campaignEditor",
    "siteConfiguration",
  ]),
  ...ruleRange(8, 10, "Release e rollback", ["work", "audit"]),
  ...ruleRange(11, 12, "Endereço público e canonical", [
    "productEditor",
    "contentEditor",
    "pageEditor",
    "campaignEditor",
    "search",
  ]),
  ...ruleRange(13, 14, "Dados mestres", ["masterData", "vocabularies", "productEditor", "pim"]),
  ...ruleRange(15, 18, "Produto, variante e SKU", ["productEditor", "pim", "productsList", "bulkImport"]),
  ...ruleRange(19, 22, "Atributos e unidades", ["productEditor", "pim", "masterData", "quality"]),
  ...ruleRange(23, 25, "Mídia e direitos", ["media", "productEditor", "contentEditor", "pageEditor"]),
  ...ruleRange(26, 28, "Busca e compatibilidade", [
    "search",
    "quality",
    "productsList",
    "productEditor",
    "discovery",
  ]),
  ...ruleRange(29, 30, "SEO determinístico e IA", [
    "quality",
    "search",
    "productEditor",
    "contentEditor",
    "pageEditor",
    "campaignEditor",
    "aiAssist",
  ]),
  ...ruleRange(31, 34, "Composição visual segura", ["visual", "pageEditor", "siteConfiguration"]),
  ...ruleRange(35, 36, "Multisite", ["sites", "visual", "siteConfiguration"]),
  ...ruleRange(37, 40, "Autorização, MFA e auditoria", [
    "login",
    "mfa",
    "profile",
    "users",
    "audit",
    "diagnostics",
  ]),
  ...ruleRange(41, 46, "IA segura e controlada", ["aiAssist", "aiExecute", "audit", "diagnostics"]),
  ...ruleRange(47, 48, "Importação atômica e idempotente", ["bulkImport", "work"]),
  ...ruleRange(49, 50, "Leads, outbox e LGPD", ["forms", "leads", "diagnostics", "audit"]),
  ...ruleRange(51, 54, "API e compatibilidade de migrations", [
    "diagnostics",
    "audit",
    "work",
    "productEditor",
    "pim",
  ]),
  ...ruleRange(55, 56, "Segredos, PII, upload e URLs", [
    "login",
    "recovery",
    "media",
    "productEditor",
    "contentEditor",
    "aiAssist",
    "aiExecute",
    "leads",
    "diagnostics",
  ]),
  ...ruleRange(57, 58, "Acessibilidade e performance", allProfileIds),
  ...ruleRange(59, 60, "Gates e qualidade ponta a ponta", allProfileIds),
];

const redesignDivergences = [
  {
    id: "RD-001",
    prototype: "ações e toasts simulados no HTML de referência",
    productionDecision:
      "cada ação operacional precisa de efeito backend confirmado, auditoria e cenário negativo",
    evidence: ["tests/e2e/cms-final-coverage.spec.ts", "scripts/qa/cms-coverage-inventory.mjs"],
    status: "implementado; homologação runtime pendente",
  },
  {
    id: "RD-002",
    prototype: "editor comum permitia estruturas e identificadores técnicos em alguns módulos",
    productionDecision:
      "controles semânticos são o caminho comum; detalhes técnicos ficam restritos a auditoria/diagnóstico",
    evidence: [
      "src/admin/components/ProductSemanticEditors.tsx",
      "src/admin/pages/AdminProductEditorPage.tsx",
    ],
    status: "correção em validação de regressão",
  },
  {
    id: "RD-003",
    prototype: "Produtos e PIM podiam abrir cadastros independentes",
    productionDecision:
      "Produtos é o único fluxo de gravação; PIM é uma visão especializada do mesmo contrato canônico",
    evidence: ["src/admin/pages/AdminPimPage.tsx", "src/admin/pages/AdminProductEditorPage.tsx"],
    status: "frontend consolidado; reconciliação backend em implementação",
  },
];

function surface(id, routerPattern, testPath, profile, options = {}) {
  return { id, routerPattern, testPath, profile, ...options };
}

const surfaces = [
  surface("auth-login", "/admin/login", "/admin/login", "login", { testMode: "auth-journey" }),
  surface("auth-recovery", "/admin/recuperar-senha", "/admin/recuperar-senha", "recovery", {
    testMode: "signed-out",
  }),
  surface("auth-set-password", "/admin/definir-senha", "/admin/definir-senha", "setPassword", {
    testMode: "signed-out",
  }),
  surface("auth-mfa", "/admin/mfa", "/admin/mfa", "mfa", { testMode: "auth-journey" }),
  surface("work-overview", "/admin", "/admin", "home", { menuPath: "/admin" }),
  surface("work-inbox", "/admin/meu-trabalho", "/admin/meu-trabalho", "work", {
    menuPath: "/admin/meu-trabalho",
  }),
  surface("ai-assistant", "/admin/assistente", "/admin/assistente", "aiAssist", {
    menuPath: "/admin/assistente",
  }),
  surface("ai-execution", "/admin/assistente/execucao", "/admin/assistente/execucao", "aiExecute"),
  surface("content-list", "/admin/conteudo", "/admin/conteudo", "contentList", {
    menuPath: "/admin/conteudo",
  }),
  surface("content-create", "/admin/conteudo/:id", "/admin/conteudo/novo", "contentEditor"),
  surface("content-edit", "/admin/conteudo/:id", "/admin/conteudo/{{contentId}}", "contentEditor", {
    requiredSyntheticId: "contentId",
  }),
  surface("products-list", "/admin/produtos", "/admin/produtos", "productsList", {
    menuPath: "/admin/produtos",
  }),
  surface("products-import", "/admin/produtos/importacao", "/admin/produtos/importacao", "bulkImport", {
    menuPath: "/admin/produtos/importacao",
  }),
  surface("product-create", "/admin/produtos/:id", "/admin/produtos/novo", "productEditor"),
  surface("product-edit", "/admin/produtos/:id", "/admin/produtos/{{productId}}", "productEditor", {
    requiredSyntheticId: "productId",
  }),
  ...["service", "industry", "application", "solution"].flatMap((contentType) => {
    const labels = {
      service: "services",
      industry: "industries",
      application: "applications",
      solution: "solutions",
    };
    const idKey = `${contentType}Id`;
    return [
      surface(
        `discovery-${labels[contentType]}-list`,
        "/admin/descoberta/:contentType",
        `/admin/descoberta/${contentType}`,
        "discovery",
        { menuPath: `/admin/descoberta/${contentType}` },
      ),
      surface(
        `discovery-${labels[contentType]}-create`,
        "/admin/descoberta/:contentType/:id",
        `/admin/descoberta/${contentType}/novo`,
        "discovery",
      ),
      surface(
        `discovery-${labels[contentType]}-edit`,
        "/admin/descoberta/:contentType/:id",
        `/admin/descoberta/${contentType}/{{${idKey}}}`,
        "discovery",
        { requiredSyntheticId: idKey },
      ),
    ];
  }),
  surface("search-governance", "/admin/busca", "/admin/busca", "search", { menuPath: "/admin/busca" }),
  surface("quality-center", "/admin/qualidade", "/admin/qualidade", "quality", {
    menuPath: "/admin/qualidade",
  }),
  surface("controlled-vocabularies", "/admin/listas-mestras", "/admin/listas-mestras", "vocabularies", {
    menuPath: "/admin/listas-mestras",
  }),
  surface("master-data", "/admin/dados-mestres", "/admin/dados-mestres", "masterData", {
    menuPath: "/admin/dados-mestres",
  }),
  surface("pim", "/admin/pim", "/admin/pim", "pim", { menuPath: "/admin/pim" }),
  surface("pages-list", "/admin/paginas", "/admin/paginas", "pagesList", { menuPath: "/admin/paginas" }),
  surface("page-create", "/admin/paginas/:id", "/admin/paginas/novo", "pageEditor"),
  surface("page-edit", "/admin/paginas/:id", "/admin/paginas/{{pageId}}", "pageEditor", {
    requiredSyntheticId: "pageId",
  }),
  surface("visual-studio-catalog", "/admin/estudio-visual", "/admin/estudio-visual", "visual", {
    menuPath: "/admin/estudio-visual",
  }),
  surface(
    "visual-studio-edit",
    "/admin/estudio-visual/:itemId",
    "/admin/estudio-visual/{{pageId}}",
    "visual",
    { requiredSyntheticId: "pageId" },
  ),
  surface("site-navigation", "/admin/site", "/admin/site?section=navigation", "siteConfiguration", {
    menuPath: "/admin/site?section=navigation",
  }),
  surface("site-settings", "/admin/site", "/admin/site?section=site_settings", "siteConfiguration", {
    menuPath: "/admin/site?section=site_settings",
  }),
  surface("site-placements", "/admin/site", "/admin/site?section=placement", "siteConfiguration", {
    menuPath: "/admin/site?section=placement",
  }),
  surface("sites-registry", "/admin/sites", "/admin/sites", "sites", { menuPath: "/admin/sites" }),
  surface("campaigns-list", "/admin/marketing", "/admin/marketing", "marketingList", {
    menuPath: "/admin/marketing",
  }),
  surface(
    "campaign-create",
    "/admin/marketing/campanhas/:id",
    "/admin/marketing/campanhas/novo",
    "campaignEditor",
  ),
  surface(
    "campaign-edit",
    "/admin/marketing/campanhas/:id",
    "/admin/marketing/campanhas/{{campaignId}}",
    "campaignEditor",
    { requiredSyntheticId: "campaignId" },
  ),
  surface("forms", "/admin/marketing/formularios", "/admin/marketing/formularios", "forms", {
    menuPath: "/admin/marketing/formularios",
  }),
  surface("leads", "/admin/leads", "/admin/leads", "leads", { menuPath: "/admin/leads" }),
  surface("media", "/admin/midia", "/admin/midia", "media", { menuPath: "/admin/midia" }),
  surface("profile", "/admin/perfil", "/admin/perfil", "profile", {
    menuPath: "/admin/perfil",
    entryPoint: "footer",
  }),
  surface("users", "/admin/usuarios", "/admin/usuarios", "users", { menuPath: "/admin/usuarios" }),
  surface("diagnostics", "/admin/diagnosticos", "/admin/diagnosticos", "diagnostics", {
    menuPath: "/admin/diagnosticos",
  }),
  surface("audit", "/admin/auditoria", "/admin/auditoria", "audit", { menuPath: "/admin/auditoria" }),
  surface("admin-not-found", "/admin/*", "/admin/qa-rota-inexistente", "notFound", {
    testMode: "negative",
    workerExpected: "reject",
  }),
];

function sourceText(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function discoverAdminRouterPatterns() {
  const source = sourceText("src/app/routes.tsx");
  const start = source.indexOf('path: "/admin"');
  const end = source.indexOf('path: "/preview/:token"', start);
  if (start < 0 || end < 0) throw new Error("Não foi possível delimitar o bloco de rotas administrativas.");
  const block = source.slice(start, end);
  const children = [...block.matchAll(/\{\s*path:\s*"([^"]+)"/g)].map((match) => match[1]);
  return unique(["/admin", ...children.map((path) => (path.startsWith("/") ? path : `/admin/${path}`))]);
}

function discoverNavigationDestinations() {
  const source = sourceText("src/admin/admin-navigation.ts");
  return unique([...source.matchAll(/\bto:\s*"([^"]+)"/g)].map((match) => match[1]));
}

function workerAdminMatcher() {
  const source = sourceText("cloudflare/_worker.js");
  const match = source.match(/const ADMIN_ROUTES\s*=\s*(\/\^[^\n]+\/[a-z]*);/);
  if (!match) throw new Error("Regex ADMIN_ROUTES não encontrada no Cloudflare Worker.");
  const literal = match[1];
  const delimiter = literal.lastIndexOf("/");
  return new RegExp(literal.slice(1, delimiter), literal.slice(delimiter + 1));
}

function expandRepresentativePath(template) {
  return template.replace(/\{\{[^}]+\}\}/g, "00000000-0000-4000-8000-000000000001").split("?")[0];
}

function countLine(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function staticHint(attributes, followingSource) {
  for (const attribute of ["aria-label", "title", "placeholder", "name", "id"]) {
    const match = attributes.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`));
    if (match?.[1]) return match[1];
  }
  const text = followingSource
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 120) || "nome acessível verificado em runtime";
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function relativeSourcePath(absolutePath) {
  return relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(resolve(repositoryRoot, fromFile)), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relativeSourcePath(candidate);
  }
  return null;
}

function sourceDependencyClosure(seedFiles) {
  const pending = [...seedFiles];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    const absolutePath = resolve(repositoryRoot, file);
    if (!existsSync(absolutePath)) throw new Error(`Fonte declarada não encontrada: ${file}`);
    visited.add(file);
    if (!/\.(?:ts|tsx)$/.test(file)) continue;
    const source = readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g)) {
      const dependency = resolveLocalImport(file, match[1]);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited];
}

function addOwner(ownerMap, file, owner) {
  const owners = ownerMap.get(file) ?? [];
  owners.push(owner);
  ownerMap.set(file, unique(owners));
}

function buildAdminSourceOwners(matrix) {
  const owners = new Map();
  for (const item of matrix) {
    for (const file of sourceDependencyClosure(item.sourceFiles)) {
      if (file.startsWith("src/admin/")) addOwner(owners, file, item.id);
    }
  }
  const authenticatedOwners = matrix
    .filter((item) => item.testMode === "authenticated" || item.testMode === "negative")
    .map((item) => item.id);
  for (const globalFile of GLOBAL_ADMIN_SOURCE_OWNERS) {
    for (const file of sourceDependencyClosure([globalFile])) {
      if (file.startsWith("src/admin/")) {
        for (const owner of authenticatedOwners) addOwner(owners, file, owner);
      }
    }
  }
  for (const [seed, publicOwners] of Object.entries(PUBLIC_SOURCE_OWNERS)) {
    for (const file of sourceDependencyClosure([seed])) {
      if (file.startsWith("src/admin/")) {
        for (const owner of publicOwners) addOwner(owners, file, owner);
      }
    }
  }
  return owners;
}

const parsedAdminModules = new Map();

function parsedAdminModule(file) {
  const cached = parsedAdminModules.get(file);
  if (cached) return cached;
  const source = sourceText(file);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = new Map();
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const dependency = resolveLocalImport(file, statement.moduleSpecifier.text);
      if (!dependency?.startsWith("src/admin/")) continue;
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { file: dependency, symbol: "default" });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, {
            file: dependency,
            symbol: (element.propertyName ?? element.name).text,
          });
        }
      } else if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        imports.set(clause.namedBindings.name.text, { file: dependency, symbol: "*namespace*" });
      }
      continue;
    }
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const defaultExport = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    );
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      declarations.set(statement.name.text, statement);
      if (exported && defaultExport) declarations.set("default", statement);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      }
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      const declaration = declarations.get(statement.expression.text);
      if (declaration) declarations.set("default", declaration);
    }
  }
  const parsed = { sourceFile, imports, declarations };
  parsedAdminModules.set(file, parsed);
  return parsed;
}

function renderedComponentReferences(module, node) {
  const references = new Map();
  const add = (file, symbol) => references.set(`${file}#${symbol}`, { file, symbol });
  const visit = (candidate) => {
    if (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) {
      const tag = candidate.tagName;
      if (ts.isIdentifier(tag)) {
        const imported = module.imports.get(tag.text);
        if (imported) add(imported.file, imported.symbol);
        else if (module.declarations.has(tag.text)) add(module.sourceFile.fileName, tag.text);
      } else if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
        const imported = module.imports.get(tag.expression.text);
        if (imported?.symbol === "*namespace*") add(imported.file, tag.name.text);
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return [...references.values()];
}

function buildAdminSourceControlOwners(matrix) {
  const ownerKeys = new Map();
  const queue = [];
  const enqueue = (file, symbol, owner) => {
    if (!file.startsWith("src/admin/") || !/\.(?:ts|tsx)$/.test(file)) return;
    const key = `${file}#${symbol}`;
    const owners = ownerKeys.get(key) ?? new Set();
    if (owners.has(owner)) return;
    owners.add(owner);
    ownerKeys.set(key, owners);
    queue.push({ file, symbol, owner });
  };
  for (const item of matrix) {
    for (const file of item.sourceFiles) enqueue(file, "*", item.id);
  }
  const authenticatedOwners = matrix
    .filter((item) => item.testMode === "authenticated" || item.testMode === "negative")
    .map((item) => item.id);
  for (const file of GLOBAL_ADMIN_SOURCE_OWNERS) {
    for (const owner of authenticatedOwners) enqueue(file, "*", owner);
  }
  for (const [file, owners] of Object.entries(PUBLIC_SOURCE_OWNERS)) {
    for (const owner of owners) enqueue(file, "*", owner);
  }

  while (queue.length) {
    const current = queue.shift();
    const module = parsedAdminModule(current.file);
    const node = current.symbol === "*" ? module.sourceFile : module.declarations.get(current.symbol);
    if (!node) {
      throw new Error(`Export JSX local não resolvido: ${current.file}#${current.symbol}`);
    }
    for (const reference of renderedComponentReferences(module, node)) {
      enqueue(reference.file, reference.symbol, current.owner);
    }
  }

  return (file, offset) => {
    const owners = new Set(ownerKeys.get(`${file}#*`) ?? []);
    const module = parsedAdminModule(file);
    for (const [symbol, declaration] of module.declarations) {
      if (
        symbol === "default" ||
        offset < declaration.getStart(module.sourceFile) ||
        offset >= declaration.end
      ) {
        continue;
      }
      const declarationOverride = ADMIN_DECLARATION_OWNER_OVERRIDES[`${file}#${symbol}`];
      if (declarationOverride) return unique(declarationOverride);
      for (const owner of ownerKeys.get(`${file}#${symbol}`) ?? []) owners.add(owner);
    }
    const defaultDeclaration = module.declarations.get("default");
    if (
      defaultDeclaration &&
      offset >= defaultDeclaration.getStart(module.sourceFile) &&
      offset < defaultDeclaration.end
    ) {
      for (const owner of ownerKeys.get(`${file}#default`) ?? []) owners.add(owner);
    }
    return unique([...owners]);
  };
}

function offsetIsInsideDeclaration(file, offset, symbol) {
  const module = parsedAdminModule(file);
  const declaration = module.declarations.get(symbol);
  return Boolean(
    declaration && offset >= declaration.getStart(module.sourceFile) && offset < declaration.end,
  );
}

function sourceControlRuntimeApplicability(relativePath, offset, ownerRouteIds) {
  const applicability = Object.fromEntries(
    ownerRouteIds.map((ownerRouteId) => [ownerRouteId, { applicability: "required" }]),
  );
  if (historicalRepositoryRoot) return applicability;
  const legacyMediaBranch =
    (relativePath === "src/admin/pages/AdminMediaPage.tsx" &&
      offsetIsInsideDeclaration(relativePath, offset, "LegacyMediaPage")) ||
    (relativePath === "src/admin/components/AdminUI.tsx" &&
      offsetIsInsideDeclaration(relativePath, offset, "RecordDrawer"));
  if (legacyMediaBranch && ownerRouteIds.includes("media")) {
    applicability.media = {
      applicability: "not-applicable",
      basisCode: "feature-branch-disabled",
      justification:
        "A superfície de mídia canônica exige ev2.dam e não renderiza o componente legado nesta homologação.",
      documentationReference: "src/admin/ev2-runtime.ts#ev2.dam",
    };
  }

  if (relativePath === "src/admin/pages/AdminPimPage.tsx" && ownerRouteIds.includes("pim")) {
    const source = sourceText(relativePath);
    const legacyBranchStart = source.indexOf("{item.legacy && (");
    if (legacyBranchStart < 0) {
      throw new Error("Ramo de reconciliação PIM legado não encontrado para classificação fail-closed.");
    }
    if (offset >= legacyBranchStart) {
      applicability.pim = {
        applicability: "not-applicable",
        basisCode: "legacy-state-unavailable-by-read-only-cutover",
        justification:
          "A migration 0078 tornou o grafo legado somente leitura; o ator sintético não pode criar este estado pela interface.",
        documentationReference:
          "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only",
      };
    }
  }
  return applicability;
}

function discoverPermissions(files) {
  return unique(
    sourceDependencyClosure(files).flatMap((file) => {
      if (!/\.(?:ts|tsx)$/.test(file)) return [];
      return [...sourceText(file).matchAll(/\bcms:[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+/g)].map(
        (match) => match[0],
      );
    }),
  );
}

function discoverApiHelperEdges() {
  const source = sourceText("src/admin/api/cms-api.ts");
  const declarations = [
    ...source.matchAll(/export\s+function\s+([A-Za-z][A-Za-z0-9]*)\s*(?:<[^>{}]*>)?\s*\(/g),
  ];
  const mapping = {};
  declarations.forEach((declaration, index) => {
    const block = source.slice(declaration.index, declarations[index + 1]?.index ?? source.length);
    const edge = block.match(/\binvoke(?:<[^>]*>)?\s*\([\s\S]*?["'](cms-[a-z0-9-]+)["']/)?.[1];
    if (edge) mapping[declaration[1]] = edge;
  });
  return mapping;
}

function discoverMigrationInventory() {
  const migrationsDirectory = resolve(repositoryRoot, "supabase/migrations");
  const files = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const relations = new Map();
  const databaseFunctions = new Map();
  const storageBuckets = new Map();
  const permissions = new Set();
  for (const fileName of files) {
    const relativePath = `supabase/migrations/${fileName}`;
    const source = sourceText(relativePath);
    const relationPattern =
      /create\s+(?:(materialized)\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?(?:(public|private)\.)?([a-z_][a-z0-9_]*)/gi;
    for (const match of source.matchAll(relationPattern)) {
      const schema = match[3] ?? "public";
      const name = schema === "public" ? match[4] : `${schema}.${match[4]}`;
      if (!relations.has(name)) {
        relations.set(name, {
          name,
          kind: match[1] ? "materialized-view" : match[2].toLowerCase(),
          evidence: `${relativePath}:${countLine(source, match.index)}`,
        });
      }
    }
    const functionPattern =
      /create\s+(?:or\s+replace\s+)?function\s+(?:(public|private)\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
    for (const match of source.matchAll(functionPattern)) {
      const schema = match[1] ?? "public";
      const name = schema === "public" ? match[2] : `${schema}.${match[2]}`;
      if (!databaseFunctions.has(name)) {
        databaseFunctions.set(name, {
          name,
          evidence: `${relativePath}:${countLine(source, match.index)}`,
        });
      }
    }
    for (const match of source.matchAll(
      /insert\s+into\s+storage\.buckets[\s\S]{0,500}?values\s*\(\s*'([^']+)'/gi,
    )) {
      if (!storageBuckets.has(match[1])) {
        storageBuckets.set(match[1], {
          name: match[1],
          evidence: `${relativePath}:${countLine(source, match.index)}`,
        });
      }
    }
    for (const match of source.matchAll(/['"](cms:[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+)['"]/g)) {
      permissions.add(match[1]);
    }
  }
  return {
    migrations: files.map((file) => `supabase/migrations/${file}`),
    relations: [...relations.values()].sort((left, right) => left.name.localeCompare(right.name)),
    databaseFunctions: [...databaseFunctions.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    storageBuckets: [...storageBuckets.values()].sort((left, right) => left.name.localeCompare(right.name)),
    permissions: [...permissions].sort(),
  };
}

function discoverProductionEdgeFunctions() {
  const functionsRoot = resolve(repositoryRoot, "supabase/functions");
  const discovered = readdirSync(functionsRoot)
    .filter(
      (entry) =>
        statSync(resolve(functionsRoot, entry)).isDirectory() &&
        existsSync(resolve(functionsRoot, entry, "index.ts")),
    )
    .map((name) => {
      const entrypoint = `supabase/functions/${name}/index.ts`;
      return { name, entrypoint };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const expected = [...PRODUCTION_FUNCTIONS].sort((left, right) => left.localeCompare(right));
  const actual = discovered.map((edge) => edge.name);
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Inventário de Edge Functions divergente da produção: ausentes=${missing.join(",") || "nenhuma"}; inesperadas=${unexpected.join(",") || "nenhuma"}`,
    );
  }
  return discovered;
}

function operationalEdgeConsumerEvidence(edgeName) {
  const paths = OPERATIONAL_EDGE_CONSUMER_SOURCES[edgeName] ?? [];
  return paths.map((path) => {
    const source = sourceText(path);
    const offset = source.indexOf(edgeName);
    if (offset < 0) {
      throw new Error(`Consumidor operacional de ${edgeName} não referencia a Function em ${path}.`);
    }
    return `${path}:${countLine(source, offset)}`;
  });
}

function buildEdgeSourceOwners(edgeFunctions) {
  const owners = new Map();
  for (const edge of edgeFunctions) {
    for (const file of sourceDependencyClosure([edge.entrypoint])) {
      if (file.startsWith("supabase/functions/")) addOwner(owners, file, edge.name);
    }
  }
  return owners;
}

function resolveAssignedStringTargets(source, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targets = [];
  for (const match of source.matchAll(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "g"))) {
    targets.push(match[1]);
  }
  for (const match of source.matchAll(
    new RegExp(`\\b${escaped}\\s*=\\s*[^;\\n]+?\\?\\s*["']([^"']+)["']\\s*:\\s*["']([^"']+)["']`, "g"),
  )) {
    targets.push(match[1], match[2]);
  }
  return unique(targets);
}

function inventoryBackendDataCalls(edgeFunctions, migrationInventory) {
  const sourceOwners = buildEdgeSourceOwners(edgeFunctions);
  const calls = [];
  for (const [relativePath, ownerEdgeFunctions] of sourceOwners.entries()) {
    if (!relativePath.endsWith(".ts")) continue;
    const source = sourceText(relativePath);
    for (const match of source.matchAll(/\.rpc\(\s*([^,\r\n)]+)/g)) {
      const argument = match[1].trim();
      const literal = argument.match(/^["']([^"']+)["']$/)?.[1];
      const variable = argument.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/)?.[1];
      const targets = literal ? [literal] : variable ? resolveAssignedStringTargets(source, variable) : [];
      if (!targets.length) {
        throw new Error(
          `RPC dinâmica sem alvos source-backed em ${relativePath}:${countLine(source, match.index)}`,
        );
      }
      calls.push({
        classification: "database-rpc",
        targets,
        ownerEdgeFunctions,
        evidence: `${relativePath}:${countLine(source, match.index)}`,
      });
    }
    for (const match of source.matchAll(/([A-Za-z_$][A-Za-z0-9_$.]*)\.from\(\s*([^,\r\n)]+)/g)) {
      const receiver = match[1];
      if (!/(?:^|\.)(?:admin|client|supabase)(?:\.storage)?$/.test(receiver)) continue;
      const argument = match[2].trim();
      const target = argument.match(/^["']([^"']+)["']$/)?.[1];
      if (!target) {
        throw new Error(
          `Relação/Storage dinâmica sem alvo source-backed em ${relativePath}:${countLine(source, match.index)}`,
        );
      }
      calls.push({
        classification: receiver.endsWith(".storage") ? "storage-bucket" : "database-table",
        targets: [target],
        ownerEdgeFunctions,
        evidence: `${relativePath}:${countLine(source, match.index)}`,
      });
    }
  }
  const knownFunctions = new Set(migrationInventory.databaseFunctions.map((item) => item.name));
  const knownRelations = new Set(migrationInventory.relations.map((item) => item.name));
  const knownBuckets = new Set(migrationInventory.storageBuckets.map((item) => item.name));
  for (const call of calls) {
    for (const target of call.targets) {
      if (call.classification === "database-rpc" && !knownFunctions.has(target)) {
        throw new Error(`RPC de Edge Function ausente das migrations: ${target} (${call.evidence})`);
      }
      if (call.classification === "database-table" && !knownRelations.has(target)) {
        throw new Error(`Relação de Edge Function ausente das migrations: ${target} (${call.evidence})`);
      }
      if (call.classification === "storage-bucket" && !knownBuckets.has(target)) {
        throw new Error(`Bucket de Edge Function ausente das migrations: ${target} (${call.evidence})`);
      }
    }
  }
  return calls;
}

function discoverPublicRouterPatterns() {
  const source = sourceText("src/app/routes.tsx");
  const rootStart = source.indexOf('path: "/"');
  const rdoStart = source.indexOf('path: "/relatorio-de-obra"', rootStart);
  if (rootStart < 0 || rdoStart < 0) throw new Error("Não foi possível delimitar as rotas públicas React.");
  const block = source.slice(rootStart, rdoStart);
  const routes = [
    { pattern: "/", layer: "react", evidence: `src/app/routes.tsx:${countLine(source, rootStart)}` },
  ];
  for (const match of block.matchAll(/\{\s*path:\s*"([^"]+)"/g)) {
    routes.push({
      pattern: match[1] === "*" ? "/*" : `/${match[1]}`,
      layer: "react",
      evidence: `src/app/routes.tsx:${countLine(source, rootStart + match.index)}`,
    });
  }
  for (const match of source.matchAll(/\{\s*path:\s*"(\/(?:preview|cms\/conteudo)\/[^"]+)"/g)) {
    routes.push({
      pattern: match[1],
      layer: "react",
      evidence: `src/app/routes.tsx:${countLine(source, match.index)}`,
    });
  }
  return [...new Map(routes.map((route) => [route.pattern, route])).values()].sort((left, right) =>
    left.pattern.localeCompare(right.pattern),
  );
}

function discoverWorkerPublicRoutes() {
  const source = sourceText("cloudflare/_worker.js");
  const routes = [];
  for (const match of source.matchAll(/path\s*===\s*["'](\/(?:healthz|sitemap[^"']*))['"]/g)) {
    routes.push({
      pattern: match[1],
      layer: "worker",
      evidence: `cloudflare/_worker.js:${countLine(source, match.index)}`,
    });
  }
  for (const match of source.matchAll(/["'](\/sitemap(?:-[a-z]+)?\.xml)["']/g)) {
    routes.push({
      pattern: match[1],
      layer: "worker",
      evidence: `cloudflare/_worker.js:${countLine(source, match.index)}`,
    });
  }
  const redirectStart = source.indexOf("const STATIC_REDIRECTS");
  const redirectEnd = source.indexOf("]);", redirectStart);
  if (redirectStart < 0 || redirectEnd < 0)
    throw new Error("Mapa STATIC_REDIRECTS não encontrado no Worker.");
  const redirects = source.slice(redirectStart, redirectEnd);
  for (const match of redirects.matchAll(/\[\s*["'](\/[^"']+)['"]\s*,/g)) {
    routes.push({
      pattern: match[1],
      layer: "worker-redirect",
      evidence: `cloudflare/_worker.js:${countLine(source, redirectStart + match.index)}`,
    });
  }
  return [...new Map(routes.map((route) => [`${route.layer}:${route.pattern}`, route])).values()];
}

function publicConsumerTokens(profile) {
  return unique(
    profile.publicConsumers.flatMap(
      (consumer) => consumer.match(/(?<![\p{L}\p{N}])\/[a-z0-9:*_-]+(?:\/[a-z0-9:*_-]+)*/gu) ?? [],
    ),
  );
}

function buildPublicRouteInventory(matrix, profileCatalog = profiles) {
  const routeMap = new Map();
  for (const route of [...discoverPublicRouterPatterns(), ...discoverWorkerPublicRoutes()]) {
    const current = routeMap.get(route.pattern) ?? {
      pattern: route.pattern,
      layers: [],
      evidenceSources: [],
    };
    current.layers.push(route.layer);
    current.evidenceSources.push(route.evidence);
    routeMap.set(route.pattern, current);
  }
  const routes = [...routeMap.values()].sort((left, right) => left.pattern.localeCompare(right.pattern));
  const managedProfiles = new Set(
    Object.entries(profileCatalog)
      .filter(([, profile]) =>
        profile.publicConsumers.some((consumer) => /rota.*(?:gerenciada|definida)/i.test(consumer)),
      )
      .map(([profileId]) => profileId),
  );
  return routes.map((route) => {
    const ownerProfiles = Object.entries(profileCatalog)
      .filter(([profileId, profile]) => {
        const tokens = publicConsumerTokens(profile);
        if (route.pattern === "/healthz") return profileId === "diagnostics";
        if (route.pattern.startsWith("/sitemap")) return profile.publicConsumers.length > 0;
        if (tokens.includes(route.pattern)) return true;
        if (route.pattern.endsWith("/:slug") && tokens.includes(route.pattern.replace(/\/:slug$/, "")))
          return true;
        if (tokens.some((token) => token !== "/" && route.pattern.startsWith(`${token}/`))) return true;
        return (
          managedProfiles.has(profileId) &&
          !/^\/(?:blog|campanhas|produtos|busca|servicos|industrias|aplicacoes|solucoes|preview|cms\/conteudo)(?:\/|$)/.test(
            route.pattern,
          )
        );
      })
      .map(([profileId]) => profileId);
    const ownerSurfaceIds = unique(
      matrix.filter((item) => ownerProfiles.includes(item.profile)).map((item) => item.id),
    );
    if (!ownerSurfaceIds.length)
      throw new Error(`Rota pública sem consumidor CMS classificado: ${route.pattern}`);
    return {
      route: route.pattern,
      layers: unique(route.layers),
      ownerSurfaceIds,
      evidence: route.evidenceSources[0],
      evidenceSources: unique(route.evidenceSources),
      state: "consumidor público classificado; comportamento validado no Playwright",
    };
  });
}

function inventorySourceControls(resolveControlOwners) {
  const adminRoot = resolve(repositoryRoot, "src/admin");
  const files = walk(adminRoot).filter(
    (path) => /\.(?:tsx)$/.test(path) && /[\\/](?:pages|components)[\\/]/.test(path),
  );
  const controls = [];
  const rolePattern =
    /\brole\s*=\s*["'](tab|tabpanel|tablist|dialog|alertdialog|menuitem|switch|checkbox|radio|slider|search)["']/;
  const native = new Set(["form", "input", "select", "textarea", "button", "a"]);
  for (const absolutePath of files) {
    const relativePath = absolutePath.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
    const source = readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(/<([A-Za-z][A-Za-z0-9.]*)\b([^<>]*?)>/g)) {
      const tag = match[1];
      const attributes = match[2] ?? "";
      const role = attributes.match(rolePattern)?.[1] ?? null;
      const reactLink = tag === "Link" && /\bto\s*=/.test(attributes);
      const customHandler = !native.has(tag) && /\bon(?:Click|Submit|Change)\s*=/.test(attributes);
      if (!native.has(tag) && !role && !reactLink && !customHandler) continue;
      const classification =
        role === "tab" || role === "tablist" || role === "tabpanel"
          ? "tab"
          : tag === "input" ||
              tag === "select" ||
              tag === "textarea" ||
              role === "checkbox" ||
              role === "radio" ||
              role === "switch" ||
              role === "slider"
            ? "field"
            : tag === "form" || role === "search" || /\bonSubmit\s*=/.test(attributes)
              ? "form"
              : tag === "a" || reactLink
                ? "link"
                : role === "dialog" || role === "alertdialog"
                  ? "dialog"
                  : "action";
      const openingEnd = match.index + match[0].length;
      const closing = source.slice(openingEnd, openingEnd + 500).split(new RegExp(`</${tag}>`))[0] ?? "";
      const ownerRouteIds = resolveControlOwners(relativePath, match.index);
      // Exported design-system components that are not referenced by the route render graph
      // do not become browser controls. They remain covered by component tests, while this
      // inventory contains only controls a classified route can actually render.
      if (!ownerRouteIds.length) continue;
      controls.push({
        id: `${relativePath}:${countLine(source, match.index)}:${tag}:${controls.length + 1}`,
        classification,
        element: tag,
        role,
        accessibleNameHint: staticHint(attributes, closing),
        ownerRouteIds: unique(ownerRouteIds),
        runtimeApplicabilityBySurface: sourceControlRuntimeApplicability(
          relativePath,
          match.index,
          unique(ownerRouteIds),
        ),
        evidence: `${relativePath}:${countLine(source, match.index)}`,
        state: "classificado; validação acessível final ocorre no Playwright",
      });
    }
  }
  return controls;
}

function inventorySourceDataCalls(sourceOwners) {
  const adminRoot = resolve(repositoryRoot, "src/admin");
  const files = walk(adminRoot).filter((path) => /\.(?:ts|tsx)$/.test(path));
  const calls = [];
  const patterns = [
    { classification: "api-helper", expression: /\b([A-Za-z][A-Za-z0-9]*Command|issuePreview)\s*\(/g },
    { classification: "database-table", expression: /\.from\(\s*["']([^"']+)["']\s*\)/g },
    { classification: "database-rpc", expression: /\.rpc\(\s*["']([^"']+)["']/g },
    { classification: "supabase-auth", expression: /supabase\.auth\.([A-Za-z][A-Za-z0-9]*)\s*\(/g },
    { classification: "http-transport", expression: /\b(fetch)\s*\(/g },
  ];
  for (const absolutePath of files) {
    const relativePath = absolutePath.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
    const source = readFileSync(absolutePath, "utf8");
    for (const { classification, expression } of patterns) {
      for (const match of source.matchAll(expression)) {
        calls.push({
          classification,
          target: match[1],
          ownerRouteIds: unique(sourceOwners.get(relativePath) ?? []),
          evidence: `${relativePath}:${countLine(source, match.index)}`,
          state: "classificado; status HTTP e erros são verificados em runtime",
        });
      }
    }
  }
  return calls;
}

function discoveredCalls(files) {
  return unique(
    files.flatMap((file) =>
      [...sourceText(file).matchAll(/\b([A-Za-z][A-Za-z0-9]*Command|issuePreview)\s*\(/g)].map(
        (match) => match[1],
      ),
    ),
  );
}

function discoveredTables(files) {
  return unique(
    files.flatMap((file) =>
      [...sourceText(file).matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]),
    ),
  );
}

function validateAndBuild() {
  const adminDocumentation = sourceText("src/admin/README.md");
  const ev2Documentation = sourceText("docs/ev2/README.md");
  for (const section of ["Trabalho", "Catálogo", "Conteúdo", "Marketing", "Site", "Administração"]) {
    if (!adminDocumentation.includes(section)) {
      throw new Error(`Seção administrativa ausente no índice canônico local: ${section}`);
    }
  }
  for (const location of canonicalDocumentation.authoritativeLocations) {
    if (
      location.startsWith("https://") &&
      !adminDocumentation.includes(location) &&
      !ev2Documentation.includes(location)
    ) {
      throw new Error(`Referência documental canônica ausente dos índices locais: ${location}`);
    }
  }
  if (!ev2Documentation.includes(".github/release-controls")) {
    throw new Error("Índice EV2 não referencia os controles executáveis de release.");
  }

  const validateRequirementBindings = (bindings, prefix, expectedCount) => {
    const expected = Array.from(
      { length: expectedCount },
      (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
    );
    const actual = bindings.map((binding) => binding.id);
    const missing = expected.filter((id) => !actual.includes(id));
    const duplicate = actual.filter((id, index) => actual.indexOf(id) !== index);
    const unknownProfiles = unique(
      bindings.flatMap((binding) => binding.profiles).filter((profileId) => !profiles[profileId]),
    );
    if (missing.length || duplicate.length || unknownProfiles.length) {
      throw new Error(
        `Rastreabilidade ${prefix} inválida: ausentes=${missing.join(",") || "nenhum"}; duplicados=${duplicate.join(",") || "nenhum"}; perfis=${unknownProfiles.join(",") || "nenhum"}`,
      );
    }
  };
  validateRequirementBindings(functionalRequirementBindings, "F", 18);
  validateRequirementBindings(businessRuleBindings, "RB", 60);

  const ids = surfaces.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("IDs duplicados na matriz de cobertura.");
  for (const item of surfaces) {
    if (!profiles[item.profile]) throw new Error(`Perfil ausente para ${item.id}: ${item.profile}`);
  }

  const migrationInventory = discoverMigrationInventory();
  const edgeFunctionSources = discoverProductionEdgeFunctions();
  const edgeFunctionNames = new Set(edgeFunctionSources.map((edge) => edge.name));
  const backendDataCalls = inventoryBackendDataCalls(edgeFunctionSources, migrationInventory);
  const apiHelperEdges = discoverApiHelperEdges();
  const knownRelations = new Set(migrationInventory.relations.map((relation) => relation.name));
  const knownBuckets = new Set(migrationInventory.storageBuckets.map((bucket) => bucket.name));
  const knownPermissions = new Set(migrationInventory.permissions);

  let matrix = surfaces.map((item) => {
    const profile = profiles[item.profile];
    const sourceApiHelpers = discoveredCalls(profile.sourceFiles);
    const sourceDirectTables = discoveredTables(profile.sourceFiles);
    const sourcePermissions = discoverPermissions(profile.sourceFiles);
    const effectiveEdgeFunctions = unique([
      ...profile.edgeFunctions,
      ...(profile.publicConsumers.length > 0 ? ["cms-public"] : []),
      ...Object.entries(OPERATIONAL_EDGE_OWNERS)
        .filter(([, ownerIds]) => ownerIds.includes(item.id))
        .map(([edge]) => edge),
    ]);
    const edgeCalls = backendDataCalls.filter((call) =>
      call.ownerEdgeFunctions.some((edge) => effectiveEdgeFunctions.includes(edge)),
    );
    const databaseFunctions = unique(
      edgeCalls.filter((call) => call.classification === "database-rpc").flatMap((call) => call.targets),
    );
    const tables = unique([
      ...profile.tables,
      ...sourceDirectTables,
      ...edgeCalls.filter((call) => call.classification === "database-table").flatMap((call) => call.targets),
    ]);
    const storage = unique([
      ...profile.storage,
      ...edgeCalls.filter((call) => call.classification === "storage-bucket").flatMap((call) => call.targets),
    ]);
    const permissions = unique([...profile.permissions, ...sourcePermissions]);
    const functionalRequirements = functionalRequirementBindings
      .filter((binding) => binding.profiles.includes(item.profile))
      .map((binding) => binding.id);
    const businessRules = businessRuleBindings
      .filter((binding) => binding.profiles.includes(item.profile))
      .map((binding) => binding.id);
    const positiveScenarios = [
      `${item.id}: abrir ${item.testPath} diretamente com a permissão efetiva declarada`,
      ...(item.menuPath ? [`${item.id}: abrir pelo destino de navegação ${item.menuPath}`] : []),
      `${item.id}: confirmar os controles source-backed, persistência e feedback acessível no backend real`,
    ];
    const negativeScenarios = [
      `${item.id}: negar usuário anônimo ou sem perfil CMS sem entregar dados da superfície`,
      `${item.id}: negar sessão sem uma das permissões efetivas declaradas`,
      `${item.id}: reprovar payload inválido, conflito, 4xx/5xx inesperado, erro de console ou controle inacessível`,
    ];
    return {
      id: item.id,
      profile: item.profile,
      section: profile.section,
      menuSubmenuTab: profile.menu,
      route: item.testPath,
      routerPattern: item.routerPattern,
      purpose: profile.purpose,
      origin: {
        code: profile.sourceFiles,
        canonicalDocumentation: canonicalDocumentation.reviewedDocuments,
        redesignArtifact: canonicalDocumentation.redesignArtifact,
      },
      functionalRequirements,
      businessRules,
      personas: permissions,
      fields: [],
      actions: [],
      tabs: [],
      controls: [],
      permissions,
      sourcePermissions,
      featureFlag: profile.featureFlag ?? null,
      requiredContext: {
        environment: item.testMode === "signed-out" ? "independente" : "staging e produção no SHA candidato",
        site: "main",
        session: item.testMode,
        featureFlag: profile.featureFlag ?? "nenhuma",
        assurance: permissions.some((permission) =>
          /publish|approve|manage|execute|export|archive/.test(permission),
        )
          ? "AAL2/MFA quando a ação for crítica"
          : "sessão e permissão efetiva",
      },
      apiHelpers: profile.apiHelpers,
      apiHelperEdgeBindings: profile.apiHelpers.map((helper) => ({
        helper,
        edgeFunction: apiHelperEdges[helper] ?? null,
        evidence: "src/admin/api/cms-api.ts",
      })),
      edgeFunctions: effectiveEdgeFunctions,
      databaseFunctions,
      tables,
      storage,
      positiveScenarios,
      negativeScenarios,
      boundaryScenarios: [
        `${item.id}: validar obrigatório, vazio, mínimo, máximo, formato, conteúdo executável e relação inválida para cada campo aplicável`,
        `${item.id}: validar paginação, filtro, ordenação, viewport e teclado para cada controle aplicável`,
      ],
      concurrencyScenarios: [
        `${item.id}: repetir comando com a mesma chave sem duplicar efeito`,
        `${item.id}: rejeitar versão obsoleta/conflito e preservar ambos os estados para decisão humana`,
      ],
      persistenceChecks: [
        "recarregar a URL e reabrir o registro",
        "confirmar estado correspondente no backend real",
        "confirmar trilha de auditoria e projeção pública quando aplicável",
      ],
      publicConsumers: profile.publicConsumers,
      publicConsumerRoutes: publicConsumerTokens(profile),
      publicResult: profile.publicResult,
      entryPoints: item.menuPath ? ["URL direta", item.entryPoint ?? "menu"] : ["URL direta"],
      menuPath: item.menuPath ?? null,
      testMode: item.testMode ?? "authenticated",
      requiredSyntheticId: item.requiredSyntheticId ?? null,
      workerExpected: item.workerExpected ?? "accept",
      sourceFiles: profile.sourceFiles,
      canonicalDocumentation: canonicalDocumentation.localIndexes,
      sourceApiHelpers,
      sourceDirectTables,
      state: "classificado por fonte; resultado de homologação preenchido pelo relatório Playwright",
      testState: "inventariado; evidência runtime vinculada ao SHA será anexada pelo Playwright",
      browserEvidence: null,
      observedError: null,
      rootCause: null,
      correctionPerformed: null,
      revalidation: null,
      finalResult: "pendente de homologação autenticada no ambiente-alvo",
      evidence: [
        "src/app/routes.tsx",
        "src/admin/admin-navigation.ts",
        "cloudflare/_worker.js",
        ...canonicalDocumentation.localIndexes,
        ...profile.sourceFiles,
      ],
      correction: null,
    };
  });

  const discoveredRoutes = discoverAdminRouterPatterns();
  const classifiedPatterns = unique(matrix.map((item) => item.routerPattern));
  const unclassifiedRoutes = discoveredRoutes.filter((route) => !classifiedPatterns.includes(route));
  const orphanPatterns = classifiedPatterns.filter((route) => !discoveredRoutes.includes(route));
  if (unclassifiedRoutes.length || orphanPatterns.length) {
    throw new Error(
      `Rota sem classificação=${unclassifiedRoutes.join(",") || "nenhuma"}; classificação órfã=${orphanPatterns.join(",") || "nenhuma"}`,
    );
  }

  const discoveredNavigation = discoverNavigationDestinations();
  const classifiedNavigation = unique(matrix.map((item) => item.menuPath).filter(Boolean));
  const unclassifiedNavigation = discoveredNavigation.filter(
    (destination) => !classifiedNavigation.includes(destination),
  );
  if (unclassifiedNavigation.length) {
    throw new Error(`Destino de navegação sem classificação: ${unclassifiedNavigation.join(", ")}`);
  }

  for (const [profileId, profile] of Object.entries(profiles)) {
    for (const file of profile.sourceFiles) sourceText(file);
    const calls = discoveredCalls(profile.sourceFiles);
    const missingCalls = calls.filter((call) => !profile.apiHelpers.includes(call));
    if (missingCalls.length) {
      throw new Error(`API helper sem classificação em ${profileId}: ${missingCalls.join(", ")}`);
    }
    for (const helper of profile.apiHelpers) {
      const mappedEdge = apiHelperEdges[helper];
      if (!mappedEdge) throw new Error(`Helper CMS sem Edge Function source-backed: ${helper}`);
      if (!profile.edgeFunctions.includes(mappedEdge)) {
        throw new Error(`Helper ${helper} chama ${mappedEdge}, ausente do perfil ${profileId}.`);
      }
    }
    const unknownEdges = profile.edgeFunctions.filter(
      (edge) => !EXTERNAL_EDGE_FUNCTIONS.has(edge) && !edgeFunctionNames.has(edge),
    );
    if (unknownEdges.length) {
      throw new Error(`Edge Function declarada e ausente em ${profileId}: ${unknownEdges.join(", ")}`);
    }
    const unknownTables = profile.tables.filter(
      (table) => !EXTERNAL_RELATIONS.has(table) && !knownRelations.has(table),
    );
    if (unknownTables.length) {
      throw new Error(
        `Tabela declarada e ausente das migrations em ${profileId}: ${unknownTables.join(", ")}`,
      );
    }
    const unknownBuckets = profile.storage.filter((bucket) => !knownBuckets.has(bucket));
    if (unknownBuckets.length) {
      throw new Error(
        `Storage declarado e ausente das migrations em ${profileId}: ${unknownBuckets.join(", ")}`,
      );
    }
    const unknownPermissions = profile.permissions.filter(
      (permission) => permission.startsWith("cms:") && !knownPermissions.has(permission),
    );
    if (unknownPermissions.length) {
      throw new Error(
        `Permissão declarada e ausente das migrations em ${profileId}: ${unknownPermissions.join(", ")}`,
      );
    }
  }

  const adminCodeFiles = walk(resolve(repositoryRoot, "src/admin"))
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/[\\/]api[\\/]/.test(path))
    .map((path) => path.slice(repositoryRoot.length + 1).replaceAll("\\", "/"));
  const globallyClassifiedHelpers = unique(Object.values(profiles).flatMap((profile) => profile.apiHelpers));
  const globallyUnclassifiedHelpers = discoveredCalls(adminCodeFiles).filter(
    (helper) => !globallyClassifiedHelpers.includes(helper),
  );
  if (globallyUnclassifiedHelpers.length) {
    throw new Error(`API helper administrativo sem classificação: ${globallyUnclassifiedHelpers.join(", ")}`);
  }
  const globallyClassifiedTables = unique(matrix.flatMap((item) => item.tables));
  const globallyUnclassifiedTables = discoveredTables(adminCodeFiles).filter(
    (table) => !globallyClassifiedTables.includes(table),
  );
  if (globallyUnclassifiedTables.length) {
    throw new Error(`Tabela administrativa sem classificação: ${globallyUnclassifiedTables.join(", ")}`);
  }

  const adminWorkerRoute = workerAdminMatcher();
  const workerMismatches = matrix.filter((item) => {
    const matches = adminWorkerRoute.test(expandRepresentativePath(item.route));
    return item.workerExpected === "accept" ? !matches : matches;
  });
  if (workerMismatches.length) {
    throw new Error(`Rota divergente do Worker: ${workerMismatches.map((item) => item.id).join(", ")}`);
  }

  const sourceOwners = buildAdminSourceOwners(matrix);
  const sourceControlOwners = buildAdminSourceControlOwners(matrix);
  let sourceControls = inventorySourceControls(sourceControlOwners);
  if (sourceControls.some((control) => !control.classification || !control.ownerRouteIds.length)) {
    throw new Error("Controle administrativo encontrado sem classificação.");
  }
  let sourceDataCalls = inventorySourceDataCalls(sourceOwners);
  if (sourceDataCalls.some((call) => !call.classification || !call.target || !call.ownerRouteIds.length)) {
    throw new Error("Chamada de dados administrativa encontrada sem classificação.");
  }

  const surfaceById = new Map(matrix.map((item) => [item.id, item]));
  const surfaceBinding = (ownerRouteId) => {
    const owner = surfaceById.get(ownerRouteId);
    if (!owner) {
      const publicBinding = PUBLIC_OWNER_BINDINGS[ownerRouteId];
      if (!publicBinding) throw new Error(`Owner de fonte sem superfície classificada: ${ownerRouteId}`);
      return {
        surfaceId: ownerRouteId,
        route: publicBinding.route,
        permissions: ["consumidor público ou token de preview válido"],
        apiHelpers: [],
        edgeFunctions: [publicBinding.edgeFunction],
        databaseFunctions: [],
        tables: [],
        storage: [],
        positiveScenarios: ["renderizar somente a projeção ou o preview autorizado"],
        negativeScenarios: ["negar conteúdo ausente, retirado, expirado ou não publicado"],
        publicResult: "superfície pública/preview fail-closed",
      };
    }
    return {
      surfaceId: owner.id,
      route: owner.route,
      permissions: owner.permissions,
      apiHelpers: owner.apiHelpers,
      edgeFunctions: owner.edgeFunctions,
      databaseFunctions: owner.databaseFunctions,
      tables: owner.tables,
      storage: owner.storage,
      positiveScenarios: owner.positiveScenarios,
      negativeScenarios: owner.negativeScenarios,
      publicResult: owner.publicResult,
    };
  };
  const linkedSurfaceMetadata = (ownerRouteIds) => {
    const bindings = ownerRouteIds.map(surfaceBinding);
    return {
      surfaceBindings: bindings,
      permissions: unique(bindings.flatMap((binding) => binding.permissions)),
      apiHelpers: unique(bindings.flatMap((binding) => binding.apiHelpers)),
      edgeFunctions: unique(bindings.flatMap((binding) => binding.edgeFunctions)),
      databaseFunctions: unique(bindings.flatMap((binding) => binding.databaseFunctions)),
      tables: unique(bindings.flatMap((binding) => binding.tables)),
      storage: unique(bindings.flatMap((binding) => binding.storage)),
      positiveScenarios: unique(bindings.flatMap((binding) => binding.positiveScenarios)),
      negativeScenarios: unique(bindings.flatMap((binding) => binding.negativeScenarios)),
      publicResults: unique(bindings.map((binding) => binding.publicResult)),
    };
  };
  sourceControls = sourceControls.map((control) => ({
    ...control,
    ...linkedSurfaceMetadata(control.ownerRouteIds),
    correction: null,
  }));
  sourceDataCalls = sourceDataCalls.map((call) => ({
    ...call,
    ...linkedSurfaceMetadata(call.ownerRouteIds),
  }));
  matrix = matrix.map((item) => {
    const ownedControls = sourceControls.filter((control) => control.ownerRouteIds.includes(item.id));
    const fieldControls = ownedControls.filter(
      (control) => control.classification === "field" || control.classification === "form",
    );
    const actionControls = ownedControls.filter((control) =>
      ["action", "link", "dialog"].includes(control.classification),
    );
    return {
      ...item,
      controls: ownedControls.map((control) => control.id),
      fields: fieldControls.map((control) => control.id),
      fieldContracts: fieldControls.map((control) => ({
        id: control.id,
        accessibleNameHint: control.accessibleNameHint,
        element: control.element,
        sourceEvidence: control.evidence,
        valuesToTest: ["válido", "ausente", "inválido", "limite inferior", "limite superior"],
        resultState: "pendente de evidência runtime vinculada ao SHA",
      })),
      actions: actionControls.map((control) => control.id),
      actionContracts: actionControls.map((control) => ({
        id: control.id,
        accessibleNameHint: control.accessibleNameHint,
        classification: control.classification,
        sourceEvidence: control.evidence,
        semanticProof:
          "efeito backend, persistência, auditoria, idempotência e feedback serão comprovados no ambiente-alvo",
        resultState: "pendente de evidência runtime vinculada ao SHA",
      })),
      tabs: ownedControls.filter((control) => control.classification === "tab").map((control) => control.id),
    };
  });

  const publicRoutes = buildPublicRouteInventory(matrix);
  const knownPublicRoutes = new Set([...publicRoutes.map((route) => route.route), "/healthz"]);
  for (const item of matrix) {
    const unclassifiedConsumers = item.publicConsumerRoutes.filter((route) => !knownPublicRoutes.has(route));
    if (unclassifiedConsumers.length) {
      throw new Error(
        `Consumidor público sem rota source-backed em ${item.id}: ${unclassifiedConsumers.join(", ")}`,
      );
    }
  }

  const edgeFunctions = edgeFunctionSources.map((edge) => {
    const operationalConsumerEvidence = operationalEdgeConsumerEvidence(edge.name);
    const ownerSurfaceIds = unique([
      ...matrix.filter((item) => item.edgeFunctions.includes(edge.name)).map((item) => item.id),
      ...(edge.name === "cms-public"
        ? matrix.filter((item) => item.publicConsumers.length > 0).map((item) => item.id)
        : []),
      ...(OPERATIONAL_EDGE_OWNERS[edge.name] ?? []),
    ]);
    if (!ownerSurfaceIds.length)
      throw new Error(`Edge Function CMS sem consumidor classificado: ${edge.name}`);
    return {
      name: edge.name,
      entrypoint: edge.entrypoint,
      ownerSurfaceIds,
      dataCallEvidence: backendDataCalls
        .filter((call) => call.ownerEdgeFunctions.includes(edge.name))
        .map((call) => call.evidence),
      consumerEvidence: operationalConsumerEvidence,
      state: "entrypoint, consumidores e chamadas backend classificados no inventário produtivo 1:1",
    };
  });
  const edgeOwners = new Map(edgeFunctions.map((edge) => [edge.name, edge.ownerSurfaceIds]));
  const classifiedBackendDataCalls = backendDataCalls.map((call) => ({
    ...call,
    ownerSurfaceIds: unique(call.ownerEdgeFunctions.flatMap((edge) => edgeOwners.get(edge) ?? [])),
    state: "alvos validados contra migrations",
  }));
  const classifyMigrationResource = (resource, classification, calls) => {
    const usedBy = calls
      .filter((call) => call.targets.includes(resource.name))
      .flatMap((call) => call.ownerEdgeFunctions);
    return {
      ...resource,
      classification: usedBy.length ? classification : "backend-internal",
      ownerEdgeFunctions: unique(usedBy),
      ownerSurfaceIds: unique(usedBy.flatMap((edge) => edgeOwners.get(edge) ?? [])),
      state: "classificado por migration canônica",
    };
  };
  const classifiedMigrationInventory = {
    migrations: migrationInventory.migrations.map((path) => ({
      path,
      classification: "ordered-migration",
      state: "incluída no inventário canônico",
    })),
    relations: migrationInventory.relations.map((resource) =>
      classifyMigrationResource(
        resource,
        "edge-consumed-relation",
        classifiedBackendDataCalls.filter((call) => call.classification === "database-table"),
      ),
    ),
    databaseFunctions: migrationInventory.databaseFunctions.map((resource) =>
      classifyMigrationResource(
        resource,
        "edge-consumed-rpc",
        classifiedBackendDataCalls.filter((call) => call.classification === "database-rpc"),
      ),
    ),
    storageBuckets: migrationInventory.storageBuckets.map((resource) =>
      classifyMigrationResource(
        resource,
        "edge-consumed-storage",
        classifiedBackendDataCalls.filter((call) => call.classification === "storage-bucket"),
      ),
    ),
    permissions: migrationInventory.permissions.map((permission) => ({
      permission,
      ownerSurfaceIds: matrix.filter((item) => item.permissions.includes(permission)).map((item) => item.id),
      classification: matrix.some((item) => item.permissions.includes(permission))
        ? "surface-permission"
        : "backend-internal-permission",
      state: "declarada em migration canônica",
    })),
  };

  let sourceSha = null;
  let sourceDirty = null;
  try {
    sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    sourceDirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0;
  } catch {
    // A matriz continua válida fora de um checkout Git; o SHA será nulo e não pode
    // ser usado como evidência de release até uma execução em CI/deploy.
  }

  const bindRequirementsToSurfaces = (bindings) =>
    bindings.map((binding) => ({
      ...binding,
      surfaceIds: matrix
        .filter((surfaceItem) => binding.profiles.includes(surfaceItem.profile))
        .map((surfaceItem) => surfaceItem.id),
      state: "fontes e cenários classificados; resultado runtime será vinculado ao SHA candidato",
      evidence: unique(
        matrix
          .filter((surfaceItem) => binding.profiles.includes(surfaceItem.profile))
          .flatMap((surfaceItem) => surfaceItem.sourceFiles),
      ),
    }));
  const requirementsCoverage = {
    functional: bindRequirementsToSurfaces(functionalRequirementBindings),
    businessRules: bindRequirementsToSurfaces(businessRuleBindings),
  };
  const unboundRequirements = [
    ...requirementsCoverage.functional,
    ...requirementsCoverage.businessRules,
  ].filter((binding) => binding.surfaceIds.length === 0);
  if (unboundRequirements.length) {
    throw new Error(
      `Requisito sem superfície source-backed: ${unboundRequirements.map((item) => item.id).join(", ")}`,
    );
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSha,
    sourceDirty,
    classificationPolicy: {
      routes: "toda rota do bloco /admin em src/app/routes.tsx deve ter ao menos uma superfície",
      navigation: "todo destino `to` de admin-navigation.ts deve estar ligado a uma superfície",
      publicConsumers:
        "toda rota React pública recebe superfícies CMS consumidoras; referências de rota declaradas são validadas contra o router",
      data: "toda chamada *Command/issuePreview, .from(), .rpc(), Supabase Auth e fetch recebe classificação; chamadas Edge são validadas contra migrations e buckets",
      backend:
        "todo diretório supabase/functions/*/index.ts coincide 1:1 com PRODUCTION_FUNCTIONS e possui consumidor, chamadas source-backed e alvos existentes nas migrations",
      controls:
        "todo controle JSX nativo, Link, role interativo ou handler explícito em pages/components recebe classe, superfícies, permissões e recursos backend",
      scopedRbac:
        "papéis globais de usuários são somente leitura; o ramo de mutação global foi removido e concessão, avaliação e revogação são inventariadas exclusivamente em ScopedAccessPanel",
      runtime:
        "nomes acessíveis, limites, visibilidade, overflow, console, HTTP, teclado, reduced-motion e axe são coletados pelo Playwright",
    },
    documentationCrossCheck: {
      ...canonicalDocumentation,
      status:
        "rotas, telas, design system, API, especificação EV2 e matriz G11 validados na revisão canônica fixada; índices locais e código executivo prevalecem quando registram correção posterior",
    },
    requirementsCoverage,
    redesignDivergences,
    productPimAuthority: {
      canonicalWriterRoutePatterns: ["/admin/produtos/:id", "/admin/importacao"],
      canonicalPayload: "CmsProductContentSchema via cms-content",
      contextualReadRoute: "/admin/pim",
      independentPimWriterInCommonUi: false,
      legacyCompatibility:
        "cms-pim permanece inventariado para leitura/reconciliação; mutação comum não é exposta",
      state: "frontend consolidado; forward reconciliation migration deve estar aprovada antes do release",
    },
    counts: {
      routerPatterns: discoveredRoutes.length,
      surfaces: matrix.length,
      navigationDestinations: discoveredNavigation.length,
      sourceControls: sourceControls.length,
      sourceDataCalls: sourceDataCalls.length,
      publicRoutes: publicRoutes.length,
      edgeFunctions: edgeFunctions.length,
      backendDataCalls: classifiedBackendDataCalls.length,
      apiHelperEdgeBindings: Object.keys(apiHelperEdges).length,
      migrationRelations: classifiedMigrationInventory.relations.length,
      migrationDatabaseFunctions: classifiedMigrationInventory.databaseFunctions.length,
      migrationStorageBuckets: classifiedMigrationInventory.storageBuckets.length,
      migrationPermissions: classifiedMigrationInventory.permissions.length,
    },
    discoveredRouterPatterns: discoveredRoutes,
    discoveredNavigationDestinations: discoveredNavigation,
    matrix,
    sourceControls,
    sourceDataCalls,
    publicRoutes,
    edgeFunctions,
    apiHelperEdges,
    backendDataCalls: classifiedBackendDataCalls,
    migrationInventory: classifiedMigrationInventory,
  };
}

function buildHistoricalFrontendSnapshot() {
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const toolingSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: toolingRepositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const sourceDirty =
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().length > 0;

  const discoveredRoutes = discoverAdminRouterPatterns();
  const activeSurfaces = surfaces.filter((item) => discoveredRoutes.includes(item.routerPattern));
  const classifiedPatterns = unique(activeSurfaces.map((item) => item.routerPattern));
  const unclassifiedRoutes = discoveredRoutes.filter((route) => !classifiedPatterns.includes(route));
  if (unclassifiedRoutes.length) {
    throw new Error(`QA_CMS_HISTORICAL_ROUTE_UNCLASSIFIED:${unclassifiedRoutes.join(",")}`);
  }

  const activeProfileIds = new Set(activeSurfaces.map((item) => item.profile));
  const activeProfiles = Object.fromEntries(
    Object.entries(profiles)
      .filter(([profileId]) => activeProfileIds.has(profileId))
      .map(([profileId, profile]) => {
        const sourceFiles = profile.sourceFiles.filter((file) => existsSync(resolve(repositoryRoot, file)));
        if (!sourceFiles.length) throw new Error(`QA_CMS_HISTORICAL_PROFILE_SOURCE_MISSING:${profileId}`);
        const sourceApiHelpers = discoveredCalls(sourceFiles);
        return [
          profileId,
          {
            ...profile,
            sourceFiles,
            apiHelpers: sourceApiHelpers,
            tables: discoveredTables(sourceFiles),
            permissions: unique([...profile.permissions, ...discoverPermissions(sourceFiles)]),
          },
        ];
      }),
  );

  const apiHelperEdges = discoverApiHelperEdges();
  const matrix = activeSurfaces.map((item) => {
    const profile = activeProfiles[item.profile];
    const edgeFunctions = unique(profile.apiHelpers.map((helper) => apiHelperEdges[helper]).filter(Boolean));
    return {
      id: item.id,
      profile: item.profile,
      section: profile.section,
      menuSubmenuTab: profile.menu,
      route: item.testPath,
      routerPattern: item.routerPattern,
      purpose: profile.purpose,
      fields: [],
      actions: [],
      tabs: [],
      controls: [],
      permissions: profile.permissions,
      sourcePermissions: discoverPermissions(profile.sourceFiles),
      featureFlag: profile.featureFlag ?? null,
      apiHelpers: profile.apiHelpers,
      edgeFunctions,
      databaseFunctions: [],
      tables: profile.tables,
      storage: [],
      publicConsumers: profile.publicConsumers,
      publicResult: profile.publicResult,
      entryPoints: item.menuPath ? ["URL direta", item.entryPoint ?? "menu"] : ["URL direta"],
      menuPath: item.menuPath ?? null,
      testMode: item.testMode ?? "authenticated",
      requiredSyntheticId: item.requiredSyntheticId ?? null,
      workerExpected: item.workerExpected ?? "accept",
      sourceFiles: profile.sourceFiles,
      state: "snapshot estrutural histórico; homologação funcional somente pelo navegador",
      testState: "inventariado estruturalmente; resultado runtime obrigatório",
      finalResult: "nenhuma cobertura funcional alegada antes do canário autenticado",
      evidence: ["src/app/routes.tsx", "src/admin/admin-navigation.ts", ...profile.sourceFiles],
    };
  });

  const discoveredNavigation = discoverNavigationDestinations();
  const classifiedNavigation = unique(matrix.map((item) => item.menuPath).filter(Boolean));
  const unclassifiedNavigation = discoveredNavigation.filter(
    (destination) => !classifiedNavigation.includes(destination),
  );
  if (unclassifiedNavigation.length) {
    throw new Error(`QA_CMS_HISTORICAL_NAVIGATION_UNCLASSIFIED:${unclassifiedNavigation.join(",")}`);
  }

  const sourceOwners = buildAdminSourceOwners(matrix);
  const sourceControlOwners = buildAdminSourceControlOwners(matrix);
  const sourceControls = inventorySourceControls(sourceControlOwners);
  const sourceDataCalls = inventorySourceDataCalls(sourceOwners);
  if (sourceControls.some((control) => !control.classification || !control.ownerRouteIds.length)) {
    throw new Error("QA_CMS_HISTORICAL_CONTROL_UNCLASSIFIED");
  }
  if (sourceDataCalls.some((call) => !call.classification || !call.target || !call.ownerRouteIds.length)) {
    throw new Error("QA_CMS_HISTORICAL_DATA_CALL_UNCLASSIFIED");
  }
  const publicRoutes = buildPublicRouteInventory(matrix, activeProfiles);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSha,
    sourceDirty,
    inventoryMode: "historical-frontend-structural",
    toolingSha,
    coverageClaim: {
      structuralInventoryComplete: true,
      functionalCoverageClaimed: false,
      functionalEvidenceRequired: "authenticated-browser-canary",
    },
    documentationCrossCheck: {
      ...canonicalDocumentation,
      status:
        "governança validada pelo tooling candidato; checkout histórico classificado apenas estruturalmente",
    },
    counts: {
      routerPatterns: discoveredRoutes.length,
      surfaces: matrix.length,
      navigationDestinations: discoveredNavigation.length,
      sourceControls: sourceControls.length,
      sourceDataCalls: sourceDataCalls.length,
      publicRoutes: publicRoutes.length,
      edgeFunctions: unique(matrix.flatMap((item) => item.edgeFunctions)).length,
      backendDataCalls: 0,
      apiHelperEdgeBindings: Object.keys(apiHelperEdges).length,
      migrationRelations: 0,
      migrationDatabaseFunctions: 0,
      migrationStorageBuckets: 0,
      migrationPermissions: 0,
    },
    discoveredRouterPatterns: discoveredRoutes,
    discoveredNavigationDestinations: discoveredNavigation,
    matrix,
    sourceControls,
    sourceDataCalls,
    publicRoutes,
    apiHelperEdges,
    backendDataCalls: [],
    migrationInventory: {
      migrations: [],
      relations: [],
      databaseFunctions: [],
      storageBuckets: [],
      permissions: [],
    },
  };
}

const report = historicalRepositoryRoot ? buildHistoricalFrontendSnapshot() : validateAndBuild();
const stdout = args.includes("--stdout");
const outputArgumentIndex = args.indexOf("--output");
const requestedOutput =
  outputArgumentIndex >= 0 ? args[outputArgumentIndex + 1] : process.env.QA_CMS_MATRIX_PATH;

if (requestedOutput) {
  const outputPath = resolve(process.cwd(), requestedOutput);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

if (stdout) {
  process.stdout.write(JSON.stringify(report));
} else {
  const destination = requestedOutput
    ? resolve(process.cwd(), requestedOutput)
    : "nenhum (use --output ou QA_CMS_MATRIX_PATH)";
  process.stdout.write(
    `Matriz CMS validada: ${report.counts.routerPatterns} padrões admin, ${report.counts.surfaces} superfícies, ${report.counts.navigationDestinations} destinos, ${report.counts.sourceControls} controles, ${report.counts.sourceDataCalls} chamadas frontend, ${report.counts.publicRoutes} rotas públicas, ${report.counts.edgeFunctions} Edge Functions e ${report.counts.backendDataCalls} chamadas backend classificadas. Saída: ${destination}\n`,
  );
}
