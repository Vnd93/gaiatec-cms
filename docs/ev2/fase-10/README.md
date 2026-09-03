# EV2.10 — IA assistiva controlada

## Estado

**Implementação e validação local F-015 concluídas; Gate G10 pendente.**

A fase introduz uma assistência de leitura e preparação de rascunhos com fonte, confiança, diff,
orçamento e decisão humana. O candidato permanece `default-off`, opera exclusivamente com
dados sintéticos e não possui integração com provedor externo. A decisão organizacional EV2-D04
continua pendente e bloqueia qualquer uso de dados reais ou ativação de provedor.

F-016, execução transacional por IA, não faz parte desta entrega. `ev2.ai_execute` permanece
desligada e nenhuma ferramenta do catálogo pode aplicar, publicar, excluir, exportar PII ou alterar
acessos.

## Entregas

| Camada      | Entrega                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| Banco       | migration `0049_ev2_ai_assist.sql`, 11 tabelas privadas, RLS e recibos idempotentes  |
| Política    | perfil sintético, retenção/expurgo até 24 h, sessão de 30 min e custo zero           |
| Ferramentas | `content.search`, `content.read`, `source.inspect` e `draft.propose_patch`           |
| API         | função `cms-ai` com autenticação, MFA, rate limit, redaction e detecção de injection |
| Interface   | `/admin/assistente`, atrás do build candidato e de override individual               |
| Fontes      | documento, versão, localizador/página, trecho e confiança em cada campo              |
| Revisão     | fila segregada; baixa confiança exige edição/rejeição; nenhuma decisão aplica saída  |
| Evals       | golden set, adversarial, privacidade, permissão, fonte, custo e baixa confiança      |
| Operação    | fallback manual, rehearsal transacional, canary sintético e limpeza verificável      |

## Comandos locais

- `npm run test:ev2:phase10`
- `npm run eval:ev2:phase10`
- `npm run test:rls` quando a stack Supabase local estiver disponível
- `npm run check`

Os comandos de rehearsal e canary apontam para staging e só podem ser executados depois de uma
autorização explícita específica. Esta implementação não aplica migration, não publica função, não
cria alias remoto e não altera staging ou produção.

Consulte o [contrato e operação](CONTRATO_E_OPERACAO.md), a
[proposta da decisão EV2-D04](PROPOSTA_POLITICA_EV2_D04.md), os
[critérios do Gate G10](GATE_G10.md), o
[relatório de validação local](RELATORIO_VALIDACAO_LOCAL_2026-09-03.md) e o
[plano de canary](PLANO_CANARY_STAGING.md).
