# Evidências e avaliação formal — Gate G3

**Data:** 2026-08-28

**Branch:** `Remodelagem`

**HEAD inicial auditado:** `65accfc5f59884c0546ab08b224cf7372d5e30f8`

**Alvo exclusivo:** Supabase `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`

**Frontend de homologação final:** `https://e48a3283.gaiatec-cms-staging.pages.dev`

**Produção:** não acessada

## Limite e premissas

Esta avaliação executa apenas a Fase 3. Nenhum produto, serviço, texto editorial, imagem, mídia, cadastro ou estrutura cadastrada no painel anterior foi importado, copiado ou adaptado. O único conteúdo usado nos testes foi sintético, descartável, marcado com proveniência de teste e removido ao final.

A contingência formal do G2 permanece inalterada: `npm run validate:local` é obrigatório; GitHub Actions, environments, branch protection, merge em `main` e produção continuam bloqueados até regularização externa. Nenhuma condição remota é declarada verde por esta evidência.

## Estado técnico do staging

- migrations locais e remotas alinhadas de `0001` a `0018`;
- migrations novas desta conclusão: `0014` a `0018`;
- funções CMS ativas: `cms-users`, `cms-session`, `cms-content`, `cms-preview`, `cms-public`, `cms-media` e `cms-outbox-worker`;
- frontend implantado pelo projeto Cloudflare Pages `gaiatec-cms-staging`, branch `Remodelagem`;
- respostas `/admin` com `Cache-Control: private, no-store, max-age=0` e `X-Robots-Tag: noindex, nofollow, noarchive`;
- preview inválido retorna `404` e mantém os mesmos controles de cache e indexação.

## Matriz remota descartável

Execução: `scripts/phase3/remote-g3-tests.ps1`, carregando somente a linha `SUPABASE_ACCESS_TOKEN` do arquivo externo documentado e recusando alvo cujo ref, nome ou região não coincidam com o staging aprovado.

**Resultado:** 44/44 verificações aprovadas.

| Área                | Evidência real                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identidade          | quatro usuários sintéticos criados, autenticados e separados em editor, revisor, publicador e identidade sem acesso |
| UI sem permissão    | `cms-session` negou a identidade sem perfil com HTTP 403                                                            |
| API sem permissão   | `cms-content` negou criação com HTTP 403                                                                            |
| Banco sem permissão | RLS retornou zero linhas na leitura e HTTP 403 na tentativa de escrita direta                                       |
| Concorrência        | save com lock obsoleto retornou HTTP 409 e código `CMS_CONTENT_CONFLICT`                                            |
| Conteúdo            | criar, salvar, enviar para revisão, aprovar e congelar revisão aprovados                                            |
| Preview             | token curto emitido; payload real exibido com `private, no-store`                                                   |
| Publicação          | projeção v1 criada transacionalmente e exibida pela API pública                                                     |
| Falha segura        | falha simulada da outbox gerou evento operacional e preservou a última projeção válida                              |
| Retry               | reprocessamento idempotente concluiu o evento falho                                                                 |
| Cache               | segunda publicação incrementou `content_version` e alterou ETag                                                     |
| Restauração         | revisão v1 restaurada como nova revisão publicada v3                                                                |
| Mídia               | original PNG privado e seis variantes WebP/AVIF enviados e validados por MIME/dimensões reais                       |
| Mapa de usos        | exclusão de ativo referenciado foi negada com HTTP 409                                                              |
| Auditoria           | eventos de criar, salvar, revisar, aprovar, publicar e restaurar persistiram durante o teste                        |
| Alerta              | falha da outbox persistiu em `cms_operational_events` sem remover a projeção                                        |

## Limpeza posterior

Fixtures foram removidas transacionalmente, objetos privados apagados e identidades Auth excluídas. A consulta final no staging retornou:

```json
{
  "synthetic_auth_users": 0,
  "synthetic_profiles": 0,
  "synthetic_content": 0,
  "synthetic_preview_tokens": 0,
  "synthetic_media": 0,
  "synthetic_storage": 0
}
```

O registro técnico `cms.synthetic-article.v1` permanece porque é configuração versionada de capacidade, não conteúdo ou fixture.

## Validação local obrigatória

Comando: `npm run validate:local`.

**Resultado final: APROVADO.** O ciclo integral de 2026-08-29T00:01:17.750Z a 2026-08-29T00:02:23.361Z aprovou formatação, lint sem erros, TypeScript, 11 testes unitários, 3 testes de integração, 4 contenções da Fase 1, 19 testes estruturais da Fase 3, auditoria com zero vulnerabilidades, build de staging, manifesto e 19 testes Playwright com 3 skips intencionais. O registro integral está em `docs/validacao-local/ULTIMA_VALIDACAO.md`.

Warnings de lint preexistentes no site público não foram convertidos em erros e não alteram o resultado. Banco local efêmero continua fora de `validate:local` porque Docker não está disponível; a matriz remota foi executada exclusivamente no staging limpo.

## Critério do Gate G3

O critério normativo exige que conteúdo demonstrativo sem dados reais seja criado, revisado, publicado, exibido, auditado e restaurado; e que usuário sem permissão seja negado em UI, API e banco.

Todos os elementos foram observados na matriz remota e a UX foi validada no staging conforme `VALIDACAO_UX_UI_G3.md`.

## Decisão formal

**GATE G3: APROVADO.**

A aprovação é limitada ao núcleo da Fase 3 no staging e não remove a contingência G2. Fase 4, `main` e produção permanecem bloqueadas e fora do escopo.
