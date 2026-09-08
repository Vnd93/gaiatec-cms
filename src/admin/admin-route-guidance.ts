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
      task: "Coordene pendências, pacotes editoriais e lotes validados.",
      publicImpact: "Somente a publicação de um pacote aprovado altera o site público.",
      internal: "Comentários, aprovações, simulações e comprovantes permanecem no CMS.",
      nextStep: "Resolva as pendências ou avance o pacote conforme seu papel e a versão atual.",
    },
  },
  {
    match: /^\/admin\/assistente\/execucao/,
    value: {
      task: "Monte um plano sintético, confira a simulação e encaminhe o resumo para aprovação independente.",
      publicImpact:
        "Nenhum dado real é alcançável; execução e reversão usam somente dados de teste isolados.",
      internal: "Plano, decisão, aprovação e versões formam uma trilha administrativa protegida.",
      nextStep: "Outro usuário autorizado confirma a operação; depois execute ou solicite a reversão.",
    },
  },
  {
    match: /^\/admin\/assistente/,
    value: {
      task: "Localize, explique, extraia ou prepare uma proposta sintética com fonte.",
      publicImpact: "Nenhuma resposta é aplicada ou publicada; a decisão humana apenas registra a revisão.",
      internal: "Somente dados sintéticos redigidos, fontes, confiança, custo zero e auditoria são retidos.",
      nextStep:
        "Confira fonte, versão, localização, confiança e alterações propostas; depois use o editor manual.",
    },
  },
  {
    match: /^\/admin\/produtos\/importacao/,
    value: {
      task: "Valide uma planilha oficial de cadastros novos.",
      publicImpact: "O lote cria somente rascunhos; não publica produtos.",
      internal: "Fabricante, referência, SKU e proveniência permanecem internos.",
      nextStep: "Execute a simulação e corrija todos os erros antes de criar o lote.",
    },
  },
  {
    match: /^\/admin\/produtos\/[^/]+/,
    value: {
      task: "Complete o produto por etapas e resolva as pendências do contrato.",
      publicImpact: "Somente uma publicação aprovada atualiza catálogo, busca e SEO.",
      internal: "Fabricante, referência comercial, código do produto e fontes são privados por padrão.",
      nextStep: "Salve o rascunho e use a pré-visualização antes de enviar para revisão.",
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
      task: "Edite o conteúdo e conduza seu fluxo editorial.",
      publicImpact: "Publicações aprovadas alimentam blog, busca e sitemap.",
      internal: "Motivo, histórico e proveniência não são públicos.",
      nextStep: "Revise conteúdo, SEO e relações antes da pré-visualização.",
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
      internal: "Governança e proveniência avançadas permanecem restritas.",
      nextStep: "Resolva as pendências e valide a pré-visualização.",
    },
  },
  {
    match: /^\/admin\/descoberta/,
    value: {
      task: "Gerencie serviços, indústrias, aplicações ou soluções.",
      publicImpact: "Somente registros publicados aparecem no site e na busca.",
      internal: "O fluxo editorial e os dados de governança são internos.",
      nextStep: "Localize o registro ou crie um cadastro novo com fontes autorizadas.",
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
      publicImpact: "Erros ativos de qualidade bloqueiam a publicação.",
      internal: "Execuções, campos e exceções permanecem no CMS.",
      nextStep: "Corrija o campo indicado ou registre uma exceção autorizada e temporária.",
    },
  },
  {
    match: /^\/admin\/listas-mestras/,
    value: {
      task: "Mantenha classificações padronizadas e reutilizáveis.",
      publicImpact: "Somente rótulos marcados como públicos podem aparecer no site.",
      internal: "Identificadores internos, uso e auditoria permanecem restritos.",
      nextStep: "Edite, ordene ou inative; não recrie um significado já cadastrado.",
    },
  },
  {
    match: /^\/admin\/dados-mestres/,
    value: {
      task: "Padronize entidades, nomes alternativos e compatibilidades reutilizáveis.",
      publicImpact: "Somente dados aprovados e adotados pelo catálogo podem aparecer no site.",
      internal: "Origem, versões, mesclagens e auditoria permanecem administrativas.",
      nextStep: "Pesquise antes de criar e confirme dependências antes de inativar ou mesclar.",
    },
  },
  {
    match: /^\/admin\/estudio-visual/,
    value: {
      task: "Componha uma página em uma versão visual independente.",
      publicImpact: "Salvar e gerar imagens de conferência não publica; aplicar altera somente o rascunho.",
      internal: "Variações de tela, vínculos, componentes reutilizáveis e histórico permanecem no CMS.",
      nextStep: "Salve, confira as três larguras e aplique ao rascunho antes da pré-visualização editorial.",
    },
  },
  {
    match: /^\/admin\/paginas\/[^/]+/,
    value: {
      task: "Monte a página com blocos governados.",
      publicImpact: "A publicação altera a rota, SEO e conteúdo público.",
      internal: "Histórico, motivo e blocos ocultos ficam no CMS.",
      nextStep: "Revise estrutura, relações e endereço na pré-visualização responsiva.",
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
      task: "Valide o isolamento de sites, ambientes de teste, endereços reservados e temas.",
      publicImpact: "Nenhum segundo site ou domínio é ativado nesta fase.",
      internal: "Somente cadastros sintéticos e endereços de teste reservados podem ser preparados.",
      nextStep:
        "Confirme sua autenticação reforçada, mantenha os ambientes bloqueados e registre os testes de isolamento.",
    },
  },
  {
    match: /^\/admin\/site/,
    value: {
      task: "Configure navegação, dados globais e destaques.",
      publicImpact: "A publicação afeta várias áreas do site ao mesmo tempo.",
      internal: "Motivo, histórico e validações são internos.",
      nextStep: "Confirme os pontos do site indicados e valide a pré-visualização.",
    },
  },
  {
    match: /^\/admin\/marketing\/campanhas\/[^/]+/,
    value: {
      task: "Edite campanha, página da campanha, formulário e vigência.",
      publicImpact: "A publicação pode criar ou retirar uma página de campanha.",
      internal: "Medição, aprovações e histórico ficam no CMS.",
      nextStep: "Confirme datas, consentimento, expiração e pré-visualização.",
    },
  },
  {
    match: /^\/admin\/marketing\/formularios/,
    value: {
      task: "Crie versões de formulários e consentimentos.",
      publicImpact: "Somente a versão publicada recebe novos leads.",
      internal: "Retenção, prazo de atendimento e histórico são administrativos.",
      nextStep: "Valide campos, consentimento e destino antes de publicar.",
    },
  },
  {
    match: /^\/admin\/marketing/,
    value: {
      task: "Organize campanhas e páginas de destino.",
      publicImpact: "Campanhas publicadas podem aparecer nas rotas e posicionamentos.",
      internal: "O fluxo editorial e as métricas operacionais ficam no CMS.",
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
      nextStep: "Confirme origem, direitos, texto alternativo e usos antes de selecionar.",
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
    match: /^\/admin\/auditoria/,
    value: {
      task: "Filtre e exporte a trilha imutável de ações do CMS.",
      publicImpact: "A consulta não altera o site nem qualquer registro.",
      internal: "Eventos, usuários, alvos e correlações são restritos.",
      nextStep: "Localize a ação pelo período e preserve o código de correlação na investigação.",
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
