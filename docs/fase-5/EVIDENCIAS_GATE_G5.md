# Gate G5 — decisão formal

**Decisão: BLOQUEADO**

Data: 2026-08-29.

## Critérios

| Critério do planejamento                | Evidência                                                                                                         | Decisão             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- |
| lotes do escopo cadastrados e aprovados | somente o lote GATFLOW da F4 existe; não foram fornecidos lotes reais F5 nem aprovações de owners                 | bloqueia            |
| nenhuma fonte editorial atual conectada | migration vazia, sem import, seed, planilha, scraper, coleção legada ou API antiga                                | atende              |
| busca usa apenas projeção nova          | `cms-public` lê somente `cms_published_projection`; teste estrutural e remoto aprovados                           | atende              |
| relações sem órfãos                     | guard transacional rejeita alvo não publicado; auditoria final sem fixture ou uso órfão                           | atende tecnicamente |
| imagens com origem/ALT                  | GATFLOW preserva origem/direitos/ALT; não existem mídias F5 reais para aprovação                                  | bloqueia o lote     |
| páginas completas, sem placeholders     | templates e estados estão completos, mas não há páginas reais dos novos lotes; listas permanecem vazias e noindex | bloqueia            |

## Causas do bloqueio

1. ausência dos lotes priorizados reais de produtos, serviços, indústrias, aplicações, soluções e detecção de gases;
2. ausência de fontes oficiais novas explicitamente autorizadas para esses lotes;
3. ausência de mídias reais com origem, direitos e ALT;
4. ausência das aprovações comercial, técnica, editorial e do owner aplicáveis.

Esses itens não podem ser substituídos por fixtures, conteúdo inventado ou material do site/painel antigo. O objetivo declarado é que o solicitante faça os cadastros definitivos no `/admin`.

## Condição objetiva para reavaliar

Cadastrar pelo novo `/admin`, revisar e publicar os lotes reais autorizados; confirmar proveniência e ALT; aprovar owners; executar amostragem de completude, relações e consultas técnicas; remover qualquer fixture; repetir auditoria de resíduos e validação UX autenticada. Somente então o Gate G5 pode ser reavaliado.

## Limites

- Gate G5 não aprovado;
- nenhuma aprovação editorial presumida;
- produção e `main` não tocadas;
- nenhum avanço à Fase 6.
