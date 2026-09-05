# Offline, conflito e recuperação

## Estados visíveis

| Estado                  | Mensagem/ação                                             |
| ----------------------- | --------------------------------------------------------- |
| verificando             | aguardar avaliação da capacidade                          |
| criando                 | informar que o registro é privado                         |
| sincronizando           | anunciar atualização do servidor por região viva          |
| salvo                   | exibir horário da confirmação server-side                 |
| offline                 | informar preservação local e retry automático             |
| recuperação disponível  | exigir escolha entre servidor e navegador                 |
| conflito                | informar versão atual e garantir que nada foi sobrescrito |
| erro recuperável        | manter backup, `correlationId` e ação “Tentar novamente”  |
| sessão EV2 indisponível | avisar o fallback v1 e seus campos obrigatórios           |

## Estratégia

O autosave usa debounce de 2 segundos e serializa somente campos alterados. Falha offline/5xx mantém a cópia local e agenda retry exponencial entre 1 e 30 segundos. A chave local inclui versão de schema, ambiente, usuário, tipo de editor e item; o TTL permanece em 24 horas.

Um 409 interrompe retries automáticos. O operador deve restaurar a versão server-side ou manter conscientemente a versão local para gerar novo patch sobre a versão recuperada. Não existe last-write-wins silencioso.

Se a capability estiver desligada ou expirada, o adapter falha fechado para o editor v1. O candidato informa essa transição em `role="alert"`, explica que o salvamento legado exige o cadastro completo e orienta reabrir uma sessão autorizada. Builds em que o adapter cliente está deliberadamente desligado permanecem silenciosos.

## Cenários obrigatórios do G2

1. Abrir novo produto vazio e confirmar registro server-side sem payload publicável.
2. Alterar um campo, ficar offline, fechar/reabrir e recuperar a cópia local.
3. Reconectar e confirmar patch/recibo sem duplicidade.
4. Abrir duas sessões, salvar na primeira e confirmar 409 na segunda.
5. Validar teclado, foco, mensagens e contraste do picker/indicadores.
6. Consultar catálogo, busca, sitemap e projeção e provar ausência do rascunho.
7. Acionar kill switch e comprovar retorno ao editor v1 sem apagar shadow data.
