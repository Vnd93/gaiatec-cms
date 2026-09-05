# Requisitos — visibilidade e cadastro em massa

## Estado

Implementação técnica, lote sintético, lote clean-room inicial, canary editorial, restore e entrega pelo Resend aprovados em staging. A aprovação LGPD administrativa foi registrada, o cron seguro está ativo e o remetente usa o domínio verificado. O Gate G8 permanece fechado para produção somente até o aceite específico do relatório de canary e a decisão formal de go-live.

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
- lote inválido bloqueado com zero criação;
- dry-run válido executado com zero criação;
- lote válido criou dois rascunhos de forma atômica e idempotente, sob o correlation ID `e8d776ed-d8b7-44cb-83c9-e732271ce1d3`;
- produto sintético foi publicado com fabricante interno, validado na API, busca, HTML e JSON-LD, reaberto, republicado com fabricante público e retirado;
- nenhum fixture sintético permaneceu na projeção pública ao final.

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

## Homologação sintética executada

As nove etapas previstas foram executadas pelo run `20260830143413-3fb870`; o painel autenticado foi reinspecionado após o ajuste responsivo. A evidência visual está em [cadastro em massa no staging](./evidencia-cadastro-massa-staging.png).

## Pendências que não podem ser substituídas por automação

1. O domínio exato do remetente deve ser verificado no Resend; chave, destinatário, cron e Vault já estão configurados.
2. A aprovação LGPD/DPO administrativa foi confirmada em 2026-08-30; qualquer mudança de finalidade ou retenção exige nova revisão.
3. Owners devem executar treinamento, aprovar runbooks/alertas e assinar o go-live.
4. Produção só pode receber canary/cutover depois do Gate G8 formal.
