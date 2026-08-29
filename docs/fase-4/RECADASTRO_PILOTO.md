# Recadastro manual — PILOTO-VZ-ELETRO-01

O staging foi confirmado vazio antes do cadastro: zero usuários Auth, itens editoriais, publicações, mídias e objetos nos buckets do CMS. Nenhum importador foi usado.

## Lote preservado

- produto: `Medidor de Vazão Eletromagnético a Bateria GATFLOW-B`;
- slug: `medidor-vazao-eletromagnetico-bateria-gatflow-b`;
- item: `b67bb372-36b2-44b4-ba42-7f814ff17260`;
- estado: `awaiting_owner`, exibido como `Conteúdo piloto em homologação`;
- SEO: não indexável; staging inteiro também envia `X-Robots-Tag: noindex, nofollow, noarchive`;
- mídia: dois originais autorizados, cada um com seis variantes WebP/AVIF, ALT descritivo, hash e direitos;
- documento: um PDF autorizado em bucket privado e relacionado pelo hash;
- conteúdo: um modelo, uma variante e dez atributos tipados; campos sem evidência permanecem `a confirmar`;
- relações: nenhuma foi inventada; o consumidor informa que não há relação homologada.

O cadastro foi criado pela API administrativa `cms-content` e a mídia pela API `cms-media`. O frontend não contém produto hardcoded. O script reexecutável aborta se o staging não estiver vazio e valida os hashes antes de enviar qualquer byte.

## Identidade de bootstrap

O workflow exige autor auditável por chave estrangeira. Foi provisionado um único ator de sistema, explicitamente marcado `synthetic: false`, de propósito exclusivo `PILOTO-VZ-ELETRO-01` e owner `Administrador/solicitante GAIATEC`. Após o ciclo, o perfil foi suspenso e o login banido. Estado final: zero usuário sintético e zero perfil ativo. A identidade desabilitada permanece apenas para integridade do histórico imutável.

## Homologação pendente

A autorização recebida comprova seleção dos três arquivos e direitos limitados ao esboço no staging. Ela não comprova aprovação visual do resultado nem a relação comercial GATFLOW-B/KF700E. O Gate G4 permanece bloqueado somente até o solicitante confirmar o preview e autorizar a homologação do conteúdo.
