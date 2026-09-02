# Auditoria funcional, técnica e visual do CMS — 2026-09-01

## Resultado executivo

Auditoria concluída no código local e no staging `https://gaiatec-cms-staging.pages.dev`, seguindo o ciclo **analisar → testar → identificar → corrigir → retestar → validar**.

As correções foram implantadas no staging por um worktree isolado, sem incluir as alterações preexistentes do usuário no editor de produto. Também foram implantadas as Edge Functions `cms-session` v10 e `cms-media` v11 e aplicada a migração `0036_cms_restore_specific_approval_permissions.sql`.

Resultado final: **APROVADO NO STAGING COM RESSALVAS EXTERNAS**. O CMS, APIs, persistência, projeções públicas, workflows, mídia, usuários, permissões e responsividade foram exercitados com dados descartáveis. Não houve toque em produção.

As ressalvas não representam erro funcional interno:

- entrega real de e-mail não foi executada porque o ambiente informa ausência de `RESEND_API_KEY`/destinatário de notificação;
- aprovação DPO e autorização de go-live continuam sendo decisões do responsável;
- CSP continua em `Report-Only` por decisão de implantação;
- chunks conhecidos de Excel/PDF continuam acima de 600 kB;
- 46 avisos de lint preexistentes permanecem, com 0 erros.

## Inventário

- 6 menus principais e 21 superfícies no menu.
- 26 padrões de rota administrativa, incluindo autenticação, editores dinâmicos, preview e 404.
- Aproximadamente 265 controles administrativos: 181 `input`, 51 `select` e 33 `textarea`.
- 156 botões, 15 formulários, 10 tabelas e 10 áreas expansíveis no código administrativo.
- 18 Edge Functions e 36 migrações Supabase; a migração 0036 está aplicada no staging.
- No início: 70 conteúdos no painel, 2 mídias e 393 alertas abertos.
- No encerramento visual: 2 mídias reais preservadas, 413 alertas abertos com somente os 50 mais recentes exibidos, 6 listas mestras ativas e 18 opções ativas.

## Fases auditadas

1. Painel, autenticação e shell.
2. Estrutura e identidade: navegação, dados globais, posicionamentos e mídia.
3. Catálogo: produtos, importação, busca e listas mestras.
4. Conteúdo: páginas, posts, serviços, indústrias, aplicações e soluções.
5. Marketing e relacionamento: campanhas, formulários e leads.
6. Administração: usuários, perfil, sessão e diagnósticos.

## Resultado por fase

### Fase 01 — Painel, autenticação e shell

- Login inválido, rota privada, dashboard, seis grupos, 21 links, busca, 404, refresh e breakpoints foram avaliados.
- Corrigido P1: HTTP 429/5xx/rede deixaram de ser classificados como ausência de permissão. Sessões já autorizadas são preservadas durante indisponibilidade transitória; 401/403 continuam fail-closed.
- `cms-session` passou a usar limite de 300 resoluções autenticadas/15 min, mantendo limites menores para MFA e recuperação.
- Reteste real: dashboard, mídia, usuários e diagnósticos permaneceram autenticados; recarga do dashboard preservou conta, H1 e ausência de alertas/console.
- A Fase 1, antes omitida do comando global, agora integra `npm run check`.
- Status: ✅ APROVADO.

### Fase 02 — Estrutura e identidade

- Navegação, dados globais e posicionamentos foram inspecionados e tiveram contratos temporais e de URL verificados.
- Corrigido P1: biblioteca de mídia deixou de ser somente lista/busca e recebeu upload, preview, usos, substituição, exclusão protegida e paginação.
- Upload real pela interface: original WebP + seis variantes WebP/AVIF; resultado `ready`, `clean`, 2400×1792, ALT, origem, proprietário e licença persistidos.
- “Consultar usos” retornou `0 usos`; a confirmação de exclusão informou que a API só excluiria sem vínculos. A mídia QA foi removida por alvo exato, mantendo as duas mídias reais.
- Banco e storage após limpeza: 0 asset QA e 0 objetos QA.
- Status: ✅ APROVADO.

### Fase 03 — Catálogo

- Busca por produto passou a considerar título; busca/sinônimos e listas receberam limites, estados, mensagens e confirmações coerentes.
- Corrigido P1 descoberto no staging: `0032` havia sobrescrito aprovações específicas e exigia `cms:products.publish` de revisores. A migração 0036 restaurou todas as permissões `*.approve` segregadas.
- Corrigido bloqueio operacional: o staging tinha zero listas mestras, tornando impossível criar produto conforme o contrato atual. Foram criadas pelo workflow governado com MFA 6 listas e 18 opções oficiais clean-room.
- Round-trip remoto de produto/mídia: 47 verificações aprovadas, incluindo RBAC, MFA AAL2, negação sem permissão, lista/opção controlada, sete uploads privados, create/save/submit/approve/publish, conflito 409, preview no-store, filtros/facetas, busca, comparação, redirect, sitemap, negação sem homologação, nova revisão, restauração e ausência de órfãos.
- Cadastro em massa: lote inválido e dry-run criaram 0 itens; lote válido criou exatamente 2 rascunhos e repetição idempotente devolveu os mesmos IDs.
- Status: ✅ APROVADO.

### Fase 04 — Conteúdo do site

- Conferidos conteúdos e projeções de página/homepage, post, serviço, indústria, aplicação e solução.
- Corrigidos retry inoperante de posts e `<main>` aninhado nos consumidores de descoberta.
- Round-trip remoto confirmou artigo agendado, publicado, schema `Article`, restauração e retirada pública com HTTP 404.
- Preview privado, publicação, versionamento e restauração também passaram no fluxo vertical de produto.
- Status: ✅ APROVADO.

