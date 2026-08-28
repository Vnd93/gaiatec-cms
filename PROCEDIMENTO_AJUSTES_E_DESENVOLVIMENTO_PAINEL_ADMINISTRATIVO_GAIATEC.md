# Procedimento de ajustes e desenvolvimento do painel administrativo GAIATEC

**Versão:** 1.0  
**Data:** 27 de agosto de 2026  
**Aplicação:** site público, CMS/painel administrativo, integrações de conteúdo e correções de segurança relacionadas  
**Repositório-base examinado:** `website_gaiatecsistemas-main/website_gaiatecsistemas-main`  
**Estado:** procedimento obrigatório para planejamento, desenvolvimento, homologação e implantação  

---

## 1. Finalidade

Este documento define **como executar** os ajustes e o desenvolvimento da área administrativa da GAIATEC, convertendo as auditorias e a especificação técnica em um processo de trabalho controlado.

O objetivo operacional é entregar um CMS no qual usuários autorizados possam administrar catálogo, conteúdo, mídia, homepage, serviços, aplicações, setores, blog, campanhas, SEO, leads, menus e configurações permitidas sem editar código — mantendo o site funcional, seguro, responsivo, rastreável e restaurável.

Este procedimento deve impedir quatro resultados inadequados:

1. telas administrativas que salvam dados sem alterar o site;
2. campos que existem no painel, mas não possuem consumidor público;
3. publicação que quebra rotas, layout, cache, SEO ou relações;
4. permissões aparentes no frontend que não são validadas no servidor e no banco.

O procedimento não autoriza uma reconstrução indiscriminada do site. Cada mudança deve ser justificada, implementada em uma capacidade vertical completa e liberada por critérios objetivos.

---

## 2. Documentos normativos e ordem de prevalência

O desenvolvimento deve consultar estes documentos:

1. `Analise e Arquitetura do Site - GAIATEC SISTEMAS.md` — experiência de descoberta, catálogo mestre, busca, taxonomia, páginas e SEO;
2. `AUDITORIA_CMS_GAIATEC.md` — auditoria externa, arquitetura geral, módulos e riscos do CMS;
3. `COMPLEMENTO_TECNICO_OPERACIONAL_AUDITORIA_CMS_GAIATEC.md` — evidências do código, contratos, segurança, RDO, operação e critérios de aceite;
4. este procedimento — sequência, responsabilidades, gates e forma de executar;
5. ADRs aprovados — decisões arquiteturais posteriores e específicas;
6. contratos versionados, migrations e testes existentes no repositório.

Em caso de conflito, prevalecem, nesta ordem:

1. legislação, segurança e regra de negócio formalmente aprovada;
2. ADR mais recente e aprovado;
3. contrato de API/schema versionado em produção;
4. este procedimento;
5. complemento técnico-operacional;
6. auditorias anteriores;
7. comportamento legado não documentado.

Nenhuma divergência deve ser resolvida silenciosamente. Deve ser criada uma ADR ou decisão registrada com impacto, responsáveis e plano de migração.

---

## 3. Princípios inegociáveis

### 3.1 Fonte canônica

Cada domínio deve possuir uma única fonte oficial. Não manter produto, serviço, setor, aplicação, menu ou contato simultaneamente no banco e em arrays hardcoded após a migração definitiva.

### 3.2 Capacidade vertical completa

Uma funcionalidade somente está pronta quando o caminho inteiro funciona:

```text
painel
 -> validação de formulário
 -> API/comando autorizado
 -> banco e relações
 -> revisão/publicação
 -> API pública/projeção
 -> cache
 -> componente do site
 -> preview
 -> auditoria
 -> testes
 -> monitoramento
```

### 3.3 Controle amplo, estrutura governada

O administrador controla conteúdo, mídia, ordem, relações, visibilidade, SEO e presets. O código controla estrutura, comportamento, segurança, acessibilidade, responsividade e limites de design.

### 3.4 Segurança no backend

Ocultar menu ou botão não é autorização. Toda ação deve ser verificada na API e no banco por RBAC/RLS.

### 3.5 Publicação restaurável

Conteúdo publicado nunca é sobrescrito sem versão. Toda publicação deve gerar auditoria e permitir restauração.

### 3.6 Migração gradual

Não reativar todos os hooks de conteúdo de uma vez. Cada domínio deve usar feature flag e possuir rollback independente.

### 3.7 Falha segura

Se CMS, API ou publicação falhar, o site deve continuar exibindo a última versão publicada válida. Rascunhos, payloads parciais e erros não podem substituir conteúdo válido.

### 3.8 Nenhum campo órfão

Todo campo administrativo deve possuir `consumer_id`, schema, componente consumidor, preview e teste. Campo sem consumidor não entra no painel.

---

## 4. Governança do projeto

### 4.1 Papéis necessários

| Papel | Responsabilidade principal |
|---|---|
| Patrocinador/decisor GAIATEC | Aprovar prioridades, orçamento, riscos e entrada em produção. |
| Product Owner | Fechar regras, critérios de aceite e ordem do backlog. |
| Responsável pelo portfólio | Validar taxonomia, produtos, atributos, documentos e relações. |
| Marketing | Validar homepage, campanhas, blog, SEO, mídia e tom editorial. |
| Comercial | Validar jornadas, CTAs, formulários, leads e integração com ERP. |
| Engenharia/técnico | Validar especificações, aplicações, serviços e evidências técnicas. |
| Tech Lead | Aprovar arquitetura, ADRs, contratos, migrations e releases. |
| Desenvolvedor frontend | Painel, preview, componentes públicos e acessibilidade. |
| Desenvolvedor backend/dados | APIs, Supabase, RLS, migrations, workers e integrações. |
| QA | Estratégia de testes, evidências, regressão e homologação. |
| Segurança/LGPD | Threat model, acessos, retenção, incidentes e dados pessoais. |
| Operação/DevOps | Ambientes, CI/CD, logs, alertas, backup e rollback. |

