# ADR-012 — campos internos e cadastro em massa governado

**Status:** aceito em 2026-08-29
**Decisor:** administrador da GAIATEC SISTEMAS

## Contexto

O administrador precisa manter informações úteis à operação no CMS sem divulgá-las no site. Fabricante/OEM, referência do fabricante e SKU são exemplos iniciais. Também é necessário cadastrar grande quantidade de conteúdo novo com uma planilha padronizada, sem reutilizar o painel anterior nem importar os produtos, serviços, imagens ou estruturas nele cadastrados.

## Decisão

1. O contrato editorial de produto registra, em allowlist fechada, a visibilidade `public` ou `internal` dos campos suportados.
2. Fabricante/OEM, referência do fabricante e SKU começam como `internal`.
3. Campo interno permanece disponível a usuários autorizados no CMS, mas é removido no servidor antes da resposta pública. Ele não participa de cards, detalhe, filtros, busca, sitemap nem JSON-LD.
4. A projeção editorial completa e as projeções técnicas deixam de ser consultáveis por `anon`. O site público consome somente a função `cms-public`, que aplica a sanitização.
5. A planilha em massa é vazia, versionada e exclusiva para cadastros novos. Exportações do site/painel anterior são proibidas.
6. O fluxo aceita `.xlsx`, no máximo 5 MB e 500 produtos. Fórmulas, macros, `.xls` e `.xlsm` são recusados.
7. O lote passa por validação local e dry-run autenticado no servidor. A gravação é transacional e idempotente: qualquer erro cancela todo o lote.
8. A importação cria somente rascunhos `awaiting_owner`, não indexáveis e sem publicação automática.
9. Imagens e documentos não entram pelo lote. Eles seguem a biblioteca privada, com origem, licença/direitos, ALT, hash, revisão e aprovação.
10. Validação e criação geram auditoria e correlation ID. RBAC, MFA e RLS continuam obrigatórios.

## Relação com a política clean-room

A proibição de automação na carga inicial continua válida para conteúdo legado. Esta decisão permite automação apenas para dados novos, preparados conscientemente no modelo oficial e submetidos ao mesmo workflow do cadastro manual. Nenhum dado foi importado na implementação deste recurso.

## Consequências

- a interface pública precisa tolerar campos opcionais depois da sanitização;
- o preview administrativo continua exibindo o conteúdo completo para revisão;
- alterações de visibilidade exigem nova revisão e publicação;
- a planilha é um formato de entrada, não uma fonte paralela: após a criação, o CMS permanece como fonte única;
- o Gate G8 deve homologar dry-run, atomicidade, idempotência, negação de permissão, ausência de vazamento e experiência desktop/mobile.