### Fase 05 — Marketing e relacionamento

- Corrigidos período aberto de campanha, defaults/limites de formulários, `name`/`autocomplete` público e confirmações LGPD para exportar/anonymizar.
- Round-trip remoto aprovado: formulário versionado, negação de publicação AAL1, publicação AAL2, campanha no frontend, captura de lead, supressão de duplicata, negação RBAC, atribuição, exportação com MFA, anonimização, dois eventos de outbox e expirações 301/302/404/410.
- Retirada eliminou todas as projeções públicas dos fixtures.
- Entrega real de e-mail não foi executada por ausência de configuração externa; nenhuma mensagem de teste foi enviada a terceiros.
- Status: ✅ APROVADO para CMS/API/banco; ⚠️ entrega externa pendente de configuração.

### Fase 06 — Administração

- Corrigido P1: Usuários e acessos passou de somente leitura para convite, reenvio, papéis, suspensão, reativação e revogação de sessões, com idempotência e autoalteração bloqueada.
- 17 verificações remotas aprovadas: lista, validação de convite sem envio, mudança de papel, repetição idempotente, autoalteração 403, suspensão, reativação, revogação e sessão revogada 401, além do seed governado das listas.
- Interface real exibiu 53 identidades e controles de convite, papéis e ações; não foram alterados usuários reais.
- Diagnósticos passou a mostrar contagem exata: 413 alertas abertos e texto “50 mais recentes”, em vez de confundir o limite da lista com o total.
- Status: ✅ APROVADO.

## Problemas encontrados e tratados

| Severidade | Quantidade | Situação                                                                                                                                                                       |
| ---------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0         |          0 | Nenhum identificado                                                                                                                                                            |
| P1         |          6 | Mídia incompleta, usuários somente leitura, ações LGPD, sessão 429, autorização de aprovação regredida e staging sem listas operacionais — tratados                            |
| P2         |          8 | Busca por título, sinônimos, campos de listas, retry de posts, total de diagnósticos, defaults/limites de formulários, `<main>` aninhado e Fase 1 fora da regressão — tratados |
| P3         |          2 | Data aberta de campanha e metadados/autocomplete público — tratados                                                                                                            |

Total: 16 ocorrências corrigidas; 0 defeitos funcionais internos conhecidos pendentes no escopo auditado.

## Implantação e incidente controlado

- Frontend implantado no projeto Cloudflare Pages `gaiatec-cms-staging`, branch `Remodelagem`.
- Deployment validado: `https://868f4382.gaiatec-cms-staging.pages.dev` e domínio estável `https://gaiatec-cms-staging.pages.dev`.
- `cms-session` ACTIVE v10; `cms-media` ACTIVE v11.
- Migração remota 0036 confirmada.
- O primeiro build isolado foi gerado sem `.env.local`, deixando conteúdo público gerenciado temporariamente indisponível. A causa foi identificada imediatamente, o build foi substituído com as variáveis corretas e contato, serviço canário, site shell, produtos e posts voltaram a responder corretamente. Nenhum dado foi perdido ou alterado pelo incidente.

## Regressão, segurança e responsividade

- `npm run check`: aprovado após incorporar a Fase 1.
- 75 testes Vitest + 74 testes Node = **149 testes automatizados aprovados**.
- TypeScript: aprovado.
- Lint: 0 erros, 46 avisos preexistentes.
- Build Vite/Cloudflare: aprovado.
- Mais 47 verificações remotas de produto/mídia, 17 de usuários/listas e 10 grupos de evidência do round-trip F7/F8.
- Pelo menos 223 verificações automatizadas/remotas formalmente contabilizadas, além dos 48 cenários da matriz funcional/visual.
- Responsividade de Mídia e Usuários: 390×844, 768×1024 e 1366×768 aprovadas; tabela de usuários permanece dentro de contêiner com rolagem horizontal no mobile.
- Console das telas autenticadas retestadas: sem erros nem avisos.
- Endpoints privados sem token: HTTP 401.
- Admin: `no-store`, `noindex`, `DENY`, `nosniff`, `no-referrer`, HSTS, COOP e CSP Report-Only.

## Dados de QA e limpeza

- Fixtures F4: 0 usuários, perfis, listas, produtos, mídias e objetos de storage após o teste.
- Dois round-trips F7/F8: removidos 8 usuários, 16 conteúdos, 2 formulários, 2 leads e todos os registros filhos; 0 projeções públicas remanescentes.
- Upload visual: asset e sete objetos removidos; as duas mídias reais foram preservadas.
- Teste de usuários: identidade-alvo removida. Uma identidade técnica de seed foi mantida apenas em `auth.users`, sem perfil, sem papel, com senha rotacionada e bloqueio permanente, porque as 6 listas e 18 opções oficiais possuem autoria obrigatória por chave estrangeira. Excluí-la exigiria apagar ou falsificar a autoria dos registros operacionais.
- Nenhum registro real foi excluído.

## Pendências externas e recomendação de promoção

1. Configurar/validar o provedor de e-mail e destinatário de notificações antes do go-live.
2. Obter aceite do DPO/responsável e autorização formal de produção.
3. Revisar relatórios CSP antes de trocar `Report-Only` por enforcement.
4. Planejar code splitting dos bundles de Excel/PDF; não bloqueia o staging.

Confiabilidade atual: **alta no staging** para operação administrativa, autorização, persistência, projeções públicas, mídia, workflows, limpeza e responsividade. Promoção para produção depende somente das aprovações/configurações externas acima e de um processo de release que preserve as alterações preexistentes do usuário.
