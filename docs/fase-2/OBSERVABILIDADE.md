# Observabilidade sem PII — Fase 2

## Contrato

Eventos são JSON com `timestamp`, `event`, `level`, `correlationId`, `release`, `route` e `context` sanitizado. O Worker acrescenta `X-Correlation-ID` e `Server-Timing`; o frontend usa o mesmo identificador como código de suporte.

Chaves de senha, token, autorização, cookie, e-mail, telefone, nome, mensagem, endereço e payload são removidas recursivamente. Erros de frontend não registram mensagem, stack, URL completa nem conteúdo digitado. Rotas perdem query string e fragmento.

## Eventos e métricas

| Evento/métrica                       | Quando                           | Alerta inicial                     |
| ------------------------------------ | -------------------------------- | ---------------------------------- |
| `http.request` / `api.request.count` | toda resposta do Worker          | 5xx > 2% por 5 min                 |
| `frontend.error`                     | boundary de rota                 | > 5 por release em 10 min          |
| `publication.result`                 | futuro pipeline editorial        | qualquer falha ou p95 > 60 s       |
| `queue.depth`                        | futura outbox/fila               | profundidade > 20 ou item > 10 min |
| `rls.denied`                         | operação negada esperada/anômala | pico 3x acima da linha-base        |

Eventos de publicação e fila são contratos preparados, mas não são emitidos nesta fase porque esses módulos pertencem às fases seguintes. Criar processadores fictícios apenas para gerar telemetria avançaria indevidamente o escopo.

## Operação

- consultar por `correlationId`, `release`, evento e status, nunca por identificador pessoal;
- manter sampling total de 5xx e reduzido para 2xx quando o volume exigir;
- não enviar `console.log` de objetos de requisição, sessão ou formulários;
- verificar o redactor em teste unitário antes de ampliar o allowlist;
- tratar qualquer PII encontrada em log como incidente e executar o runbook da Fase 1.