Uma pessoa pode acumular funções, mas as responsabilidades não podem ficar sem proprietário.

### 4.2 RACI resumido

| Decisão/atividade | Responsável | Aprovador | Consultados |
|---|---|---|---|
| Taxonomia e primeira onda de produtos | Portfólio | Product Owner | Comercial, Engenharia |
| Arquitetura e hosting | Tech Lead | Patrocinador | DevOps, Segurança |
| RBAC e MFA | Backend/Segurança | Tech Lead | Product Owner |
| Design do painel | Frontend/UX | Product Owner | Usuários reais |
| Conteúdo e SEO | Marketing | Product Owner | Comercial, Técnico |
| Regras do RDO | Product Owner/RDO | Patrocinador | Jurídico, Segurança, Operação |
| Go-live | Tech Lead/QA | Patrocinador | Todos os owners |

### 4.3 Ritos

- planejamento semanal com prioridades e dependências;
- refinamento técnico antes de iniciar cada capacidade;
- demonstração em staging ao concluir uma capacidade vertical;
- revisão de riscos P0/P1 semanal;
- homologação formal por módulo;
- retrospectiva após cada release importante;
- revisão mensal de acessos, falhas e métricas durante a implantação.

---

## 5. Preparação obrigatória

### 5.1 Acessos e artefatos

Obter antes de alterar produção:

- repositório Git completo, com histórico e branch principal identificada;
- repositório do ERP/`dzsystem` e código do painel `/marketing/site` citado;
- fonte de todas as Edge Functions implantadas, especialmente `site-content`;
- migrations completas das tabelas de conteúdo e `leads`;
- acesso separado ao Supabase de desenvolvimento, staging e produção;
- acesso à hospedagem canônica e ao DNS/CDN;
- acesso ao Resend e confirmação dos domínios de envio;
- inventário de secrets, owners e expiração;
- backup atual e evidência de restauração;
- Figma e componentes visuais aprovados;
- catálogo mestre e owner de cada conjunto de dados;
- política do RDO, assinatura e retenção aprovada pelos responsáveis adequados.

### 5.2 Decisões que bloqueiam o desenvolvimento estrutural

Devem ser registradas como ADR:

1. painel dentro do ERP, em `/admin` ou em subdomínio;
2. hosting canônico: Cloudflare Pages, Vercel ou outra plataforma;
3. modelo de API pública e administrativa;
4. separação de permissões CMS/RDO;
5. schema canônico e estratégia de publicação;
6. mídia e processamento de variantes;
7. prerender/SSR/edge para SEO e status HTTP;
8. sistema mestre de leads — ERP ou CMS;
9. migração ou manutenção especializada da detecção de gases;
10. política de imutabilidade e correção do RDO.

### 5.3 Ambientes

| Ambiente | Finalidade | Dados | Publicação |
|---|---|---|---|
| Local | Desenvolvimento individual | seed sintético | livre, sem integração real |
| CI | testes automatizados | efêmero | destruído após execução |
| Preview | revisão por branch/PR | seed ou staging isolado | automática e não indexável |
| Staging | integração e homologação | cópia sanitizada | controlada |
| Produção | operação real | dados reais | aprovação e trilha obrigatórias |

Nunca usar credenciais de produção no ambiente local. Nunca copiar leads, usuários, assinaturas, fotos ou relatórios reais para desenvolvimento sem base legal e anonimização.

### 5.4 Reprodutibilidade mínima

O projeto usa Node 22 conforme `.nvmrc`. A equipe deve tornar válidos e documentar comandos equivalentes a:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
npm run test:e2e
```

Hoje apenas `dev`, `build`, `build:full` e geração de imagens estão definidos. Os demais comandos devem ser implantados na fase de fundação.

Criar `.env.example` sem valores reais e validar no startup todas as variáveis obrigatórias. Configuração ausente deve falhar de forma clara; não usar silenciosamente projeto de produção como fallback.

---

## 6. Gate G0 — autorização para iniciar

O desenvolvimento pode começar quando:

- repositório oficial foi identificado;
- alterações existentes e branch base foram preservadas;
- owner técnico e Product Owner foram nomeados;
- staging e banco não produtivo estão disponíveis;
- ADRs bloqueadoras têm decisão ou prazo/owner;
- riscos críticos do RDO possuem plano de contenção;
- catálogo mestre e primeira onda de produtos foram definidos;
- critérios de aceite deste procedimento foram aceitos.

Se o repositório do ERP não estiver disponível, é permitido trabalhar apenas em tarefas independentes — CI, contratos, staging, correções públicas e desenho do backend — sem decidir definitivamente a localização do painel.

---

## 7. Procedimento padrão para qualquer alteração

Cada ajuste, correção ou funcionalidade deve seguir estas etapas.

### 7.1 Abrir item de trabalho

Registrar:

- problema/resultado desejado;
- usuário afetado;
- evidência atual;
- escopo e fora de escopo;
- `consumer_id` e rotas afetadas;
- modelo/API/banco afetados;
- risco e plano de rollback;
- critérios de aceite;
- testes obrigatórios;
- documentos que precisam ser atualizados.

### 7.2 Confirmar comportamento atual

Antes de editar:

1. reproduzir o comportamento em ambiente seguro;
2. registrar captura, request/response ou teste falhando;
3. localizar fonte canônica e consumidores;
4. verificar mudanças locais existentes;
5. identificar dados e integrações atingidos;
6. classificar risco P0, P1, P2 ou P3.

### 7.3 Desenhar a mudança

- atualizar contrato/schema primeiro;
- definir compatibilidade com versão anterior;
- definir migration e rollback;
- definir autorização positiva e negativa;
- definir estados de erro, vazio, loading e conflito;
- definir telemetria e alertas;
- criar ADR se houver decisão estrutural.

### 7.4 Implementar de dentro para fora

Ordem recomendada:

1. migration/constraint;
2. RLS/RBAC;
3. schema runtime e tipos gerados;
4. serviço/comando/API;
5. projeção pública/outbox/cache;
6. formulário/tela administrativa;
7. preview;
8. componente público;
9. observabilidade;
10. testes e documentação.

Para ajustes puramente visuais sem alteração de dados, começar por teste/reprodução, componente compartilhado e regressão responsiva.

### 7.5 Revisar

A revisão deve verificar:

- regra de negócio e critérios;
- segurança e vazamento de dados;
- transações, concorrência e idempotência;
- acessibilidade e responsividade;
- performance e cache;
- SEO e rotas;
- migrations/rollback;
- logs sem conteúdo sensível;
- testes negativos;
- documentação atualizada.

### 7.6 Homologar e liberar

- implantar em preview/staging;
- executar testes automáticos;
- executar roteiro manual do módulo;
- obter aceite do owner;
- registrar evidências;
- liberar por feature flag/canary;
- executar smoke tests;
- observar métricas;
- concluir ou acionar rollback.

---

## 8. Estrutura obrigatória de ticket

Usar este modelo:

```markdown
# [MÓDULO-ID] Resultado esperado

