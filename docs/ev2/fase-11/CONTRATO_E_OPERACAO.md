# Contrato e operação — EV2.11

## 1. Invariantes de F-017

1. O lead, consentimento, histórico inicial e evento de outbox existem antes de qualquer dependência
   de e-mail.
2. Falha de e-mail altera somente o evento da fila; não apaga nem regrava o lead.
3. Cada falha recebe código técnico, próxima disponibilidade e contador limitado a 20 tentativas.
4. A tentativa 20 move o evento para `dead_letter` e abre alerta operacional crítico.
5. O painel de Leads mostra `pending`, `processing`, `failed`, `dead_letter` e `completed` sem expor
   esses estados na superfície pública.
6. Reprocessamento manual aceita apenas `failed` ou `dead_letter`, zera o contador operacional e
   mantém um registro imutável do estado anterior.
7. Ao sair de `dead_letter`, o alerta crítico correspondente é resolvido automaticamente; se o evento
   esgotar as novas tentativas, um novo alerta crítico é aberto.
8. Reprocessamento exige `cms:leads.retry_delivery`, MFA/AAL2, justificativa, override individual,
   idempotency key e correlation ID.
9. Exportação e anonimização continuam críticas, justificadas e auditadas.
10. Versões publicadas de formulário permanecem imutáveis.

## 2. Invariantes de F-018

- `ev2.system_assurance` nasce e permanece `default_enabled=false`;
- apenas `local` e `staging` são aceitos; `production` falha fechado;
- override válido é individual, único, do mesmo ambiente e de no máximo 30 minutos;
- qualquer override amplo ativo desabilita o candidato;
- a fotografia não contém payload, e-mail, nome, telefone, token ou outro dado pessoal;
- métricas persistidas aceitam apenas números, booleanos ou nulos, com chaves allowlisted por formato;
- a fotografia do banco retorna `gateDecision=non_authoritative`;
- medição aprovada tecnicamente fica em `measured`; somente outro operador pode aceitar ou rejeitar;
- medição e revisão precisam ocorrer na janela individual de 30 minutos;
- medição com um único limite violado fica em `failed` e não pode ser aceita;
- toda mutação de garantia tem recibo idempotente, evento e auditoria;
- métricas medidas, eventos e recibos concluídos são imutáveis; a medição aceita apenas a transição
  segregada de `measured` para `accepted` ou `rejected`.

## 3. Baselines obrigatórios

| Indicador                   |                 Limite G11 |
| --------------------------- | -------------------------: |
| Disponibilidade da amostra  |                 `>= 99,9%` |
| Leitura administrativa      |            p95 `<= 500 ms` |
| Comando síncrono            |            p95 `<= 800 ms` |
| Atraso do outbox            |         p95 `<= 60.000 ms` |
| Auditoria de ações críticas |                     `100%` |
| Restore                     |   RPO `0`, RTO `<= 15 min` |
| Acessibilidade automatizada | `0` critical e `0` serious |
| Defeitos bloqueadores       |            `P0=0` e `P1=0` |

Os limites vêm do baseline da EV2.0. Igualdade no limite é aceita; qualquer valor pior reprova a
medição sem exceção manual.

## 4. Fronteiras de API

### `cms-system`

| Ação         | Efeito                                            | MFA    | Idempotência   |
| ------------ | ------------------------------------------------- | ------ | -------------- |
| `capability` | informa flag, ambiente e baseline                 | sessão | não necessária |
| `snapshot`   | calcula filas, reconciliação, alertas e auditoria | sessão | não necessária |
| `record_run` | persiste relatório sintético medido               | AAL2   | obrigatória    |
| `review_run` | aceita ou rejeita por segundo operador            | AAL2   | obrigatória    |

O ambiente declarado no envelope precisa coincidir com `CMS_ENVIRONMENT` configurado na função.
Sem essa configuração o runtime assume `production` e recusa o candidato.

### `cms-leads / retry_delivery`

Entrada: `eventId` e `justification`. O ambiente vem exclusivamente de `CMS_ENVIRONMENT` no servidor.
O retorno informa evento, lead, estado `pending`, duplicidade idempotente e correlation ID. Em erro, o
contrato responde `preserved=true`, indicando que a falha não alterou o lead.

## 5. Fotografia operacional

`cms_get_system_snapshot` mede três filas (`publication`, `lead_delivery`, `collaboration`), o evento
acionável mais antigo, dead-letter, divergência publicação/projeção, ausência de consentimento,
histórico ou outbox em leads, alertas críticos não resolvidos e ações críticas sem correlation ID nas
últimas 24 horas. A consulta é estável, somente leitura e retorna contagens, nunca conteúdo.

## 6. Compatibilidade e degradação

Com o build candidate desligado, Diagnósticos mantém a visualização anterior e Leads continua
operável. Se `cms-system` falhar, o painel informa a indisponibilidade sem bloquear o atendimento. Se
o provedor de e-mail falhar, o lead permanece disponível, o worker responde `degraded`, o evento
entra em retentativa e o operador pode agir pelo código de suporte. Nenhum recurso de IA participa
deste fluxo; indisponibilidade da IA não afeta a operação manual.
