# Fase 7 — conteúdo, marketing e leads

**Data:** 2026-08-29

**Branch:** `Remodelagem`

**Base autorizada:** `aab55f7`
**Status:** implementação e validação local; Gate G7 pendente de autenticação e homologação Supabase

## Resultado local

A Fase 7 implementa uma vertical limpa para blog, campanhas, landing pages, formulários versionados e leads. A migration cria somente estrutura e capacidades; não cadastra nem importa artigos, campanhas, formulários, leads, produtos, serviços, páginas, menus, contatos ou mídia.

- blog com autoria e taxonomia estruturadas, relações, agendamento, `Article` JSON-LD e sitemap;
- campanhas com templates fechados, blocos, período, posicionamento contextual, prioridade, formulário fixado por versão, tracking somente após consentimento e expiração por redirect, fallback, 404 ou 410;
- formulários imutáveis por versão, consentimento, SLA e retenção;
- leads com origem, UTM, produto/campanha, responsável, histórico, outbox, exportação auditada, anonimização e retenção;
- menus, contato, redes e CTA continuam no documento global único da Fase 6, agora mapeado como dependência explícita da Fase 7;
- frontend, preview, API pública e Worker conectados aos mesmos contratos.

## Documentos

- [Exceção para avanço com G6 pendente](./EXCECAO_AVANCO_COM_G6_PENDENTE.md)
- [Arquitetura e matriz de integração](./ARQUITETURA_E_MATRIZ_INTEGRACAO_F7.md)
- [Segurança, LGPD e operação](./SEGURANCA_LGPD_E_OPERACAO_F7.md)
- [Evidências técnicas](./EVIDENCIAS_TECNICAS_F7.md)
- [Validação UX/UI](./VALIDACAO_UX_UI_F7.md)
- [Gate G7](./EVIDENCIAS_GATE_G7.md)
- [Runbook de homologação](./RUNBOOK_HOMOLOGACAO_G7.md)

## Limite formal

Sem autenticação posterior no Supabase não é possível aplicar as migrations `0026` e `0027`, publicar as Edge Functions, testar RLS/RBAC com identidades reais nem comprovar o round-trip campanha → lead em staging. Não há evidência remota simulada. Produção e `main` permanecem intocadas.