## Contexto e evidência

## Usuário e necessidade

## Escopo

## Fora de escopo

## Consumer IDs e rotas

## Contrato de dados/API

## Permissões

## Migration e compatibilidade

## Plano de implementação

## Critérios de aceite

## Testes positivos e negativos

## Telemetria/alertas

## Rollback

## Documentação afetada

## Evidências de homologação
```

Um ticket não pode entrar em desenvolvimento com critérios “funcionar corretamente”, “deixar responsivo” ou “criar painel” sem casos observáveis.

---

## 9. Fase 1 — contenção dos riscos atuais

Esta fase ocorre antes de conectar o CMS ao site inteiro.

### 9.1 RDO

Executar prioritariamente:

1. fechar criação automática de usuário por qualquer e-mail no `rdo-otp`;
2. permitir OTP apenas para usuário convidado, ativo e autorizado ao RDO;
3. separar papéis `rdo:*` de `cms:*`;
4. impedir update genérico de relatório finalizado/assinado;
5. impedir hard delete de relatório finalizado/assinado;
6. criar versionamento para correções;
7. migrar `rdo-fotos` para bucket privado;
8. alterar `rdo-notify` para receber `report_id` e reconstruir dados no servidor;
9. restringir CORS, aplicar rate limit e idempotência;
10. registrar evidências e hashes de assinatura;
11. substituir hard delete de usuário por suspensão/revogação;
12. revisar termos, retenção e validade do processo com jurídico/negócio.

#### Critério de saída RDO

- usuário não convidado não entra;
- membro não acessa relatório alheio;
- assinado não é editável nem excluível;
- correção cria nova versão;
- fotos/PDFs exigem autorização;
- token remoto expira e é consumido uma vez;
- notificação não aceita destinatário, link ou conteúdo arbitrário;
- testes de RLS e E2E comprovam as regras.

### 9.2 Site público

- corrigir links `#` sem função;
- corrigir cards com destino genérico indevido;
- corrigir overflow mobile identificado;
- aplicar Error Boundary e erros de rota;
- garantir `noindex` em RDO, futuro admin e preview;
- definir política de Service Worker e excluir áreas privadas;
- corrigir soft 404 e canonical das rotas prioritárias;
- escolher configuração canônica de hosting;
- remover/sanear registros de teste da base de conteúdo;
- registrar fonte da Edge Function `site-content`.

### 9.3 Formulário de contato

- limitar corpo e campos;
- validar dados no servidor;
- implementar honeypot/CAPTCHA adaptativo e rate limit;
- estruturar consentimento e origem;
- usar remetente de domínio aprovado;
- criar outbox/retentativa para ERP/e-mail;
- não expor detalhes internos na resposta pública.

---

## 10. Gate G1 — segurança e estabilidade mínimas

Não iniciar migração de conteúdo dinâmico em produção enquanto houver:

- cadastro aberto no RDO;
- relatório assinado alterável/excluível;
- bucket sensível público;
- função implantada sem fonte versionada;
- ausência de staging;
- dados de teste misturados à fonte candidata;
- hosting/cache sem proprietário;
- ausência total de teste de autorização.

O Gate G1 exige evidência dos testes e plano de rollback.

---

## 11. Fase 2 — fundação de engenharia

### 11.1 Repositório

- restaurar histórico Git oficial;
- proteger branch principal;
- exigir pull request e checks;
- renomear pacote `@figma/my-make-file` para nome do produto;
- definir versionamento e changelog;
- documentar Node 22, instalação e troubleshooting;
- adicionar `tsconfig` com estratégia de adoção estrita;
- configurar formatter e lint;
- remover configurações mortas somente após decidir hosting.

### 11.2 Testes e CI

- testes unitários e de contrato;
- Supabase local/efêmero para migrations e RLS;
- testes de componente;
- E2E com Playwright ou equivalente;
- acessibilidade automatizada;
- regressão visual dos blocos;
- build e análise de bundle;
- preview por pull request;
- smoke test pós-deploy.

### 11.3 Tratamento de erros

