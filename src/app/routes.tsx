/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./rdo/AuthContext";
import { RequireAuth } from "./rdo/RequireAuth";
import { AdminAuthProvider } from "../admin/auth/AdminAuthContext";
import { RequireAdminAuth } from "../admin/auth/RequireAdminAuth";
import { AdminShell } from "../admin/components/AdminShell";

import RouteErrorPage from "./pages/RouteErrorPage";

// Demais páginas = lazy load (code splitting)
const BlogPage = lazy(() => import("../public/pages/CmsBlogPage"));
const BlogPostPage = lazy(() => import("../public/pages/CmsBlogPostPage"));
const CampaignPage = lazy(() => import("../public/pages/CmsCampaignPage"));
const ProdutosPage = lazy(() => import("../public/pages/CmsProductsPage"));
const ProdutoPage = lazy(() => import("../public/pages/CmsProductPage"));
const DiscoveryListPage = lazy(() => import("../public/pages/CmsDiscoveryListPage"));
const DiscoveryDetailPage = lazy(() => import("../public/pages/CmsDiscoveryDetailPage"));
const ComparadorPage = lazy(() => import("../public/pages/CmsComparePage"));
const SearchPage = lazy(() => import("../public/pages/CmsSearchPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

// ─── App interno: Relatório Diário de Obra (/relatorio-de-obra) ───
// Vive fora do Layout de marketing — shell/CSS próprios (Montserrat, cantos arredondados).
const RdoLoginPage = lazy(() => import("./rdo/pages/LoginPage"));
const RdoRelatoriosPage = lazy(() => import("./rdo/pages/RelatoriosPage"));
const RdoArquivoPage = lazy(() => import("./rdo/pages/ArquivoPage"));
const RdoFormPage = lazy(() => import("./rdo/pages/FormPage"));
const RdoDefinirSenhaPage = lazy(() => import("./rdo/pages/DefinirSenhaPage"));
const RdoEquipePage = lazy(() => import("./rdo/pages/EquipePage"));
const RdoAssinarPage = lazy(() => import("./rdo/pages/AssinarPage"));

// CMS administrativo isolado do RDO e do site publico.
const AdminLoginPage = lazy(() => import("../admin/pages/LoginPage"));
const AdminRecoveryPage = lazy(() => import("../admin/pages/RecoveryPage"));
const AdminSetPasswordPage = lazy(() => import("../admin/pages/SetPasswordPage"));
const AdminMfaPage = lazy(() => import("../admin/pages/MfaPage"));
const AdminHomePage = lazy(() => import("../admin/pages/AdminHomePage"));
const AdminContentPage = lazy(() => import("../admin/pages/AdminContentPage"));
const AdminEditorPage = lazy(() => import("../admin/pages/AdminEditorPage"));
const AdminProductsPage = lazy(() => import("../admin/pages/AdminProductsPage"));
const AdminProductEditorPage = lazy(() => import("../admin/pages/AdminProductEditorPage"));
const AdminBulkImportPage = lazy(() => import("../admin/pages/AdminBulkImportPage"));
const AdminMediaPage = lazy(() => import("../admin/pages/AdminMediaPage"));
const AdminProfilePage = lazy(() => import("../admin/pages/AdminProfilePage"));
const AdminUsersPage = lazy(() => import("../admin/pages/AdminUsersPage"));
const AdminDiagnosticsPage = lazy(() => import("../admin/pages/AdminDiagnosticsPage"));
const AdminNotFoundPage = lazy(() => import("../admin/pages/AdminNotFoundPage"));
const AdminDiscoveryPage = lazy(() => import("../admin/pages/AdminDiscoveryPage"));
const AdminSearchGovernancePage = lazy(() => import("../admin/pages/AdminSearchGovernancePage"));
const AdminControlledVocabulariesPage = lazy(
  () => import("../admin/pages/AdminControlledVocabulariesPage"),
);
const AdminMasterDataPage = lazy(() => import("../admin/pages/AdminMasterDataPage"));
const AdminPimPage = lazy(() => import("../admin/pages/AdminPimPage"));
const AdminPagesPage = lazy(() => import("../admin/pages/AdminPagesPage"));
const AdminPageBuilderPage = lazy(() => import("../admin/pages/AdminPageBuilderPage"));
const AdminSiteConfigurationPage = lazy(() => import("../admin/pages/AdminSiteConfigurationPage"));
const AdminMarketingPage = lazy(() => import("../admin/pages/AdminMarketingPage"));
const AdminCampaignEditorPage = lazy(() => import("../admin/pages/AdminCampaignEditorPage"));
const AdminFormsPage = lazy(() => import("../admin/pages/AdminFormsPage"));
const AdminLeadsPage = lazy(() => import("../admin/pages/AdminLeadsPage"));
const CmsPreviewPage = lazy(() => import("../admin/pages/CmsPreviewPage"));
const CmsPublishedPage = lazy(() => import("../admin/pages/CmsPublishedPage"));
const CmsManagedPageRoute = lazy(() =>
  import("../public/pages/CmsManagedPageRoute").then((module) => ({ default: module.CmsManagedPageRoute })),
);

// Loader minimalista — não bloqueia o paint
function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#0057DE]/20 border-t-[#0057DE] rounded-full animate-spin" />
    </div>
  );
}

