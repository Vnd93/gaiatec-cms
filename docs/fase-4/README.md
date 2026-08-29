# Fase 4 — produto piloto vertical

**Branch exclusiva:** `Remodelagem`

**Base aprovada:** Gate G3 no commit `95a5a2ffe8608c620fc98aebcfaca8351c144c25`

**Alvo permitido:** Supabase staging `glcqsosxwgmlhzgcsnzv`

**Produção e `main`:** fora do escopo

## Escopo

- F4-01: contrato de produto, fabricante, linha, modelo/variante, atributos tipados, mídia, documentos, relações, busca, SEO, redirects e proveniência;
- F4-02: estrutura da taxonomia e regras de completude, sem inventar o workshop ou sua homologação;
- F4-03: editor completo no `/admin`;
- F4-04: recadastro manual clean-room do lote mínimo autorizado `PILOTO-VZ-ELETRO-01`;
- F4-05: lista, detalhe, cards, filtros, comparador, busca, relações, schema, canonical e sitemap derivados da projeção publicada;
- F4-06: fluxo vertical e casos negativos com fixtures sintéticas descartáveis.

## Regra de conteúdo

Nenhum dado, imagem, documento, taxonomia ou estrutura editorial do site, banco ou painel anterior foi consultado ou transformado em cadastro. Somente os três arquivos nominalmente autorizados foram usados no staging. Dados não sustentados permanecem `a confirmar`. O solicitante homologou funcionalmente o piloto e confirmou `GATFLOW` como marca, `GATFLOW-B` como modelo comercial e `KF700E` como referência do fabricante; isso não congela as especificações técnicas editáveis.

## Contingência G2

`npm run validate:local` permanece obrigatório. Esta fase não declara GitHub Actions, environments, branch protection, `main` ou produção verdes.

## Evidências

- `MODELO_E_CONTRATO.md`: contrato e projeções;
- `AUDITORIA_CAMPO_CONSUMIDOR.md`: cobertura integral sem campos órfãos ou perda silenciosa;
- `EVIDENCIA_FONTES_PILOTO_VZ_ELETRO_01.md`: caminhos, hashes, autorização, correspondência e extração manual;
- `RECADASTRO_PILOTO.md`: estado clean-room do lote;
- `EXECUCAO_F4_01_A_F4_06.md`: execução e ciclo remoto;
- `VALIDACAO_UX_UI_F4.md`: desktop/mobile, navegador e HTTP;
- `EVIDENCIAS_GATE_G4.md`: matriz de critérios e decisão explícita.

## Decisão

**Gate G4 aprovado em 2026-08-29.** O lote único permanece publicado somente no staging, homologado funcionalmente e não indexável. A Fase 5 não foi iniciada.
