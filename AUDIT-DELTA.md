# AUDIT-DELTA — Site Gaiatec V2

> Relatório gerado em 2026-05-06 (commit base `d39641d`).
> Aponta dívida técnica restante para guiar TASKs 2-29.

---

## 1A — Cor laranja antiga `#FF6A00` ainda presente

**33 arquivos** com referências a `#FF6A00` ou `rgb(255, 106, 0)`.

| # | Arquivo | Severidade |
|---|---------|------------|
| 1 | `src/app/components/BackToTop.tsx` | 🔴 Alto (visível na home) |
| 2 | `src/app/components/BlockRenderer.tsx` | 🔴 Alto (CMS blocks) |
| 3 | `src/app/components/CTABanner.tsx` | 🔴 Alto (homepage) |
| 4 | `src/app/components/ContactSection.tsx` | 🔴 Alto (form de contato) |
| 5 | `src/app/components/ContentSection.tsx` | 🔴 Alto (homepage Quem Somos) |
| 6 | `src/app/components/Footer.tsx` | 🔴 Alto (todas páginas) |
| 7 | `src/app/components/IndustriesCarousel.tsx` | 🔴 Alto (homepage) |
| 8 | `src/app/components/InnovativeSolutions.tsx` | 🔴 Alto (homepage) |
| 9 | `src/app/components/NewsSection.tsx` | 🟡 Médio (homepage) |
| 10 | `src/app/components/PageHero.tsx` | 🔴 Alto (todos heroes) |
| 11 | `src/app/components/PartnersLogos.tsx` | 🟡 Médio (homepage) |
| 12 | `src/app/components/ProductsGrid.tsx` | 🟡 Médio |
| 13 | `src/app/components/ScrollProgress.tsx` | 🟢 Baixo |
| 14 | `src/app/components/ScrollTextFill.tsx` | 🟢 Baixo |
| 15 | `src/app/components/SectionBlock.tsx` | 🟢 Baixo |
| 16 | `src/app/components/SliderModule.tsx` | 🟡 Médio |
| 17-25 | `src/app/pages/Biodigestor*.tsx` (8 páginas) | 🟡 Médio |
| 26 | `src/app/pages/BlogPage.tsx` | 🟢 Baixo |
| 27 | `src/app/pages/ContatoPage.tsx` | 🟡 Médio |
| 28 | `src/app/pages/NotFoundPage.tsx` | 🟢 Baixo |
| 29 | `src/app/pages/ProdutosPage.tsx` | 🔴 Alto |
| 30 | `src/app/pages/SectorPage.tsx` | 🔴 Alto |
| 31 | `src/app/pages/ServicoPage.tsx` | 🔴 Alto |
| 32 | `src/app/pages/ServicosPage.tsx` | 🔴 Alto |
| 33 | `src/app/pages/SetoresPage.tsx` | 🔴 Alto |
| 34 | `src/app/pages/SobrePage.tsx` | 🔴 Alto |

**Total estimado de ocorrências:** ~120 (concentrado em CTABanner, ContactSection, BlockRenderer)

**Estratégia recomendada:** sed global `FF6A00` → `0057DE` + `255, 106, 0` → `0, 87, 222`, depois revisão manual de hovers críticos.

---

## 1B — Backgrounds escuros (`bg-black`, `bg-zinc-9*`, `bg-neutral-9*`)

**17 arquivos** ainda com `bg-black`. Filtrados (componentes UI Radix mantém em modais — esperado):

### 🔴 Componentes principais (substituir):
- `src/app/components/CTABanner.tsx` — banner final da home (gradient brand recomendado)
- `src/app/components/ContactSection.tsx` — coluna direita preta (manter ou trocar pelo brand)
- `src/app/components/Footer.tsx` — `<footer className="bg-black">` (manter pois textos são brancos)
- `src/app/components/BackToTop.tsx` — `hover:bg-black` (substituir por hover:bg-brand-hover)
- `src/app/components/BlockRenderer.tsx` — `bg-black/70` em legendas de imagem

### 🟡 Hero pages (7 páginas servicos/*):
Todas com `<section className="relative h-[500px] bg-black overflow-hidden">`:
- `GasesOdorantesPage`, `InspecaoRevestimentoPage`, `InstrumentacaoIndustrialPage`
- `LocalizacaoTubulacaoPage`, `MedicaoPage`, `ProtecaoCatodicaPage`, `VazamentoAguaPage`

