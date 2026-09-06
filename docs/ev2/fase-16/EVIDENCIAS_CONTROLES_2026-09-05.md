# Evidências dos controles de prontidão — 5 de setembro de 2026

## Verificações externas e configuração controlada

- GitHub Pro confirmado para `@Vnd93`; `main` protegida em `Vnd93/gaiatec-cms` com PR obrigatório,
  zero approvals, checks `quality`, `database` e `browser`, atualização estrita, conversas resolvidas,
  histórico linear, administradores incluídos, sem bypass, force-push ou exclusão;
- `main` protegida em `Vnd93/gaiatec-documentacao` com a mesma política solo e check `quality`;
- ambientes `production` e `production-backup` criados no repositório executável, sem required
  reviewers e limitados às branches protegidas;
- Supabase `GAIATEC CMS Production`: ref. `chfuhctnhqgyjowkvllv`, região `us-east-2`, plano Free,
  estado `ACTIVE_HEALTHY`, sem migrations, funções ou dados; senha redefinida por API oficial,
  conexão TLS pelo pooler IPv4 comprovada e valores armazenados apenas nos ambientes protegidos;
- staging `glcqsosxwgmlhzgcsnzv`: preservado e saudável;
- Resend: integração existente confirmada no código; nenhuma credencial produtiva lida ou copiada.
- Cloudflare staging: alias isolado `ev2-g16-csp-canary` atualizado para o SHA `7804d5b4…`, com
  deployment imutável `017e2a7b`; staging estável e projeto produtivo não foram promovidos.

## Alterações técnicas verificadas

- CSP seleciona Report-Only ou enforcement a partir do ambiente real;
- origens BrasilAPI e Nominatim adicionadas e Resend removido do browser;
- backup externo cifra antes do upload e restaura o mesmo ciphertext em ambiente efêmero;
- provider check vincula domínio e entrega sintética ao SHA;
- proteção exige PR de `@Vnd93`, CODEOWNERS exclusivo e checks reais no SHA;
- G12 approval schema v2 exige DPO/legal, governança solo aceita, evidência para as quatro
  responsabilidades, todos os controles e autorização com SHA.
- `@Vnd93` confirmou os dados do controlador sem alterações, Marcelo Diaz como encarregado e
  `vendas@gaiatecsistemas.com.br` como canal público; o escopo aprovado está vinculado ao SHA-256
  canônico `39fd74f255c9235c0d2148d791e6189dfe88ff977b5d92396c68ecd2a3191b9c`.

Validação local do candidato:

- `npm run test:ev2:phase12`: 10/10;
- `npm run test:ev2:phase16`: 7/7;
- `npm run check`: 51 arquivos/168 testes Vitest, todos os testes EV2 e legados, typecheck, lint,
  formatação, build e orçamento de bundle aprovados;
