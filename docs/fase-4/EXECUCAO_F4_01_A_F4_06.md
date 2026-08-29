# Execução F4-01 a F4-06

Data: 2026-08-28 (America/Sao_Paulo)

Escopo executado: exclusivamente a Fase 4. A Fase 5 não foi iniciada.

## F4-01 — modelo vertical

- contrato `cms.catalog-product.v1` com produto, fabricante, linha, modelo, variante, classificação, conteúdo comercial, atributos tipados, mídia, documentos, relações, busca, redirects, SEO, proveniência e aprovação;
- migrations `0019` e `0020` aplicadas somente no Supabase staging `glcqsosxwgmlhzgcsnzv`, após dry-run;
- projeções normalizadas de produto, variante, atributo, documento, relação, termo de busca e redirect;
- guardas de publicação para homologação, relações publicadas, tipo de atributo e mídia pronta, limpa e com direitos confirmados;
- migrations não inserem produto, fabricante, taxonomia, mídia, documento ou redirect editorial.

## F4-02 — editor no novo `/admin`

- lista exclusiva em `/admin/produtos` com busca, status e estado vazio;
- editor em `/admin/produtos/novo` e `/admin/produtos/:id`;
- abas de identificação, classificação, conteúdo comercial, especificações, imagens, documentos, relações, busca, SEO, governança e histórico/publicação;
- ações criar, salvar com lock otimista, enviar à revisão, aprovar, emitir preview, publicar e restaurar revisão;
- validação Zod antes de persistir e RBAC específico `cms:products.approve`.

## F4-03 — recadastro piloto

Nenhum produto real foi recadastrado. Não há evidência versionada de fonte oficial nova escolhida e aceita nem homologação formal do owner do portfólio. Pela política clean-room, seria incorreto selecionar, copiar ou aprovar um produto por inferência.

O lote usado em testes foi estritamente sintético, criado registro a registro pelo script, marcado `synthetic_test`, não indexável e removido ao final. A imagem foi gerada por código durante o teste; nenhum arquivo editorial do site atual, banco antigo, painel antigo ou pasta externa foi consultado ou reutilizado.

## F4-04 — consumidores públicos

- `/produtos`: lista, cards, busca e facets;
- `/produtos/:slug`: detalhe, mídia privada por URL assinada, especificações, modelos/variantes, relações e documentos públicos;
- `/produtos/comparador`: comparação somente de atributos tipados marcados como comparáveis;
- `/busca`: busca por título, fabricante, linha, modelo, variante, classificação, função, tecnologia, sinônimos, palavras-chave e especificações;
- `/sitemap-produtos.xml`: inclui apenas produto homologado e indexável;
- canonical, robots e schema.org `Product` no detalhe;
- redirect editorial aplicado no edge; slug desconhecido retorna 404 real;
- todos os consumidores leem somente `cms_published_projection`.

## F4-05 — ciclo vertical

O script `scripts/phase4/remote-f4-tests.ps1` executou 36 checks aprovados no staging:

1. criou usuários sintéticos com papéis separados e negou identidade sem permissão;
2. gerou, enviou e processou mídia privada em original, WebP e AVIF;
3. criou dois produtos sintéticos, testou conflito otimista, revisão e aprovação;
4. emitiu preview privado fiel e `no-store`;
5. publicou e verificou detalhe, mídia, lista/facets, busca por sinônimo, comparador, redirect e exclusão do sitemap;
6. negou publicação indexável sem homologação do owner com HTTP 422;
7. publicou nova revisão e restaurou a primeira como versão 3;
8. confirmou projeções sem variante, atributo ou documento órfão;
9. removeu fixtures, usuários, mídia, objetos de storage, projeções e redirects.

Estado final consultado no banco: zero usuários Auth, itens editoriais, produtos publicados, mídias, objetos em `cms-media-private` e redirects.

## F4-06 — evidência e gate

As evidências de UX/UI estão em `VALIDACAO_UX_UI_F4.md`. A decisão do gate está em `EVIDENCIAS_GATE_G4.md`.
