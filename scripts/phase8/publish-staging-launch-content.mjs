import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.GAIATEC_SUPABASE_URL;
const anonKey = process.env.GAIATEC_SUPABASE_ANON_KEY;
const serviceKey = process.env.GAIATEC_SUPABASE_SERVICE_ROLE_KEY;
const siteOrigin = "https://gaiatec-cms-staging.pages.dev";
const stagingProject = "glcqsosxwgmlhzgcsnzv";
const authorizationDate = "2026-08-30";
const authorizationReference = "GAIATEC-ADMIN-CHAT-2026-08-30";

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

function provenance() {
  return [
    {
      sourceKind: "owner_authored",
      authorizationReference,
      authorizationDate,
      rightsScope: "Conteúdo clean-room fornecido e autorizado pelo administrador para staging.",
      rightsConfirmed: true,
      commercialOwner: "Victor Nishida",
      technicalOwner: "Equipe técnica GAIATEC SISTEMAS",
      verifiedAt: now(),
    },
  ];
}

function richBlock(text) {
  return { id: uid(), type: "rich_text", data: { text } };
}

function seo(title, description, canonicalPath) {
  return {
    title: `${title} | GAIATEC SISTEMAS`,
    description,
    canonicalPath,
    indexable: true,
  };
}

function discoveryApproval() {
  return {
    businessOwner: "Victor Nishida",
    technicalReviewer: "Equipe técnica GAIATEC SISTEMAS",
    commercialReviewer: "Victor Nishida",
    editorialReviewer: "Victor Nishida",
    homologatedAt: now(),
  };
}

function serviceApproval() {
  return {
    operationalOwner: "Victor Nishida",
    technicalReviewer: "Equipe técnica GAIATEC SISTEMAS",
    commercialReviewer: "Victor Nishida",
    editorialReviewer: "Victor Nishida",
    homologatedAt: now(),
  };
}

function baseDiscovery(title, slug, summary, contentType, consumerId, keywords) {
  const collectionPath =
    contentType === "industry"
      ? "industrias"
      : contentType === "application"
        ? "aplicacoes"
        : contentType === "solution"
          ? "solucoes"
          : "servicos";
  return {
    schemaVersion: 1,
    consumerId,
    contentType,
    title,
    summary,
    blocks: [richBlock(summary)],
    seo: seo(title, summary, `/${collectionPath}/${slug}`),
    provenance: provenance(),
    governanceState: "homologated",
    media: [],
    search: { synonyms: [], keywords },
  };
}

