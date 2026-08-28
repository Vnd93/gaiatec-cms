# Fase 1 — contenção de riscos P0

Data da verificação: 2026-08-28 (America/Sao_Paulo)

Branch autorizada: `Remodelagem`

Baseline aprovado (Gate G0): `1a4d635b70fe763aeed851514a8fc03ba0f7012c`

Escopo: exclusivamente a Fase 1 do planejamento executivo.

## Resultado executivo

O código de contenção P0 foi preparado para RDO, site e formulários, e o frontend foi publicado somente em staging. O Gate G1 permanece **BLOQUEADO**: não houve autorização/acesso ao projeto Supabase de staging para aplicar e testar a migração e as Edge Functions; a aprovação jurídico-negocial exigida pela ADR-010 não foi apresentada; e falta concluir a geração server-side do PDF canônico para assinaturas desenhadas.

Nenhum produto, serviço, texto editorial, imagem, mídia, cadastro ou estrutura atualmente cadastrada foi importado, copiado ou adaptado. Nenhuma submissão de formulário foi realizada. Produção não foi acessada ou modificada e nenhum segredo foi lido ou versionado.

## Evidências

- [Matriz de contenção P0](./MATRIZ_CONTENCAO_P0.md)
- [Validação técnica e de staging](./VALIDACAO_TECNICA_STAGING.md)
- [Runbook de aplicação no Supabase de staging](./RUNBOOK_APLICACAO_SUPABASE.md)
- [Avaliação formal do Gate G1](./AVALIACAO_GATE_G1.md)

## Alterações locais preexistentes

As mudanças já existentes e ainda não commitadas em `ContactSection.tsx`, `Footer.tsx` e `src/lib/supabase.ts` foram preservadas. A contenção da Fase 1 foi integrada sobre elas sem reintroduzir URL/chave Supabase hardcoded e sem descarte silencioso.

## Limites da entrega

- o painel administrativo antigo não foi reutilizado;
- a API/CMS legado permanece desabilitada e protegida por teste de regressão;
- nenhum trabalho da Fase 2 foi iniciado;
- o deployment de frontend é staging e recebe `X-Robots-Tag: noindex, nofollow, noarchive` em todas as rotas.