- Error Boundary global e por domínio;
- `errorElement` nas rotas;
- fallback para falha de chunk;
- correlation ID;
- página amigável com código de suporte;
- logs estruturados;
- alertas por versão/rota;
- última projeção publicada continua disponível.

### 11.4 Banco e tipos

- trazer todas as migrations para o repositório;
- criar seed sintético;
- gerar tipos do Supabase;
- validar JSON em runtime;
- adicionar constraints e índices;
- documentar RLS e grants;
- testar migration forward e rollback/compatibilidade.

---

## 12. Gate G2 — plataforma reproduzível

Liberar a construção do núcleo do CMS quando:

- `npm ci` e build funcionam em máquina limpa/CI;
- format, lint, typecheck e testes estão no pipeline;
- staging é implantável por processo documentado;
- migrations sobem em banco vazio;
- RLS possui testes negativos;
- erros são observáveis;
- rollback de aplicação e banco foi ensaiado;
- secrets e ambientes estão documentados.

---

## 13. Fase 3 — contratos e núcleo administrativo

### 13.1 Registro de capacidades

Criar um registro versionado contendo:

- `consumer_id`;
- domínio e owner;
- schema e versão;
- renderer público e de preview;
- rotas consumidoras;
- permissões de leitura/edição/publicação;
- regras de mídia, links e SEO;
- fixtures desktop/tablet/mobile;
- testes associados.

O pipeline deve rejeitar painel ou conteúdo publicado sem capacidade registrada.

### 13.2 Autenticação e RBAC

Implementar:

- convite fechado;
- MFA;
- perfis e status;
- papéis por aplicação e escopo;
- revogação imediata;
- sessões seguras;
- matriz de permissões;
- RLS default-deny;
- audit log append-only;
- revisão periódica de acessos.

### 13.3 Shell administrativo

Entregar:

- rota/build administrativo não indexável;
- login, logout, recuperação e MFA;
- navegação condicionada por permissão;
- dashboard operacional;
- busca global;
- breadcrumbs;
- tabelas com filtro, paginação e ações em massa seguras;
- estados de loading, vazio, erro e sem permissão;
- página de perfil/sessões;
- diagnóstico básico.

### 13.4 Revisões e publicação

- rascunho separado do publicado;
- revisão e aprovação;
- agendamento server-side;
- concorrência otimista;
- histórico e comparação;
- restauração como nova revisão;
- lixeira;
- outbox transacional;
- invalidação de cache por versão/tag;
- status visível da publicação.

### 13.5 Preview

- usa componentes públicos reais;
- token curto e auditável;
- resolução desktop/tablet/mobile;
- conteúdo não indexável;
- validação de links, imagens, relações e SEO;
- não compartilha cache com produção.

### 13.6 Mídia

- upload validado;
- hash/deduplicação;
- original protegido;
- variantes WebP/AVIF e tamanhos;
- ALT, legenda, crédito/licença;
- busca e categorias;
- mapa de usos;
- substituição versionada;
- exclusão bloqueada quando referenciada.

---

## 14. Gate G3 — núcleo pronto

O núcleo está pronto quando um conteúdo de demonstração consegue:

1. ser criado por usuário autorizado;
2. ser negado a usuário sem permissão;
3. passar por revisão;
4. aparecer no preview real;
5. ser publicado de forma transacional;
6. atualizar cache/projeção;
7. registrar auditoria;
8. ser restaurado;
9. continuar disponível após falha simulada do admin;
10. gerar métricas e alerta em falha.

---

## 15. Fase 4 — produto como módulo piloto

Produto deve ser o primeiro módulo comercial completo porque exercita catálogo, taxonomia, atributos, mídia, documentos, relações, busca, SEO e publicação.

### 15.1 Workshop de dados

Fechar:

- segmento, categoria, subcategoria e família;
- distinção entre produto, modelo e variante;
- SKU/código e slug;
- atributos por categoria, tipo e unidade;
- indústrias/setores e aplicações prioritárias;
- documentos e certificações;
- regras de descontinuado;
- primeira onda de publicação;
- owner de cada campo.

### 15.2 Reconciliar fontes atuais

Comparar:

- `src/app/data/products.ts`;
- produtos embutidos em `ProdutosPage.tsx`;
- catálogo de detecção de gases;
- dados da API/banco legado;
- `Portfolio Mestre - Gaiatec Sistemas.xlsx`;
- documentos técnicos aprovados.

Gerar relatório de reconciliação com:

- identidade canônica;
- duplicatas;
- conflitos;
- campos ausentes;
- evidência/origem;
- decisão e aprovador;
- item migrado, descartado ou pendente.

Nenhuma importação deve “escolher o valor mais recente” sem owner quando houver conflito técnico.

### 15.3 Banco e contrato do produto

Implementar:

- produtos, modelos/variantes;
- hierarquia de catálogo;
- atributos e valores tipados;
- mídia e documentos;
- palavras-chave/sinônimos;
- relações com aplicação, setor, serviço e produto;
- SEO e redirects;
- revisions/status;
- constraints para SKU/slug;
- projeção pública versionada.

### 15.4 Editor administrativo

Abas recomendadas:

1. identificação;
2. classificação;
3. conteúdo comercial;
4. especificações técnicas;
5. imagens;
6. documentos;
7. aplicações e setores;
8. produtos relacionados;
9. busca e sinônimos;
10. SEO;
11. publicação e histórico.

Campos técnicos aparecem conforme categoria. Não criar um formulário universal gigante.

### 15.5 Consumidores públicos

Migrar conjuntamente:

- `/produtos`;
- `/produtos/:slug`;
- comparador;
- cards/destaques da homepage;
- busca global;
- mega menu quando usa catálogo;
- páginas de aplicação/setor que relacionam produto;
- sitemap, breadcrumb e schema.org.