> Nota: Esses heroes usam imagem de fundo com overlay escuro. A TASK 6 propõe **trocar overlay escuro por overlay branco translúcido** — então `bg-black` daqui some naturalmente.

### 🟢 Manter (esperado):
- `ui/alert-dialog.tsx`, `ui/dialog.tsx`, `ui/drawer.tsx`, `ui/sheet.tsx` — overlays de modais (Radix padrão)
- `pages/NotFoundPage.tsx` — 404 dark é ok

---

## 2 — Acentos faltando

**3 arquivos**, **18 ocorrências**:

### `src/app/pages/ProdutosPage.tsx` (16 ocorrências — CRÍTICO)

```ts
// Linhas 33, 55, 77        → "MEDICAO DE VAZAO" → "MEDIÇÃO DE VAZÃO"
// Linha 99                 → "MEDICAO DE NIVEL" → "MEDIÇÃO DE NÍVEL"
// Linha 121                → "MEDICAO DE PRESSAO" → "MEDIÇÃO DE PRESSÃO"
// Linha 165                → "DETECCAO DE GAS" → "DETECÇÃO DE GÁS"
// Linhas 187, 319          → "PROTECAO CATODICA" → "PROTEÇÃO CATÓDICA"
// Linhas 209, 231          → "BIOGAS E BIOMETANO" → "BIOGÁS E BIOMETANO"
// Linhas 297, 385          → "AUTOMACAO" → "AUTOMAÇÃO"

// MAPA de exibição (linhas 423-433):
// "Medicao de Vazao", "Medicao de Nivel", "Medicao de Pressao",
// "Biogas e Biometano", "Protecao Catodica", "Automacao", "Deteccao de Gas"
// → todos com acento

// Linha 912: comentário "{/* TIPO DE MEDICAO */}" → "{/* TIPO DE MEDIÇÃO */}"
```

### `src/app/pages/BiodigestorAutomacao.tsx` (1)
- Linha 99: `AUTOMACAO E CONTROLE` → `AUTOMAÇÃO E CONTROLE`

### `src/app/pages/BiodigestorBiogasBiometano.tsx` (1)
- Linha 86: `BIOGAS X BIOMETANO` → `BIOGÁS X BIOMETANO`

> ✅ `MISSAO`, `VISAO`, `CALIBRACAO`, `INSPECAO` — **zero ocorrências sem acento** (já corrigidas).

---

## 3 — Componentes/páginas pendentes (esperado)

7 arquivos novos a criar nas TASKs 5, 10, 11, 13, 14, 19:

| Arquivo | TASK |
|---------|------|
| `src/app/components/sobre/Timeline.tsx` | 19 |
| `src/app/pages/AplicacoesPage.tsx` | 10 |
| `src/app/pages/AplicacaoPage.tsx` | 11 |
| `src/app/components/header/MegaMenuPanel.tsx` | 5 |
| `src/app/components/produtos/FiltrosHierarquicos.tsx` | 12 |
| `src/app/components/produtos/FiltrosTecnicos.tsx` | 13 |
| `src/app/components/produtos/ComparadorContext.tsx` | 14 |

---

## 4 — Ações sugeridas (próximas TASKs)

| TASK | Escopo | Estimativa |
|------|--------|-----------|
| **2** | Migrar `#FF6A00` → `#0057DE` + `bg-black` críticos → gradient brand | 30-45 min |
| **3** | Sed nos 18 acentos faltando | 10-15 min |
| **4** | Renomear "Setores" → "Indústrias" + "Saneamento" → "Saneamento / Líquido" | 20-30 min |

**Total quick wins:** ~1h30. Após isso, o site fica visualmente coerente com o tema azul V2.

---

## 5 — Notas para outras TASKs

- **Heroes únicos (TASK 6):** páginas `servicos/*Page.tsx` perdem `bg-black` automaticamente quando trocarmos imagem + overlay branco
- **Mega menu (TASK 5):** Header.tsx atual é base sólida — `useMenu` + estrutura hierárquica já existem, só falta o painel visual
- **Aplicações (TASKs 10-11):** repo dzsystem precisa criar tabela `aplicacoes_site` ANTES (não bloqueante — pode usar fallback hardcoded)
- **Timeline (TASK 19):** já existe `BlockRenderer` com Timeline component (linhas 305-315) — pode ser ponto de partida ou referência

---

**Build status atual:** ✅ Verde (último build local em 5.84s, deploy CF Pages OK)
**Cobertura V2:** ~30% (cores parcialmente migradas, estrutura preparada, conteúdo principal pendente)
