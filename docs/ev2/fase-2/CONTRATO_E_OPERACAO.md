# Contrato e operação dos rascunhos EV2.2

## Validação progressiva

| Fronteira       | Exigência                                                                   | Efeito permitido                 |
| --------------- | --------------------------------------------------------------------------- | -------------------------------- |
| `DraftSchema`   | tipo, schema v2, título opcional e mapa de campos que pode permanecer vazio | criar, recuperar e salvar patch  |
| `ReviewSchema`  | título e algum conteúdo editorial                                           | preparar submissão, sem publicar |
| `PublishSchema` | contrato público v1 completo, proveniência, mídia, SEO e quality gates      | revisão/publicação posterior     |

Salvar um rascunho nunca chama o comando editorial v1, altera workflow ou escreve em projeção pública. O adapter só sincroniza novos produtos quando os dois gates estiverem ativos: variável de build candidata e avaliação server-side da flag por usuário/ambiente.

## Comandos

Todos os comandos recebem envelope v1, identidade derivada da sessão, ambiente configurado no servidor e `correlationId`.

- `capability`: retorna a avaliação fail-closed de `ev2.draft_v2`.
- `resume`: localiza o último rascunho ativo do próprio criador e tipo.
- `get`: recupera um rascunho conhecido após autorização do domínio.
- `create`: cria registro vazio, privado e com `lockVersion=1`.
- `patch`: aplica até 100 operações top-level com `expectedVersion` e limite final de 1 MiB.
- `discard`: exige motivo e versão, marca como descartado e mantém dados/histórico.

`create`, `patch` e `discard` exigem chave idempotente. Repetição com mesmo hash devolve o recibo; a mesma chave com hash diferente retorna conflito. Patches obsoletos retornam HTTP 409, versão atual e referência de diff sem expor o payload em log.

## Segurança e privacidade

- RLS está habilitada e não há grant de tabela para `anon` ou `authenticated`.
- Toda leitura/escrita passa pela Edge Function e RPC `security definer` com autorização efetiva.
- Produção e qualquer `siteKey` diferente de `main` são recusados no Edge e no banco.
- Chaves de campo perigosas e payloads acima do limite são rejeitados.
- Eventos guardam nomes de campos e hash, não o conteúdo editorial.
- Rascunhos v2 não possuem consumidor público, índice, sitemap ou vínculo com projeção.

## Rollback

O kill switch ou a remoção da variável candidata restaura o editor v1 imediatamente. Shadow drafts, recibos e eventos permanecem preservados para recuperação/exportação; não há down migration destrutiva.
