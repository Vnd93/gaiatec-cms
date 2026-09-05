# Gate G4 — PIM íntegro e compatível com v1

**Resultado atual:** G4 APROVADO — canary técnico e piloto operacional concluídos; EV2.5 LIBERADA<br>
**Produção:** bloqueada<br>
**Staging EV2.4:** piloto real concluído; funções ativas, dados privados preservados, flags desligadas e build restrito ao alias isolado

## Evidências disponíveis no branch

| Critério                    | Situação            | Evidência                                                             |
| --------------------------- | ------------------- | --------------------------------------------------------------------- |
| Schema aditivo/RLS          | aprovado em staging | migrations `0041` e corretiva fail-closed `0042`                      |
| Contratos/API               | aprovado em staging | `cms-pim` v2 e `cms-attributes` v1, ambos com JWT                     |
| Editor guiado               | aprovado no canary  | SHA `a0d185a`, alias `ev2-g4-canary`; staging estável não substituído |
| Identidade/SKU              | aprovado no canary  | geração, formato, imutabilidade lógica, idempotência e histórico      |
| Atributos/unidades          | aprovado no canary  | attribute set obrigatório e conversão 10 L/s → 36 m³/h                |
| Adapter v1                  | aprovado no canary  | projeção reconciliada sem alertas                                     |
| Concorrência/recuperação    | aprovado no canary  | update obsoleto HTTP 409 imediato com conteúdo preservado             |
| Segurança/rollback          | aprovado no canary  | RLS 401, produção 403, kill switch individual e flags globais off     |
| Limpeza                     | aprovada            | 32/32; zero resíduos em 20 escopos e reconciliação global             |
| Banco integrado             | aprovado na CI      | 220/220 pgTAP; 35 asserções específicas da EV2.4                      |
| Qualidade/navegador         | aprovado na CI      | 112 Vitest, check, 32 Playwright e preview                            |
| Lote real/decisões de fonte | aprovado            | 20 rascunhos; MPN/fabricante, GS1/ERP, ERP/fiscal e SKU/CMS definidos |
| Completude/round-trip       | aprovado            | 97/100 campos críticos; 20/20 grafos; zero divergência crítica        |
| Idempotência/rollback       | aprovado            | repetição criou 0 registros; operador suspenso e overrides desligados |
| Entrega final               | aprovada            | SHA `25a17de`; três checks remotos verdes e canary `53a0a000`         |

## Critérios objetivos para aprovação

- CI completa verde, incluindo as 35 asserções pgTAP da EV2.4.
- Canary sintético isolado em staging com migration `0041`, duas funções e build candidato explicitamente habilitado.
- Limpeza comprovada do usuário, override, produtos, modelos, variantes, SKUs, atributos e proveniência sintéticos.
- Fontes ERP/MPN/GTIN/NCM e regra de SKU aprovadas pelos responsáveis.
- Lote de 20–50 produtos previamente autorizado, sem inferência silenciosa.
- 100% dos campos críticos do round-trip sem divergência e completude mínima de 95% no piloto.
- Busca por faixa demonstra conversão de unidade e interseção correta.
- Rollback lógico testado com v1 operacional e v2 inerte.

## Evidência do canary controlado — 2 de setembro de 2026

- Alvo validado por ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging` e região `us-east-2`.
- Migration remota avançada de `0040` para `0041` e, após diagnóstico, para a corretiva `0042`; nenhuma migration de produção foi executada.
- `cms-pim` v2 e `cms-attributes` v1 estão ativas com JWT obrigatório; `cms-master-data` v1 foi apenas consumida como dependência existente.
- Build final do SHA `a0d185a14557ec52755d61feb43cc1a06564c6cb`, manifesto `6d99027a6ba9d7d996689128944798ae78130ae539a660fa412d386f41a5a250`, deployment `d64bde2f` e alias isolado `ev2-g4-canary`.
- O primeiro ensaio encontrou retry indevido de conflito pelo SQLSTATE `40001`; a migration `0042` alterou somente os dois erros de domínio para `P0001`, preservando a `0041` imutável.
- O segundo ensaio comprovou a resposta imediata, mas encontrou mapeamento HTTP 500 do objeto RPC; `cms-pim` v2 passou a preservar `message` e `code` e devolver HTTP 409.
- O ensaio final aprovou 32/32 verificações, inclusive grafo normalizado, busca sem acento, conversão de unidade, SKU, replay, adapter v1, concorrência, RLS, produção, kill switch e flag global.
- As três execuções utilizaram somente usuários e dados sintéticos descartáveis; todas terminaram com limpeza verificada. A reconciliação global final encontrou zero usuário, override, entidade mestre, produto, identificador, atributo ou proveniência G4.
- `ev2.pim_v2` e `ev2.master_data` permanecem `default_enabled=false`, `kill_switch=false` e sem override G4. O staging estável `868f4382` não foi promovido nem substituído.

## Estado e decisão

O canary técnico do G4 está aprovado. As execuções de sua base — [CI do push `33681484930`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681484930), [CI do PR `33681491734`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681491734) e [Preview `33681491801`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681491801) — foram aprovadas no SHA `a0d185a`.

Em 2 de setembro de 2026, o solicitante confirmou o lote, OP-01/REV-01 e a hierarquia de fontes. O dry-run e a carga real em staging criaram 20 rascunhos, 20 modelos, 18 SKUs, 45 entidades e 37 compatibilidades. A reconciliação foi 20/20, com 97% de completude crítica e zero divergência no adapter; a repetição idempotente criou zero registro adicional. A busca `0,1–0,3 g/L` → `100–300 mg/L` retornou somente `GAI-0007`.

`GAI-0691` e `GAI-0696` continuam bloqueados pela inversão documental e sem SKU; `GAI-1130` permanece incompleto pelo fabricante desconhecido. As duas faixas documentais não estão homologadas e não alimentam facetas públicas. O rollback lógico preservou dados/eventos, suspendeu e baniu o operador técnico, removeu o papel e desligou os overrides. Os quatro conteúdos v1 não foram alterados.

Com essas contenções, G4 está aprovado e EV2.5 pode iniciar. Dual-write, publicação do lote, produção, merge em `main`, promoção do staging estável e qualquer inferência dos campos ausentes continuam bloqueados. Consulte o [relatório do piloto operacional](RELATORIO_PILOTO_OPERACIONAL_STAGING_2026-09-02.md).

A entrega consolidada no SHA `25a17de38b14727e704bd8fc732b40928bd0b1a1` também concluiu com [CI do push `33690367157`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690367157), [CI do PR `33690371278`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690371278) e [Preview `33690371305`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690371305) aprovados. O build PIM candidato, manifesto `ff354559eb1729861301639f2aa1cc5f10eba6d0e7291020679e52a39ef1f929`, foi publicado somente no deployment `53a0a000` e no alias isolado `ev2-g4-canary`; o smoke HTTP aprovou ambas as URLs.