function service({
  title,
  slug,
  kind,
  summary,
  scope,
  whenToHire,
  deliverables,
  prerequisites,
  steps,
  keywords,
}) {
  return {
    contentType: "service",
    slug,
    payload: {
      ...baseDiscovery(title, slug, summary, "service", "cms.service.v1", keywords),
      serviceKind: kind,
      scope,
      whenToHire,
      deliverables,
      prerequisites,
      executionSteps: steps,
      cta: { label: "Solicitar avaliação técnica", href: "/contato" },
      relations: { productIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      approval: serviceApproval(),
    },
  };
}

function industry({ title, slug, summary, challenges, processAreas, keywords }) {
  return {
    contentType: "industry",
    slug,
    payload: {
      ...baseDiscovery(title, slug, summary, "industry", "cms.industry.v1", keywords),
      marketName: title,
      challenges,
      evidence: ["Escopo inicial definido e aprovado pelo administrador da GAIATEC SISTEMAS."],
      processAreas,
      cta: { label: "Conversar com um especialista", href: "/contato" },
      relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      approval: discoveryApproval(),
    },
  };
}

function application({ title, slug, summary, process, problem, benefits, point, keywords }) {
  return {
    contentType: "application",
    slug,
    payload: {
      ...baseDiscovery(title, slug, summary, "application", "cms.application.v1", keywords),
      process,
      problem,
      benefits,
      points: [
        {
          id: uid(),
          title: point.title,
          need: point.need,
          variable: point.variable,
          function: point.function,
          technicalBenefit: point.technicalBenefit,
          operationalBenefit: point.operationalBenefit,
          productIds: [],
          serviceIds: [],
        },
      ],
      cta: { label: "Avaliar esta aplicação", href: "/contato" },
      relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      approval: discoveryApproval(),
    },
  };
}

function solution({ title, slug, summary, problem, approach, benefits, components, gasDetection, keywords }) {
  return {
    contentType: "solution",
    slug,
    payload: {
      ...baseDiscovery(title, slug, summary, "solution", "cms.solution.v1", keywords),
      problem,
      approach,
      benefits,
      components,
      gasDetectionModel: gasDetection ? "integrated_master_catalog" : "not_applicable",
      cta: { label: "Projetar solução integrada", href: "/contato" },
      relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
      approval: discoveryApproval(),
    },
  };
}

const launchContent = [
  service({
    title: "Instalação de Medidores",
    slug: "instalacao-de-medidores",
    kind: "Instalação e comissionamento",
    summary:
      "Instalação técnica de medidores para variáveis de processo, com verificação funcional do ponto de medição.",
    scope:
      "Levantamento do ponto, orientação de montagem, instalação, conexão aplicável e verificação funcional de medidores de vazão, pressão, nível ou temperatura.",
    whenToHire: [
      "Novos pontos de medição",
      "Substituição de instrumentos",
      "Adequação de uma instalação existente",
    ],
    deliverables: [
      "Registro do serviço executado",
      "Verificação funcional",
      "Orientações iniciais de operação",
    ],
    prerequisites: [
      "Acesso seguro ao local",
      "Ponto de instalação liberado",
      "Informações básicas do processo",
    ],
    steps: ["Levantamento técnico", "Planejamento da intervenção", "Instalação", "Verificação e entrega"],
    keywords: ["instalação", "medidores", "instrumentação"],
  }),
  service({
    title: "Monitoramento e Controle Remoto",
    slug: "monitoramento-e-controle-remoto",
    kind: "Monitoramento digital",
    summary:
      "Integração de instrumentos à plataforma GAIATEC para acompanhamento remoto de variáveis e eventos operacionais.",
    scope:
      "Configuração da coleta de dados, painéis de acompanhamento, regras operacionais e acesso remoto de acordo com o escopo contratado.",
    whenToHire: [
      "Necessidade de visibilidade remota",
      "Consolidação de dados operacionais",
      "Acompanhamento de pontos distribuídos",
    ],
    deliverables: ["Painel configurado", "Pontos integrados", "Orientação de uso"],
    prerequisites: [
      "Instrumentos compatíveis",
      "Conectividade disponível ou prevista",
      "Definição das variáveis monitoradas",
    ],
    steps: [
      "Mapeamento dos pontos",
      "Configuração da integração",
      "Validação dos dados",
      "Liberação do acesso",
    ],
    keywords: ["monitoramento remoto", "controle", "plataforma GAIATEC"],
  }),
  service({
    title: "Instalação de Biodigestores",
    slug: "instalacao-de-biodigestores",
    kind: "Implantação de sistemas",
    summary:
      "Apoio técnico à implantação de biodigestores e dos sistemas de instrumentação associados ao processo.",
    scope:
      "Planejamento da instalação, acompanhamento das interfaces de processo e integração dos instrumentos previstos no projeto do biodigestor.",
    whenToHire: [
      "Implantação de novo biodigestor",
      "Expansão de uma unidade",
      "Integração de instrumentação e automação",
    ],
    deliverables: [
      "Plano de implantação",
      "Registro das interfaces verificadas",
      "Orientação operacional inicial",
    ],
    prerequisites: [
      "Projeto e local definidos",
      "Condições civis e utilidades liberadas",
      "Escopo técnico aprovado",
    ],
    steps: [
      "Análise do projeto",
      "Planejamento",
      "Acompanhamento da instalação",
      "Verificação das interfaces",
    ],
    keywords: ["biodigestor", "biogás", "instalação"],
  }),
  service({
    title: "Calibração de Instrumentos",
    slug: "calibracao-de-instrumentos",
    kind: "Verificação metrológica",
    summary:
      "Calibração e verificação de instrumentos conforme o escopo técnico definido para cada aplicação.",
    scope:
      "Identificação do instrumento, definição dos pontos, execução da calibração ou verificação e emissão dos registros correspondentes ao serviço contratado.",
    whenToHire: [
      "Plano periódico de calibração",
      "Dúvida sobre o desempenho do instrumento",
      "Retorno de manutenção",
    ],
    deliverables: ["Registro de calibração", "Resultados por ponto", "Identificação do instrumento avaliado"],
    prerequisites: ["Instrumento disponível", "Faixa e pontos definidos", "Condição segura para execução"],
    steps: [
      "Recebimento e identificação",
      "Execução dos pontos",
      "Análise dos resultados",
      "Emissão do registro",
    ],
    keywords: ["calibração", "instrumentos", "metrologia"],
  }),
  service({
    title: "Serviço de Proteção Catódica",
    slug: "servico-de-protecao-catodica",
    kind: "Integridade e corrosão",
    summary:
      "Serviços técnicos para acompanhamento de sistemas de proteção catódica e pontos de medição associados.",
    scope:
      "Levantamento de pontos, medições em campo, verificação dos elementos do sistema e consolidação dos registros previstos no escopo contratado.",
    whenToHire: ["Inspeção periódica", "Avaliação de desempenho", "Implantação ou adequação de pontos"],
    deliverables: ["Registros de campo", "Relação dos pontos avaliados", "Recomendações técnicas do escopo"],
    prerequisites: ["Acesso aos pontos", "Documentação disponível", "Condições seguras de trabalho"],
    steps: ["Planejamento", "Levantamento em campo", "Análise", "Entrega dos registros"],
    keywords: ["proteção catódica", "corrosão", "integridade"],
  }),
  industry({
    title: "Saneamento",
    slug: "saneamento",
    summary:
      "Instrumentação e monitoramento para captação, tratamento, distribuição de água e tratamento de efluentes.",
    challenges: ["Medição confiável em redes e processos", "Visibilidade operacional de pontos distribuídos"],
    processAreas: ["Água bruta", "Tratamento de água", "Esgotamento sanitário", "Distribuição"],
    keywords: ["saneamento", "água", "esgoto"],
  }),
  industry({
    title: "Óleo e Gás",
    slug: "oleo-e-gas",
    summary:
      "Soluções de medição, detecção e acompanhamento para processos de óleo, gás e seus sistemas auxiliares.",
    challenges: [
      "Confiabilidade das variáveis de processo",
      "Detecção de condições potencialmente perigosas",
    ],
    processAreas: ["Gasodutos", "Estações de medição", "Utilidades", "Áreas de processo"],
    keywords: ["óleo", "gás", "gasoduto"],
  }),
  industry({
    title: "Processos Industriais",
    slug: "processos-industriais",
    summary: "Instrumentação, automação e monitoramento para diferentes processos e utilidades industriais.",
    challenges: ["Padronização da medição", "Integração entre instrumentos e operação"],
    processAreas: ["Produção", "Utilidades", "Armazenamento", "Tratamento de efluentes"],
    keywords: ["indústria", "processo", "automação"],
  }),
  industry({
    title: "Farmacêutica",
    slug: "farmaceutica",
    summary:
      "Medição e monitoramento de variáveis em processos, utilidades e ambientes da indústria farmacêutica.",
    challenges: ["Repetibilidade da medição", "Organização dos registros operacionais"],
    processAreas: ["Água de processo", "Utilidades", "Ambientes controlados", "Armazenamento"],
    keywords: ["farmacêutica", "processo", "utilidades"],
  }),
  industry({
    title: "Alimentos e Bebidas",
    slug: "alimentos-e-bebidas",
    summary:
      "Instrumentação para processos de produção, transferência, utilidades e tratamento na indústria de alimentos e bebidas.",
    challenges: ["Continuidade operacional", "Acompanhamento das variáveis de produção e utilidades"],
    processAreas: ["Produção", "Limpeza", "Utilidades", "Tratamento de água e efluentes"],
    keywords: ["alimentos", "bebidas", "processo"],
  }),
  industry({
    title: "Agronegócio",
    slug: "agronegocio",
    summary:
      "Medição e monitoramento aplicados à água, armazenagem, produção e aproveitamento de resíduos no agronegócio.",
    challenges: ["Pontos geograficamente distribuídos", "Acompanhamento de recursos e processos"],
    processAreas: ["Irrigação", "Armazenagem", "Biodigestão", "Tratamento de resíduos"],
    keywords: ["agronegócio", "irrigação", "biodigestor"],
  }),
  industry({
    title: "HVAC",
    slug: "hvac",
    summary:
      "Medição de vazão, pressão, temperatura e outras variáveis em sistemas de climatização e utilidades prediais.",
    challenges: ["Balanceamento operacional", "Acompanhamento de desempenho dos circuitos"],
    processAreas: ["Água gelada", "Ventilação", "Pressurização", "Utilidades prediais"],
    keywords: ["HVAC", "climatização", "água gelada"],
  }),
  industry({
    title: "Mineração",
    slug: "mineracao",
    summary: "Medição e monitoramento para água, polpas, utilidades e processos auxiliares da mineração.",
    challenges: ["Condições operacionais exigentes", "Medição em diferentes características de fluido"],
    processAreas: ["Captação e água de processo", "Beneficiamento", "Rejeitos", "Utilidades"],
    keywords: ["mineração", "polpa", "água de processo"],
  }),
  application({
    title: "Medição em Estações de Água e Esgoto",
    slug: "medicao-estacoes-agua-esgoto",
    summary: "Medição e controle de variáveis em estações de tratamento de água e de esgoto.",
    process: "Captação, tratamento, transferência e descarte controlado de água ou efluentes.",
    problem:
      "A operação precisa acompanhar vazão, pressão, nível e outras variáveis em pontos críticos do processo.",
    benefits: [
      "Maior visibilidade do processo",
      "Apoio ao controle operacional",
      "Centralização de informações",
    ],
    point: {
      title: "Ponto de medição do processo",
      need: "Acompanhar continuamente uma variável crítica.",
      variable: "Vazão, pressão, nível ou temperatura",
      function: "Medir e disponibilizar o valor para operação local ou remota.",
      technicalBenefit: "Seleção do instrumento de acordo com o ponto e o fluido.",
      operationalBenefit: "Informação disponível para acompanhamento e tomada de decisão.",
    },
    keywords: ["ETA", "ETE", "medição", "controle"],
  }),
  application({
    title: "Medição e Controle em Gasodutos",
    slug: "medicao-controle-gasodutos",
    summary: "Instrumentação para acompanhamento de variáveis e condições operacionais em gasodutos.",
    process: "Transporte e distribuição de gases por redes e estações associadas.",
    problem: "Pontos distribuídos precisam de medição e acompanhamento consistente para apoiar a operação.",
    benefits: [
      "Visibilidade dos pontos monitorados",
      "Integração com sistemas de controle",
      "Apoio à operação remota",
    ],
    point: {
      title: "Estação ou ponto de linha",
      need: "Monitorar as condições do trecho ou da estação.",
      variable: "Vazão, pressão e temperatura",
      function: "Coletar as variáveis definidas e encaminhá-las ao sistema de acompanhamento.",
      technicalBenefit: "Arquitetura de medição organizada por ponto.",
      operationalBenefit: "Acompanhamento centralizado de locais distribuídos.",
    },
    keywords: ["gasoduto", "gás", "pressão", "vazão"],
  }),
  application({
    title: "Monitoramento e Detecção de Gases",
    slug: "monitoramento-deteccao-gases",
    summary:
      "Detecção fixa ou portátil e monitoramento de gases em áreas e atividades definidas pela análise de risco do cliente.",
    process:
      "Acompanhamento de ambientes, equipamentos, veículos ou atividades com possibilidade de presença de gases.",
    problem:
      "A equipe precisa identificar condições de gás conforme o cenário e o procedimento operacional aplicável.",
    benefits: [
      "Monitoramento compatível com o cenário",
      "Alarmes locais ou integrados",
      "Organização dos pontos de detecção",
    ],
    point: {
      title: "Ponto ou atividade monitorada",
      need: "Detectar a presença ou concentração de gases definidos para o cenário.",
      variable: "Gás ou grupo de gases monitorados",
      function: "Detectar, sinalizar e, quando previsto, transmitir o evento.",
      technicalBenefit: "Combinação de detectores conforme a necessidade da aplicação.",
      operationalBenefit: "Informação para execução dos procedimentos de resposta definidos pelo cliente.",
    },
    keywords: ["detecção de gases", "detector fixo", "detector portátil"],
  }),
  solution({
    title: "Instrumentação e Monitoramento Remoto",
    slug: "instrumentacao-monitoramento-remoto",
    summary: "Solução integrada de medição de vazão, pressão, nível e temperatura com acompanhamento remoto.",
    problem:
      "Variáveis importantes ficam distribuídas entre instrumentos e locais diferentes, dificultando uma visão consolidada.",
    approach:
      "Selecionar os instrumentos, integrar os pontos de medição e disponibilizar os dados na plataforma GAIATEC de acordo com o escopo técnico.",
    benefits: ["Visão consolidada", "Acompanhamento remoto", "Arquitetura expansível por etapas"],
    components: [
      "Medidores de vazão",
      "Instrumentos de pressão",
      "Instrumentos de nível",
      "Sensores de temperatura",
      "Plataforma de monitoramento",
    ],
    gasDetection: false,
    keywords: ["instrumentação", "monitoramento remoto", "vazão", "pressão", "nível", "temperatura"],
  }),
  solution({
    title: "Detecção Integrada de Gases",
    slug: "deteccao-integrada-gases",
    summary:
      "Combinação de detectores portáteis, fixos, detectores de chama e soluções veiculares para cenários de detecção.",
    problem:
      "Diferentes áreas e atividades podem exigir tecnologias e formatos distintos de detecção e alarme.",
    approach:
      "Organizar o cenário, os gases de interesse, os pontos e a forma de resposta para compor uma solução com equipamentos do catálogo mestre.",
    benefits: [
      "Cobertura adequada ao cenário",
      "Integração entre pontos quando aplicável",
      "Gestão centralizada no catálogo",
    ],
    components: [
      "Detectores portáteis",
      "Detectores fixos",
      "Detectores de chama",
      "Detectores veiculares",
      "Acessórios e integração",
    ],
    gasDetection: true,
    keywords: ["detecção de gases", "detector de chama", "detector veicular"],
  }),
];

function navigationDocument() {
  const footerRootId = uid();
  const links = [
    ["Produtos", "/produtos"],
    ["Serviços", "/servicos"],
    ["Indústrias", "/industrias"],
    ["Aplicações", "/aplicacoes"],
    ["Soluções", "/solucoes"],
    ["Contato", "/contato"],
  ];
  return {
    contentType: "navigation",
    slug: "site-navigation",
    payload: {
      schemaVersion: 1,
      consumerId: "cms.site-navigation.v1",
      contentType: "navigation",
      title: "Navegação global",
      blocks: [],
      seo: {
        title: "Navegação global",
        description: "Documento de navegação do novo CMS GAIATEC.",
        canonicalPath: "/_site/navigation",
        indexable: false,
      },
      provenance: provenance(),
      items: [
        ...links.map(([label, href], order) => ({
          id: uid(),
          parentId: null,
          location: "header",
          label,
          href,
          order,
          newTab: false,
          visible: true,
        })),
        {
          id: footerRootId,
          parentId: null,
          location: "footer",
          label: "Navegação",
          href: "/",
          order: 0,
          newTab: false,
          visible: true,
        },
        ...links.map(([label, href], order) => ({
          id: uid(),
          parentId: footerRootId,
          location: "footer",
          label,
          href,
          order,
          newTab: false,
          visible: true,
        })),
      ],
    },
  };
}

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
  const email = `cms-launch-${role}-${runTag}@example.com`;
  const password = `T!${crypto.randomBytes(24).toString("base64url")}9a`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const actor = { id: created.data.user.id, role, email, password, client: null, session: null };
  actors.push(actor);
  const profile = await admin.from("cms_profiles").insert({
    user_id: actor.id,
    display_name: `Publicação clean-room ${role} ${runTag}`,
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
      `${functionName}/${body.action ?? "request"} retornou ${response.status}: ${data.error ?? "falha"}`,
    );
  return data;
}

async function elevate(actor) {
  const enrolled = await actor.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `launch-staging-${actor.role}-${runTag}`,
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
  const reason = `Recadastro clean-room autorizado por Victor Nishida em ${authorizationDate}`;
  const existing = await admin
    .from("cms_content_items")
    .select("id,workflow_status")
    .eq("content_type", item.contentType)
    .eq("slug", item.slug)
    .neq("workflow_status", "archived");
  if (existing.error) throw existing.error;
  if (existing.data.length > 0) {
    if (existing.data.length === 1 && existing.data[0].workflow_status === "published") {
      return { contentType: item.contentType, slug: item.slug, status: "already_published" };
    }
    if (existing.data.length === 1 && ["in_review", "approved"].includes(existing.data[0].workflow_status)) {
      const revision = await admin
        .from("cms_content_revisions")
        .select("id")
        .eq("item_id", existing.data[0].id)
        .order("revision_number", { ascending: false })
        .limit(1)
        .single();
      if (revision.error) throw revision.error;
      if (existing.data[0].workflow_status === "in_review") {
        await invoke("cms-content", reviewer, {
          action: "approve",
          itemId: existing.data[0].id,
          contentType: null,
          slug: null,
          payload: null,
          expectedLockVersion: null,
          revisionId: revision.data.id,
          reason,
          publishAt: null,
        });
      }
      const published = await invoke("cms-content", creator, {
        action: "publish",
        itemId: existing.data[0].id,
        contentType: null,
        slug: null,
        payload: null,
        expectedLockVersion: null,
        revisionId: revision.data.id,
        reason,
        publishAt: null,
      });
      return {
        contentType: item.contentType,
        slug: item.slug,
        itemId: existing.data[0].id,
        revisionId: revision.data.id,
        correlationId: published.correlationId,
        status: "resumed_and_published",
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

async function validatePublicProjection() {
  const expected = Object.groupBy(launchContent, (item) => item.contentType);
  const counts = {};
  for (const contentType of ["service", "industry", "application", "solution"]) {
    const collection = await publicJson({ type: "collection", contentType });
    const slugs = new Set((collection.items ?? []).map((item) => item.slug));
    for (const item of expected[contentType] ?? []) {
      if (!slugs.has(item.slug))
        throw new Error(`A projeção pública não contém ${contentType}/${item.slug}.`);
    }
    counts[contentType] = collection.total;
  }
  const shell = await publicJson({ type: "site-shell" });
  if (!shell.navigation?.items?.length) throw new Error("A navegação não chegou ao site-shell público.");
  return { counts, navigationItems: shell.navigation.items.length };
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
  for (const item of [...launchContent, navigationDocument()]) {
    published.push(await publishFlow(item, creator, reviewer));
  }
  report = {
    status: "passed",
    environment: "staging",
    productionTouched: false,
    authorizationReference,
    published,
    publicProjection: await validatePublicProjection(),
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
