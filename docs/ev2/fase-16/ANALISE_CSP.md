# Análise e enforcement de Content Security Policy

## Achados

A política anterior estava apenas em `Content-Security-Policy-Report-Only` e continha
`https://api.resend.com` em `connect-src`, embora o navegador nunca deva chamar o provedor de e-mail.
Também faltavam duas origens usadas pelo RDO, o que quebraria CNPJ e geocodificação ao ativar o
enforcement.

Inventário validado no código:

| Diretiva      | Origens necessárias                                                    |
| ------------- | ---------------------------------------------------------------------- |
| `script-src`  | própria origem e Cloudflare Turnstile                                  |
| `style-src`   | própria origem, estilos inline atuais e Google Fonts                   |
| `font-src`    | própria origem, `data:` e Google Fonts                                 |
| `connect-src` | própria origem, Supabase HTTPS/WSS, Turnstile, BrasilAPI e Nominatim   |
| `frame-src`   | Turnstile, Google Maps e OpenStreetMap                                 |
| `img-src`     | própria origem, `data:`, `blob:` e HTTPS para mídia governada pelo CMS |

Foram adicionados `script-src-attr 'none'`, `worker-src`, `manifest-src` e
`upgrade-insecure-requests`. `api.resend.com` foi removido do navegador.

## Modo por ambiente

- local, staging comum e host desconhecido: Report-Only;
- alias isolado `ev2-g16-csp-canary` no projeto de staging: enforcement para teste em navegador;
- qualquer preview do projeto Cloudflare produtivo `gaiatec-website`: enforcement;
- domínios reais: enforcement somente quando `CF_PAGES_BRANCH=main`.

O probe G12 agora recusa o candidato se o header ativo estiver ausente, se ambos os modos estiverem
presentes, se BrasilAPI/Nominatim faltarem ou se Resend reaparecer no browser. O preview produtivo é
testado antes da promoção, portanto uma regressão CSP interrompe o workflow antes do domínio real.

## Riscos residuais e redução futura

- `style-src 'unsafe-inline'` ainda é necessário pelos estilos inline existentes; remover exige
  refatoração ou nonces/hashes de estilo;
- `img-src https:` aceita mídia HTTPS ampla porque URLs de mídia são geridas pelo CMS; uma allowlist
  fechada deve acompanhar a definição definitiva do storage;
- a ausência de endpoint de coleta significa que staging Report-Only precisa ser inspecionado no
  canary. Não foi criado endpoint público suscetível a spam apenas para alegar telemetria.

Scripts inline permanecem bloqueados. A orientação de CSP recomenda nonce ou hash em vez de liberar
`unsafe-inline`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src>.

O status `criticalViolations=0` só pode ser registrado após o canary do SHA final; a análise estática
e os testes locais não substituem essa evidência.