- `npm audit --audit-level=high`: zero vulnerabilidades.
- CI remoto no SHA exato: [push](https://github.com/Vnd93/gaiatec-cms/actions/runs/33983191194)
  `quality`, `database` e `browser`; [pull request](https://github.com/Vnd93/gaiatec-cms/actions/runs/33983193678)
  com os mesmos três checks; [preview](https://github.com/Vnd93/gaiatec-cms/actions/runs/33983193675);
  e [qualidade documental](https://github.com/Vnd93/gaiatec-documentacao/actions/runs/33983193664):
  sete de sete checks do CMS e um de um da documentação aprovados.
- produção, dados reais, domínio real e staging estável: zero mutações.

## Canary CSP G16 em staging

Candidato: `7804d5b44786941e4fa1f4c6ad5626cb26bee802`.

- deployment imutável: `https://017e2a7b.gaiatec-cms-staging.pages.dev`;
- HTTP aprovado: 22/22 respostas, 100% de disponibilidade, 0% de 5xx, p95 público 1.384,756 ms,
  orçamentos por rota aprovados e nenhum desvio de release/health/manifest/noindex/CSP;
- navegador: quatro rotas, quatro status 200, CSP enforced, SHA exato e zero violação crítica;
- relatórios brutos: [HTTP aprovado](evidencias/G16_CSP_HTTP_7804d5b.json),
  [navegador aprovado](evidencias/G16_CSP_BROWSER_7804d5b.json) e
  [primeira janela em pausa](evidencias/G16_CSP_HTTP_7804d5b_ATTEMPT1_PAUSE.json).

A primeira janela do candidato atual ficou em `pause` porque `/produtos` atingiu 1.797,458 ms,
acima do limite por rota, apesar de 100% de disponibilidade, zero 5xx e contratos corretos. A
tentativa foi preservada, cinco ciclos adicionais de aquecimento foram executados e a repetição
passou sem elevar limites: `/produtos` 1.384,756 ms, `/contato` 1.457,435 ms e p95 público
1.384,756 ms.

O candidato anterior `3433aebb…` teve duas janelas HTTP em `pause` somente por latência de
aquecimento (p95 1.608,260 ms e 1.510,146 ms), seguidas por uma janela aprovada de 1.007,746 ms e
canary de navegador sem violações. O achado originou aquecimento explícito e testado no workflow;
nenhum limite foi aumentado e nenhuma tentativa reprovada foi descrita como aprovação.

### Revalidação no candidato de produção

Candidato: `e52b25d903251cf538918d89049a58524c3c9911`.

- o [workflow `34001071800`](https://github.com/Vnd93/gaiatec-cms/actions/runs/34001071800)
  confirmou o SHA exato da `main`, aprovou 51/51 arquivos e 168/168 testes, auditoria, build e
  manifesto; como o ambiente `staging` do GitHub não continha o conjunto completo de segredos, ele
  publicou somente o candidato e não foi contabilizado como canary remoto;
- o mesmo checkout imutável foi implantado com a sessão Wrangler já autenticada, exclusivamente no
  projeto `gaiatec-cms-staging`, deployment `https://10ddc502.gaiatec-cms-staging.pages.dev` e alias
  isolado `ev2-g16-csp-canary`; nenhum projeto, domínio ou dado produtivo foi alterado;
- HTTP: 22/22 respostas, 100% de disponibilidade, 0% de 5xx, p95 público 1.480,285 ms, orçamentos
  por rota aprovados e contratos de release, health, manifesto, noindex e CSP exatos;
- navegador: quatro rotas com status 200, SHA exato, CSP em enforcement e zero violação crítica;
- relatórios brutos: [HTTP](evidencias/G16_CSP_HTTP_e52b25d.json) e
  [navegador](evidencias/G16_CSP_BROWSER_e52b25d.json).

## Backup e restore drill — tentativas preservadas e aprovação

O [workflow `33995606426`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33995606426),
executado em `main` no SHA `09b6fcd774fd840a987459e097d5847fc752af25`, validou configuração,
conectou ao projeto produtivo, gerou os dumps e o bundle cifrado e iniciou a restauração local. A
tentativa parou em modo fail-closed ao reaplicar `ALTER ROLE ... SET log_min_messages`: esse GUC é
gerenciado pela plataforma e o Supabase local bloqueia sua alteração. A etapa `always()` removeu o
material em texto puro e nenhum artefato incompleto foi publicado.

A correção remove da cópia usada somente no drill as instruções `ALTER ROLE ... SET`, preservando o
arquivo original dentro do backup cifrado. Todos os demais comandos de roles, schema e dados
continuam sob `ON_ERROR_STOP=1`. A tentativa não é contabilizada como backup ou restore aprovado;
uma nova execução integral é obrigatória.

O [workflow `33996304748`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33996304748)
preservou a segunda tentativa. Ele confirmou que o dump também representa o mesmo comando em várias
linhas; o filtro inicial removeu apenas a variante em uma linha e a restauração voltou a bloquear no
mesmo GUC. Texto puro removido e nenhum artefato publicado. A segunda correção usa um sanitizador
Node testado que trata a instrução SQL completa, inclusive multilinha, sem atravessar `;`, e mantém
inalterados `ALTER ROLE ... WITH`, `RESET`, grants, schema e dados.

O [workflow `33996892845`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33996892845)
comprovou que as três instruções `ALTER ROLE ... SET` foram removidas, mas revelou um comando de
sessão independente `SET log_min_messages`. O drill permaneceu fail-closed, removeu o texto puro e
não publicou artefato. A terceira correção adiciona somente esse parâmetro à lista explícita de GUCs
gerenciados; `SET search_path` e os demais comandos de sessão continuam preservados e testados.

O [workflow `33997628222`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33997628222),
no SHA `d037b88342445e40937171a4126bd154144dc806`, confirmou que a representação restante usa
uma atribuição de sessão de `log_min_messages` que o filtro anterior não reconheceu. A execução
voltou a falhar fechada, removeu todo o texto puro e não publicou artefato. A quarta correção reconhece somente
`log_min_messages` nas formas `SET`, `SET SESSION`, `SET LOCAL` e `pg_catalog.set_config`; os outros
ajustes de sessão e todo o restante do restore continuam preservados e sob `ON_ERROR_STOP=1`.

O [workflow `33998278506`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33998278506),
no SHA `333643f74d22456cdc70012b6d59e44e9245c8dd`, preservou a sexta tentativa. O relatório do
sanitizador mostrou três atribuições de role removidas e nenhuma atribuição de sessão reconhecida,
enquanto o PostgreSQL ainda bloqueou `log_min_messages`. Isso reduz o caso restante a uma atribuição
vinculada ao banco. A correção seguinte trata exclusivamente `ALTER DATABASE ... SET
log_min_messages`, preserva outros parâmetros de banco e mantém a restauração estrita. O texto puro
foi removido e nenhum artefato incompleto foi publicado.

O [workflow `33998761317`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33998761317),
no SHA `7c87634e4204a8f93188f2a87dc581d1d82a0299`, mostrou contadores zero tanto para a forma de
sessão quanto para a forma de banco, apesar do erro inequívoco no mesmo GUC. Em vez de continuar
inferindo a sintaxe, o sanitizador passa a remover qualquer instrução SQL terminada por `;` que
contenha o identificador exato `log_min_messages`, preservando comentários, metacomandos de proteção
do dump e todas as instruções sem esse identificador. A execução falhou fechada, limpou o texto puro
e não publicou artefato.

O [workflow `33999303916`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33999303916),
no SHA `804382ab10d54fc675b0de8ac22e9af9c6330658`, comprovou o avanço: roles e schema foram
restaurados, e a carga de dados percorreu as tabelas até `storage.buckets_vectors`. Essa tabela
interna, mantida pela plataforma, rejeitou escrita mesmo vazia (`COPY 0`). A correção exclui
somente `storage.buckets_vectors` do dump de dados; todos os dados da aplicação e as demais tabelas
continuam incluídos e sob restauração estrita. A tentativa limpou o texto puro e não publicou
artefato incompleto.

O [workflow `33999766926`](https://github.com/Vnd93/gaiatec-cms/actions/runs/33999766926),
no SHA `e908e9a3364317f09327547ac96725211b6a1826`, avançou além de `buckets_vectors` e falhou
fechado na outra tabela do mesmo recurso, `storage.vector_indexes`. A
[migração oficial do Supabase Storage](https://github.com/supabase/storage/blob/master/migrations/tenant/0045-vector-buckets.sql)
confirma que o recurso Vector Storage cria esse par de tabelas internas. Ambas ficam excluídas do
dump de dados restaurável; `storage.buckets`, `storage.objects`, autenticação, dados do CMS e todas
as outras tabelas permanecem incluídos. O texto puro foi limpo e nenhum artefato incompleto foi
publicado.

O [workflow `34000214134`](https://github.com/Vnd93/gaiatec-cms/actions/runs/34000214134),
executado em `main` no SHA `7613c1b11a60a50ff9be5547624c79662602e09a`, concluiu com sucesso:
dump lógico, cifragem AES-256, decriptação, restauração em Supabase local efêmero, comparação do
inventário e das contagens de linhas públicas, limpeza do texto puro, manifesto e upload externo.
O artefato `supabase-production-backup-34000214134` tem digest GitHub
`sha256:e346901092477cda2c489e25ab8a47b7a8cd5ccedcfeff859ab1ed73d1565ed6`, tamanho 3,9 KB e
retenção efetiva de 30 dias. O workflow passa a declarar os mesmos 30 dias permitidos pelo
repositório, eliminando o aviso de redução automática sem alterar o backup aprovado.

## Tokens mínimos e entrega sintética

Em 2026-09-05 foram criadas três credenciais exclusivas, com valores gravados diretamente nos
secrets protegidos do ambiente `production` e nunca registrados em documentação ou logs:

- Resend `GAIATEC CMS Production`: somente envio e restrito ao domínio
  `gaiatecsistemas.com`, salvo como `RESEND_API_KEY`;
- Cloudflare `GAIATEC CMS Production Pages`: somente
  `Gaiatec Sistemas - Cloudflare Pages:Editar`, salvo como `CLOUDFLARE_API_TOKEN`;
- GitHub `GAIATEC G12 Release Guard`: somente o repositório `Vnd93/gaiatec-cms`, com
  `Actions`, `Administration`, `Metadata` e `Pull requests` em leitura, expiração em
  2026-10-05 e secret `RELEASE_GUARD_TOKEN`.

O prefixo `GITHUB_` é reservado pelo GitHub e foi recusado pela própria plataforma. Por isso os
workflows de deploy e rollback passam a usar `RELEASE_GUARD_TOKEN`, sem ampliar permissões.

O [workflow `34002956973`](https://github.com/Vnd93/gaiatec-cms/actions/runs/34002956973)
executou em `main`, vinculou o envio ao candidato
`e52b25d903251cf538918d89049a58524c3c9911` e submeteu somente a mensagem sintética para
`comercial@gaiatecsistemas.com.br`. A credencial de envio mínimo aceitou a mensagem, mas recusou
com `401` a leitura posterior do status, como esperado para uma chave sem acesso de leitura; o
workflow falhou fechado e não fabricou uma evidência de entrega. O painel autenticado do Resend
confirmou o mesmo envio como `delivered`, identificador
`2eae753e-c380-4cf1-913d-05f9e22354e4`, assunto
`GAIATEC CMS — verificação sintética e52b25d90325`.

A correção mantém a chave mínima: a automação passa a registrar
`accepted-awaiting-provider-dashboard` quando a consulta é recusada especificamente com `401` e
continua bloqueando qualquer outro erro. A prontidão final permanece exigindo a comprovação
independente `delivered`; aceite do provedor isoladamente não satisfaz o gate.

## Evidência ainda inexistente

Não foi fabricada a autorização literal vinculada ao SHA final. Nenhum deploy, migration, função,
dado real, domínio real ou promoção de produção foi executado.
