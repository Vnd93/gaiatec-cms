import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import HomePage from "./pages/HomePage";
import SobrePage from "./pages/SobrePage";
import SectorPage from "./pages/SectorPage";
import BiodigestorPage from "./pages/BiodigestorPage";
import BiodigestorComoFunciona from "./pages/BiodigestorComoFunciona";
import BiodigestorPortes from "./pages/BiodigestorPortes";
import BiodigestorBeneficios from "./pages/BiodigestorBeneficios";
import BiodigestorMonitoramento from "./pages/BiodigestorMonitoramento";
import BiodigestorBiogasBiometano from "./pages/BiodigestorBiogasBiometano";
import BiodigestorAutomacao from "./pages/BiodigestorAutomacao";
import BiodigestorEscolas from "./pages/BiodigestorEscolas";
import BlogPage from "./pages/BlogPage";
import ContatoPage from "./pages/ContatoPage";
import ProdutosPage from "./pages/ProdutosPage";
import SetoresPage from "./pages/SetoresPage";
import ServicosPage from "./pages/ServicosPage";
import ServicoPage from "./pages/ServicoPage";
import NotFoundPage from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "sobre", Component: SobrePage },
      { path: "setores", Component: SetoresPage },
      { path: "setores/:slug", Component: SectorPage },
      { path: "servicos", Component: ServicosPage },
      { path: "servicos/:slug", Component: ServicoPage },
      { path: "biodigestor", Component: BiodigestorPage },
      { path: "biodigestor/como-funciona", Component: BiodigestorComoFunciona },
      { path: "biodigestor/portes", Component: BiodigestorPortes },
      { path: "biodigestor/beneficios", Component: BiodigestorBeneficios },
      { path: "biodigestor/monitoramento", Component: BiodigestorMonitoramento },
      { path: "biodigestor/biogas-biometano", Component: BiodigestorBiogasBiometano },
      { path: "biodigestor/automacao", Component: BiodigestorAutomacao },
      { path: "biodigestor/escolas", Component: BiodigestorEscolas },
      { path: "blog", Component: BlogPage },
      { path: "contato", Component: ContatoPage },
      { path: "produtos", Component: ProdutosPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);