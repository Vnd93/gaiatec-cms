# ADR-022 — elegibilidade EV2 em runtime e fail-closed

**Status:** aceita<br>
**Data:** 4 de setembro de 2026

## Contexto

As interfaces candidatas EV2 eram incluídas ou ocultadas por variáveis `VITE_EV2_*` resolvidas no
build. Esse mecanismo separava artefatos, mas não acompanhava revogação, expiração, kill switch ou
identidade em uma sessão já aberta. Além disso, uma mesma compilação não podia servir com segurança
uma coorte individual e um usuário de controle.

## Decisão

1. O servidor gera um manifesto agregado e versionado para todas as capacidades EV2.
2. Exatamente um override ativo de usuário, com janela total de até 30 minutos e sem override amplo
   paralelo da mesma capacidade, pode habilitar o frontend em `local` ou `staging`; site, ambiente,
   global, TTL excessivo, ausência, erro e resposta inválida resultam em `enabled=false`.
3. Produção é explicitamente `gated` e nunca habilita uma capacidade nesta fase.
4. `cms-session` é a única fronteira pública que entrega o manifesto. A função SQL de avaliação é
   restrita a `service_role`.
5. O cliente revalida a sessão a cada 30 segundos, ao voltar para a aba e após renovação do token. Um
   erro transitório conserva a sessão v1, mas remove imediatamente as capacidades EV2.
6. Manifestos com mais de 60 segundos, ambiente/site divergente ou origem diferente de `override`
   falham fechados.
7. Variáveis `VITE_EV2_*` deixam de participar de decisões de autorização. O backend continua sendo
   a autoridade final para toda leitura ou mutação.

## Consequências

- o mesmo SHA pode demonstrar isolamento por identidade sem builds distintos;
- revogação e expiração passam a alcançar a interface aberta em até 60 segundos;
- indisponibilidade do agregador não derruba o CMS legado;
- a migration `0053` e a republicação de `cms-session` são pré-requisitos para o candidato;
- ativação por percentual ou escopo amplo exige uma decisão futura e não é inferida desta ADR;
- produção permanece bloqueada até um gate específico aprovar infraestrutura, privacidade, owners,
  evidência vinculada ao SHA e autorização expressa.

## Alternativas rejeitadas

- manter flags apenas no build: não permite revogação nem diferenciação por identidade;
- consultar uma função por feature: amplia latência, inconsistência e superfície de falha;
- aceitar overrides de ambiente/site/global: aumenta o raio de impacto antes da homologação;
- falhar aberto quando o manifesto está ausente: pode expor interfaces ainda não autorizadas.
