# Modelo e contrato do produto piloto

## Fonte única

O rascunho/revisão versionado em `cms_content_*` é a fonte editorial. Ao publicar, a mesma revisão gera `cms_published_projection` e as projeções derivadas `cms_product_*`; lista, detalhe, cards, filtros, comparação, busca e SEO não consultam arrays nem tabelas anteriores.

## Modelo

- identificação imutável e slug novo;
- marca comercial, fabricante/OEM nominal e linha como conceitos independentes;
- um ou mais modelos e variantes, separando nome/modelo comercial GAIATEC da referência/modelo do fabricante, com SKU/código novo;
- segmento → categoria → subcategoria opcional → família;
- atributos `text`, `number`, `boolean`, `enum` e `range`, com unidade e flags de filtro/comparação/busca;
- mídia aprovada da biblioteca nova e documentos com URL oficial ou caminho privado, revisão, idioma, hash e direito de uso;
- relações por UUID novo com produto, aplicação, setor e serviço;
- sinônimos e palavras-chave governados;
- SEO, canonical e redirects sem cadeia implícita;
- proveniência e aprovação separadas, incluindo owner do portfólio.

## Bloqueios técnicos

- produto indexável exige estado `homologated` e data de homologação;
- relação com produto não publicado é negada;
- fonte externa exige URL oficial ou caminho autorizado e SHA-256;
- proveniência persiste data do arquivo, referência/data da autorização e escopo dos direitos;
- documento privado exige objeto existente no bucket antes da publicação;
- direitos não confirmados invalidam o payload;
- capacidade ou bloco sem renderer impede publicação;
- RLS/RBAC e comandos específicos continuam sendo a fronteira de autorização.

## Consumer ID

`cms.catalog-product.v1` usa renderer público e de preview `catalog-product` nas rotas `/produtos`, `/produtos/:slug`, `/produtos/comparador` e `/busca`, além do sitemap de produtos.

## Fechamento da identidade do piloto

- marca comercial: `GATFLOW`;
- nome/modelo comercial GAIATEC: `GATFLOW-B`;
- referência/modelo do fabricante: `KF700E`;
- fabricante/OEM nominal: editável e `a confirmar` até existir evidência documental conclusiva.

A migration `0024_fase4_product_identity_and_roundtrip.sql` projeta esses conceitos em colunas distintas e completa as flags `required` dos atributos e `storage_path` dos documentos. O editor mantém campos explícitos para a identidade e JSON governado para as coleções completas, sem perda no round-trip. A matriz integral está em `AUDITORIA_CAMPO_CONSUMIDOR.md`.