### 15.6 Teste vertical do produto

Executar:

```text
criar
 -> classificar
 -> preencher atributos
 -> carregar mídia/documento
 -> relacionar
 -> preencher SEO
 -> preview mobile/desktop
 -> revisão
 -> publicar
 -> validar lista/detalhe/comparador/busca/relações/sitemap
 -> editar nova revisão
 -> restaurar
```

Testar também:

- SKU e slug duplicados;
- categoria incompatível com atributo;
- mídia ausente;
- documento privado;
- relação com item não publicado;
- usuário sem permissão;
- concorrência de edição;
- falha de cache/outbox;
- produto descontinuado e redirect.

---

## 16. Gate G4 — prova da arquitetura

Não expandir para todos os módulos enquanto o produto piloto não atender:

- fonte canônica única;
- zero dependência do array hardcoded para o piloto;
- painel, API e site usando o mesmo contrato;
- preview fiel;
- rollback funcional;
- RLS/RBAC testados;
- busca e SEO coerentes;
- observabilidade ativa;
- performance e responsividade aprovadas;
- owner do portfólio homologou os dados.

---

## 17. Fase 5 — catálogo, descoberta e relações

Após G4:

### 17.1 Serviços

- reconciliar `servicesList.ts`, `services.ts` e banco legado;
- definir categorias oficiais;
- migrar lista/detalhe/destaques;
- relacionar produtos, setores e aplicações;
- preservar slugs ou criar redirects;
- remover fallback após observação.

### 17.2 Setores/indústrias

- aprovar glossário e nome canônico;
- separar indústria, infraestrutura, aplicação e tema quando misturados;
- migrar conteúdo, estatísticas, desafios, soluções e relações;
- validar evidências de claims;
- preservar URLs relevantes.

### 17.3 Aplicações

- estruturar pontos da aplicação;
- registrar contexto Produto × Aplicação;
- gerar filtros a partir de relações canônicas;
- eliminar listas manuais divergentes;
- garantir próximo passo útil em cada página.

### 17.4 Detecção de gases

Executar uma decisão explícita:

- migrar para catálogo mestre com atributos suficientes; ou
- manter módulo especializado, mas integrado à busca, relações, mídia, SEO e governança.

Não achatar dados especializados em campos genéricos com perda de faixa, gás, sensor, certificação ou categoria.

### 17.5 Busca

- um único índice da projeção publicada;
- normalização de acentos, hífens, unidades e modelos;
- sinônimos administráveis com governança;
- pesos documentados;
- autocomplete e página de resultados;
- analytics de consultas e zero resultado;
- conteúdo privado/rascunho excluído;
- teste das consultas definidas na arquitetura de descoberta.

---

## 18. Fase 6 — homepage, páginas, menus e aparência

### 18.1 Registro de blocos

Para cada bloco:

- schema versionado;
- defaults;
- renderer público e preview;
- páginas permitidas;
- limites de quantidade/layout;
- regras de mídia/link;
- fixture responsiva;
- migration de schema;
- teste visual e acessível.

`linked_list` não pode aparecer no painel enquanto não tiver renderer. Tipo desconhecido deve impedir publicação, não retornar vazio silenciosamente.

### 18.2 Homepage

Migrar em ondas:

1. hero;
2. caminhos de descoberta;
3. destaques de produtos;
4. setores/aplicações;
5. serviços;
6. diferenciais/stats;
7. conteúdo/blog;
8. CTA/contato.

Cada onda recebe feature flag e validação mobile antes de remover o fallback.

### 18.3 Menus

- árvore tipada com profundidade máxima;
- validação de rota externa/interna;
- impedir ciclo e `#` inválido;
- mesma origem para header, mega menu, mobile e footer, com projeções específicas;
- drag-and-drop acessível;
- preview de desktop/mobile;
- crawl automático após publicar.

### 18.4 Contato e configurações globais

- uma única configuração para telefone, WhatsApp, e-mail, endereço e redes;
- valores e links derivados consistentemente;
- validação de formato;
- atualização confirmada em header, footer, contato e CTAs;
- dados jurídicos e institucionais com permissão própria.

### 18.5 Aparência

- somente tokens/presets aprovados;
- contraste validado;
- opções fechadas de grade, densidade e tipografia;
- preview responsivo;
- regressão visual;
- sem CSS/JS arbitrário no painel.

---

## 19. Fase 7 — blog, campanhas, SEO e leads

### 19.1 Blog

- criar `/blog/:slug`;
- autor, categoria, tags, imagem, resumo, conteúdo, relações e SEO;
- editor estruturado/sanitizado;
- rascunho, revisão, agendamento e publicação;
- schema Article, sitemap e feeds quando aplicável;
- conteúdo relacionado e CTA contextual.

### 19.2 Campanhas e landing pages

- templates/blocos aprovados;
- duplicação sem copiar IDs/relações indevidas;
- período e status;
- formulário versionado;
- tracking governado por consentimento;
- preview e URL;
- expiração/despublicação e redirect planejado.

### 19.3 SEO

- meta title/description;
- canonical derivado e override restrito;
- OG;
- index/noindex;
- schema por entidade;
- sitemap da projeção publicada;
- redirects com validação de loop/cadeia;
- 404 HTTP real;
- metadados no HTML inicial por prerender/SSR/edge conforme ADR.

### 19.4 Leads e ERP

- definir sistema mestre;
- formulários e consentimentos versionados;
- origem, campanha, produto e UTMs estruturados;
- outbox idempotente;
- status e owner sincronizados por contrato;
- retentativa e diagnóstico;
- exportação restrita e auditada;
- retenção/LGPD;
- teste completo site → persistência → ERP → notificação.

