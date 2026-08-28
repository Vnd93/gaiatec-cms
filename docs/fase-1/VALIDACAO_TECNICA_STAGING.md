# Validação técnica e de staging

Data: 2026-08-28

Deployment validado: https://5a4b7c5e.gaiatec-cms-staging.pages.dev

## Estado Git e isolamento

- branch confirmada: `Remodelagem`;
- baseline/origin inicial confirmado: `1a4d635b70fe763aeed851514a8fc03ba0f7012c`;
- alterações locais preexistentes em `ContactSection.tsx`, `Footer.tsx` e `src/lib/supabase.ts` preservadas;
- nenhum arquivo `.env` real ou segredo foi incluído;
- produção não foi ligada ao CLI Supabase, consultada ou alterada;
- dados atuais não foram consultados, importados ou reutilizados.

## Testes automatizados

| Comando | Resultado |
|---|---|
| `npm run test:phase1` | 4/4 testes passaram: Worker/status/headers; acesso/imutabilidade/storage RDO fail-closed; identificadores-only/CMS legado; termos cliente-servidor idênticos |
| `npm run build:staging` | passou com Vite 6.4.3; único aviso: chunk PDF de aproximadamente 1,9 MB |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `npx deno@2.5.6 check --node-modules-dir=auto ...` | todas as Edge Functions da Fase 1 passaram na verificação de tipos |
| `git diff --check` | passou; apenas avisos informativos de normalização CRLF no Windows |

O teste `scripts/phase1/containment.test.mjs` inclui casos negativos para impedir abertura de OTP, edição de assinado, bucket público, notificação controlada pelo cliente e reativação do CMS legado.

## Verificação HTTP no staging

| Rota | HTTP | Controle observado |
|---|---:|---|
| `/`, `/contato`, `/blog`, `/produtos` | 200 | staging com `X-Robots-Tag: noindex, nofollow, noarchive` |
| `/relatorio-de-obra/login` | 200 | `noindex`; `Cache-Control: private, no-store`; `X-Frame-Options: DENY` |
| `/relatorio-de-obra/inexistente` | 404 | mesmos controles privados, sem fallback 200 |
| `/produto-inexistente` | 404 | 404 real, sem soft 404 |
| `/assets/inexistente.js` | 404 | `no-store` e `noindex` |

Headers adicionais observados: HSTS, `nosniff`, COOP, Referrer-Policy, Permissions-Policy e CSP report-only. CSP permanece em modo report-only deliberadamente para colher violações antes de enforcement.

## UX/UI prática

Foi feita navegação prática nas rotas `/`, `/contato`, `/blog`, `/produtos` e `/relatorio-de-obra/login` em desktop e viewport mobile, incluindo abertura/fechamento do menu mobile. Resultados:

- nenhuma rolagem horizontal nas rotas em escopo;
- menu mobile atualiza `aria-expanded` e bloqueia/restaura o scroll do body;
- zero botões sem nome acessível, campos sem label e links críticos `href="#"`;
- zero warnings/errors de console nas rotas verificadas;
- canonical público correto; canonical removido e meta `noindex, nofollow, noarchive` na rota RDO;
- títulos e `h1` presentes e rotas renderizando sem regressão aparente.

O deployment final foi rechecado após o ajuste de canonical; a alteração não tocou CSS/layout. A validação móvel completa imediatamente anterior usou o mesmo bundle de layout. O controle de viewport do navegador não reaplicou o override na última repetição, por isso essa repetição final não é contabilizada como uma segunda validação móvel independente.

## Validações bloqueadas

Não foi possível executar:

- aplicação da migração `0008_fase1_contencao_p0.sql` em Supabase staging;
- deploy das Edge Functions no Supabase staging;
- testes de RLS com usuários sintéticos owner, membro, admin, suspenso e sem escopo;
- fluxo remoto E2E de convite, OTP, finalização, correção e assinatura;
- validação real de buckets privados, outbox, SMTP/Resend e Turnstile;
- lint/integração SQL via Supabase local.

Motivos objetivos: não há `SUPABASE_ACCESS_TOKEN`/vínculo autorizado para staging e Docker não está disponível. Nenhuma tentativa foi feita com credenciais de produção.
