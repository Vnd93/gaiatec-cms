# Estratégia de testes — Fase 2

## Pirâmide e comandos

| Camada              | Escopo                                                     | Comando                                   |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Unitário            | redaction, correlação, métricas                            | `npm run test:unit`                       |
| Contrato/schema     | envelopes de API, publicação, fila e erro de frontend      | `npm run test`                            |
| Componente          | metadados de erro e ausência de PII                        | `npm run test`                            |
| Integração estática | migrações, RLS, limites de módulos, seed sintético, Worker | `npm run test:integration`                |
| RLS real            | permissões positivas e negativas em Postgres efêmero       | `npm run test:rls`                        |
| E2E                 | rotas, navegação, responsividade, console e regressão      | `npm run test:e2e`                        |
| Acessibilidade      | Axe + interações práticas com teclado e mobile             | `npm run test:a11y` e inspeção no staging |
| Smoke HTTP          | status, `noindex`, cache privado e cabeçalhos              | `npm run smoke:http -- <URL>`             |

## Matriz negativa mínima

- usuário sem escopo RDO não lê linhas e não forja ownership;
- outro membro não lê relatório do proprietário;
- proprietário não altera nem exclui relatório finalizado;
- buckets RDO permanecem privados;
- rotas privadas recusam cache compartilhado;
- logs descartam chaves e valores sensíveis;
- preview rejeita indexação por header e meta tag;
- console do navegador não contém erro nas rotas críticas.

## Critérios

Falha de teste, migração ou build bloqueia entrega. Warnings legados de lint são aceitos temporariamente apenas porque o escopo estrito novo permanece com zero erro; a contagem não pode crescer sem justificativa. O teste automatizado de contraste é complementado por inspeção visual porque a aplicação legada contém combinações dinâmicas que precisam de contexto, mas violações sérias/críticas de Axe continuam bloqueantes.
