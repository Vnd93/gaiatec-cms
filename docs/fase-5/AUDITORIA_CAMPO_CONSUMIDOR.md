# Auditoria campo → consumidor e round-trip

## Matriz comum

| Campo/coleção                 | Editor `/admin`                    | Preview                     | Projeção/API                             | Público                         | Busca/SEO                        | Teste                                         |
| ----------------------------- | ---------------------------------- | --------------------------- | ---------------------------------------- | ------------------------------- | -------------------------------- | --------------------------------------------- |
| identidade do contrato e tipo | JSON validado + campos explícitos  | seleciona renderer por tipo | schema/consumer/renderer preservados     | rota e template por domínio     | agrupamento por tipo             | contrato + round-trip remoto                  |
| título, resumo e blocos       | editáveis                          | renderizados                | preservados sem transformação destrutiva | hero, resumo e blocos           | nome/resumo pontuam              | testes de consumidor                          |
| governança e aprovação        | editáveis e workflow segregado     | badge/estado                | guard de homologação                     | estado visível quando aplicável | indexação só homologada          | publicação sintética não indexável            |
| SEO                           | JSON governado                     | `noindex/no-store`          | objeto preservado                        | title, canonical e robots       | listas vazias/erro noindex       | inspeção de staging                           |
| proveniência                  | JSON obrigatório                   | preservada                  | revisão imutável                         | não expõe fonte privada         | não altera score                 | parse estrito e round-trip                    |
| mídia                         | asset, papel, ALT, legenda e ordem | URL assinada                | uso sincronizado e rights guard          | imagem/legenda/ALT              | ALT não vira fonte editorial     | navegador: zero imagens sem ALT               |
| relações                      | arrays tipados por domínio         | renderizadas                | publicação rejeita órfãos                | seção de relações e links       | conteúdo relacionado pesquisável | guard remoto + auditoria zero órfão           |
| busca                         | sinônimos e palavras-chave         | preservada                  | índice somente da projeção publicada     | busca, autocomplete e grupos    | normalização e analytics zero    | consultas `KF700E`, `GATFLOW`, fixture e zero |
| CTA                           | rótulo e href                      | renderizado                 | payload preservado                       | link real                       | não cria página paralela         | teste de consumidor                           |

## Campos específicos

- Serviço: `serviceKind`, `scope`, `whenToHire`, `deliverables`, `prerequisites` e `executionSteps` são consumidos no detalhe e cobertos por teste.
- Indústria: `marketName`, `challenges`, `evidence` e `processAreas` são consumidos no detalhe e nos filtros/categoria.
- Aplicação: `process`, `problem`, `benefits` e cada campo de `points` são renderizados; IDs de produtos e serviços passam pelo guard de relação.
- Solução: `problem`, `approach`, `benefits`, `components` e `gasDetectionModel` são preservados; o último governa a integração ao catálogo mestre.

## Evidência de round-trip remoto

O script `scripts/phase5/remote-f5-tests.ps1` executou no staging os quatro domínios com payloads sintéticos v1/v2. Em cada domínio, o título v2 retornou idêntico no preview e no consumidor público depois de create/save/submit/approve/publish. O lock avançou de 1 para 2, o preview respondeu `no-store`, e publicação produziu `contentVersion=1`. Ao final, entidades, revisões, projeções, auditorias associadas e usuários sintéticos foram removidos.

O teste `tests/contracts/discovery-roundtrip.test.ts` impede perda silenciosa no parse/serialize. `tests/components/discovery-consumers.test.tsx` exige presença dos campos específicos no frontend. `scripts/phase5/catalog-discovery.test.mjs` protege rotas, fonte única, decisão de gases, monitoramento e semântica acessível do autocomplete.
