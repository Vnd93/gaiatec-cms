# Contrato e operação — EV2.10

## Limite funcional

O recorte implementado é F-015:

1. localizar uma referência sintética;
2. explicar um trecho autorizado;
3. extrair um campo com citação;
4. preparar um patch de rascunho com diff;
5. aceitar, rejeitar ou editar a proposta para posterior uso manual.

Não existe ferramenta de aplicação. A aprovação humana é um registro de decisão, não um comando
editorial. Publicação, exclusão, exportação, gestão de acesso, execução de código e chamadas de rede
externa permanecem fora do contrato.

## Invariantes

- ambiente permitido: `local` ou `staging`; produção falha antes da capacidade;
- site permitido: somente `main`;
- ativação: build candidato e exatamente um override de usuário no mesmo ambiente, por até 30 min;
- qualquer override global, de ambiente, de site ou ambíguo faz a capacidade falhar fechada;
- dados: somente `synthetic` e referências `g10x-*`;
- provedor: `synthetic`; provedor externo e rede externa desligados;
- modelo: adaptador determinístico `deterministic-v1`;
- credenciais: nenhum token de `service_role` é entregue a modelo ou ferramenta;
- retenção: no máximo 24 horas; sessão ativa por no máximo 30 minutos;
- expurgo: rotina SQL limitada roda a cada cinco minutos; a expiração é antecipada para 23 h 55 min;
- orçamento: 8.000 tokens por sessão, 2.000 de entrada por chamada e custo zero;
- baixa confiança: qualquer campo abaixo de 0,80 recebe `pending`;
- segregação: o autor não decide a própria proposta; revisores autorizados veem a fila do mesmo
  site e ambiente;
- uma proposta pendente não pode ser aceita diretamente; edição humana canônica ou rejeição é
  obrigatória;
- mutações da fase exigem AAL2, permissão efetiva, idempotência e correlação;
- tabelas têm RLS e não concedem acesso a `anon` ou `authenticated`;
- falha da assistência nunca bloqueia os editores manuais.

## Catálogo fechado

| Ferramenta            | Modo     | Permissão      | Modifica CMS |
| --------------------- | -------- | -------------- | ------------ |
| `content.search`      | leitura  | `cms:ai.read`  | não          |
| `content.read`        | leitura  | `cms:ai.read`  | não          |
| `source.inspect`      | leitura  | `cms:ai.read`  | não          |
| `draft.propose_patch` | rascunho | `cms:ai.draft` | não          |

Qualquer chave fora da lista é inexistente e não pode ser enviada pelo cliente ou criada pelo
adaptador. O catálogo registra `mutates_cms=false` e `critical_action=false` por
constraint.

## Fluxo

`capability` informa ambiente, site, política, fonte da ativação, limites e fallback.
`workspace` retorna as sessões do ator e, para quem possui `cms:ai.review`, a fila segregada do
mesmo site e ambiente dentro da retenção. `start_session` abre uma janela curta.
`generate_proposal` redige PII, bloqueia segredos e injection, registra a fonte, executa somente o
adaptador sintético e grava mensagem, tool call, proposta, recibo e evento na mesma transação.
`decide_proposal` valida o hash imutável, impede autoaprovação e registra a escolha humana sem
aplicação. Campos editados preservam a citação original, descartam metadados enviados pelo cliente e
recebem `human_verified`. `record_eval` grava somente métricas sintéticas.

Conteúdo recuperado é sempre tratado como dado não confiável. Os mesmos limites são impostos pela
validação Zod no edge e pelas constraints/funções SQL. Logs e respostas de erro usam códigos e
correlation ID, sem reproduzir conteúdo sensível.

## Códigos operacionais principais

| Código                                | Significado                              | Recuperação                         |
| ------------------------------------- | ---------------------------------------- | ----------------------------------- |
| `CMS_AI_FEATURE_DISABLED`             | flag/override indisponível ou amplo      | usar CMS manual; revisar override   |
| `CMS_AI_MFA_REQUIRED`                 | sessão abaixo de AAL2                    | confirmar MFA                       |
| `CMS_AI_SAFETY_BLOCKED`               | injection ou segredo detectado           | remover o dado e reformular         |
| `CMS_AI_UNREDACTED_DATA`              | segunda barreira SQL recusou PII/segredo | não reenviar dado real              |
| `CMS_AI_BUDGET_EXCEEDED`              | limite da sessão atingido                | encerrar e avaliar necessidade      |
| `CMS_AI_PROPOSAL_CONFLICT`            | hash mudou                               | recarregar antes de decidir         |
| `CMS_AI_REVIEWER_SEPARATION_REQUIRED` | autor tentou decidir a própria saída     | usar outro revisor autorizado       |
| `CMS_AI_LOW_CONFIDENCE_PENDING`       | aceitação direta de campo pendente       | editar após conferência ou rejeitar |
| `CMS_AI_PRODUCTION_GATED`             | tentativa em produção                    | operação proibida nesta fase        |

## Rollback

O rollback operacional é imediato e não destrutivo:

1. remover os overrides individuais de `ev2.ai_assist` ou acionar seu kill switch;
2. manter `VITE_EV2_AI_ASSIST_CANDIDATE=false` no build estável;
3. retirar `cms-ai` do tráfego candidato, preservando auditoria;
4. expirar/cancelar sessões sintéticas;
5. usar normalmente conteúdo, produtos e páginas no CMS manual.

A migration é aditiva. Não se apagam tabelas em rollback operacional. O rehearsal usa transação e
`rollback` apenas para provar instalação e reversão antes do canary autorizado.