// Wrapper Suspense para rotas lazy
const lazyWrap = (Component: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);
const discoveryList = (contentType: "service" | "industry" | "application" | "solution") => (
  <Suspense fallback={<PageLoader />}><DiscoveryListPage contentType={contentType} /></Suspense>
);
const discoveryDetail = (contentType: "service" | "industry" | "application" | "solution") => (
  <Suspense fallback={<PageLoader />}><DiscoveryDetailPage contentType={contentType} /></Suspense>
);
const managedPage = (fallback?: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>
    <CmsManagedPageRoute fallback={fallback} />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: managedPage() },
      { path: "sobre", element: managedPage() },
      { path: "setores", element: <Navigate replace to="/industrias" /> },
      { path: "setores/saneamento", element: <Navigate replace to="/industrias/saneamento" /> },
      { path: "setores/gas-petroleo", element: <Navigate replace to="/industrias/oleo-e-gas" /> },
      { path: "setores/hvac", element: <Navigate replace to="/industrias/hvac" /> },
      { path: "setores/agronegocio", element: <Navigate replace to="/industrias/agronegocio" /> },
      { path: "setores/industria", element: <Navigate replace to="/industrias/processos-industriais" /> },
      { path: "setores/biogas-biometano", element: <Navigate replace to="/industrias/biogas-biometano" /> },
      { path: "setores/protecao-catodica", element: <Navigate replace to="/industrias/protecao-catodica" /> },
      { path: "setores/controle-ambiental", element: <Navigate replace to="/industrias/controle-ambiental" /> },
      { path: "setores/seguranca-operacional", element: <Navigate replace to="/industrias/seguranca-operacional" /> },
      { path: "setores/instrumentacao", element: <Navigate replace to="/industrias/instrumentacao" /> },
      { path: "setores/telemetria", element: <Navigate replace to="/industrias/telemetria" /> },
      { path: "setores/:slug", element: managedPage() },
      { path: "servicos", element: discoveryList("service") },
      { path: "servicos/:slug", element: discoveryDetail("service") },
      { path: "industrias", element: discoveryList("industry") },
      { path: "industrias/:slug", element: discoveryDetail("industry") },
      { path: "solucoes", element: discoveryList("solution") },
      { path: "solucoes/:slug", element: discoveryDetail("solution") },
      { path: "biodigestor", element: managedPage() },
      { path: "biodigestor/como-funciona", element: managedPage() },
      { path: "biodigestor/portes", element: managedPage() },
      { path: "biodigestor/beneficios", element: managedPage() },
      { path: "biodigestor/monitoramento", element: managedPage() },
      { path: "biodigestor/biogas-biometano", element: managedPage() },
      { path: "biodigestor/automacao", element: managedPage() },
      { path: "biodigestor/escolas", element: managedPage() },
      { path: "blog", element: lazyWrap(BlogPage) },
      { path: "blog/:slug", element: lazyWrap(BlogPostPage) },
      { path: "campanhas/:slug", element: lazyWrap(CampaignPage) },
      { path: "contato", element: managedPage() },
      { path: "produtos", element: lazyWrap(ProdutosPage) },
      { path: "produtos/comparador", element: lazyWrap(ComparadorPage) },
      { path: "produtos/:slug", element: lazyWrap(ProdutoPage) },
      { path: "busca", element: lazyWrap(SearchPage) },
      { path: "aplicacoes", element: discoveryList("application") },
      { path: "aplicacoes/:slug", element: discoveryDetail("application") },
      { path: "deteccao-de-gas", element: managedPage() },
      { path: "deteccao-de-gas/:categoria", element: managedPage() },
      { path: "deteccao-de-gas/:categoria/:produto", element: managedPage() },
      { path: "politica-de-privacidade", element: managedPage() },
      { path: "termos-de-uso", element: managedPage() },
      { path: "*", element: managedPage(lazyWrap(NotFoundPage)) },
    ],
  },
  {
    path: "/relatorio-de-obra",
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { path: "login", element: lazyWrap(RdoLoginPage) },
      { path: "definir-senha", element: lazyWrap(RdoDefinirSenhaPage) },
      { path: "assinar/:token", element: lazyWrap(RdoAssinarPage) },
      { index: true, element: <RequireAuth>{lazyWrap(RdoRelatoriosPage)}</RequireAuth> },
      { path: "arquivo", element: <RequireAuth>{lazyWrap(RdoArquivoPage)}</RequireAuth> },
      { path: "novo", element: <RequireAuth>{lazyWrap(RdoFormPage)}</RequireAuth> },
      { path: "relatorio/:id", element: <RequireAuth>{lazyWrap(RdoFormPage)}</RequireAuth> },
      { path: "equipe", element: <RequireAuth>{lazyWrap(RdoEquipePage)}</RequireAuth> },
    ],
  },
  {
    path: "/admin",
    element: (
      <AdminAuthProvider>
        <Outlet />
      </AdminAuthProvider>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { path: "login", element: lazyWrap(AdminLoginPage) },
      { path: "recuperar-senha", element: lazyWrap(AdminRecoveryPage) },
      { path: "definir-senha", element: lazyWrap(AdminSetPasswordPage) },
      { path: "mfa", element: lazyWrap(AdminMfaPage) },
      {
        element: <RequireAdminAuth><AdminShell /></RequireAdminAuth>,
        children: [
          { index: true, element: lazyWrap(AdminHomePage) },
          { path: "conteudo", element: lazyWrap(AdminContentPage) },
          { path: "conteudo/:id", element: lazyWrap(AdminEditorPage) },
          { path: "produtos", element: lazyWrap(AdminProductsPage) },
          { path: "produtos/importacao", element: lazyWrap(AdminBulkImportPage) },
          { path: "produtos/:id", element: lazyWrap(AdminProductEditorPage) },
          { path: "descoberta/:contentType", element: lazyWrap(AdminDiscoveryPage) },
          { path: "descoberta/:contentType/:id", element: lazyWrap(AdminDiscoveryPage) },
          { path: "busca", element: lazyWrap(AdminSearchGovernancePage) },
          { path: "listas-mestras", element: lazyWrap(AdminControlledVocabulariesPage) },
          { path: "dados-mestres", element: lazyWrap(AdminMasterDataPage) },
          { path: "pim", element: lazyWrap(AdminPimPage) },
          { path: "paginas", element: lazyWrap(AdminPagesPage) },
          { path: "paginas/:id", element: lazyWrap(AdminPageBuilderPage) },
          { path: "site", element: lazyWrap(AdminSiteConfigurationPage) },
          { path: "marketing", element: lazyWrap(AdminMarketingPage) },
          { path: "marketing/campanhas/:id", element: lazyWrap(AdminCampaignEditorPage) },
          { path: "marketing/formularios", element: lazyWrap(AdminFormsPage) },
          { path: "leads", element: lazyWrap(AdminLeadsPage) },
          { path: "midia", element: lazyWrap(AdminMediaPage) },
          { path: "perfil", element: lazyWrap(AdminProfilePage) },
          { path: "usuarios", element: lazyWrap(AdminUsersPage) },
          { path: "diagnosticos", element: lazyWrap(AdminDiagnosticsPage) },
          { path: "*", element: lazyWrap(AdminNotFoundPage) },
        ],
      },
    ],
  },
  { path: "/preview/:token", element: lazyWrap(CmsPreviewPage), errorElement: <RouteErrorPage /> },
  { path: "/cms/conteudo/:slug", element: lazyWrap(CmsPublishedPage), errorElement: <RouteErrorPage /> },
]);
