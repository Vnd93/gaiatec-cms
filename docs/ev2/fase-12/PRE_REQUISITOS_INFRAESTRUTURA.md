# Pré-requisitos de infraestrutura EV2.12

**Inventário verificado em 4 de setembro de 2026.** Nenhum item bloqueado abaixo deve ser contornado
ou substituído por confirmação verbal.

## Estado encontrado

| Controle                       | Estado                                                                                     | Condição para liberar                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Cloudflare produção            | projeto `gaiatec-website` ativo e com histórico recuperável                                | manter token de Pages com menor privilégio e validar baseline na janela    |
| Deployment produtivo observado | `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, release `ba1131060177cdc602448ba4e9aeccf7afc298a5` | reconfirmar automaticamente; o valor pode mudar                            |
| Ambiente GitHub `production`   | não configurado                                                                            | criar ambiente protegido, lista com dois revisores e `prevent_self_review` |
| Branch `main`                  | sem proteção                                                                               | exigir PR, um approval, admins incluídos e checks estritos da CI           |
| Secrets/variables Actions      | ausentes                                                                                   | cadastrar somente no ambiente protegido conforme lista abaixo              |
| Supabase de produção           | projeto isolado `chfuhctnhqgyjowkvllv` saudável, mas no plano Free e ainda vazio           | backup externo, restore drill, migrations, funções e revisão RLS aprovados |
| Edge Functions EV2             | guardas ainda recusam produção por desenho                                                 | criar release produtiva separada e homologá-la antes de qualquer ativação  |
| Elegibilidade frontend         | switches candidatos são de build                                                           | implementar avaliação runtime antes de rollout por coorte em produção      |
| Privacidade/legal              | EV2-D04 pendente                                                                           | aprovação DPO/legal para dados reais e textos/retenção                     |
| Provider externo               | não faz parte dos canaries sintéticos                                                      | credenciais, circuit breaker, custo e DPA aprovados antes de uso real      |
| CSP                            | `Report-Only`                                                                              | receber/analisar relatórios e aprovar enforcement sem regressão            |
| Alertas/on-call                | canal e escala não registrados                                                             | owner primário/secundário e comunicação de incidente testados              |

## Configuração mínima no ambiente GitHub `production`

Proteções:

- pelo menos dois revisores elegíveis e distintos na lista; o GitHub exige a aprovação de um deles;
- impedir autoaprovação;
- permitir deployment somente a partir de branch protegida;
- `main` protegida, sem force-push/delete, com checks estritos `quality`, `database`, `browser`;
- nenhuma execução concorrente de deploy/rollback.

Secrets:

- `CLOUDFLARE_API_TOKEN` — Pages Write somente na conta/projeto necessários;
- `CLOUDFLARE_ACCOUNT_ID`;
- `GITHUB_RELEASE_GUARD_TOKEN` — token fine-grained somente leitura de administração/metadados para
  verificar ambiente e proteção do branch;
- `PRODUCTION_SUPABASE_URL`;
- `PRODUCTION_SUPABASE_ANON_KEY` — chave pública, ainda assim segregada do build de staging.

Variables:

- `PRODUCTION_SUPABASE_PROJECT_REF` — exatamente o ref contido na URL e diferente de
  `glcqsosxwgmlhzgcsnzv`;
- `PRODUCTION_SITE_ORIGIN=https://gaiatecsistemas.com.br`.

O workflow valida esses valores sem imprimir credenciais e falha antes do build se detectar staging,
placeholder, URL divergente ou projeto incorreto.

## Inventário Supabase produtivo

Em 4 de setembro de 2026, o projeto `GAIATEC CMS Production` foi provisionado na organização
`GAIATEC Production`, ref. `chfuhctnhqgyjowkvllv`, região `us-east-2`, distinto do staging
`glcqsosxwgmlhzgcsnzv`. Ele permanece sem migrations, funções, dados ou integração GitHub.

Por decisão do responsável, a organização usa o plano Free. Esse plano não inclui backups
automáticos ou PITR e pode pausar projetos após uma semana de baixa atividade. Assim, o projeto
dedicado atende ao isolamento, mas ainda não ao requisito de recuperação produtiva. O go-live exige
backup lógico externo, retenção, restore drill compatível com o RPO/RTO e aceite formal do risco ou
upgrade de plano.

A pausa controlada do `DZ System Project` (`pbmyttjnqijdbscrjayk`) liberou a vaga Free; ele ficou
`INACTIVE`, sem exclusão. O `GAIATEC CMS Staging` continuou `ACTIVE_HEALTHY`.

## Automação do canary em staging

O ambiente GitHub `staging` também está sem secrets. Para que o workflow publique o canary, cadastrar
nele `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STAGING_SUPABASE_URL` e
`STAGING_SUPABASE_ANON_KEY`. Enquanto faltar qualquer valor, o workflow valida e preserva o artefato,
mas não faz deploy. A execução local autenticada continua possível somente após autorização do SHA.

## Autoridade necessária

As sessões GitHub verificadas não possuem administração efetiva: `Vnd93` tem permissão `write` e
`dzsystemsproductions` não possui acesso ao repositório. Por isso, a criação do ambiente protegido e
da proteção de `main` requer autenticação como `pedronishida` ou elevação comprovada de outra conta.
Essa limitação não reduz a segurança: nenhum secret foi colocado no escopo do repositório e o
workflow se recusa a prosseguir enquanto os controles não estiverem efetivamente configurados.

Evidência detalhada: [infraestrutura produtiva de 4 de setembro de 2026](EVIDENCIAS_INFRAESTRUTURA_PRODUCAO_2026-09-04.md).
