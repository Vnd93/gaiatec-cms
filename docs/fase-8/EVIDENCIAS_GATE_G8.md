# Gate G8 — evidências e decisão

**Data:** 2026-08-30

**Ambiente:** Supabase `glcqsosxwgmlhzgcsnzv` e Cloudflare Pages staging

**Decisão:** APROVADO PARA INICIAR A FASE 9 EM LOCAL/STAGING; PRODUÇÃO NÃO AUTORIZADA

| Critério                        | Evidência atual                                                                                           | Decisão                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| zero P0                         | lint remoto limpo, check local e E2E staging verdes; nenhum P0 técnico conhecido                          | atende no escopo testado  |
| P1 com aceite/owner/prazo       | nenhum P1 técnico conhecido no escopo do canary; parâmetros LGPD aprovados                                | atende                    |
| lote 100% novo e aprovado       | configurações globais, produto, navegação, 5 serviços, 8 indústrias, 3 aplicações e 2 soluções publicados | atende no escopo inicial  |
| nenhum fallback editorial atual | formulários, dados globais, navegação e coleções do lançamento consomem somente a nova projeção           | atende no escopo inicial  |
| restore/rollback comprovados    | versão 2 temporária publicada e revisão 1 restaurada como versão 3, confirmada na API e no frontend       | atende                    |
| alertas e runbooks ativos       | cron seguro ativo; Resend respondeu HTTP 200 e confirmou `sent`/`delivered`                               | atende                    |
| owners aprovam o avanço         | Victor Nishida aprovou a Fase 8 e o relatório canary em 2026-08-30; produção exige autorização adicional  | atende para local/staging |

## Aceite administrativo e reavaliação formal

Em 2026-08-30, Victor Nishida, administrador da GAIATEC SISTEMAS, aprovou explicitamente a Fase 8 e o relatório `RELATORIO_CANARY_STAGING_2026-08-30.md`. A reavaliação objetiva dos critérios acima conclui:

- Gate G8 **aprovado** para iniciar a Fase 9 em local e staging;
- o aceite cobre a retirada técnica, os testes e as evidências em ambientes não produtivos;
- produção, go-live, cutover público e deploy no projeto `gaiatec-website` permanecem proibidos sem uma autorização explícita adicional;
- nenhuma remoção da Fase 9 pode reintroduzir conteúdo anterior nem usar o site antigo como fallback.

## Homologação técnica

- migrations `0030` a `0034` aplicadas e schema remoto sem erros/avisos;
- permissões críticas exigem AAL2 independentemente do perfil;
- arquivamento remove imediatamente qualquer conteúdo da projeção pública;
- round-trip `20260830143413-3fb870` aprovou blog, campanha, formulário, leads, expiração, importação e visibilidade;
- cadastro em massa aprovou bloqueio total por erro, dry-run sem escrita, atomicidade, idempotência e auditoria;
- campos internos ficaram ausentes de API, busca, HTML e JSON-LD até a republicação explícita como públicos;
- 36 testes E2E aprovados em desktop/mobile, 2 skips condicionais e zero falha;
- zero fixture sintético permaneceu publicado;
- `main` e produção não foram alterados.

## Lote clean-room inicial

- autorização `GAIATEC-ADMIN-CHAT-2026-08-30` registrada como `owner_authored`;
- cinco serviços publicados;
- oito indústrias publicadas;
- três aplicações publicadas;
- duas soluções publicadas;
- navegação com seis links no header e seis links no footer publicada;
- dois atores temporários distintos, com MFA, executaram autoria/publicação e aprovação;
- API pública e páginas detalhadas confirmaram o conteúdo sem consulta ao caminho anterior;
- acessos diretos às coleções e páginas detalhadas retornaram HTTP 200 real no Worker, preservando 404 para rotas inexistentes;
- a coleção de produtos foi isolada de serviços, indústrias, aplicações e soluções nas camadas cliente e API;
- viewport móvel 393 × 852 sem overflow horizontal;
- evidência completa registrada em `LOTE_CLEAN_ROOM_INICIAL.md`.

Evidência visual: [solução clean-room publicada](./evidencia-solucao-clean-room-staging.png).

## Operação, Resend e LGPD

- `RESEND_API_KEY` presente no staging e nunca exposta no repositório;
- `pg_cron`, `pg_net` e Vault ativos;
- job `cms-outbox-worker-every-5m` ativo com agenda `*/5 * * * *`;
- segredo do worker rotacionado e sincronizado entre Edge Functions e Vault;
- função protegida `private.invoke_outbox_worker()` negada a `anon` e `authenticated`;
- invocação assíncrona do worker aprovada com HTTP 200;
- o teste anterior `LD-29930A2FDF` registrou a divergência do remetente `.com.br` e foi anonimizado;
- o domínio `gaiatecsistemas.com` foi confirmado como verificado no Resend, com DKIM, SPF/MX de envio e TXT válidos;
- `EMAIL_FROM` foi atualizado no staging para `GAIATEC SISTEMAS <cms@gaiatecsistemas.com>`;
- o teste `LD-D6257F8D15` gerou HTTP 200 e eventos `sent`/`delivered` no Resend;
- log `48d9d8c9-4291-4eef-8b5d-2f775bc3fbed` e e-mail `f6202cda-a228-4d51-adf1-695eaeeb3241` comprovam a entrega;
- Victor Nishida, como administrador, confirmou em 2026-08-30 os textos, SLA, retenção e demais recomendações LGPD/DPO descritas no guia.

## Configuração permanente validada em staging

- `contato-principal` versão 1 publicado com sete campos conectados ao frontend;
- `newsletter` versão 1 publicada com e-mail e consentimento versionado;
- envio público de contato aprovado com protocolo `LD-BDDCDE3FA3`;
- fixture sintética anonimizada após o teste;
- remetente alinhado ao domínio verificado `.com` e controlado pelo secret `EMAIL_FROM`;
- guia simplificado de operação e testes registrado em `GUIA_OPERACIONAL_CMS_E_PENDENCIAS.md`.

Evidência visual: [formulários publicados em staging](./evidencia-formularios-publicados-staging.png).

## Dependências remanescentes

1. autorização explícita de produção/go-live antes de qualquer promoção para o projeto produtivo;
2. conclusão e evidência do período de estabilidade exigido pelo Gate G9.

A primeira dependência não impede a execução da Fase 9 em local/staging. A segunda impede declarar o Gate G9 aprovado enquanto a janela de estabilidade não estiver objetivamente concluída.

Relatório consolidado: [canary, backup/restore e entrega de e-mail](./RELATORIO_CANARY_STAGING_2026-08-30.md).
