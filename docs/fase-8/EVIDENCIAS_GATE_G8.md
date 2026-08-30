# Gate G8 — evidências e decisão

**Data:** 2026-08-30

**Ambiente:** Supabase `glcqsosxwgmlhzgcsnzv` e Cloudflare Pages staging

**Decisão:** BLOQUEADO PARA GO-LIVE; HARDENING TÉCNICO SINTÉTICO APROVADO

| Critério                        | Evidência atual                                                                                     | Decisão                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| zero P0                         | lint remoto limpo, check local e E2E staging verdes; nenhum P0 técnico conhecido                    | atende no escopo testado             |
| P1 com aceite/owner/prazo       | entrega real de e-mail e aprovações humanas ainda abertas                                           | não atende formalmente               |
| lote 100% novo e aprovado       | lote sintético foi novo e retirado; lotes reais não foram preenchidos                               | bloqueia                             |
| nenhum fallback editorial atual | consumidores CMS são fail-closed, mas o conteúdo permanente ainda não foi recadastrado por completo | bloqueia                             |
| restore/rollback comprovados    | restauração editorial e retirada de projeção aprovadas; runbook de infraestrutura existe            | validação operacional final pendente |
| alertas e runbooks ativos       | runbooks existem; provedor de e-mail/alerta externo não está completo                               | bloqueia                             |
| owners aprovam go-live          | nenhuma aprovação de go-live foi presumida                                                          | bloqueia                             |

## Homologação técnica

- migrations `0030` a `0033` aplicadas e schema remoto sem erros/avisos;
- permissões críticas exigem AAL2 independentemente do perfil;
- arquivamento remove imediatamente qualquer conteúdo da projeção pública;
- round-trip `20260830143413-3fb870` aprovou blog, campanha, formulário, leads, expiração, importação e visibilidade;
- cadastro em massa aprovou bloqueio total por erro, dry-run sem escrita, atomicidade, idempotência e auditoria;
- campos internos ficaram ausentes de API, busca, HTML e JSON-LD até a republicação explícita como públicos;
- 26 testes E2E aprovados em desktop/mobile, 2 skips condicionais e zero falha;
- zero fixture sintético permaneceu publicado;
- `main` e produção não foram alterados.

## Configuração permanente validada em staging

- `contato-principal` versão 1 publicado com sete campos conectados ao frontend;
- `newsletter` versão 1 publicada com e-mail e consentimento versionado;
- envio público de contato aprovado com protocolo `LD-BDDCDE3FA3`;
- fixture sintética anonimizada após o teste;
- remetente corrigido para o domínio `.com.br` e controlado pelo secret `EMAIL_FROM`;
- guia simplificado de operação e testes registrado em `GUIA_OPERACIONAL_CMS_E_PENDENCIAS.md`.

Evidência visual: [formulários publicados em staging](./evidencia-formularios-publicados-staging.png).

## Dependências para liberar o gate

1. cadastrar e aprovar os lotes reais novos no CMS, sem importar o painel antigo;
2. configurar `RESEND_API_KEY`, verificar o domínio e comprovar entrega real de uma notificação de staging;
3. obter aceite do DPO e dos owners de conteúdo/operação;
4. concluir treinamento, alerta operacional, backup/restore e decisão de canary;
5. registrar autorização explícita de go-live.

A Fase 9 não pode começar antes disso, pois sua retirada do caminho anterior depende do período de estabilidade e do Gate G8 concluído.
