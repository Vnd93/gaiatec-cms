import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.GAIATEC_SUPABASE_URL;
const anonKey = process.env.GAIATEC_SUPABASE_ANON_KEY;
const serviceKey = process.env.GAIATEC_SUPABASE_SERVICE_ROLE_KEY;
const stagingProject = "glcqsosxwgmlhzgcsnzv";
const siteOrigin = "https://gaiatec-cms-staging.pages.dev";
const authorizationDate = "2026-08-30";
const authorizationReference = "GAIATEC-F9-CLEAN-ROOM-STAGING-2026-08-30";

if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Variáveis seguras de staging ausentes.");
if (new URL(supabaseUrl).hostname !== `${stagingProject}.supabase.co`)
  throw new Error("Este utilitário aceita somente o projeto Supabase de staging.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runTag = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const actors = [];
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function provenance(
  scope = "Texto original clean-room criado para a Fase 9 e autorizado somente em staging.",
) {
  return [
    {
      sourceKind: "owner_authored",
      authorizationReference,
      authorizationDate,
      rightsScope: scope,
      rightsConfirmed: true,
      commercialOwner: "Victor Nishida",
      technicalOwner: "Equipe técnica GAIATEC SISTEMAS",
      verifiedAt: now(),
    },
  ];
}

const blockBase = (type, tone = "light", width = "content") => ({
  id: uid(),
  type,
  hidden: false,
  width,
  tone,
});

const hero = (title, text, eyebrow = "GAIATEC SISTEMAS", secondaryCta) => ({
  ...blockBase("hero", "dark", "full"),
  data: {
    eyebrow,
    title,
    text,
    primaryCta: { label: "Falar com especialista", href: "/contato" },
    ...(secondaryCta ? { secondaryCta } : {}),
    alignment: "left",
  },
});

const richText = (heading, text, eyebrow) => ({
  ...blockBase("rich_text"),
  data: { ...(eyebrow ? { eyebrow } : {}), heading, text },
});

const grid = (heading, items, eyebrow) => ({
  ...blockBase("content_grid", "light", "wide"),
  data: {
    ...(eyebrow ? { eyebrow } : {}),
    heading,
    columns: 3,
    items: items.map((item) => ({ id: uid(), ...item })),
  },
});

const benefits = (heading, items, eyebrow) => ({
  ...blockBase("benefit_grid", "muted"),
  data: {
    ...(eyebrow ? { eyebrow } : {}),
    heading,
    items: items.map(([title, text]) => ({ id: uid(), title, text })),
  },
});

const steps = (heading, items) => ({
  ...blockBase("steps"),
  data: { heading, items: items.map(([title, text]) => ({ id: uid(), title, text })) },
});

const faq = (heading, items) => ({
  ...blockBase("faq", "muted"),
  data: { heading, items: items.map(([question, answer]) => ({ id: uid(), question, answer })) },
});

const cta = (heading, text = "Descreva o contexto da sua operação para uma avaliação inicial.") => ({
  ...blockBase("cta", "brand", "wide"),
  data: { heading, text, link: { label: "Entrar em contato", href: "/contato" } },
});

const contactForm = () => ({
  ...blockBase("form", "muted", "wide"),
  data: {
    heading: "Conte sua necessidade",
    text: "Informe o contexto, a variável ou o processo que precisa ser avaliado. A equipe retornará pelos dados fornecidos.",
    formKey: "lead",
    buttonLabel: "Enviar solicitação",
  },
});

function managedPage({
  title,
  slug,
  path,
  summary,
  blocks,
  pageKind = "institutional",
  templateKey = "standard",
  legalReview = false,
}) {
  const homepage = path === "/";
  return {
    contentType: homepage ? "homepage" : "page",
    slug,
    payload: {
      schemaVersion: 1,
      consumerId: homepage ? "cms.homepage-builder.v1" : "cms.managed-page.v1",
      contentType: homepage ? "homepage" : "page",
      title,
      summary,
      pageKind: homepage ? "home" : pageKind,
      templateKey: homepage ? "home" : templateKey,
      route: { path, navigationLabel: title, breadcrumbLabel: title },
      blocks,
      seo: {
        title: homepage ? "GAIATEC SISTEMAS" : `${title} | GAIATEC SISTEMAS`,
        description: summary,
        canonicalPath: path,
        indexable: true,
      },
      provenance: provenance(
        legalReview
          ? "Redação legal conservadora e original para staging; revisão jurídica/DPO final obrigatória antes de produção."
          : undefined,
      ),
      governanceState: "homologated",
      relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      retirement: { mode: "not_found" },
      approval: {
        businessOwner: "Victor Nishida",
        editorialReviewer: legalReview
          ? "Victor Nishida — staging; revisão final DPO antes de produção"
          : "Victor Nishida — autorização clean-room para staging",
        approvedAt: now(),
      },
    },
  };
}

function industry({ title, slug, summary, challenges, processAreas, keywords }) {
  return {
    contentType: "industry",
    slug,
    payload: {
      schemaVersion: 1,
      consumerId: "cms.industry.v1",
      contentType: "industry",
      title,
      summary,
      marketName: title,
      challenges,
      evidence: ["Escopo editorial clean-room autorizado para validação em staging."],
      processAreas,
      blocks: [{ ...blockBase("rich_text"), data: { text: summary } }],
      seo: {
        title: `${title} | GAIATEC SISTEMAS`,
        description: summary,
        canonicalPath: `/industrias/${slug}`,
        indexable: true,
      },
      provenance: provenance(),
      governanceState: "homologated",
      media: [],
      search: { synonyms: [], keywords },
      cta: { label: "Conversar com um especialista", href: "/contato" },
      relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      approval: {
        businessOwner: "Victor Nishida",
        technicalReviewer: "Equipe técnica GAIATEC SISTEMAS",
        commercialReviewer: "Victor Nishida",
        editorialReviewer: "Victor Nishida",
        homologatedAt: now(),
      },
    },
  };
}

const pages = [
  managedPage({
    title: "Homepage GAIATEC",
    slug: "homepage",
    path: "/",
    summary:
      "Instrumentação, automação, monitoramento e serviços técnicos organizados conforme a necessidade de cada operação.",
    blocks: [
      hero(
        "Tecnologia aplicada a processos e operações",
        "A GAIATEC SISTEMAS reúne soluções de instrumentação, automação, monitoramento e serviços técnicos para apoiar decisões de engenharia.",
        "ENGENHARIA E TECNOLOGIA",
        { label: "Explorar soluções", href: "/solucoes" },
      ),
      grid(
        "Encontre o caminho adequado",
        [
          {
            title: "Produtos",
            text: "Consulte o catálogo publicado e seus dados técnicos disponíveis.",
            href: "/produtos",
          },
          {
            title: "Serviços",
            text: "Conheça os serviços técnicos cadastrados e seus escopos.",
            href: "/servicos",
          },
          {
            title: "Indústrias",
            text: "Explore áreas atendidas e desafios operacionais relacionados.",
            href: "/industrias",
          },
          {
            title: "Aplicações",
            text: "Veja exemplos de aplicação organizados por processo e necessidade.",
            href: "/aplicacoes",
          },
          {
            title: "Soluções",
            text: "Consulte abordagens integradas para diferentes contextos técnicos.",
            href: "/solucoes",
          },
          {
            title: "Detecção de gases",
            text: "Entenda como iniciar a definição de um cenário de detecção.",
            href: "/deteccao-de-gas",
          },
        ],
        "CONTEÚDO PUBLICADO",
      ),
      benefits("Como começamos", [
        [
          "Contexto primeiro",
          "A avaliação parte do processo, do ambiente e da variável que precisa ser acompanhada.",
        ],
        ["Escopo editável", "Requisitos, entregáveis e responsabilidades são registrados antes da execução."],
        [
          "Integração por etapas",
          "Produtos, serviços e monitoramento podem ser organizados conforme o escopo aprovado.",
        ],
      ]),
      cta("Converse sobre sua aplicação"),
    ],
  }),
  managedPage({
    title: "Sobre a GAIATEC",
    slug: "sobre",
    path: "/sobre",
    summary:
      "Conheça a atuação da GAIATEC SISTEMAS em instrumentação, automação, monitoramento e serviços técnicos.",
    blocks: [
      hero(
        "Engenharia orientada ao contexto da operação",
        "A GAIATEC SISTEMAS organiza produtos, serviços e integrações a partir das necessidades técnicas informadas por cada cliente.",
        "SOBRE",
      ),
      richText(
        "Nossa atuação",
        "A GAIATEC COMÉRCIO E SERVIÇOS DE AUTOMAÇÃO E SISTEMA DO BRASIL LTDA atua com instrumentação, automação, monitoramento e serviços técnicos. Cada escopo deve considerar as condições do processo, o ambiente de instalação e os requisitos definidos para a aplicação.\n\nAs informações técnicas e comerciais específicas são confirmadas durante o atendimento. Este conteúdo não substitui levantamento, projeto, procedimento operacional ou análise de risco.",
      ),
      benefits("Princípios de trabalho", [
        ["Clareza de escopo", "Objetivos, interfaces e entregáveis são definidos de forma rastreável."],
        [
          "Adequação técnica",
          "A seleção depende das condições reais informadas para cada ponto ou processo.",
        ],
        ["Evolução controlada", "Integrações e monitoramento podem avançar por etapas verificáveis."],
      ]),
      cta("Fale com a equipe GAIATEC"),
    ],
  }),
  managedPage({
    title: "Contato",
    slug: "contato",
    path: "/contato",
    summary: "Canais oficiais para falar com a GAIATEC SISTEMAS e apresentar uma necessidade técnica.",
    blocks: [
      hero(
        "Vamos entender sua necessidade",
        "Informe o processo, a variável, o local de aplicação e o objetivo esperado para iniciarmos uma avaliação.",
        "CONTATO",
      ),
      richText(
        "Canais oficiais",
        "E-mail: gaiatec@gaiatecsistemas.com.br\n\nTelefone: +55 11 2207-1933\n\nWhatsApp: +55 11 2207-1986\n\nEndereço: Rua Herói da Força Expedicionária Brasileira, 22 — Parque Novo Mundo — São Paulo/SP — Brasil — CEP 02188-040.",
      ),
      contactForm(),
    ],
  }),
  managedPage({
    title: "Política de Privacidade",
    slug: "politica-de-privacidade",
    path: "/politica-de-privacidade",
    summary:
      "Informações gerais sobre o tratamento de dados pessoais nos canais digitais da GAIATEC SISTEMAS.",
    legalReview: true,
    blocks: [
      hero(
        "Privacidade e tratamento de dados",
        "Esta página explica, de forma geral, como dados pessoais podem ser tratados nos canais digitais da GAIATEC SISTEMAS.",
        "PRIVACIDADE",
      ),
      richText(
        "Controlador e contato",
        "O controlador indicado para estes canais é GAIATEC COMÉRCIO E SERVIÇOS DE AUTOMAÇÃO E SISTEMA DO BRASIL LTDA. Solicitações relacionadas a dados pessoais podem ser encaminhadas para gaiatec@gaiatecsistemas.com.br.\n\nEsta redação foi preparada para staging e deve receber revisão final do responsável por privacidade/DPO antes de qualquer publicação em produção.",
      ),
      richText(
        "Dados e finalidades",
        "Podemos tratar dados fornecidos voluntariamente em formulários ou contatos, como nome, empresa, e-mail, telefone e descrição da solicitação. Também podem existir registros técnicos necessários à segurança e ao funcionamento dos canais digitais.\n\nOs dados podem ser usados para responder solicitações, prestar atendimento, proteger os sistemas, cumprir obrigações aplicáveis e manter registros necessários à relação estabelecida. A base legal adequada depende do contexto de cada tratamento.",
      ),
      richText(
        "Compartilhamento, retenção e segurança",
        "Dados podem ser tratados por fornecedores que apoiam hospedagem, comunicação, segurança e operação dos sistemas, sempre conforme a finalidade aplicável. Também poderão ser fornecidos quando houver obrigação legal ou determinação válida.\n\nA retenção deve observar a finalidade, obrigações aplicáveis e prazos internos aprovados. São adotadas medidas administrativas e técnicas proporcionais ao contexto, sem promessa de segurança absoluta.",
      ),
      richText(
        "Direitos e atualizações",
        "O titular pode solicitar informações e exercer os direitos previstos na legislação aplicável pelos canais indicados. A identidade e o contexto da solicitação poderão ser confirmados para proteção do próprio titular.\n\nEsta política poderá ser atualizada para refletir mudanças operacionais, normativas ou de serviços. A versão vigente deve permanecer identificável no CMS.",
      ),
    ],
  }),
  managedPage({
    title: "Termos de Uso",
    slug: "termos-de-uso",
    path: "/termos-de-uso",
    summary: "Condições gerais e conservadoras para utilização dos canais digitais da GAIATEC SISTEMAS.",
    legalReview: true,
    blocks: [
      hero(
        "Condições de uso dos canais digitais",
        "Ao utilizar este site, o visitante deve observar estes termos e a legislação aplicável.",
        "TERMOS DE USO",
      ),
      richText(
        "Finalidade do site",
        "O site apresenta informações institucionais, técnicas e comerciais de caráter geral. Conteúdo público não constitui proposta definitiva, projeto, especificação contratual, recomendação de segurança ou garantia de adequação a uma aplicação específica.\n\nCondições técnicas, preços, prazos, responsabilidades e resultados dependem de avaliação e documento próprio aprovado entre as partes.",
      ),
      richText(
        "Uso adequado e propriedade intelectual",
        "O usuário não deve tentar comprometer a disponibilidade, a segurança ou a integridade dos canais digitais. Marcas, textos, interfaces e materiais publicados permanecem sujeitos aos direitos aplicáveis e não podem ser reutilizados fora das permissões concedidas.\n\nLinks externos, quando existentes, são oferecidos como conveniência e podem estar sujeitos a termos e políticas próprios.",
      ),
      richText(
        "Privacidade, disponibilidade e alterações",
        "O tratamento de dados pessoais é descrito na Política de Privacidade. O site pode passar por manutenção, correções ou indisponibilidades, e seu conteúdo pode ser atualizado de forma governada.\n\nEsta redação foi preparada para staging e requer revisão jurídica/DPO final antes de produção. Dúvidas podem ser enviadas para gaiatec@gaiatecsistemas.com.br.",
      ),
    ],
  }),
  managedPage({
    title: "Biodigestores",
    slug: "biodigestor",
    path: "/biodigestor",
    summary:
      "Visão geral sobre biodigestão, dimensionamento, monitoramento e automação, sem substituir projeto específico.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Biodigestão com escopo técnico definido",
        "Projetos de biodigestores exigem avaliação do material de entrada, do processo, da operação e do uso previsto para os produtos gerados.",
        "BIODIGESTORES",
      ),
      richText(
        "Uma solução que depende do contexto",
        "A biodigestão anaeróbia transforma matéria orgânica por ação biológica em ambiente sem oxigênio livre. O desempenho e a segurança dependem do substrato, da carga, do tempo de retenção, da temperatura, do manejo e do dimensionamento.\n\nAs páginas desta área apresentam conceitos gerais. Qualquer implantação requer levantamento, projeto e responsabilidades definidos para a operação real.",
      ),
      grid("Explore a área", [
        {
          title: "Como funciona",
          text: "Conheça as etapas gerais da digestão anaeróbia.",
          href: "/biodigestor/como-funciona",
        },
        {
          title: "Dimensionamento",
          text: "Entenda os fatores considerados na definição de porte.",
          href: "/biodigestor/portes",
        },
        {
          title: "Benefícios potenciais",
          text: "Veja resultados que podem ser avaliados para cada projeto.",
          href: "/biodigestor/beneficios",
        },
        {
          title: "Monitoramento",
          text: "Conheça variáveis que podem apoiar a operação.",
          href: "/biodigestor/monitoramento",
        },
        {
          title: "Biogás e biometano",
          text: "Entenda a distinção entre os dois termos.",
          href: "/biodigestor/biogas-biometano",
        },
        {
          title: "Automação",
          text: "Veja como instrumentos e controles podem ser integrados.",
          href: "/biodigestor/automacao",
        },
        {
          title: "Ambientes educacionais",
          text: "Consulte princípios para projetos com finalidade didática.",
          href: "/biodigestor/escolas",
        },
      ]),
      cta("Avalie um projeto de biodigestão"),
    ],
  }),
  managedPage({
    title: "Como funciona a biodigestão",
    slug: "biodigestor-como-funciona",
    path: "/biodigestor/como-funciona",
    summary: "Etapas gerais de um processo de digestão anaeróbia e fatores que exigem avaliação técnica.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Como funciona a digestão anaeróbia",
        "O processo biológico ocorre em etapas interdependentes e deve ser mantido dentro das condições previstas em projeto.",
        "BIODIGESTORES",
      ),
      steps("Fluxo geral", [
        [
          "Caracterização",
          "O material de entrada é identificado e avaliado quanto à composição, disponibilidade e possíveis interferentes.",
        ],
        [
          "Alimentação",
          "A carga é introduzida conforme a estratégia operacional e a capacidade definidas no projeto.",
        ],
        [
          "Conversão biológica",
          "Comunidades de microrganismos degradam a matéria orgânica em ambiente anaeróbio.",
        ],
        [
          "Separação e uso",
          "Biogás e digestato seguem para manejo, tratamento ou uso compatível com o escopo aprovado.",
        ],
      ]),
      richText(
        "Projeto e operação",
        "Temperatura, pH, carga orgânica, mistura, retenção e composição do material podem influenciar o processo. Os valores adequados não devem ser generalizados: precisam ser definidos e acompanhados para cada instalação.",
      ),
      cta("Entenda a aplicação no seu contexto"),
    ],
  }),
  managedPage({
    title: "Dimensionamento de biodigestores",
    slug: "biodigestor-portes",
    path: "/biodigestor/portes",
    summary: "Critérios gerais para avaliar capacidade e configuração de um biodigestor.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "O porte resulta dos dados do processo",
        "Não existe uma configuração universal: o dimensionamento depende da alimentação, do regime de operação e dos objetivos do projeto.",
        "DIMENSIONAMENTO",
      ),
      benefits("Informações necessárias", [
        ["Material de entrada", "Tipo, quantidade, variação e características relevantes do substrato."],
        [
          "Regime de operação",
          "Frequência de alimentação, sazonalidade, disponibilidade de equipe e utilidades.",
        ],
        ["Destino dos produtos", "Uso previsto para biogás, digestato e demais correntes do processo."],
        ["Condições locais", "Área, acesso, clima, infraestrutura, segurança e requisitos aplicáveis."],
      ]),
      richText(
        "Próximo passo",
        "A definição de capacidade, geometria, materiais, acessórios e controles deve ocorrer em documento técnico próprio. Os dados iniciais podem ser registrados no contato para organizar o levantamento.",
      ),
      cta("Solicite uma avaliação inicial"),
    ],
  }),
  managedPage({
    title: "Benefícios potenciais da biodigestão",
    slug: "biodigestor-beneficios",
    path: "/biodigestor/beneficios",
    summary:
      "Resultados potenciais que devem ser avaliados e quantificados para cada projeto de biodigestão.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Benefícios precisam ser demonstrados no projeto",
        "A biodigestão pode apoiar o manejo de matéria orgânica e gerar correntes aproveitáveis, mas os resultados não são automáticos nem universais.",
        "BENEFÍCIOS POTENCIAIS",
      ),
      benefits("O que pode ser avaliado", [
        [
          "Manejo de resíduos",
          "Organização do tratamento de correntes orgânicas compatíveis com o processo.",
        ],
        [
          "Aproveitamento energético",
          "Uso do biogás condicionado à qualidade, ao tratamento e aos equipamentos previstos.",
        ],
        [
          "Aproveitamento do digestato",
          "Possibilidade sujeita à caracterização, à qualidade e aos requisitos aplicáveis.",
        ],
        [
          "Dados operacionais",
          "Monitoramento do processo para apoiar ajustes, manutenção e rastreabilidade.",
        ],
      ]),
      richText(
        "Sem promessa de resultado",
        "Economia, produção, emissões evitadas e retorno financeiro dependem de premissas verificáveis. Qualquer estimativa deve declarar metodologia, dados de entrada, incertezas e responsabilidades.",
      ),
      cta("Estruture as premissas do projeto"),
    ],
  }),
  managedPage({
    title: "Monitoramento de biodigestores",
    slug: "biodigestor-monitoramento",
    path: "/biodigestor/monitoramento",
    summary: "Princípios gerais para selecionar variáveis, alarmes e registros em processos de biodigestão.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Monitorar para compreender o processo",
        "Variáveis e frequências de medição devem ser escolhidas conforme o projeto, o risco e a estratégia operacional.",
        "MONITORAMENTO",
      ),
      grid("Camadas de acompanhamento", [
        { title: "Processo", text: "Variáveis físicas, químicas ou operacionais definidas para o sistema." },
        {
          title: "Equipamentos",
          text: "Estados, falhas e necessidades de manutenção dos componentes monitorados.",
        },
        { title: "Alarmes", text: "Limites e respostas vinculados a procedimentos aprovados pela operação." },
        { title: "Histórico", text: "Registros que apoiam análise de tendência, investigação e melhoria." },
      ]),
      richText(
        "Integração responsável",
        "A disponibilidade remota de dados não substitui inspeções, procedimentos locais ou sistemas de segurança independentes quando exigidos. Conectividade, permissões e retenção precisam ser definidas no escopo.",
      ),
      cta("Defina um plano de monitoramento"),
    ],
  }),
  managedPage({
    title: "Biogás e biometano",
    slug: "biodigestor-biogas-biometano",
    path: "/biodigestor/biogas-biometano",
    summary: "Diferença conceitual entre biogás e biometano e cuidados para especificar seu uso.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Biogás e biometano não são sinônimos",
        "O biogás é produzido na digestão anaeróbia; o biometano resulta de tratamento e adequação do gás aos requisitos do uso previsto.",
        "CONCEITOS",
      ),
      richText(
        "Biogás",
        "É uma mistura gasosa gerada pela conversão anaeróbia de matéria orgânica. Sua composição varia conforme o material, o processo e a operação. Antes do uso, é necessário avaliar composição, contaminantes, umidade, pressão e segurança.",
      ),
      richText(
        "Biometano",
        "É obtido após etapas de tratamento e purificação destinadas a elevar a concentração de metano e adequar outras características. Os requisitos dependem da aplicação e das normas aplicáveis; não devem ser presumidos a partir desta descrição geral.",
      ),
      cta("Avalie a medição e o tratamento necessários"),
    ],
  }),
  managedPage({
    title: "Automação de biodigestores",
    slug: "biodigestor-automacao",
    path: "/biodigestor/automacao",
    summary: "Como instrumentos, controles e registros podem apoiar a operação de um biodigestor.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Automação alinhada ao processo",
        "A arquitetura de controle deve refletir o projeto, os modos de operação e as respostas previstas para condições anormais.",
        "AUTOMAÇÃO",
      ),
      steps("Estrutura genérica", [
        ["Medir", "Selecionar instrumentos compatíveis com variável, faixa, ambiente e ponto de instalação."],
        [
          "Controlar",
          "Definir lógicas, intertravamentos e modos manuais ou automáticos conforme análise aprovada.",
        ],
        [
          "Registrar",
          "Manter dados relevantes com identificação, horário e contexto suficientes para uso operacional.",
        ],
        [
          "Responder",
          "Relacionar alarmes a responsáveis e procedimentos, sem depender apenas de notificações remotas.",
        ],
      ]),
      cta("Planeje a automação por etapas"),
    ],
  }),
  managedPage({
    title: "Biodigestores em ambientes educacionais",
    slug: "biodigestor-escolas",
    path: "/biodigestor/escolas",
    summary: "Princípios conservadores para projetos de biodigestão com finalidade didática.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "Aprendizado prático com segurança",
        "Projetos educacionais podem demonstrar ciclos de matéria e energia, desde que tenham escopo, supervisão e controles adequados ao ambiente.",
        "EDUCAÇÃO",
      ),
      benefits("Cuidados essenciais", [
        ["Objetivo pedagógico", "Definir o que será observado e como a atividade se integra ao aprendizado."],
        [
          "Supervisão",
          "Estabelecer responsáveis, acesso controlado e procedimentos compatíveis com o público.",
        ],
        [
          "Operação segura",
          "Avaliar alimentação, gás, pressão, ventilação, efluentes e manutenção antes do uso.",
        ],
        [
          "Registro",
          "Documentar rotinas, ocorrências e resultados sem transformar estimativas em promessas.",
        ],
      ]),
      cta("Converse sobre um projeto educacional"),
    ],
  }),
  managedPage({
    title: "Detecção e monitoramento de gases",
    slug: "deteccao-de-gas",
    path: "/deteccao-de-gas",
    summary:
      "Orientação inicial para definir cenários de detecção e monitoramento sem expor fabricantes ou dados internos.",
    pageKind: "thematic",
    templateKey: "technical",
    blocks: [
      hero(
        "A tecnologia depende do cenário de risco",
        "A seleção começa pelo gás de interesse, pela área, pela atividade, pela forma de exposição e pela resposta operacional esperada.",
        "DETECÇÃO DE GASES",
      ),
      steps("Como estruturar a necessidade", [
        [
          "Definir o cenário",
          "Identificar ambiente, atividade, fontes possíveis, pessoas expostas e condições operacionais.",
        ],
        [
          "Definir o que detectar",
          "Registrar gases, faixas, tempos de resposta e limitações relevantes para a avaliação.",
        ],
        ["Definir a resposta", "Relacionar alarmes, responsáveis, procedimentos e integrações necessárias."],
        [
          "Validar o conjunto",
          "Confirmar instalação, uso, testes, calibração e manutenção conforme o escopo aprovado.",
        ],
      ]),
      grid("Conteúdo relacionado", [
        {
          title: "Aplicação de monitoramento",
          text: "Visão de processo e pontos de acompanhamento.",
          href: "/aplicacoes/monitoramento-deteccao-gases",
        },
        {
          title: "Solução integrada",
          text: "Abordagem para combinar formatos de detecção conforme o cenário.",
          href: "/solucoes/deteccao-integrada-gases",
        },
        {
          title: "Contato técnico",
          text: "Registre o gás, o ambiente e o objetivo da avaliação.",
          href: "/contato",
        },
      ]),
      faq("Perguntas iniciais", [
        [
          "Existe um detector universal?",
          "Não. Tecnologia, sensor, faixa e formato dependem do gás, do ambiente e do objetivo de uso.",
        ],
        [
          "O alarme substitui o procedimento de emergência?",
          "Não. A detecção deve fazer parte de uma resposta operacional definida e treinada pelo responsável da instalação.",
        ],
        [
          "Informações de fabricante aparecem nesta página?",
          "Não. Dados de fabricante marcados como internos permanecem fora da projeção pública.",
        ],
      ]),
      cta("Descreva o cenário de detecção"),
    ],
  }),
];

