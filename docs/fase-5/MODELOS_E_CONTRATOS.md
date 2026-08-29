# Modelos e contratos da Fase 5

## Regra comum

Serviço, indústria, aplicação e solução usam payload JSON versionado como fonte editorial única. Cada payload declara `schemaVersion`, `consumerId`, `contentType`, título, resumo, blocos, SEO, proveniência, estado de governança, busca, aprovação, mídia, relações e CTA. O banco deriva somente projeções de leitura; não existe uma segunda fonte editável.

Estados permitidos: `synthetic_test`, `awaiting_owner` e `homologated`. Conteúdo indexável exige homologação e data de homologação. As relações de uma publicação só aceitam UUIDs que já estejam na projeção publicada do tipo esperado.

## Domínios

| Domínio   | Contrato             | Campos específicos                                                         | Consumidores                                          |
| --------- | -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Serviço   | `cms.service.v1`     | categoria, escopo, quando contratar, entregáveis, pré-requisitos e etapas  | editor, preview, lista, detalhe, busca e diagnósticos |
| Indústria | `cms.industry.v1`    | mercado, desafios, evidências e áreas de processo                          | editor, preview, lista, detalhe, busca e diagnósticos |
| Aplicação | `cms.application.v1` | processo, problema, benefícios e pontos de aplicação tipados               | editor, preview, lista, detalhe, busca e diagnósticos |
| Solução   | `cms.solution.v1`    | problema, abordagem, benefícios, componentes e modelo de detecção de gases | editor, preview, lista, detalhe, busca e diagnósticos |

## Persistência, acesso e publicação

A migration `0025` amplia os tipos de conteúdo, registra capabilities/renderers, cria permissões `read/edit/approve/publish` por domínio e atribui papéis editor, técnico, marketing, comercial, revisor, admin e super admin conforme segregação de função. As tabelas novas têm RLS habilitada; escrita ocorre por funções autorizadas e `service_role`, nunca pelo cliente anônimo.

O ciclo provado foi:

`create → save com lock otimista → submit → approve por revisor → preview no-store → publish → projeção pública`.

A função `cms_validate_f5_publication` bloqueia publicação indexável não homologada, homologação sem data e relações órfãs. A função `cms_sync_discovery_media_usage` exige ativo pronto e direitos confirmados antes de registrar uso.

## Busca e monitoramento

`cms-public` consulta exclusivamente `cms_published_projection`. A normalização cobre acentos, hífens, subscrito de fórmulas, DN e `4-20 mA`; sinônimos são registros governados em `cms_search_synonyms`. Consultas e autocomplete produzem apenas analytics anônimos com consulta normalizada, contagem, tipos e refinamentos. A página administrativa de busca mostra zero resultado; diagnósticos mostram a contagem publicada de cada domínio.