### 19.5 Fase 8 — hardening, treinamento e go-live

Depois de concluir os módulos contratados:

1. congelar mudanças estruturais durante a homologação final;
2. executar regressão funcional, visual, responsiva e de acessibilidade;
3. executar revisão de segurança, RLS, secrets, uploads e dependências;
4. ensaiar restore, rollback, expurgo de cache e resposta a incidente;
5. reconciliar novamente contagens, slugs, relações, mídia e redirects;
6. treinar cada perfil com tarefas reais e ambiente de treinamento;
7. produzir guia rápido do usuário e canal de suporte;
8. executar canary interno e depois público;
9. monitorar intensivamente erros, latência, leads, busca e publicação;
10. remover ou datar a remoção dos caminhos legados restantes.

### 19.6 Gate G5 — autorização de produção

O go-live exige:

- aceite formal dos owners de conteúdo, negócio, tecnologia, segurança e operação;
- zero P0 aberto e P1 com risco/owner/prazo formalmente aceitos;
- testes e evidências arquivados;
- dados reconciliados;
- backup e rollback comprovados;
- alertas e responsáveis ativos;
- comunicação e suporte preparados;
- janela e critérios de abortar definidos;
- versão anterior disponível para restauração.

---

## 20. Procedimento de migration e feature flag

Para cada domínio:

### Etapa A — observar

- manter frontend legado;
- gerar projeção nova em paralelo;
- comparar contagens, IDs, slugs e hashes;
- corrigir divergências.

### Etapa B — shadow read

- frontend continua usando legado;
- sistema consulta novo backend de forma não bloqueante;
- registra diferenças sem expor dados sensíveis;
- não altera experiência do usuário.

### Etapa C — canary

- habilitar nova fonte para equipe/staging ou percentual controlado;
- medir erros, latência, conteúdo ausente e SEO;
- rollback instantâneo por flag.

### Etapa D — fonte principal

- nova projeção passa a responder pelo domínio;
- fallback legado permanece temporariamente somente como rollback explícito;
- edições hardcoded ficam congeladas.

### Etapa E — remoção

- período de observação concluído;
- conteúdo e métricas reconciliados;
- fallback e adaptadores antigos removidos;
- testes impedem reintrodução;
- documentação atualizada.

Não manter fallback oculto indefinidamente, pois ele recria duas fontes de verdade.

---

## 21. Procedimento de banco e migrations

1. escrever migration pequena, reversível ou compatível;
2. adicionar constraints inicialmente sem bloquear dados legados quando necessário;
3. executar backfill idempotente;
4. validar contagens, nulos, duplicatas e relações;
5. habilitar leitura/escrita nova por código compatível;
6. observar;
7. tornar constraint obrigatória;
8. remover coluna/caminho antigo somente em release posterior.

Usar expand/migrate/contract para mudanças destrutivas. Nunca:

- editar migration já aplicada;
- executar SQL manual de produção sem registrar equivalente;
- usar service role no frontend;
- desabilitar RLS para “resolver” autorização;
- apagar dados antes de backup e validação;
- depender de transação impossível entre provedores sem outbox/idempotência.

Cada migration deve possuir:

- objetivo;
- impacto e lock esperado;
- compatibilidade com versão anterior;
- script de validação;
- plano de rollback/roll-forward;
- estimativa de volume/tempo;
- responsável e evidência de staging.

---

## 22. Procedimento de API e autorização

### 22.1 Separar leitura e comandos

- API pública: somente projeção publicada, cacheável, sem dados internos;
- API administrativa: autenticada, sem cache público;
- comandos específicos: `publish`, `approve`, `restore`, `archive`; não update genérico de status;
- funções internas: service role mínima, validação de origem e payload.

### 22.2 Todo endpoint deve definir

- método e rota;
- schema de entrada/saída;
- autenticação e permissão;
- recurso/tenant/owner validado;
- idempotência;
- limites e rate limit;
- erros estáveis;
- transação;
- auditoria;
- métricas;
- cache;
- testes de contrato e autorização negativa.

### 22.3 Regra de falha

Nunca aceitar do cliente dados que o servidor pode derivar com segurança. Exemplos:

- destinatários de notificação;
- papel do usuário;
- status final;
- preço/classificação calculada;
- URL oficial de assinatura;
- conteúdo canônico de PDF;
- owner de um registro.

---

## 23. Procedimento de frontend administrativo

Para cada formulário:

1. carregar schema e permissão;
2. apresentar somente campos ativos para o contrato;
3. validar no cliente para usabilidade e no servidor para segurança;
4. preservar rascunho e alertar navegação com mudanças;
5. tratar conflito de edição;
6. exibir erros por campo e resumo;
7. não perder dados em erro de rede;
8. oferecer preview real;
9. registrar intenção de ação crítica;
10. confirmar sucesso apenas após resposta canônica.

Padrões:

- labels e instruções claras;
- teclado e leitores de tela;
- foco após erro/modal;
- tabelas adaptadas para telas menores;
- paginação server-side para grandes volumes;
- busca com debounce e cancelamento;
- drag-and-drop com alternativa por teclado/botões;
- mensagens sem detalhes técnicos sensíveis;
- ação destrutiva separada;
- histórico e status sempre visíveis.

---

## 24. Procedimento de teste e homologação

### 24.1 Matriz obrigatória