const industries = [
  industry({
    title: "Biogás e Biometano",
    slug: "biogas-biometano",
    summary:
      "Instrumentação, monitoramento e integração para etapas de produção, tratamento e uso de gases renováveis.",
    challenges: ["Variabilidade da composição do gás", "Acompanhamento seguro de processo e utilidades"],
    processAreas: ["Biodigestão", "Tratamento de gás", "Utilização energética", "Monitoramento operacional"],
    keywords: ["biogás", "biometano", "biodigestão"],
  }),
  industry({
    title: "Integridade e Proteção Catódica",
    slug: "protecao-catodica",
    summary: "Medição e acompanhamento de pontos associados à integridade e a sistemas de proteção catódica.",
    challenges: ["Pontos distribuídos", "Rastreabilidade de medições e intervenções"],
    processAreas: ["Levantamento de campo", "Pontos de teste", "Monitoramento", "Registros técnicos"],
    keywords: ["proteção catódica", "integridade", "corrosão"],
  }),
  industry({
    title: "Controle Ambiental",
    slug: "controle-ambiental",
    summary:
      "Instrumentação e monitoramento para variáveis ambientais definidas no contexto de cada operação.",
    challenges: ["Representatividade dos pontos", "Qualidade e continuidade dos registros"],
    processAreas: ["Água", "Efluentes", "Emissões e gases", "Condições ambientais"],
    keywords: ["controle ambiental", "monitoramento", "efluentes"],
  }),
  industry({
    title: "Segurança Operacional",
    slug: "seguranca-operacional",
    summary:
      "Soluções de medição, detecção e alarme que podem apoiar procedimentos de segurança definidos pela operação.",
    challenges: ["Detecção de condições anormais", "Integração entre alarme e resposta operacional"],
    processAreas: ["Áreas de processo", "Atividades de campo", "Alarmes", "Registros de eventos"],
    keywords: ["segurança operacional", "detecção", "alarme"],
  }),
  industry({
    title: "Instrumentação Industrial",
    slug: "instrumentacao",
    summary:
      "Medição de variáveis de processo e integração de instrumentos conforme as condições de cada aplicação.",
    challenges: ["Seleção adequada ao processo", "Confiabilidade e manutenção dos pontos"],
    processAreas: ["Vazão", "Pressão", "Nível", "Temperatura e outras variáveis"],
    keywords: ["instrumentação", "medição", "processo industrial"],
  }),
  industry({
    title: "Telemetria e Operações Remotas",
    slug: "telemetria",
    summary:
      "Coleta e acompanhamento de dados em pontos distribuídos, com conectividade e governança definidas no escopo.",
    challenges: ["Conectividade entre locais", "Disponibilidade e interpretação dos dados"],
    processAreas: ["Aquisição de dados", "Comunicação", "Painéis", "Alarmes e histórico"],
    keywords: ["telemetria", "monitoramento remoto", "dados operacionais"],
  }),
];

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(value) {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

function totp(secret, offset = 0) {
  const counter = BigInt(Math.floor(Date.now() / 30000) + offset);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const position = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function createActor(role) {
  const email = `cms-f9-${role}-${runTag}@example.com`;
  const password = `T!${crypto.randomBytes(24).toString("base64url")}9a`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const actor = { id: created.data.user.id, role, email, password, client: null, session: null };
  actors.push(actor);
  const profile = await admin.from("cms_profiles").insert({
    user_id: actor.id,
    display_name: `Publicação F9 clean-room ${role} ${runTag}`,
    display_email: email,
    status: "active",
  });
  if (profile.error) throw profile.error;
  const grant = await admin.from("cms_user_roles").insert({ user_id: actor.id, role_key: role });
  if (grant.error) throw grant.error;
  actor.client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await actor.client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error(`Login ${role} falhou.`);
  actor.session = signed.data.session;
  return actor;
}

async function invoke(functionName, actor, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${actor.session.access_token}`,
      Origin: siteOrigin,
      "Content-Type": "application/json",
      "X-Idempotency-Key": uid(),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `${functionName}/${body.action ?? "request"} retornou ${response.status}: ${data.code ?? data.error ?? "falha"}`,
    );
  return data;
}

async function elevate(actor) {
  const enrolled = await actor.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `f9-staging-${actor.role}-${runTag}`,
  });
  if (enrolled.error || !enrolled.data?.id || !enrolled.data?.totp?.secret)
    throw enrolled.error ?? new Error(`MFA ${actor.role} não foi matriculado.`);
  for (const offset of [0, -1, 1]) {
    const verified = await actor.client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret, offset),
    });
    if (!verified.error && verified.data?.access_token) {
      actor.session = {
        ...actor.session,
        ...verified.data,
        expires_at: Math.round(Date.now() / 1000) + verified.data.expires_in,
      };
      break;
    }
  }
  if (decodeJwt(actor.session.access_token).aal !== "aal2") throw new Error(`Sessão ${actor.role} sem AAL2.`);
  await invoke("cms-session", actor, { action: "mfa" });
}

async function publishFlow(item, creator, reviewer) {
  const reason = `Substituto clean-room F9 autorizado para staging em ${authorizationDate}`;
  const existing = await admin
    .from("cms_content_items")
    .select("id,workflow_status")
    .eq("content_type", item.contentType)
    .eq("slug", item.slug)
    .neq("workflow_status", "archived");
  if (existing.error) throw existing.error;
  if (existing.data.length > 0) {
    if (existing.data.length === 1 && existing.data[0].workflow_status === "published")
      return { contentType: item.contentType, slug: item.slug, status: "already_published" };
    if (
      existing.data.length === 1 &&
      ["draft", "in_review", "approved"].includes(existing.data[0].workflow_status)
    ) {
      const itemId = existing.data[0].id;
      const publication = await admin.from("cms_publications").select("item_id").eq("item_id", itemId);
      if (publication.error) throw publication.error;
      if (publication.data.length)
        throw new Error(`O conteúdo ${item.contentType}/${item.slug} já possui publicação.`);
      if (existing.data[0].workflow_status !== "draft") {
        const correlationId = uid();
        const recovered = await admin
          .from("cms_content_items")
          .update({ workflow_status: "draft", updated_by: creator.id })
          .eq("id", itemId)
          .in("workflow_status", ["in_review", "approved"]);
        if (recovered.error) throw recovered.error;
        const audit = await admin.from("cms_audit_log").insert({
          actor_id: creator.id,
          action: "cms:content.recover_failed_staging_publication",
          target_type: "content_item",
          target_id: itemId,
          event_data: {
            fromState: existing.data[0].workflow_status,
            reason: "Recuperação de item F9 nunca publicado após rejeição do validador de staging.",
            authorizationReference,
          },
          correlation_id: correlationId,
        });
        if (audit.error) throw audit.error;
      }
      const draft = await admin
        .from("cms_content_drafts")
        .select("lock_version")
        .eq("item_id", itemId)
        .single();
      if (draft.error) throw draft.error;
      const saved = await invoke("cms-content", creator, {
        action: "save",
        itemId,
        contentType: null,
        slug: item.slug,
        payload: item.payload,
        expectedLockVersion: draft.data.lock_version,
        revisionId: null,
        reason,
        publishAt: null,
      });
      const submitted = await invoke("cms-content", creator, {
        action: "submit",
        itemId,
        contentType: null,
        slug: null,
        payload: null,
        expectedLockVersion: saved.lockVersion,
        revisionId: null,
        reason,
        publishAt: null,
      });
      await invoke("cms-content", reviewer, {
        action: "approve",
        itemId,
        contentType: null,
        slug: null,
        payload: null,
        expectedLockVersion: null,
        revisionId: submitted.revisionId,
        reason,
        publishAt: null,
      });
      const published = await invoke("cms-content", creator, {
        action: "publish",
        itemId,
        contentType: null,
        slug: null,
        payload: null,
        expectedLockVersion: null,
        revisionId: submitted.revisionId,
        reason,
        publishAt: null,
      });
      return {
        contentType: item.contentType,
        slug: item.slug,
        itemId,
        revisionId: submitted.revisionId,
        correlationId: published.correlationId,
        status: "recovered_and_published",
      };
    }
    throw new Error(`O conteúdo ${item.contentType}/${item.slug} já existe fora do estado publicado.`);
  }

  const created = await invoke("cms-content", creator, {
    action: "create",
    itemId: null,
    contentType: item.contentType,
    slug: item.slug,
    payload: item.payload,
    expectedLockVersion: null,
    revisionId: null,
    reason,
    publishAt: null,
  });
  const submitted = await invoke("cms-content", creator, {
    action: "submit",
    itemId: created.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: created.lockVersion,
    revisionId: null,
    reason,
    publishAt: null,
  });
  await invoke("cms-content", reviewer, {
    action: "approve",
    itemId: created.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: submitted.revisionId,
    reason,
    publishAt: null,
  });
  const published = await invoke("cms-content", creator, {
    action: "publish",
    itemId: created.itemId,
    contentType: null,
    slug: null,
    payload: null,
    expectedLockVersion: null,
    revisionId: submitted.revisionId,
    reason,
    publishAt: null,
  });
  return {
    contentType: item.contentType,
    slug: item.slug,
    itemId: created.itemId,
    revisionId: submitted.revisionId,
    correlationId: published.correlationId,
    status: "published",
  };
}

async function publicJson(params) {
  const response = await fetch(`${supabaseUrl}/functions/v1/cms-public?${new URLSearchParams(params)}`, {
    headers: { apikey: anonKey },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`API pública retornou ${response.status}.`);
  return data;
}

async function validateProjection() {
  const resolvedPaths = [];
  for (const item of pages) {
    const resolution = await publicJson({ type: "page-by-path", path: item.payload.route.path });
    if (resolution.kind !== "page" || resolution.page?.payload?.route?.path !== item.payload.route.path)
      throw new Error(`A projeção pública não resolveu ${item.payload.route.path}.`);
    resolvedPaths.push(item.payload.route.path);
  }
  const collection = await publicJson({ type: "collection", contentType: "industry" });
  const industrySlugs = new Set((collection.items ?? []).map((item) => item.slug));
  for (const item of industries) {
    if (!industrySlugs.has(item.slug))
      throw new Error(`A projeção pública não contém industry/${item.slug}.`);
  }
  return { resolvedPaths, industryTotal: collection.total };
}

async function cleanupActors() {
  const timestamp = now();
  for (const actor of actors) {
    await admin
      .from("cms_profiles")
      .update({ status: "suspended", suspended_at: timestamp, sessions_valid_after: timestamp })
      .eq("user_id", actor.id);
    await admin.auth.admin.updateUserById(actor.id, {
      password: `R!${crypto.randomBytes(32).toString("base64url")}8z`,
      ban_duration: "876000h",
    });
  }
}

let report;
try {
  const [creator, reviewer] = await Promise.all([createActor("admin"), createActor("super_admin")]);
  await Promise.all([elevate(creator), elevate(reviewer)]);
  const published = [];
  const biodigestorHub = pages.find((item) => item.payload.route.path === "/biodigestor");
  const orderedPages = pages.filter((item) => item !== biodigestorHub);
  if (biodigestorHub) orderedPages.push(biodigestorHub);
  for (const item of [...industries, ...orderedPages])
    published.push(await publishFlow(item, creator, reviewer));
  report = {
    status: "passed",
    environment: "staging",
    productionTouched: false,
    authorizationReference,
    published,
    publicProjection: await validateProjection(),
  };
} catch (error) {
  report = {
    status: "failed",
    environment: "staging",
    productionTouched: false,
    error: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
} finally {
  await cleanupActors();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
