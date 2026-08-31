# Gate G9 — evidências e decisão

**Data:** 2026-08-30

**Decisão:** **BLOQUEADO SOMENTE POR PRODUÇÃO E TEMPO REAL**
**Produção:** não autorizada, não acessada e não alterada

## Decisão objetiva

| Critério G9                                  | Evidência                                                                                              | Resultado               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| site e CMS usam somente contratos novos      | rotas clean-room e coleções são servidas por `cms-public`; imports anteriores removidos do grafo ativo | atende em local/staging |
| busca/sitemap usam somente projeção nova     | páginas/homepage foram incluídas na busca; sitemap contém 38 URLs novas e nenhuma `/setores/*`         | atende em staging       |
| nenhum consumidor consulta conteúdo anterior | guardas, inspeção de imports e bundle sem chunks editoriais anteriores                                 | atende em local/staging |
| nenhum usuário acessa administração paralela | `/admin` é o único CMS; RDO segregado por ADR                                                          | atende                  |
| período de estabilidade concluído            | exige go-live autorizado e 14 dias reais segundo a recomendação documentada                            | pendente                |

## Entrega clean-room

Foram publicadas por workflow governado 14 páginas CMS — homepage, Sobre, Contato, Política de Privacidade, Termos de Uso, oito páginas de Biodigestor e Detecção de Gás — além de seis indústrias substitutas. O texto é original, neutro e tecnicamente conservador; não foi obtido do site/painel anterior. As páginas legais usam dados administrativos já confirmados e estão marcadas para revisão final do DPO antes da produção.

Durante a publicação, duas validações de dependência impediram avanço prematuro: o formulário de Contato foi ajustado para a chave genérica aceita pelo contrato, e o hub Biodigestor foi publicado somente após suas subrotas. Itens de staging que ficaram em estados intermediários nunca publicados foram recuperados por nova revisão imutável e log explícito de auditoria; nenhum dado foi apagado.

## Evidências produzidas

- aceite F8/G8 registrado nos artefatos normativos;
- inventário completo em `INVENTARIO_CAMINHOS_LEGADOS_F9.md`;
- publicação e projeção em `RELATORIO_PUBLICACAO_CLEAN_ROOM_STAGING_F9.md`;
- redirects/404/410 em `MAPA_REDIRECTS_410_404_F9.md`;
- estabilidade e rollback em `RELATORIO_ESTABILIDADE_E_ROLLBACK_F9.md`;
- UX/UI em `VALIDACAO_UX_UI_F9.md`;
- guardas em `scripts/phase9/legacy-retirement.test.mjs` e E2E publicado.

## Resultado das validações

- `npm run check`: aprovado;
- formatter: aprovado;
- lint: zero erros e 45 warnings preexistentes;
- typecheck: aprovado;
- Vitest: 50 aprovados;
- guardas F9: 6 aprovados;
- build: aprovado, 3.389 módulos;
- Playwright staging: 38 aprovados, 2 skips, zero falha;
- HTTP staging: 15 rotas críticas 200, redirect 301 exato, ausência 404 real com `noindex`;
- busca: `biodigestor`, `privacidade`, `deteccao gases` e `telemetria` retornam as projeções novas;
- sitemap: 38 URLs, incluindo Biodigestor e Política de Privacidade, sem `/setores/*`;
- UX/UI: desktop, mobile, acessibilidade, teclado, console e evidências visuais aprovados;
- produção: não tocada; nenhum commit ou push realizado.

## Bloqueios verificáveis remanescentes

1. **Autorização explícita de go-live em produção**, incluindo revisão final DPO/legal como parte do sign-off pré-produção.
2. **Passagem real da janela de 14 dias pós-go-live** e comprovação dos limiares objetivos documentados.

Não existe impedimento técnico conhecido remanescente que possa ser resolvido com segurança apenas em local/staging. O Gate G9 não é declarado aprovado porque o critério temporal depende necessariamente de produção autorizada e tempo real.

## Adendo — consolidação final do CMS

A auditoria administrativa final está documentada em
`MATRIZ_FINAL_ROTAS_CMS.md` e `RELATORIO_FINAL_CMS_E_ENCERRAMENTO_F9.md`. Após a
consolidação, o resultado atualizado é:

- Vitest: 58 aprovados;
- fases 2–9: 55 aprovados, incluindo 9 guardas da Fase 9;
- E2E local: 32 aprovados e 8 skips exclusivos de staging;
- E2E staging somente leitura: 38 aprovados e 2 skips condicionais;
- smoke do Worker local: 6/6;
- formatter, TypeScript e build: aprovados;
- lint: zero erros e 45 warnings legados;
- RLS real não repetido neste host porque Docker/Postgres local está ausente; a Supabase CLI está disponível via `npx supabase` (2.116.0);
- editores autenticados dependem de conta de homologação por papel e MFA para inspeção
  visual completa em staging.

Assim, a recomendação consolidada é **aprovado com ressalvas para homologação autenticada;
go-live formal bloqueado**. A produção permanece intocada.
