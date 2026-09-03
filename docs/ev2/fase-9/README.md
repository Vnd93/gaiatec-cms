# EV2.9 — Estúdio Visual governado e preparação multisite

## Resultado de engenharia

A fase entrega o candidato local de F-011 e o recorte preparatório de F-012 de forma aditiva e `default-off`. O site principal e o renderer v1 permanecem como caminho operacional. Somente uma identidade com override individual válido, por no máximo 30 minutos e no mesmo ambiente, acessa as superfícies candidatas.

- registry fechado com 20 componentes versionados e propriedades tipadas;
- documento visual governado, sem HTML, CSS, JavaScript, iframe ou handlers arbitrários;
- canvas responsivo 12/8/4 com modo guiado e modo designer;
- camadas com drag-and-drop e alternativa equivalente por teclado;
- branch isolada, concorrência otimista, idempotência, undo/redo, símbolos e três snapshots por versão;
- aplicação somente em rascunho v1, sem revisão ou publicação automática;
- registro estrutural de sites, ambientes, temas, domínios e tokens preparado para isolamento;
- multisite operacionalmente bloqueado: apenas candidatos sintéticos `g9x-*`, ambientes travados e domínios `.invalid`;
- MFA/AAL2 para toda mutação visual ou de site;
- tabelas com RLS e privilégios exclusivos de `service_role`;
- ativação global, contexto ambíguo e produção falham de forma fechada.

## Componentes do MVP

A decisão EV2-D03 foi encerrada com 20 componentes exatos: `hero`, `rich_text`, `image`, `gallery`, `benefit_grid`, `content_grid`, `steps`, `metrics`, `testimonial`, `faq`, `form`, `cta`, `related_content`, `split_content`, `logo_cloud`, `tabs`, `comparison_table`, `alert`, `timeline` e `link_list`.

O catálogo detalhado, seus limites e as exclusões de segurança estão em [Decisão do MVP de componentes](DECISAO_MVP_COMPONENTES.md).

## Superfícies implementadas

| Camada          | Artefato                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| Dados/RLS       | `0048_ev2_visual_studio_multisite.sql`                                                        |
| APIs            | `supabase/functions/cms-visual/index.ts` e `supabase/functions/cms-sites/index.ts`            |
| Estúdio         | `/admin/estudio-visual/:itemId`, atrás do build candidato e da flag individual                |
| Sites           | `/admin/sites`, limitado a fixtures sintéticas, atrás do build candidato e da flag individual |
| Renderer        | componentes públicos compartilhados, preservando páginas v1 sem metadados visuais             |
| Contratos       | `src/shared/contracts/ev2-visual.ts` e extensão compatível de `cms-content.ts`                |
| Testes          | `npm run test:ev2:phase9`, Vitest, `supabase test db` e `npm run check`                       |
| Rehearsal       | `npm run canary:ev2:phase9:validate` — somente após autorização explícita de staging          |
| Canary          | `npm run canary:ev2:phase9` — somente após migration, funções e build do mesmo SHA em staging |
| Preview isolado | workflow `EV2.9 Canary Preview`, alias planejado `ev2-g9-canary` e SHA exato obrigatório      |

## Estado do Gate G9

O candidato concluiu a validação local de engenharia: `npm run check` aprovou formatação, tipos, lint sem erros, 145 testes Vitest, todas as suítes estáticas EV2.0–EV2.9 e Fases 1–11 e o build de produção. O Gate G9 permanece **PENDENTE** até que o mesmo SHA passe pela CI remota, rehearsal transacional, canary sintético de dois tenants e verificação operacional de acessibilidade, isolamento e compatibilidade v1 em staging.

Nenhuma migration ou função desta fase foi aplicada em staging, nenhuma flag foi habilitada, nenhum dado real foi criado e produção não foi alterada por esta implementação local.

Consulte o [contrato e modelo operacional](CONTRATO_E_OPERACAO.md), a [decisão do MVP](DECISAO_MVP_COMPONENTES.md), os [critérios do Gate G9](GATE_G9.md) e o [plano de canary](PLANO_CANARY_STAGING.md).
