# Contrato e operação da fundação EV2.1

## Endpoint

`POST /functions/v1/cms-releases`

Headers obrigatórios: sessão Supabase válida, `Content-Type: application/json` e `X-Idempotency-Key` UUID. A função aceita CORS somente das origens permitidas e limita cada ação por identidade/endereço.

O servidor exige `CMS_ENVIRONMENT=local|staging`, confere o ambiente enviado e aceita somente `siteKey=main`. Ausência ou divergência falha fechada; o cliente não escolhe o ambiente efetivo.

## Envelope v1

```json
{
  "envelope": {
    "schemaVersion": 1,
    "commandId": "UUID",
    "correlationId": "UUID",
    "occurredAt": "2026-09-01T23:00:00.000Z",
    "actorContext": { "environment": "local", "siteKey": "main" },
    "expectedVersion": 1
  },
  "action": "rollback",
  "releaseId": "UUID",
  "reason": "Reverter release vazio do teste"
}
```

`actorId`, papéis e permissões nunca vêm do corpo: são derivados da sessão e revalidados no banco. `expectedVersion` é obrigatório para `cancel`/`rollback`. `releaseId` é proibido em `create` e obrigatório nas demais ações.

## Ações

| Ação       | Permissão               | MFA                      | Resultado EV2.1                                                     |
| ---------- | ----------------------- | ------------------------ | ------------------------------------------------------------------- |
| `create`   | `cms:releases.create`   | conforme papel/permissão | release vazio `draft`; exige flag ativa no escopo                   |
| `status`   | `cms:releases.read`     | conforme papel           | estado/versão do release, mesmo com flag desligada para diagnóstico |
| `cancel`   | `cms:releases.cancel`   | AAL2                     | `draft` -> `canceled`                                               |
| `rollback` | `cms:releases.rollback` | AAL2                     | `draft/canceled` -> `rolled_back`                                   |

Produção é rejeitada no Edge e no contrato do banco da EV2.1. Somente `local` e `staging` existem na tabela, mas esta fase não autoriza deploy em staging.

## Idempotência e conflito

- O servidor calcula SHA-256 de JSON canônico e combina ator, ação e `X-Idempotency-Key`.
- Mesma chave/hash retorna exatamente o recibo persistido.
- Mesma chave com hash diferente retorna `CMS_RELEASE_IDEMPOTENCY_CONFLICT`/409.
- Versão divergente retorna `CMS_RELEASE_CONFLICT`/409; não há overwrite silencioso.
- Eventos de release e auditoria são append-only.

## Erros estáveis

|    HTTP | Código principal                                                                        | Significado                           |
| ------: | --------------------------------------------------------------------------------------- | ------------------------------------- |
|     400 | `CMS_RELEASE_COMMAND_INVALID`                                                           | schema/header inválido                |
|     401 | sessão inválida                                                                         | autenticação ausente/inválida         |
|     403 | `CMS_RELEASE_FORBIDDEN`, `CMS_RELEASE_FEATURE_DISABLED`, `CMS_RELEASE_PRODUCTION_GATED` | permissão, flag ou ambiente bloqueado |
|     404 | `CMS_RELEASE_NOT_FOUND`                                                                 | release fora do escopo ou inexistente |
|     409 | `CMS_RELEASE_CONFLICT`, `CMS_RELEASE_IDEMPOTENCY_CONFLICT`                              | concorrência/idempotência             |
|     422 | `CMS_RELEASE_TRANSITION_INVALID`                                                        | state machine rejeitou transição      |
| 429/503 | proteção/indisponibilidade                                                              | rate limit ou defesa indisponível     |

Logs expõem somente ação, ambiente, status/código e `correlationId`; motivo, payload, sessão e identidade não são registrados.
