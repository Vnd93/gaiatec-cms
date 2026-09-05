# Relatório do canary, backup/restore e entrega de e-mail — staging

**Data:** 2026-08-30

**Ambiente:** Supabase `glcqsosxwgmlhzgcsnzv` e Cloudflare Pages `gaiatec-cms-staging`

**Operador inicial do CMS:** Victor Nishida

**Produção:** não acessada e não alterada. Qualquer promoção permanece condicionada a uma autorização explícita adicional de produção pelo administrador.

## Resultado executivo

O canary de staging foi aprovado. O workflow editorial, a projeção pública, a criação de nova versão, o restore de uma revisão anterior, o formulário governado, a fila assíncrona e a entrega pelo Resend funcionaram de ponta a ponta.

Não foi encontrado P0 ou P1 técnico no escopo executado. O Gate G8 permanece fechado para produção somente porque o administrador determinou que o aceite deste relatório deve anteceder qualquer mudança de produção.

## 1. Registro canário publicado

- item: `6273fa16-bdb7-4e5b-a799-d09ec6e649f6`;
- slug: `validacao-integracao-cms-staging`;
- página pública: `https://gaiatec-cms-staging.pages.dev/servicos/validacao-integracao-cms-staging`;
- conteúdo explicitamente sintético e exclusivo de staging;
- workflow executado: rascunho → revisão → aprovação → publicação;
- correlação do envio para revisão: `e669fec4-a896-46fd-8325-0fe5fe7356d5`;
- correlação da aprovação: `45cc8d3b-d3c0-4f6f-ae9b-f23f046afdfd`;
- correlação da primeira publicação: `775a4e62-88d6-46bc-87b7-d4ab27f3fd80`.

A página pública retornou o título, resumo, escopo, entregáveis, etapas e CTA cadastrados no CMS, com SEO correto e sem erro de console.

## 2. Backup lógico e restore

O histórico imutável de revisões do CMS foi usado como backup lógico do item.

| Etapa                | Revisão                                | Versão pública | ETag             | Resultado                                 |
| -------------------- | -------------------------------------- | -------------: | ---------------- | ----------------------------------------- |
| publicação inicial   | `4d1efefc-e361-434b-982c-2de2d6985086` |              1 | `b567c36c…e9081` | conteúdo-base publicado                   |
| alteração temporária | `fe691d27-4bdf-4f38-8b86-13bc26702600` |              2 | `257527a9…0d0e`  | marcador `VERSÃO TEMPORÁRIA` chegou à API |
| restore da revisão 1 | `c9fb434d-d676-4023-bfe9-f765461ae790` |              3 | `1288e509…35f21` | conteúdo-base integralmente recuperado    |

- correlação do salvamento temporário: `c88337cc-5a05-4d4e-a289-ff46990cb956`;
- correlação da publicação temporária: `4dc83631-9818-41db-8081-f02369eb3653`;
- correlação do restore: `3f676d49-60d6-4503-93fa-8ea5d939c7ba`.

Após o restore, o frontend voltou a exibir exatamente o resumo original. O marcador temporário ficou ausente da página e da projeção pública. Produtos, indústrias, aplicações e soluções não foram modificados. A única variação esperada no inventário foi a coleção de serviços, de 5 para 6 itens, pela inclusão do canary.

## 3. Resend e fila de leads

- domínio verificado no Resend: `gaiatecsistemas.com`;
- DKIM, SPF/MX de envio e TXT verificados; recebimento corporativo não foi alterado;
- `EMAIL_FROM` de staging alinhado para `GAIATEC SISTEMAS <cms@gaiatecsistemas.com>`;
- protocolo do contato sintético: `LD-D6257F8D15`;
- lead confirmado no CMS com status `new`, origem `contact /contato`, SLA e consentimento;
- log Resend: `48d9d8c9-4291-4eef-8b5d-2f775bc3fbed`;
- e-mail Resend: `f6202cda-a228-4d51-adf1-695eaeeb3241`;
- resposta da API: HTTP 200;
- eventos do provedor: `sent` e `delivered` em 2026-08-30 às 15:40 BRT;
- destinatário: `comercial@gaiatecsistemas.com.br`;
- o corpo da notificação contém somente protocolo e evento, sem os dados pessoais do formulário.

Evidência privada do provedor: `https://resend.com/emails/f6202cda-a228-4d51-adf1-695eaeeb3241`.

## 4. Revisão UX/UI do CMS

O editor de serviços, indústrias, aplicações e soluções deixou de usar o JSON como interface principal. A operação foi reorganizada em cinco seções:

1. Conteúdo;
2. Busca, CTA e SEO;
3. Mídia e relações;
4. Governança;
5. Avançado.

Campos públicos, internos, ajuda contextual, listas, relações e workflow passaram a ter agrupamento próprio. O JSON integral permanece disponível somente na área avançada. A barra do workflow foi reduzida para uma faixa de aproximadamente 69 px, sem encobrir o formulário. Rótulos e textos de ajuda agora têm associações acessíveis separadas.

Validações executadas: 50 testes unitários aprovados, testes específicos da Fase 5 aprovados, typecheck aprovado, lint sem erros, build de staging aprovado e inspeção visual no Chrome sem sobreposição ou erro de console.

## 5. Decisão e contenção

- canary de staging: **APROVADO**;
- backup/restore editorial: **APROVADO**;
- Resend e cron: **APROVADOS**;
- CMS → frontend: **APROVADO**;
- produção/go-live: **NÃO AUTORIZADO NESTE RELATÓRIO**.

## 6. Aceite posterior do administrador

Em 2026-08-30, Victor Nishida aprovou explicitamente este relatório e a Fase 8. O aceite fecha o Gate G8 para início da Fase 9 em local/staging. Ele não autoriza deploy, cutover, go-live ou qualquer alteração em produção, que continuam dependentes de autorização explícita adicional.
