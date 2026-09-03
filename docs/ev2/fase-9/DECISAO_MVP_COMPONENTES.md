# EV2-D03 — componentes do MVP do Estúdio Visual

**Decisão:** resolvida para o candidato EV2.9<br>
**Quantidade:** 20 componentes exatos, todos na versão 1<br>
**Aprovadores funcionais:** UX/Marketing<br>
**Guardrails técnicos:** schema fechado, renderer compartilhado, design tokens e zero código arbitrário

## Catálogo aprovado

| Grupo     | Chave              | Finalidade principal                           |
| --------- | ------------------ | ---------------------------------------------- |
| Estrutura | `hero`             | abertura de página com título, apoio e ação    |
| Conteúdo  | `rich_text`        | texto editorial estruturado                    |
| Mídia     | `image`            | imagem única com ALT e metadados governados    |
| Mídia     | `gallery`          | coleção de imagens do DAM                      |
| Conteúdo  | `benefit_grid`     | benefícios ou diferenciais em grade            |
| Conteúdo  | `content_grid`     | cards de conteúdo relacionados                 |
| Conteúdo  | `steps`            | processo sequencial                            |
| Dados     | `metrics`          | indicadores e números-chave                    |
| Conteúdo  | `testimonial`      | depoimento com autoria                         |
| Conteúdo  | `faq`              | perguntas e respostas acessíveis               |
| Conversão | `form`             | formulário previamente cadastrado              |
| Conversão | `cta`              | chamada para ação                              |
| Conteúdo  | `related_content`  | navegação contextual para conteúdo relacionado |
| Estrutura | `split_content`    | composição de texto e mídia em duas áreas      |
| Mídia     | `logo_cloud`       | conjunto governado de marcas ou parceiros      |
| Conteúdo  | `tabs`             | conteúdo alternável com semântica acessível    |
| Dados     | `comparison_table` | comparação tabular responsiva                  |
| Conteúdo  | `alert`            | aviso informativo, de atenção ou crítico       |
| Conteúdo  | `timeline`         | marcos cronológicos                            |
| Conteúdo  | `link_list`        | lista de links internos ou externos validados  |

## Critérios usados

O conjunto cobre composição institucional, produto/serviço, prova social, dados técnicos, navegação e conversão sem criar um construtor de código. Cada componente possui versão, schema, renderer, valores iniciais e limites de instância/payload no registry. Layout, largura, tom, visibilidade e breakpoint são metadados do documento visual, não CSS fornecido pelo usuário.

O mesmo contrato é consumido pelo editor, pela API e pelo renderer público. Incompatibilidades futuras exigem nova versão e migração explícita; não há alteração silenciosa de schema.

## Fora do MVP

- HTML, CSS ou JavaScript arbitrário;
- iframe, `embed`, script de terceiros e handlers de evento;
- componente de vídeo remoto até existir política de privacidade, consentimento e desempenho;
- A/B testing e personalização;
- publicação direta pelo Estúdio;
- extensão de registry feita pelo navegador;
- componente sem suporte equivalente a desktop, tablet e mobile.

Esses itens somente podem entrar por decisão posterior, com threat model, orçamento de performance, requisitos de acessibilidade e gate próprios.
