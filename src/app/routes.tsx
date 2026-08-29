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
const ProdutosPage = lazy(() => import("./pages/ProdutosPage"));
const ProdutoPage = lazy(() => import("./pages/ProdutoPage"));
const SetoresPage = lazy(() => import("./pages/SetoresPage"));
const ServicosPage = lazy(() => import("./pages/ServicosPage"));
const ServicoPage = lazy(() => import("./pages/ServicoPage"));
const AplicacoesPage = lazy(() => import("./pages/AplicacoesPage"));
const AplicacaoPage = lazy(() => import("./pages/AplicacaoPage"));
const ComparadorPage = lazy(() => import("./pages/ComparadorPage"));
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
const AdminMediaPage = lazy(() => import("../admin/pages/AdminMediaPage"));
const AdminProfilePage = lazy(() => import("../admin/pages/AdminProfilePage"));
const AdminUsersPage = lazy(() => import("../admin/pages/AdminUsersPage"));
const AdminDiagnosticsPage = lazy(() => import("../admin/pages/AdminDiagnosticsPage"));
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
      { path: "servicos", element: lazyWrap(ServicosPage) },
      { path: "servicos/:slug", element: lazyWrap(ServicoPage) },
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
      { path: "aplicacoes", element: lazyWrap(AplicacoesPage) },
      { path: "aplicacoes/:slug", element: lazyWrap(AplicacaoPage) },
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
