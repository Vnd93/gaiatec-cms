# Fase 6 — Remodelagem pública e site builder governado

**Data:** 2026-08-29  
**Branch:** `Remodelagem`  
**Status:** implementação local concluída; Gate G6 bloqueado para homologação remota

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

## Limite atual

A migration `0026_fase6_site_builder.sql` é inédita e não foi aplicada em staging porque não há `SUPABASE_ACCESS_TOKEN` disponível nesta sessão e a máquina não possui Docker/Podman para um banco local efêmero. Consequentemente, o código não foi implantado e o fluxo administrativo autenticado não foi executado contra o banco real.

Esse bloqueio não autoriza avançar ao Gate G7 nem publicar em produção. O código permanece preparado para a homologação assim que o acesso seguro ao staging for restabelecido.
