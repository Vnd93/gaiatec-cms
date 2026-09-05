# Decisão de arquitetura — detecção de gases

## Decisão

Adotar o modelo **integrado ao catálogo mestre novo**, representado por `gasDetectionModel=integrated_master_catalog` nas soluções, em vez de criar um cadastro editorial especializado paralelo.

## Motivos

- produto de detecção de gases continua sendo produto e reutiliza o contrato tipado, workflow, mídia, documentos, atributos, relações e projeção publicados já provados;
- especificidades técnicas permanecem em atributos tipados, modelos, variantes, documentos e relações, sem achatamento em texto livre;
- aplicações e soluções explicam processo, problema, ponto de aplicação, benefícios e componentes sem duplicar a ficha do produto;
- a busca única recebe produtos e relações pela mesma projeção publicada e pela governança comum de sinônimos;
- evita duas fontes editoriais, divergência de SEO e relações ambíguas.

## Limites clean-room

Nenhuma página, estrutura, cadastro, taxonomia, texto, mídia ou planilha do site antigo foi consultada ou conectada como fonte. Não houve recadastro real de detecção de gases nesta execução porque não foi entregue lote novo autorizado nem aprovação dos owners. O contrato e o caminho administrativo estão prontos; o cadastro definitivo deverá ser feito no `/admin` com fontes oficiais novas autorizadas.

## Consequência para o Gate G5

A decisão técnica está encerrada, mas o requisito editorial “recadastrar produtos e imagens” não pode ser aprovado sem lote e proveniência reais. Essa é uma das causas formais do Gate G5 **BLOQUEADO**.
