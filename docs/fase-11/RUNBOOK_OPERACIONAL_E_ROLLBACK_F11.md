# Runbook operacional e rollback — F11

## Publicação em staging

1. confirmar branch `Remodelagem` e revisar todo o `git status`;
2. executar formatter, lint, typecheck, Vitest, estruturas F2–F11, build, E2E e a11y;
3. impedir deploy se qualquer teste crítico falhar;
4. executar `npm run deploy:staging` somente no projeto `gaiatec-cms-staging`;
5. registrar URL imutável e domínio estável;
6. validar autenticação, shell, cada grupo de rota, preview e projeção pública;
7. confirmar header `noindex, nofollow, noarchive` em staging.

## Homologação autenticada

Entrar com conta autorizada e MFA diretamente no navegador. O operador digita o TOTP; nenhum código é enviado pelo chat. Validar:

- busca global, grupo ativo, recolhimento, drawer e breadcrumb;
- produto com troca de etapa, digitação, troca de aba e retorno sem desmontagem;
- restauração/descarte de cópia local;
- estados de erro, vazio, sucesso e sem permissão;
- logout e sessão expirada fail-closed.

## Rollback de staging

1. suspender a homologação e registrar a URL/horário do defeito;
2. reimplantar o artefato Cloudflare imutável anterior;
3. preservar banco, revisões, rascunhos e auditoria;
4. não apagar conteúdo nem listas mestras;
5. corrigir por roll-forward local e repetir a suíte;
6. validar login, `/admin`, produto, preview, site público e projeção privada.

## Gatilhos

- perda de rascunho ou desmontagem em refresh;
- ação exibida sem permissão/estado;
- vazamento de campo interno;
- body com overflow, navegação bloqueada ou editor inutilizável;
- regressão de MFA/RBAC/RLS;
- P0/P1 de acessibilidade nas jornadas principais.

Produção não faz parte deste runbook e continua proibida.
