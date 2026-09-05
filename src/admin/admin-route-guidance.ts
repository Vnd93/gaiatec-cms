export type AdminRouteGuidance = {
  task: string;
  publicImpact: string;
  internal: string;
  nextStep: string;
};

const guidance: Array<{ match: RegExp; value: AdminRouteGuidance }> = [
  {
    match: /^\/admin\/?$/,
    value: {
      task: "Acompanhe pendências e escolha a próxima tarefa.",
      publicImpact: "Nenhuma alteração é publicada nesta visão.",
      internal: "Indicadores e falhas são internos.",
      nextStep: "Abra o conteúdo que exige ação.",
    },
  },
  {
    match: /^\/admin\/meu-trabalho/,
    value: {
      task: "Coordene pendências, releases e lotes validados.",
      publicImpact: "Somente a publicação de release aprovado altera o estado público.",
      internal: "Comentários, aprovações, dry-runs e recibos permanecem no CMS.",
      nextStep: "Resolva a inbox ou avance o pacote conforme seu papel e a versão atual.",
    },
  },
  {
    match: /^\/admin\/assistente\/execucao/,
    value: {
      task: "Monte um plano sintético, confira o dry-run e encaminhe o hash para aprovação segregada.",
      publicImpact:
        "Nenhum alvo real é alcançável; execução e compensação operam somente referências g14x-*.",
      internal: "Plano, decisão de política, aprovação, snapshots e correlação formam a trilha G14.",
      nextStep: "Outro usuário sintético MFA aprova; o operador executa ou solicita compensação.",
    },
  },
  {
    match: /^\/admin\/assistente/,
    value: {
      task: "Localize, explique, extraia ou prepare uma proposta sintética com fonte.",
      publicImpact: "Nenhuma resposta é aplicada ou publicada; a decisão humana apenas registra a revisão.",
      internal: "Somente dados sintéticos redigidos, fontes, confiança, custo zero e auditoria são retidos.",
      nextStep: "Confira fonte, versão, localizador, confiança e diff; depois use o editor manual.",
    },
  },
  {
    match: /^\/admin\/produtos\/importacao/,
    value: {
      task: "Valide uma planilha oficial de cadastros novos.",
      publicImpact: "O lote cria somente rascunhos; não publica produtos.",
      internal: "Fabricante, referência, SKU e proveniência permanecem internos.",
      nextStep: "Faça o dry-run e corrija todos os erros antes de criar o lote.",
    },
  },
  {
    match: /^\/admin\/produtos\/[^/]+/,
    value: {
      task: "Complete o produto por etapas e resolva as pendências do contrato.",
      publicImpact: "Somente uma publicação aprovada atualiza catálogo, busca e SEO.",
      internal: "Fabricante/OEM, referência, SKU e proveniência são privados por padrão.",
      nextStep: "Salve o rascunho e use o preview antes de enviar para revisão.",
    },
  },
  {
    match: /^\/admin\/produtos/,
    value: {
      task: "Localize produtos e abra o cadastro correto.",
      publicImpact: "A listagem administrativa não muda o catálogo público.",
      internal: "Status, fabricante e dados operacionais são internos.",
      nextStep: "Filtre, abra um item ou inicie um cadastro autorizado.",
    },
  },
  {
    match: /^\/admin\/conteudo\/[^/]+/,
    value: {
      task: "Edite o conteúdo editorial e seu workflow.",
      publicImpact: "Publicações aprovadas alimentam blog, busca e sitemap.",
      internal: "Motivo, histórico e proveniência não são públicos.",
      nextStep: "Revise conteúdo, SEO e relações antes do preview.",
    },
  },
  {
    match: /^\/admin\/conteudo/,
    value: {
      task: "Gerencie artigos e conteúdo editorial.",
      publicImpact: "Apenas itens publicados chegam ao site.",
      internal: "Rascunhos, revisões e histórico ficam no CMS.",
      nextStep: "Abra um item existente ou crie conteúdo novo autorizado.",
    },
  },
  {
    match: /^\/admin\/descoberta\/[^/]+\/[^/]+/,
    value: {
      task: "Organize conteúdo, relações, mídia e SEO desta página.",
      publicImpact: "A publicação atualiza a página e os vínculos públicos.",
      internal: "Governança, JSON avançado e proveniência permanecem internos.",
      nextStep: "Resolva as pendências e valide o preview.",
    },
  },
  {
    match: /^\/admin\/descoberta/,
    value: {
      task: "Gerencie serviços, indústrias, aplicações ou soluções.",
      publicImpact: "Somente registros publicados aparecem no site e na busca.",
      internal: "Workflow e dados de governança são internos.",
      nextStep: "Localize o registro ou crie um cadastro clean-room.",
    },
  },
  {
    match: /^\/admin\/busca/,
    value: {
      task: "Ajuste sinônimos e investigue buscas sem resultado.",
      publicImpact: "Sinônimos ativos melhoram a descoberta pública.",
      internal: "Consultas e diagnósticos de busca não são publicados.",
      nextStep: "Valide o termo e sua vigência antes de salvar.",
    },
  },
  {
    match: /^\/admin\/qualidade/,
    value: {
      task: "Resolva achados determinísticos antes de publicar.",
      publicImpact: "Erros ativos bloqueiam a publicação quando a EV2.6 está habilitada.",
      internal: "Execuções, campos e exceções permanecem no CMS.",
      nextStep: "Corrija o campo indicado ou registre uma exceção autorizada e temporária.",
    },
  },
  {
    match: /^\/admin\/listas-mestras/,
    value: {
      task: "Mantenha classificações padronizadas e reutilizáveis.",
      publicImpact: "Somente rótulos marcados como públicos podem aparecer no site.",
      internal: "UUIDs, uso e auditoria permanecem internos.",
      nextStep: "Edite, ordene ou inative; nunca recrie um significado com outro UUID.",
    },
  },
  {
    match: /^\/admin\/dados-mestres/,
    value: {
      task: "Normalize entidades, aliases e compatibilidades reutilizáveis.",
      publicImpact: "A EV2.3 permanece isolada até migração e adoção aprovadas.",
      internal: "Origem, versões, mesclagens e auditoria permanecem administrativas.",
      nextStep: "Pesquise antes de criar e confirme dependências antes de inativar ou mesclar.",
    },
  },
  {
    match: /^\/admin\/estudio-visual/,
    value: {
      task: "Componha uma página em um branch visual versionado.",
      publicImpact: "Salvar e gerar snapshots não publica; aplicar altera somente o rascunho.",
      internal: "Layout 12/8/4, bindings, símbolos e histórico permanecem governados no CMS.",
      nextStep: "Salve, gere os três snapshots e aplique ao rascunho antes do preview editorial.",
    },
  },
  {
    match: /^\/admin\/paginas\/[^/]+/,
    value: {
      task: "Monte a página com blocos governados.",
      publicImpact: "A publicação altera a rota, SEO e conteúdo público.",
      internal: "Histórico, motivo e blocos ocultos ficam no CMS.",
      nextStep: "Revise estrutura, relações e URL no preview responsivo.",
    },
  },
  {
    match: /^\/admin\/paginas/,
    value: {
      task: "Gerencie homepage, páginas institucionais e temáticas.",
      publicImpact: "Somente versões publicadas alteram o site.",
      internal: "Rascunhos e histórico permanecem no CMS.",
      nextStep: "Abra a página certa ou crie uma rota autorizada.",
    },
  },
  {
    match: /^\/admin\/sites/,
    value: {
      task: "Valide o isolamento de sites, ambientes, domínios reservados e temas.",
      publicImpact: "Nenhum segundo site ou domínio é ativado nesta fase.",
      internal: "Somente fixtures g9x-* e domínios .invalid podem ser preparados.",
      nextStep: "Use MFA, mantenha os ambientes bloqueados e colete as evidências negativas do Gate G9.",
    },
  },
  {
    match: /^\/admin\/site/,
    value: {
      task: "Configure navegação, dados globais e destaques.",
      publicImpact: "A publicação afeta várias áreas do site ao mesmo tempo.",
      internal: "Motivo, histórico e validações são internos.",
      nextStep: "Confirme os consumidores indicados e valide o preview.",
    },
  },
  {
    match: /^\/admin\/marketing\/campanhas\/[^/]+/,
    value: {
      task: "Edite campanha, landing page, formulário e vigência.",
      publicImpact: "A publicação pode criar ou retirar uma página de campanha.",
      internal: "Tracking, aprovações e histórico ficam no CMS.",
      nextStep: "Confirme datas, consentimento, expiração e preview.",
    },
  },
  {
    match: /^\/admin\/marketing\/formularios/,
    value: {
      task: "Crie versões de formulários e consentimentos.",
      publicImpact: "Somente a versão publicada recebe novos leads.",
      internal: "Retenção, SLA e histórico são administrativos.",
      nextStep: "Valide campos, consentimento e destino antes de publicar.",
    },
  },
  {
    match: /^\/admin\/marketing/,
    value: {
      task: "Organize campanhas e páginas de destino.",
      publicImpact: "Campanhas publicadas podem aparecer nas rotas e posicionamentos.",
      internal: "Workflow e métricas operacionais ficam no CMS.",
      nextStep: "Abra uma campanha ou crie uma nova com período definido.",
    },
  },
  {
    match: /^\/admin\/leads/,
    value: {
      task: "Atenda, atribua e acompanhe solicitações recebidas.",
      publicImpact: "As ações não mudam conteúdo público.",
      internal: "Dados pessoais, consentimento e histórico são restritos.",
      nextStep: "Abra o lead, registre a ação e respeite a retenção.",
    },
  },
  {
    match: /^\/admin\/midia/,
    value: {
      task: "Localize mídia autorizada e acompanhe seu processamento.",
      publicImpact: "Um arquivo só aparece quando vinculado a conteúdo publicado.",
      internal: "Originais, direitos e mapa de usos são protegidos.",
      nextStep: "Confirme origem, direitos, ALT e usos antes de selecionar.",
    },
  },
  {
    match: /^\/admin\/usuarios/,
    value: {
      task: "Consulte identidades, papéis e estado de acesso.",
      publicImpact: "Nenhuma ação afeta o site público.",
      internal: "Usuários, sessões e permissões são dados restritos.",
      nextStep: "Aplique somente ações permitidas pelo contrato e MFA.",
    },
  },
  {
    match: /^\/admin\/perfil/,
    value: {
      task: "Confira sua identidade, sessão e permissões efetivas.",
      publicImpact: "Esta área não publica conteúdo.",
      internal: "Dados de sessão são privados.",
      nextStep: "Encerre a sessão ao terminar em dispositivo compartilhado.",
    },
  },
  {
    match: /^\/admin\/diagnosticos/,
    value: {
      task: "Investigue falhas reais por código de acompanhamento.",
      publicImpact: "A consulta não altera o site.",
      internal: "Eventos e correlações são operacionais e restritos.",
      nextStep: "Registre o código e siga o runbook do evento.",
    },
  },
];

export function resolveAdminRouteGuidance(pathname: string): AdminRouteGuidance {
  return (
    guidance.find((entry) => entry.match.test(pathname))?.value ?? {
      task: "Conclua a tarefa desta área com segurança.",
      publicImpact: "Confirme o impacto público antes de executar ações.",
      internal: "Dados operacionais permanecem restritos ao CMS.",
      nextStep: "Revise as informações e prossiga somente com permissão.",
    }
  );
}
