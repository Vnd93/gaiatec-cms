# Plano de contenção dos riscos críticos do RDO

**Status:** plano F0; execução pertence à Fase 1

| Risco | Contenção obrigatória | Evidência de saída | Owner funcional |
|---|---|---|---|
| OTP cria usuário para e-mail arbitrário | convite/allowlist, usuário ativo, rate limit e enumeração bloqueada | E2E de usuário não convidado negado | Segurança + RDO |
| Papel global `admin/membro` | escopos independentes `rdo:*` e `cms:*` | matriz e testes negativos | Tech Lead |
| Relatório assinado editável/reabrível/excluível | snapshot imutável; correção cria nova versão; sem hard delete | testes DB/API/UI negando mutação | Responsável RDO |
| Bucket público de fotos | bucket privado, RLS e URL assinada curta | acesso anônimo negado | Backend/Segurança |
| Notificação confia no cliente | receber apenas `report_id`/ação e derivar conteúdo/destino no servidor | contrato e teste de payload adulterado | Backend |
| Assinatura sem trilha suficiente | token único/expirável, idempotência, hash e evidências | teste de concorrência e consumo único | RDO/Jurídico |
| Hard delete de usuário | suspensão e revogação preservando autoria | autoria permanece consultável | PO/RDO |
| Privacidade/retencão indefinidas | política jurídica e LGPD por dado | aprovação nominal e runbook | Jurídico/LGPD |

## Sequência segura

1. Reproduzir em staging com dados sintéticos.
2. Criar migrations compatíveis e testes falhando.
3. Aplicar RLS/RBAC default-deny.
4. Alterar funções server-side e clientes.
5. Executar testes de autorização, concorrência, privacidade e E2E.
6. Ensaiar rollback/roll-forward.
7. Liberar apenas após Gate G1.

Nenhuma credencial ou dado real do RDO será usado em local/CI.
