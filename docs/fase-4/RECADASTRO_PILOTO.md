# Recadastro manual — PILOTO-VZ-ELETRO-01

O staging foi confirmado vazio antes do cadastro: zero usuários Auth, itens editoriais, publicações, mídias e objetos nos buckets do CMS. Nenhum importador foi usado.

## Lote preservado

- produto: `Medidor de Vazão Eletromagnético a Bateria GATFLOW-B`;
- slug: `medidor-vazao-eletromagnetico-bateria-gatflow-b`;
- item: `b67bb372-36b2-44b4-ba42-7f814ff17260`;
- estado: `homologated`, exibido como `Conteúdo piloto homologado`;
- SEO: não indexável; staging inteiro também envia `X-Robots-Tag: noindex, nofollow, noarchive`;
- mídia: dois originais autorizados, cada um com seis variantes WebP/AVIF, ALT descritivo, hash e direitos;
- documento: um PDF autorizado em bucket privado e relacionado pelo hash;
- identidade: marca `GATFLOW`, modelo comercial GAIATEC `GATFLOW-B` e referência/modelo do fabricante `KF700E`, em campos independentes;
- conteúdo: um modelo, uma variante e dez atributos tipados; fabricante/OEM nominal e campos sem evidência conclusiva permanecem editáveis e `a confirmar`;
- relações: nenhuma foi inventada; o consumidor informa que não há relação homologada.

O cadastro foi criado pela API administrativa `cms-content` e a mídia pela API `cms-media`. O frontend não contém produto hardcoded. O script reexecutável aborta se o staging não estiver vazio e valida os hashes antes de enviar qualquer byte.

## Identidade de bootstrap

O workflow exige autor auditável por chave estrangeira. Foi provisionado um único ator de sistema, explicitamente marcado `synthetic: false`, de propósito exclusivo `PILOTO-VZ-ELETRO-01` e owner `Administrador/solicitante GAIATEC`. Após o ciclo, o perfil foi suspenso e o login banido. Estado final: zero usuário sintético e zero perfil ativo. A identidade desabilitada permanece apenas para integridade do histórico imutável.

## Homologação funcional

Em 2026-08-29, o administrador/solicitante confirmou a identidade `GATFLOW` / `GATFLOW-B` / `KF700E` e homologou o objetivo funcional do esboço: todos os campos devem permanecer conectados ao frontend e alteráveis pelo novo `/admin`, sem mudança de código. A auditoria e o round-trip remoto comprovaram esse requisito e o `pilotState` passou para `homologated`.

Essa homologação é funcional e autoriza a continuidade do projeto; não congela nem declara definitivas as especificações técnicas. O cadastro definitivo poderá ser completado e revisado futuramente pelo painel, mantendo proveniência, revisão e aprovação. O lote segue não indexável no staging.