| Dimensão | Teste |
|---|---|
| Regra | caso válido, inválido, limite e transição proibida. |
| Autorização | cada papel permitido e negado. |
| Dados | constraints, relações, concorrência e rollback. |
| API | contrato, erro, rate limit e idempotência. |
| Painel | loading, vazio, erro, sucesso, conflito e permissão. |
| Site | lista, detalhe, relações, busca e CTA. |
| Preview | fidelidade e segurança do token. |
| Publicação | revisão, agendamento, cache, outbox e restauração. |
| SEO | title, canonical, robots, schema, sitemap e HTTP status. |
| Responsividade | 375 px, tablet, notebook e desktop. |
| Acessibilidade | teclado, foco, nomes acessíveis, contraste e zoom. |
| Performance | JS, imagens, LCP, CLS, API e cache. |
| Observabilidade | erro gera evento/alerta e não vaza dados. |

### 24.2 Evidências de homologação

Salvar por release:

- versão/commit;
- ambiente;
- dataset/seed;
- resultados automáticos;
- roteiro manual assinado/aprovado;
- capturas relevantes;
- migrations aplicadas;
- métricas antes/depois;
- riscos aceitos;
- rollback testado;
- aprovadores.

### 24.3 Bloqueadores

Release não pode avançar com:

- teste crítico falhando;
- vulnerabilidade crítica/alta sem decisão formal;
- migration não testada;
- ausência de backup/rollback;
- campo sem consumidor;
- tipo de bloco sem renderer;
- link interno inválido;
- rota privada indexável;
- conteúdo técnico sem aprovação do owner;
- divergência de dados sem decisão.

---

## 25. Procedimento de release

### 25.1 Antes

- congelar escopo;
- confirmar checks e aprovações;
- revisar migrations e feature flags;
- confirmar backup e saúde atual;
- definir janela, responsáveis e canal de comunicação;
- preparar consultas de validação e rollback;
- registrar versão do frontend/API/schema.

### 25.2 Durante

1. aplicar mudanças compatíveis de banco;
2. implantar backend/workers;
3. executar smoke de API;
4. implantar painel/site;
5. executar smoke de rotas/assets;
6. habilitar feature flag gradualmente;
7. validar conteúdo, SEO, lead e autenticação;
8. observar erros/latência/cache;
9. registrar horários e resultados.

### 25.3 Depois

- confirmar SLOs e filas;
- comparar métricas;
- monitorar pelo período definido;
- comunicar resultado;
- registrar incidente/anomalia;
- encerrar release somente após critérios;
- planejar remoção de compatibilidade antiga.

### 25.4 Rollback

Acionar quando houver:

- perda/corrupção de dados;
- autorização indevida;
- indisponibilidade relevante;
- conteúdo crítico incorreto;
- erro acima do limite;
- falha de assets/cache sem mitigação rápida;
- impacto de SEO severo.

Rollback pode ser:

- desligar feature flag;
- restaurar projeção publicada anterior;
- reverter aplicação para artefato imutável anterior;
- roll-forward de banco quando downgrade não for seguro;
- restaurar backup somente com decisão e preservação das escritas posteriores.

---

## 26. Documentação durante o desenvolvimento

Toda pull request deve avaliar e atualizar, quando aplicável:

- README e instalação;
- `.env.example`;
- ADR;
- OpenAPI/schemas;
- dicionário de dados;
- matriz RLS/RBAC;
- registro `consumer_id`;
- matriz painel → consumidor;
- runbook;
- estratégia/fixture de teste;
- changelog;
- guia do usuário administrativo.

Documentação gerada de tipos/contratos deve ser automatizada quando possível. Capturas de tela não substituem regras, contratos ou critérios.

### 26.1 Controle de mudança documental

Cada documento deve possuir:

- versão/data;
- owner;
- status: rascunho, aprovado ou obsoleto;
- documentos substituídos;
- decisão relacionada;
- data de próxima revisão.

Ao mudar uma regra do RDO, permissão, status editorial ou contrato público, atualizar documentação na mesma mudança de código.

---

## 27. Backlog mestre recomendado

### Onda 0 — desbloqueio

- DEV-000: identificar repositórios e owners;
- DEV-001: ADR do painel/ERP;
- DEV-002: ADR de hosting;
- DEV-003: staging e secrets;
- DEV-004: trazer Edge Functions/migrations ausentes;
- DEV-005: inventário e backup.

### Onda 1 — riscos P0

- SEC-001: fechar OTP aberto do RDO;
- SEC-002: imutabilidade/versionamento de RDO;
- SEC-003: fotos privadas;
- SEC-004: reconstruir `rdo-notify` server-side;
- SEC-005: papéis separados CMS/RDO;
- WEB-001: Error Boundary e erros de rota;
- WEB-002: noindex privado;
- WEB-003: links `#`, overflow e destinos;
- WEB-004: hosting/cache/Service Worker;
- LEAD-001: proteção do contato.

### Onda 2 — fundação

- ENG-001: pacote/README/Node/env;
- ENG-002: TypeScript/lint/format;
- ENG-003: testes/CI/preview;
- ENG-004: Supabase local/migrations/tipos;
- ENG-005: logs, métricas e alertas;
- ENG-006: deploy/rollback/backup runbooks.

### Onda 3 — núcleo CMS

- CMS-001: registro de capacidades/blocos;
- CMS-002: Auth/MFA/RBAC/RLS;
- CMS-003: shell e dashboard;
- CMS-004: revisions/workflow/lixeira;
- CMS-005: publicação/outbox/cache;
- CMS-006: preview;
- CMS-007: mídia;
- CMS-008: auditoria/diagnóstico.

### Onda 4 — produto piloto

- CAT-001: workshop/taxonomia;
- CAT-002: reconciliação;
- CAT-003: schema/migration;
- CAT-004: importador com validação;
- CAT-005: editor de produto;
- CAT-006: lista/detalhe/comparador;
- CAT-007: busca/SEO/relações;
- CAT-008: homologação/feature flag/remoção de fallback.

