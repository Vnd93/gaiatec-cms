# Fase 6 — Remodelagem pública e site builder governado

**Data:** 2026-08-29  
**Branch:** `Remodelagem`  
**Status:** implementação e homologação remota concluídas; Gate G6 aprovado em staging

## Resultado

A Fase 6 recebeu uma implementação vertical para administração de páginas, homepage, menus, configurações globais e destaques temporários. O painel usa campos e blocos estruturados; não expõe JSON, HTML, JavaScript ou CSS arbitrário ao editor. O frontend público consome a mesma projeção publicada e o mesmo renderer usado pelo preview.

Também foi consolidada a nova experiência da página de produtos em desktop e mobile, preservando os filtros e o único produto novo já homologado nas fases anteriores. Nenhum produto, serviço, página, imagem ou estrutura do painel antigo foi importado.

## Entregas

- 13 tipos de bloco governado, todos com contrato, editor e renderer;
- criação, edição, duplicação, reordenação, ocultação, preview, workflow, agendamento, retirada, histórico, restauração, lixeira e hard delete restrito;
- homepage única e páginas com rotas dinâmicas protegidas contra prefixos reservados e colisões;
- administração versionada de header, menu mobile, footer, contatos, redes, CTA e destaques;
- relações tipadas com produtos, serviços, indústrias, aplicações e soluções;
- mídia de blocos com origem no acervo novo, rights guard e ALT entregue ao renderer;
- retirada atômica com decisão explícita de redirect, `404` ou `410`;
- Worker Cloudflare com status HTTP reais e SEO de páginas CMS no HTML inicial;
- fallback público estrutural seguro quando ainda não existe documento novo publicado;
- página de produtos validada visualmente em `1440 × 900` e `390 × 844`;
- regra automática de contraste WCAG reativada e correções de contraste no footer, cookies e catálogo.

## Documentos

- [Modelo e integrações](./MODELO_SITE_BUILDER_E_INTEGRACOES.md)
- [Evidências técnicas](./EVIDENCIAS_TECNICAS_F6.md)
- [Validação UX/UI](./VALIDACAO_UX_UI_F6.md)
- [Gate G6](./EVIDENCIAS_GATE_G6.md)
- [Runbook de homologação](./RUNBOOK_HOMOLOGACAO_G6.md)

## Homologação remota

A migration `0026_fase6_site_builder.sql`, as Edge Functions e o frontend foram aplicados somente em staging. O Super Admin com MFA executou o round-trip real de página, incluindo preview, publicação, nova versão, restauração, retirada `404`, inspeção pública desktop/mobile e processamento integral da outbox. A decisão detalhada está em `EVIDENCIAS_GATE_G6.md`.

Produção e branch `main` permanecem intocadas. O Gate G6 aprovado não substitui os critérios próprios dos Gates G7 e G8.
