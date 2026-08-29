/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./rdo/AuthContext";
import { RequireAuth } from "./rdo/RequireAuth";
import { AdminAuthProvider } from "../admin/auth/AdminAuthContext";
import { RequireAdminAuth } from "../admin/auth/RequireAdminAuth";
import { AdminShell } from "../admin/components/AdminShell";

// Home page = eager load (entry point — não vale a pena lazy)
import HomePage from "./pages/HomePage";
import RouteErrorPage from "./pages/RouteErrorPage";

// Demais páginas = lazy load (code splitting)
const SobrePage = lazy(() => import("./pages/SobrePage"));
const SectorPage = lazy(() => import("./pages/SectorPage"));
const BiodigestorPage = lazy(() => import("./pages/BiodigestorPage"));
const BiodigestorComoFunciona = lazy(() => import("./pages/BiodigestorComoFunciona"));
const BiodigestorPortes = lazy(() => import("./pages/BiodigestorPortes"));
const BiodigestorBeneficios = lazy(() => import("./pages/BiodigestorBeneficios"));
const BiodigestorMonitoramento = lazy(() => import("./pages/BiodigestorMonitoramento"));
const BiodigestorBiogasBiometano = lazy(() => import("./pages/BiodigestorBiogasBiometano"));
const BiodigestorAutomacao = lazy(() => import("./pages/BiodigestorAutomacao"));
const BiodigestorEscolas = lazy(() => import("./pages/BiodigestorEscolas"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const ContatoPage = lazy(() => import("./pages/ContatoPage"));
const ProdutosPage = lazy(() => import("../public/pages/CmsProductsPage"));
const ProdutoPage = lazy(() => import("../public/pages/CmsProductPage"));
const SetoresPage = lazy(() => import("./pages/SetoresPage"));
const DiscoveryListPage = lazy(() => import("../public/pages/CmsDiscoveryListPage"));
const DiscoveryDetailPage = lazy(() => import("../public/pages/CmsDiscoveryDetailPage"));
const ComparadorPage = lazy(() => import("../public/pages/CmsComparePage"));
const SearchPage = lazy(() => import("../public/pages/CmsSearchPage"));
const DeteccaoGasPage = lazy(() => import("./pages/DeteccaoGasPage"));
const DeteccaoGasCategoriaPage = lazy(() => import("./pages/DeteccaoGasCategoriaPage"));
const DeteccaoGasProdutoPage = lazy(() => import("./pages/DeteccaoGasProdutoPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const PoliticaPrivacidadePage = lazy(() => import("./pages/PoliticaPrivacidadePage"));
const TermosDeUsoPage = lazy(() => import("./pages/TermosDeUsoPage"));

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
const AdminMediaPage = lazy(() => import("../admin/pages/AdminMediaPage"));
const AdminProfilePage = lazy(() => import("../admin/pages/AdminProfilePage"));
const AdminUsersPage = lazy(() => import("../admin/pages/AdminUsersPage"));
const AdminDiagnosticsPage = lazy(() => import("../admin/pages/AdminDiagnosticsPage"));
const AdminDiscoveryPage = lazy(() => import("../admin/pages/AdminDiscoveryPage"));
const AdminSearchGovernancePage = lazy(() => import("../admin/pages/AdminSearchGovernancePage"));
const CmsPreviewPage = lazy(() => import("../admin/pages/CmsPreviewPage"));
const CmsPublishedPage = lazy(() => import("../admin/pages/CmsPublishedPage"));

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

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, Component: HomePage },
      { path: "sobre", element: lazyWrap(SobrePage) },
      { path: "setores", element: lazyWrap(SetoresPage) },
      { path: "setores/:slug", element: lazyWrap(SectorPage) },
      { path: "servicos", element: discoveryList("service") },
      { path: "servicos/:slug", element: discoveryDetail("service") },
      { path: "industrias", element: discoveryList("industry") },
      { path: "industrias/:slug", element: discoveryDetail("industry") },
      { path: "solucoes", element: discoveryList("solution") },
      { path: "solucoes/:slug", element: discoveryDetail("solution") },
      { path: "biodigestor", element: lazyWrap(BiodigestorPage) },
      { path: "biodigestor/como-funciona", element: lazyWrap(BiodigestorComoFunciona) },
      { path: "biodigestor/portes", element: lazyWrap(BiodigestorPortes) },
      { path: "biodigestor/beneficios", element: lazyWrap(BiodigestorBeneficios) },
      { path: "biodigestor/monitoramento", element: lazyWrap(BiodigestorMonitoramento) },
      { path: "biodigestor/biogas-biometano", element: lazyWrap(BiodigestorBiogasBiometano) },
      { path: "biodigestor/automacao", element: lazyWrap(BiodigestorAutomacao) },
      { path: "biodigestor/escolas", element: lazyWrap(BiodigestorEscolas) },
      { path: "blog", element: lazyWrap(BlogPage) },
      { path: "contato", element: lazyWrap(ContatoPage) },
      { path: "produtos", element: lazyWrap(ProdutosPage) },
      { path: "produtos/comparador", element: lazyWrap(ComparadorPage) },
      { path: "produtos/:slug", element: lazyWrap(ProdutoPage) },
      { path: "busca", element: lazyWrap(SearchPage) },
      { path: "aplicacoes", element: discoveryList("application") },
      { path: "aplicacoes/:slug", element: discoveryDetail("application") },
      { path: "deteccao-de-gas", element: lazyWrap(DeteccaoGasPage) },
      { path: "deteccao-de-gas/:categoria", element: lazyWrap(DeteccaoGasCategoriaPage) },
      { path: "deteccao-de-gas/:categoria/:produto", element: lazyWrap(DeteccaoGasProdutoPage) },
      { path: "politica-de-privacidade", element: lazyWrap(PoliticaPrivacidadePage) },
      { path: "termos-de-uso", element: lazyWrap(TermosDeUsoPage) },
      { path: "*", element: lazyWrap(NotFoundPage) },
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
          { path: "produtos/:id", element: lazyWrap(AdminProductEditorPage) },
          { path: "descoberta/:contentType", element: lazyWrap(AdminDiscoveryPage) },
          { path: "descoberta/:contentType/:id", element: lazyWrap(AdminDiscoveryPage) },
          { path: "busca", element: lazyWrap(AdminSearchGovernancePage) },
          { path: "midia", element: lazyWrap(AdminMediaPage) },
          { path: "perfil", element: lazyWrap(AdminProfilePage) },
          { path: "usuarios", element: lazyWrap(AdminUsersPage) },
          { path: "diagnosticos", element: lazyWrap(AdminDiagnosticsPage) },
        ],
      },
    ],
  },
  { path: "/preview/:token", element: lazyWrap(CmsPreviewPage), errorElement: <RouteErrorPage /> },
  { path: "/cms/conteudo/:slug", element: lazyWrap(CmsPublishedPage), errorElement: <RouteErrorPage /> },
]);
