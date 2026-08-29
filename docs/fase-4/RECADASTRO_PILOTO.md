# Recadastro piloto — estado e bloqueios

## Estado inicial exigido

O staging deve ser confirmado sem produtos, projeções, mídia editorial e arquivos de produto antes de qualquer lote real. Importadores permanecem inexistentes/desabilitados.

## Lote mínimo previsto

O recorte `PILOTO-01` definido na Fase 0 continua sendo apenas hipótese de arquitetura: um item de vazão eletromagnética, um ultrassônico clamp-on e um de nível por radar. Nenhum fabricante/modelo foi selecionado por fonte oficial e nenhum desses três registros foi criado nesta fase.

## Bloqueio de cadastro real

Não há, no repositório ou na autorização desta tarefa, documento nominal do owner do portfólio que selecione fabricante/modelo, aprove fonte oficial vigente, confirme direitos de mídia/documento e homologue os dados do lote. Por isso:

- nenhum produto real é inventado;
- nenhuma pasta externa é usada como aprovação implícita;
- nenhum arquivo é copiado ou carregado;
- testes remotos, quando executados, usam somente fixtures `synthetic_test`, descartadas ao final;
- o Gate G4 não pode ser aprovado enquanto o aceite formal não existir.

## Procedimento quando o owner liberar o lote

1. registrar fonte oficial, versão/data e SHA-256;
2. cadastrar manualmente um registro por vez no `/admin`;
3. carregar somente originais autorizados na biblioteca nova;
4. revisar técnica, comercial e editorialmente;
5. homologar preview desktop/tablet/mobile;
6. publicar no staging e verificar todos os consumidores;
7. registrar aceite nominal do owner do portfólio.
