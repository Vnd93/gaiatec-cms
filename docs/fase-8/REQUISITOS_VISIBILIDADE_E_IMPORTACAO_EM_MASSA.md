# Requisitos — visibilidade e cadastro em massa

## Estado

Implementação técnica publicada e parcialmente homologada em staging. O Gate G8 permanece pendente do lote sintético completo, dos demais lotes editoriais e da decisão formal de go-live.

## Evidências executadas em staging

- migrations 0028 e 0029 aplicadas; banco remoto sem erro ou aviso de lint;
- fabricante/OEM, referência, SKU, código de variante, proveniência, aprovação, caminhos locais e metadados de busca ausentes da resposta pública;
- buscas por `KF700E` e pelo código interno retornaram zero resultado;
- documento cujo caminho revela referência interna não recebeu URL assinada pública;
- produto publicado permaneceu funcional, com os dados internos disponíveis apenas no editor autenticado;
- tela “Público ou interno” inspecionada visualmente e corrigida para grade responsiva;
- tela de cadastro em massa inspecionada visualmente e corrigida para fluxo em três etapas;
- modelo XLSX vazio respondeu HTTP 200, MIME de planilha e assinatura ZIP válida;
- rota `/admin/produtos/importacao` respondeu HTTP 200, `private, no-store` e `noindex`;
- nenhum cadastro foi criado ou importado nessa homologação parcial.

## Critérios de aceite

- fabricante, referência do fabricante e SKU são internos por padrão;
- a resposta pública não contém campo interno, configuração de visibilidade, bloco oculto nem metadado de documento privado;
- `anon` não consulta projeções editoriais completas diretamente;
- preview autenticado apresenta os dados internos para revisão;
- a planilha oficial começa sem cadastro real ou legado;
- arquivo inválido, fórmula, versão incorreta, slug duplicado, relação ausente ou campo incompleto bloqueia o lote;
- dry-run não cria conteúdo;
- criação gera somente rascunhos e é atômica e idempotente;
- o painel mostra erros por aba, linha e campo, além do correlation ID;
- nenhuma imagem ou documento é importado em massa;
- UX/UI desktop e mobile, teclado, foco, contraste, overflow e mensagens de estado são aprovados.

## Homologação restante

1. Baixar o modelo pelo painel.
2. Preencher um lote exclusivamente sintético com dois produtos.
3. Produzir intencionalmente um erro na segunda linha e confirmar zero criação.
4. Corrigir, executar dry-run e confirmar zero criação.
5. Criar o lote e confirmar dois rascunhos, com um único correlation ID do lote e auditoria individual.
6. Repetir o mesmo comando idempotente e confirmar ausência de duplicidade.
7. Publicar um produto sintético com fabricante interno e inspecionar API, busca, filtros e JSON-LD.
8. Alterar fabricante para público, republicar e confirmar o novo comportamento.
9. Remover os fixtures sintéticos e processar a outbox.
