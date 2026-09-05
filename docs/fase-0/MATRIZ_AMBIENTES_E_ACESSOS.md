# Matriz de ambientes e acessos

**Status:** aprovada; staging técnico disponível

| Ambiente | Hosting | Banco/Auth/Storage | Dados | Indexação | Credenciais | Owner |
|---|---|---|---|---|---|---|
| Local | Vite local | `GAIATEC CMS Staging` | apenas seed sintético | não | URL/chave pública de staging | Pedro Nishida |
| CI | runner efêmero | Supabase efêmero/local | sintético e destruído ao final | não | OIDC/secret mínimo | Pedro Nishida (interino) |
| Preview | Cloudflare Pages por branch/PR | staging isolado, namespace/dataset de teste | sintético | `noindex, nofollow` | somente leitura pública e comandos de teste | DevOps + QA |
| Staging | `gaiatec-cms-staging.pages.dev` | `GAIATEC CMS Staging`, região `us-east-2` | vazio/sintético; nenhum dado produtivo | `X-Robots-Tag: noindex, nofollow` | secrets de staging | Pedro Nishida |
| Produção | `gaiatec-website` no Cloudflare Pages | projeto Supabase de produção formalmente identificado | dados reais aprovados | conforme entidade | secrets de produção somente no provedor | Operação |

## Estado encontrado

- Cloudflare Pages é o hosting público real e possui conta autenticada.
- Foi criado o projeto Pages `gaiatec-cms-staging`, separado da produção.
- O projeto público `gaiatec-website` não possui integração Git e lista deploys `Production/main`.
- Foi criado o projeto Supabase `GAIATEC CMS Staging`, separado do projeto anterior.
- A consulta somente leitura de 28/08/2026 confirmou `0` tabelas públicas, `0` buckets e `0` usuários no staging.
- `.env.local` aponta somente para staging e contém apenas URL, chave anônima pública e project ref.
- Não há ambiente CI nem preview por PR.

## Regras de acesso

1. Produção não será configurada em `.env.local`.
2. Service role nunca será exposta ao Vite/browser.
3. Cada ambiente terá projeto Supabase, Auth, buckets e secrets próprios.
4. Nenhum lead, usuário, foto, RDO ou assinatura real será copiado para ambientes inferiores.
5. Preview e staging serão bloqueados de indexação e terão cache separado.
6. Acesso privilegiado será nominal, mínimo, revisado e revogável.
7. A criação de projetos externos que possa gerar cobrança exige autorização do patrocinador.

## Ações para fechar o gate

- Classificação conservadora aplicada: o projeto anterior é tratado como produção até decisão posterior.
- Staging Cloudflare e Supabase foram criados e validados.
- O estado vazio do Supabase staging foi comprovado antes de qualquer schema ou carga.
- `.env.local` foi isolado de produção; o backup privilegiado está fora do repositório, na pasta de segredos do workspace.
- Owners e inventário de acesso foram registrados sem valores de segredo.
