# Pré-requisitos de infraestrutura EV2.12

**Inventário atualizado em 5 de setembro de 2026.** Nenhum item bloqueado abaixo deve ser contornado
ou substituído por confirmação verbal.

## Estado encontrado

| Controle                       | Estado                                                                                     | Condição para liberar                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Cloudflare produção            | projeto `gaiatec-website` ativo e com histórico recuperável                                | manter token de Pages com menor privilégio e validar baseline na janela     |
| Deployment produtivo observado | `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, release `ba1131060177cdc602448ba4e9aeccf7afc298a5` | reconfirmar automaticamente; o valor pode mudar                             |
| Ambientes GitHub               | `production` e `production-backup` criados e limitados a branches protegidas               | manter sem bypass e completar apenas os secrets externos pendentes          |
| Branch `main`                  | protegida nos repositórios executável e documental                                         | manter PR, zero approvals, checks estritos, admins e histórico linear       |
| Secrets/variables Actions      | Supabase, backup e variáveis operacionais cadastrados nos environments                     | adicionar tokens mínimos de Cloudflare, guard GitHub e Resend               |
| Supabase de produção           | projeto isolado `chfuhctnhqgyjowkvllv` saudável, mas no plano Free e ainda vazio           | backup externo, restore drill, migrations, funções e revisão RLS aprovados  |
| Edge Functions EV2             | guardas ainda recusam produção por desenho                                                 | criar release produtiva separada e homologá-la antes de qualquer ativação   |
| Elegibilidade frontend         | switches candidatos são de build                                                           | implementar avaliação runtime antes de rollout por coorte em produção       |
| Privacidade/legal              | escopo padrão aprovado por `@Vnd93`, DPO Marcelo Diaz e canal público registrados          | manter provedor externo de IA desligado; anexar a aprovação ao registro G12 |
| Provider externo               | Resend definido; produção sem credencial ou evidência                                      | domínio e entrega sintética por SHA, custo e DPA aprovados                  |
| CSP                            | enforcement implementado para preview/produto; staging em Report-Only                      | canary no SHA final com zero violação crítica                               |
| Alertas/on-call                | canal e escala não registrados                                                             | owner primário/secundário e comunicação de incidente testados               |

## Configuração mínima no ambiente GitHub `production`

Proteções:

- PR obrigatório criado e integrado por `@Vnd93`, sem aprovação humana impossível de satisfazer;
- CODEOWNERS exclusivo `@Vnd93` globalmente e para workflows/registros de aprovação;
- checks reais `quality`, `database` e `browser` concluídos com sucesso no SHA exato;
- conversas resolvidas e histórico linear;
- permitir deployment somente a partir de branch protegida;
- `main` protegida, sem force-push/delete, com checks estritos `quality`, `database`, `browser`;
- nenhuma execução concorrente de deploy/rollback.

Secrets:

- `CLOUDFLARE_API_TOKEN` — Pages Write somente na conta/projeto necessários;
- `CLOUDFLARE_ACCOUNT_ID`;
- `RELEASE_GUARD_TOKEN` — token fine-grained somente leitura de administração/metadados para
  verificar ambiente, proteção, PR e jobs reais do GitHub Actions;
- `PRODUCTION_SUPABASE_URL`;
- `PRODUCTION_SUPABASE_ANON_KEY` — chave pública, ainda assim segregada do build de staging.

Variables:

- `PRODUCTION_SUPABASE_PROJECT_REF=chfuhctnhqgyjowkvllv`;
- `PRODUCTION_SITE_ORIGIN=https://gaiatecsistemas.com.br`.

O workflow valida esses valores sem imprimir credenciais e falha antes do build se detectar staging,
placeholder, URL divergente ou projeto incorreto.

## Inventário Supabase produtivo

Em 4 de setembro de 2026, o projeto `GAIATEC CMS Production` foi provisionado na organização
`GAIATEC Production`, ref. `chfuhctnhqgyjowkvllv`, região `us-east-2`, distinto do staging
`glcqsosxwgmlhzgcsnzv`. Ele permanece sem migrations, funções ou dados. Em 5 de setembro, a senha
foi redefinida por API oficial, a conexão TLS pelo pooler IPv4 foi validada e as credenciais foram
armazenadas somente nos environments protegidos do GitHub.

Por decisão do responsável, a organização usa o plano Free. Esse plano não inclui backups
automáticos ou PITR e pode pausar projetos após uma semana de baixa atividade. Assim, o projeto
dedicado atende ao isolamento, mas ainda não ao requisito de recuperação produtiva. O go-live exige
backup lógico externo, retenção, restore drill compatível com o RPO/RTO e aceite formal do risco ou
upgrade de plano.

O workflow de backup/restore e seus secrets exclusivos estão descritos em
[EV2.16](../fase-16/BACKUP_EXTERNO_E_RESTORE_DRILL.md).

A pausa controlada do `DZ System Project` (`pbmyttjnqijdbscrjayk`) liberou a vaga Free; ele ficou
`INACTIVE`, sem exclusão. O `GAIATEC CMS Staging` continuou `ACTIVE_HEALTHY`.

## Automação do canary em staging

O ambiente GitHub `staging` também está sem secrets. Para que o workflow publique o canary, cadastrar
nele `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STAGING_SUPABASE_URL` e
`STAGING_SUPABASE_ANON_KEY`. Enquanto faltar qualquer valor, o workflow valida e preserva o artefato,
mas não faz deploy. A execução local autenticada continua possível somente após autorização do SHA.

## Plano e mantenedor necessário

O GitHub Pro está ativo para `@Vnd93`. A decisão vigente adota `@Vnd93` como único mantenedor humano
e usa zero approvals, PR obrigatório, CODEOWNERS solo, checks reais no SHA, proteção de
administradores e ausência de bypass. O Codex fornece revisão técnica automatizada, sem ser tratado
como segunda conta ou pessoa responsável.

Nenhum secret foi movido para escopo desprotegido e nenhuma identidade fictícia foi criada. O risco
de mantenedor único deve ser aceito explicitamente no registro G12. Detalhes:
[proteção GitHub EV2.16](../fase-16/GITHUB_PROTECAO_E_REVISORES.md).

Evidência detalhada: [infraestrutura produtiva de 4 de setembro de 2026](EVIDENCIAS_INFRAESTRUTURA_PRODUCAO_2026-09-04.md).
