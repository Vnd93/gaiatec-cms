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
- `npm run test:ev2:phase16`: 6/6;
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

## Backup e restore drill — primeira tentativa preservada

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

## Evidências ainda inexistentes

Não foram fabricados: backup real, restore real, chave Resend de produção, entrega sintética
produtiva, preview CSP do SHA final de produção ou autorização literal do SHA final. Proteções,
ambientes, DPO/legal, governança solo, risco e credenciais Supabase foram comprovados; os itens
restantes continuam bloqueando G12.