### Onda 5 — expansão

- CNT-001: serviços;
- CNT-002: setores/indústrias;
- CNT-003: aplicações/pontos;
- CAT-009: detecção de gases;
- SEARCH-001: busca unificada;
- HOME-001: homepage por blocos;
- NAV-001: menus;
- SITE-001: contato/configurações/aparência.

### Onda 6 — conteúdo e conversão

- BLOG-001: blog completo;
- MKT-001: campanhas/landing pages;
- SEO-001: metadados/sitemap/redirects/404;
- LEAD-002: formulários/leads/ERP;
- OPS-001: diagnóstico avançado;
- LAUNCH-001: hardening, treinamento e go-live.

Cada ID deve ser decomposto em tickets verticais pequenos; a lista não substitui refinamento.

---

## 28. Indicadores de acompanhamento

### Engenharia

- percentual de checks verdes;
- cobertura de contratos e RLS;
- falhas escapadas por release;
- tempo de rollback;
- módulos ainda com fonte duplicada;
- campos administrativos sem teste/consumer — meta zero.

### Conteúdo

- produtos reconciliados/aprovados;
- itens sem imagem/ALT/SEO/documento;
- links/relações órfãos;
- revisões pendentes e tempo de aprovação;
- publicações/rollbacks.

### Experiência e negócio

- buscas com e sem resultado;
- caminho até produto/solução;
- conversão por CTA/formulário;
- leads entregues ao ERP;
- páginas com erro;
- Core Web Vitals e acessibilidade.

### Segurança e operação

- contas sem MFA quando obrigatório;
- acessos revogados pendentes;
- falhas de autorização;
- filas/outbox atrasadas;
- backups/restores testados;
- assinaturas RDO pendentes/expiradas;
- incidentes e tempo de resposta.

---

## 29. Checklist de aprovação do painel

### Segurança

- [ ] Cadastro fechado e MFA configurado.
- [ ] RBAC por escopo e RLS testados.
- [ ] CMS e RDO não compartilham papel administrativo genérico.
- [ ] Sessão, revogação, rate limit e uploads protegidos.
- [ ] Audit log não pode ser alterado por usuário comum/admin editorial.

### Funcionalidade

- [ ] Cada campo possui consumidor e teste.
- [ ] Preview usa os componentes públicos reais.
- [ ] Publicação é transacional e restaurável.
- [ ] Agendamentos são server-side e idempotentes.
- [ ] Lixeira e histórico funcionam.
- [ ] Ações em massa validam item por item e apresentam resultado parcial seguro.

### Conteúdo

- [ ] Fonte canônica definida por domínio.
- [ ] Produtos, serviços, setores e aplicações reconciliados.
- [ ] Relações não apontam para itens ausentes/não publicados.
- [ ] Mídia possui ALT, variantes e mapa de usos.
- [ ] Dados técnicos possuem owner e evidência.

### Site

- [ ] Rotas públicas, busca, menus e CTAs usam a projeção correta.
- [ ] Nenhum link editorial `#` inválido.
- [ ] Sem overflow em smartphone.
- [ ] Error Boundary e 404 real.
- [ ] Última versão válida permanece disponível em falha do CMS.

### SEO e performance

- [ ] Canonical, robots, OG, schema e sitemap corretos.
- [ ] Admin, preview e RDO não indexáveis.
- [ ] Redirects sem ciclo/cadeia indevida.
- [ ] Budgets de JS, imagem, LCP e CLS atendidos.

### Operação

- [ ] CI/CD, staging, métricas e alertas ativos.
- [ ] Backup, restore e rollback testados.
- [ ] Runbooks e owners definidos.
- [ ] Treinamento realizado por perfil.
- [ ] Evidências de homologação arquivadas.

---

## 30. Definition of Done final

O painel administrativo GAIATEC somente pode ser considerado entregue quando:

1. os módulos do escopo possuem fonte canônica e não dependem de edição de código para rotinas autorizadas;
2. cada controle administrativo altera todos os consumidores previstos e foi testado;
3. permissões são validadas no frontend, API e banco;
4. preview, revisão, publicação, agendamento, histórico, lixeira e restauração funcionam;
5. site, busca, SEO, sitemap, relações e cache permanecem coerentes;
6. falha do painel/API não remove a última publicação válida;
7. RDO atende acesso fechado, imutabilidade, privacidade e evidência;
8. leads chegam ao sistema mestre com consentimento, idempotência e diagnóstico;
9. testes automáticos e homologação cobrem desktop, tablet, mobile, acessibilidade, segurança e performance;
10. CI/CD, observabilidade, backup e rollback foram comprovados;
11. documentação e treinamento permitem operar sem depender de conhecimento informal;
12. fallbacks e fontes duplicadas obsoletas foram removidos ou possuem plano datado de remoção.

---

## 31. Próxima ação concreta

Realizar um workshop de início com Product Owner, Portfólio, Comercial, Marketing, Engenharia, Tech Lead, Segurança e Operação para produzir estas saídas:

1. responsáveis e RACI confirmados;
2. repositórios, ambientes e acessos inventariados;
3. decisão provisória ou definitiva sobre painel/ERP e hosting;
4. primeira onda de produtos e taxonomia aprovadas;
5. plano imediato para os riscos P0 do RDO;
6. backlog das Ondas 0 e 1 priorizado;
7. datas e evidências exigidas para Gates G0 e G1.

Após o workshop, executar Ondas 0 e 1. Não iniciar a construção em massa de formulários do CMS antes de concluir a fundação e comprovar a arquitetura com o produto piloto.
