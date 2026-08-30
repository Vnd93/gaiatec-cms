# Runbook de homologação — Gate G7

Executar somente em Supabase de staging após concluir o runbook G6.

1. Confirmar projeto/branch de staging, backup e ausência de acesso à produção.
2. Aplicar migrations até `0027` e executar lint do banco.
3. Publicar `cms-content`, `cms-public`, `cms-preview`, `cms-leads`, `lead-capture` e `cms-outbox-worker`.
4. Configurar secrets listados em `SEGURANCA_LGPD_E_OPERACAO_F7.md` sem registrá-los em logs.
5. Criar identidades temporárias para admin, marketing, revisor e comercial; validar permissões positivas e negativas com AAL exigido.
6. Confirmar banco limpo: zero artigos, campanhas, formulários e leads importados.
7. Cadastrar manualmente um formulário sintético descartável, publicar a versão e confirmar imutabilidade.
8. Cadastrar artigo sintético; revisar, agendar, publicar, inspecionar Article schema/sitemap, restaurar e retirar.
9. Cadastrar campanha sintética com formulário e posicionamento; usar preview privado, agendar e publicar.
10. Aceitar cookies e confirmar evento de tracking; recusar e confirmar ausência do evento.
11. Enviar lead sintético; registrar correlation ID e verificar persistência antes da notificação, consentimento, UTM/origem, SLA e outbox.
12. Atribuir e alterar status como comercial; verificar histórico e notificação sem PII.
13. Exportar com justificativa e AAL; validar log de exportação e negação a perfil sem permissão.
14. Anonimizar um lead e executar retenção em fixture controlada; confirmar payload/UTM removidos e auditoria preservada.
15. Expirar campanha para redirect, fallback, 404 e 410; conferir HTTP no Worker e remoção do sitemap.
16. Validar desktop/mobile, teclado, Axe, contraste e overflow nas jornadas autenticadas e públicas.
17. Remover fixtures sintéticas conforme política e anexar resultados, IDs e screenshots ao Gate G7.

Falha em qualquer etapa mantém o gate bloqueado. Não executar contra produção.
