# Gate G8 — evidências e decisão

**Data:** 2026-08-30

**Ambiente:** Supabase `glcqsosxwgmlhzgcsnzv` e Cloudflare Pages staging

**Decisão:** BLOQUEADO PARA GO-LIVE; HARDENING TÉCNICO SINTÉTICO APROVADO

| Critério                        | Evidência atual                                                                                                      | Decisão                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| zero P0                         | lint remoto limpo, check local e E2E staging verdes; nenhum P0 técnico conhecido                                     | atende no escopo testado             |
| P1 com aceite/owner/prazo       | administrador aprovou parâmetros LGPD; entrega de e-mail ainda rejeitada pelo remetente não autorizado               | bloqueia                             |
| lote 100% novo e aprovado       | configurações globais e um produto publicados; navegação, serviços, indústrias, aplicações e soluções ainda ausentes | bloqueia                             |
| nenhum fallback editorial atual | formulários e dados globais consomem CMS; navegação pública ainda usa fallback seguro                                | bloqueia                             |
| restore/rollback comprovados    | restauração editorial e retirada de projeção aprovadas; runbook de infraestrutura existe                             | validação operacional final pendente |
| alertas e runbooks ativos       | cron seguro ativo a cada 5 minutos; Resend responde, mas rejeita o domínio/remetente                                 | bloqueia                             |
| owners aprovam go-live          | aprovação de parâmetros e testes registrada; autorização de canary/produção não foi presumida                        | bloqueia                             |

## Homologação técnica

- migrations `0030` a `0034` aplicadas e schema remoto sem erros/avisos;
- permissões críticas exigem AAL2 independentemente do perfil;
- arquivamento remove imediatamente qualquer conteúdo da projeção pública;
- round-trip `20260830143413-3fb870` aprovou blog, campanha, formulário, leads, expiração, importação e visibilidade;
- cadastro em massa aprovou bloqueio total por erro, dry-run sem escrita, atomicidade, idempotência e auditoria;
- campos internos ficaram ausentes de API, busca, HTML e JSON-LD até a republicação explícita como públicos;
- 26 testes E2E aprovados em desktop/mobile, 2 skips condicionais e zero falha;
- zero fixture sintético permaneceu publicado;
- `main` e produção não foram alterados.

## Operação, Resend e LGPD

- `RESEND_API_KEY` presente no staging e nunca exposta no repositório;
- `pg_cron`, `pg_net` e Vault ativos;
- job `cms-outbox-worker-every-5m` ativo com agenda `*/5 * * * *`;
- segredo do worker rotacionado e sincronizado entre Edge Functions e Vault;
- função protegida `private.invoke_outbox_worker()` negada a `anon` e `authenticated`;
- invocação assíncrona do worker aprovada com HTTP 200;
- teste `LD-29930A2FDF` identificou `lead_notification_sender_not_authorized` e foi anonimizado sob a correlação `5202c33f-0715-441a-8a15-7c18856c581c`;
- seis notificações de fixtures já anonimizadas foram encerradas sem envio; quatro notificações ativas permanecem em retry até a autorização do remetente;
- consulta DNS pública não encontrou ainda DKIM/SPF/MX do Resend no domínio raiz;
- Victor Nishida, como administrador, confirmou em 2026-08-30 os textos, SLA, retenção e demais recomendações LGPD/DPO descritas no guia.

## Configuração permanente validada em staging

- `contato-principal` versão 1 publicado com sete campos conectados ao frontend;
- `newsletter` versão 1 publicada com e-mail e consentimento versionado;
- envio público de contato aprovado com protocolo `LD-BDDCDE3FA3`;
- fixture sintética anonimizada após o teste;
- remetente corrigido para o domínio `.com.br` e controlado pelo secret `EMAIL_FROM`;
- guia simplificado de operação e testes registrado em `GUIA_OPERACIONAL_CMS_E_PENDENCIAS.md`.

Evidência visual: [formulários publicados em staging](./evidencia-formularios-publicados-staging.png).

## Dependências para liberar o gate

1. cadastrar e aprovar navegação, serviços, indústrias, aplicações e soluções novos no CMS, sem importar o painel antigo;
2. concluir o DNS do domínio exato verificado no Resend, alinhar `EMAIL_FROM` e comprovar a entrega real;
3. concluir treinamento, alerta operacional, backup/restore e decisão de canary;
4. registrar autorização explícita de go-live.

A Fase 9 não pode começar antes disso, pois sua retirada do caminho anterior depende do período de estabilidade e do Gate G8 concluído.
