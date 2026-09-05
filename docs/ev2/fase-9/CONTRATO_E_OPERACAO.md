# Contrato e operação do Estúdio Visual e multisite EV2.9

## Limite de confiança

O navegador monta comandos tipados, mas não decide autorização, versão efetiva, publicação ou isolamento. As funções `cms-visual` e `cms-sites` autenticam o JWT, confirmam origem, ambiente e atualidade do envelope, aplicam rate limit e chamam RPCs com `service_role`. As tabelas e RPCs internas não são acessíveis por `anon` nem `authenticated`.

O escopo visual desta fase é `siteKey=main` e `environment=local|staging`. A preparação multisite aceita exclusivamente sites sintéticos com chave `g9x-*`, domínios reservados `.invalid` e ambientes bloqueados. Produção, domínios reais e ativação operacional são recusados também no banco.

## Ativação e compatibilidade

1. `ev2.visual_studio` e `ev2.multisite` permanecem globalmente desligadas.
2. O build candidato também exige `VITE_EV2_VISUAL_STUDIO_CANDIDATE=true` ou `VITE_EV2_MULTISITE_CANDIDATE=true` para expor a navegação correspondente.
3. A API somente habilita o caminho novo quando encontra exatamente um override individual ativo para a identidade, no ambiente solicitado, com duração total máxima de 30 minutos.
4. Override amplo, mais de um override elegível, ativação global, kill switch ou produção resultam em negação segura.
5. Remover ou deixar expirar o override encerra imediatamente o acesso candidato.
6. Conteúdo v1 sem metadados visuais continua usando o fluxo e o renderer existentes.

## Contrato `cms-visual`

`POST /functions/v1/cms-visual` aceita envelope estrito v1. Mutações exigem `X-Idempotency-Key`, AAL2 e versão esperada.

| Ação             | Permissão             | Resultado                                                               |
| ---------------- | --------------------- | ----------------------------------------------------------------------- |
| `capability`     | sessão válida         | informa ativação sem expor documentos                                   |
| `catalog`        | `cms:visual.read`     | devolve registry exato e tokens do tema principal                       |
| `list_branches`  | `cms:visual.read`     | lista somente branches do item e escopo autorizados                     |
| `get_document`   | `cms:visual.read`     | obtém documento, branch e snapshots                                     |
| `create_branch`  | `cms:visual.branch`   | cria branch a partir de rascunho v1                                     |
| `save_document`  | `cms:visual.edit`     | valida schema, registry, bindings, isolamento e lock otimista           |
| Modo Designer    | `cms:visual.design`   | habilita controles avançados; não é concedido a editor ou marketing     |
| `snapshot`       | `cms:visual.snapshot` | grava um grupo imutável desktop/tablet/mobile                           |
| `create_symbol`  | `cms:visual.symbols`  | cria símbolo versionado no mesmo site                                   |
| `apply_to_draft` | `cms:visual.apply`    | atualiza somente rascunho v1 e registra proveniência; `published=false` |
| `abandon`        | `cms:visual.branch`   | encerra a branch sem alterar o rascunho ou a projeção pública           |

## Contrato `cms-sites`

| Ação                | Permissão          | Resultado                                                   |
| ------------------- | ------------------ | ----------------------------------------------------------- |
| `capability`        | sessão válida      | informa preparo habilitado e operação multisite bloqueada   |
| `registry`          | `cms:sites.read`   | lista o site principal e fixtures visíveis no escopo        |
| `create_candidate`  | `cms:sites.manage` | cria fixture sintética suspensível com ambientes travados   |
| `add_domain`        | `cms:sites.manage` | associa somente hostname `.invalid`, sem roteamento público |
| `update_tokens`     | `cms:sites.manage` | cria nova versão imutável de tokens no candidato            |
| `suspend_candidate` | `cms:sites.manage` | suspende a fixture, sem tocar no site principal             |

O papel `site_pilot_manager` exige MFA e reúne apenas `cms:sites.read/manage`. Cada candidato `g9x-*` pertence à identidade que o criou: o registry retorna o site estrutural `main` e somente os candidatos desse proprietário; uma chave pertencente a outra identidade responde como inexistente.

## Invariantes

- 20 chaves exatas no registry v1;
- no máximo um `hero`, 80 nós e 200 bindings por documento;
- grid fixo 12/8/4 e spans contidos em cada breakpoint;
- identidade única por nó e binding somente para nó existente;
- sem HTML/CSS/JS/iframe/handlers em qualquer profundidade do payload;
- documento, eventos, snapshots, símbolos versionados e recibos imutáveis;
- replay idempotente devolve o mesmo resultado; corpo divergente falha sem efeito;
- lock obsoleto retorna conflito e preserva o estado do servidor;
- aplicar exige que a versão atual do rascunho ainda seja exatamente a versão-base do branch;
- referências de mídia precisam existir, estar limpas, vigentes e publicáveis; conteúdos relacionados precisam existir no escopo editorial permitido;
- símbolo e branch não atravessam site ou ambiente;
- `apply_to_draft` nunca revisa, aprova, agenda ou publica;
- somente um site estrutural `main` pode ser primário e não sintético;
- fixtures EV2.9 são `g9x-*`, nunca primárias, e não aceitam produção;
- domínios candidatos terminam em `.invalid` e não são roteáveis;
- candidatos sintéticos são enumeráveis e mutáveis somente por sua identidade proprietária;
- tokens são versionados; versões anteriores permanecem para auditoria.
- páginas com proveniência visual mantêm os blocos somente leitura no builder v1 e não podem ser duplicadas por ele; a cópia exige nova página e novo branch visual;
- o canvas desativa navegação e envio de formulários, força o breakpoint escolhido e consome os tokens governados do tema.

## Rollback

O rollback operacional preferencial remove os overrides individuais ou aciona o kill switch das duas flags. Em seguida, restaura-se o build e as versões anteriores das funções. Como a migration é aditiva, tabelas, eventos e snapshots permanecem para diagnóstico; não se remove schema durante contenção. O site principal, o rascunho v1 e o renderer anterior continuam disponíveis independentemente do candidato.
