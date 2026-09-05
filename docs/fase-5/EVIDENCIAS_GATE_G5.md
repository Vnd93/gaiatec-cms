# Gate G5 — decisão formal

**Decisão: BLOQUEADO**

Data: 2026-08-29.

## Critérios

| Critério do planejamento                | Evidência                                                                                                                                    | Decisão             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| lotes do escopo cadastrados e aprovados | somente o lote GATFLOW da F4 existe; a retomada identificou candidatos documentais, ainda sem correspondência e aprovação nominal dos owners | bloqueia            |
| nenhuma fonte editorial atual conectada | migration vazia, sem import, seed, planilha, scraper, coleção legada ou API antiga                                                           | atende              |
| busca usa apenas projeção nova          | `cms-public` lê somente `cms_published_projection`; teste estrutural e remoto aprovados                                                      | atende              |
| relações sem órfãos                     | guard transacional rejeita alvo não publicado; auditoria final sem fixture ou uso órfão                                                      | atende tecnicamente |
| imagens com origem/ALT                  | GATFLOW preserva origem/direitos/ALT; os PNG candidatos F5 ainda não têm origem, direitos, correspondência e ALT aprovados                   | bloqueia o lote     |
| páginas completas, sem placeholders     | templates e estados estão completos, mas não há páginas reais dos novos lotes; listas permanecem vazias e noindex                            | bloqueia            |

## Causas do bloqueio

1. ausência dos lotes priorizados reais de produtos, serviços, indústrias, aplicações, soluções e detecção de gases;
2. fontes potenciais foram inventariadas read-only, mas ainda não têm autenticidade, correspondência e uso editorial autorizados nominalmente por arquivo;
3. imagens candidatas sem origem, direitos, correspondência física e ALT aprovados;
4. ausência das aprovações comercial, técnica, editorial e do owner aplicáveis.

Esses itens não podem ser substituídos por fixtures, conteúdo inventado ou material do site/painel antigo. O objetivo declarado é que o solicitante faça os cadastros definitivos no `/admin`.

## Retomada read-only de 2026-08-29

A pasta nova autorizada `Soluções\1. Instrumentos de Medição` foi inventariada sem cópia, importação ou alteração de staging. Entre 109 arquivos, a triagem identificou quatro candidatos com PDF e mídia local para diligência dos owners. O artefato `PROPOSTA_LOTE_MINIMO_G5_INSTRUMENTOS_MEDICAO.md` registra hashes, lacunas e a checklist nominal. A autorização da pasta para inventário não foi interpretada como autorização editorial ou de publicação.

Nenhum candidato foi cadastrado porque a associação entre modelo comercial e referência do fabricante ainda não foi confirmada, os direitos dos PDFs e das imagens não foram declarados e as configurações técnicas vendidas não foram selecionadas. O lote GATFLOW homologado permaneceu intocado.

## Condição objetiva para reavaliar

Responder nominalmente à checklist de `PROPOSTA_LOTE_MINIMO_G5_INSTRUMENTOS_MEDICAO.md`; então cadastrar pelo novo `/admin`, revisar e publicar os lotes reais autorizados; confirmar proveniência e ALT; aprovar owners; executar amostragem de completude, relações e consultas técnicas; remover qualquer fixture; repetir auditoria de resíduos e validação UX autenticada. Somente então o Gate G5 pode ser reavaliado.

## Limites

- Gate G5 não aprovado;
- nenhuma aprovação editorial presumida;
- produção e `main` não tocadas;
- nenhum avanço à Fase 6.
