# Fase 1 — contenção de riscos P0

Data da verificação: 2026-08-28 (America/Sao_Paulo)

Branch autorizada: `Remodelagem`

Baseline aprovado (Gate G0): `1a4d635b70fe763aeed851514a8fc03ba0f7012c`

Escopo: exclusivamente a Fase 1 do planejamento executivo.

## Resultado executivo

As contenções P0 de RDO, site e formulários foram aplicadas e testadas no projeto exclusivo de staging `glcqsosxwgmlhzgcsnzv` (`GAIATEC CMS Staging`, `us-east-2`). O PDF canônico de assinaturas desenhadas agora é gerado e selado server-side, armazenado em bucket privado e verificado por SHA-256.

Todos os seis critérios do Gate G1 têm evidência verde. O aceite jurídico-negocial humano exigido pela ADR-010 foi formalmente concedido pelo Administrador da GAIATEC SISTEMAS, sob sua responsabilidade, e registrado com trilha de auditoria. O Gate G1 está **APROVADO** em 2026-08-28.

Nenhum produto, serviço, texto editorial, imagem, mídia ou cadastro atual foi importado, copiado ou adaptado. Somente dados sintéticos descartáveis foram usados e todos os contadores retornaram a zero. Produção não foi consultada ou modificada. O PAT foi usado apenas em memória para o ref exato de staging; nenhum segredo foi impresso ou versionado.

## Evidências

- [Matriz de contenção P0](./MATRIZ_CONTENCAO_P0.md)
- [Validação técnica e de staging](./VALIDACAO_TECNICA_STAGING.md)
- [Runbook de aplicação no Supabase de staging](./RUNBOOK_APLICACAO_SUPABASE.md)
- [Aceite jurídico-negocial da ADR-010](./ACEITE_JURIDICO_NEGOCIAL_ADR010.md)
- [Avaliação formal do Gate G1](./AVALIACAO_GATE_G1.md)
- [Evidência do Supabase staging](./EVIDENCIA_SUPABASE_STAGING.md)

## Alterações locais preexistentes

As mudanças já existentes e ainda não commitadas em `ContactSection.tsx`, `Footer.tsx` e `src/lib/supabase.ts` foram preservadas. A contenção da Fase 1 foi integrada sobre elas sem reintroduzir URL/chave Supabase hardcoded e sem descarte silencioso.

## Limites da entrega

- o painel administrativo antigo não foi reutilizado;
- a API/CMS legado permanece desabilitada e protegida por teste de regressão;
- nenhum trabalho da Fase 2 foi iniciado;
- a aprovação do Gate G1 encerra somente a Fase 1 e não constitui, neste registro, autorização para iniciar a Fase 2;
- o deployment de frontend é staging e recebe `X-Robots-Tag: noindex, nofollow, noarchive` em todas as rotas.
- Resend e Turnstile não receberam credenciais de produção; a ausência foi validada em modo fail-closed e registrada como limitação operacional de staging.
