# Arquitetura e matriz de integração — Fase 7

## Fonte e consumidores

| Domínio                   | Fonte administrativa                                | Persistência/publicação                                    | Consumidores                                                            |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| artigo                    | editor de conteúdo, contrato `CmsPostContentSchema` | drafts/revisions, taxonomias F7 e projeção publicada       | `/blog`, `/blog/:slug`, preview, Worker, sitemap e busca                |
| campanha                  | editor de campanhas e `CmsCampaignContentSchema`    | drafts/revisions, projeção, route rules e job de expiração | landing pública, posicionamentos contextuais, preview, Worker e sitemap |
| formulário                | administração de formulários                        | definição + versões imutáveis; uma versão ativa            | blocos de página, campanhas e `lead-capture`                            |
| lead                      | formulário público versionado                       | lead, consentimento, histórico, outbox e export log        | administração de leads e worker de notificação                          |
| menu/contato/configuração | administração global F6                             | documento versionado `navigation`/`site_settings`          | Header, menu mobile, Footer, contato e CTA global                       |

## Regras de conexão

- Um artigo só publica com `consumerId` do blog, autor/categoria/tags ativos, canonical `/blog/:slug` e relações tipadas.
- Uma campanha só publica com template aprovado, janela válida, tracking marcado como condicionado a consentimento e relações/posicionamentos existentes.
- Campanha com formulário fixa `formId` e `versionId`; a projeção rejeita versão que não seja a ativa e publicada.
- O formulário público envia os mesmos IDs; a API e o banco revalidam a versão e os campos. Campos ocultos ou desconhecidos são rejeitados.
- Origem, UTM, produto e campanha são server-side validados e persistidos antes da criação do evento de notificação.
- O worker expira campanhas, publica agendamentos, aplica retenção e processa outboxes. E-mail contém apenas referência interna e link autenticado, sem PII.
- O Worker Cloudflare injeta SEO e `Article` schema no HTML inicial, responde redirects/404/410 reais e expõe sitemap unificado.

## Clean-room

`0027_fase7_marketing_blog_leads.sql` não contém inserts editoriais. A interface inicia vazia ou com rascunhos sintéticos descartáveis e não consulta tabelas do painel administrativo antigo. O recadastro real dependerá de conteúdo novo, autorizado e inserido pelo proprietário após a homologação.
